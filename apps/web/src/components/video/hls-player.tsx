'use client';

import type { PlaybackToken } from '@smart-teacher/shared-types';
import type HlsJs from 'hls.js';
import type { ErrorData, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import { Loader2, LockKeyhole, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const NATIVE_HLS_TYPE = 'application/vnd.apple.mpegurl';
const SEEK_STEP_SECONDS = 5;
// A refresh burst means something is wrong with the token, not with the video length, so cap by
// rate rather than by a lifetime count — a 45-minute video needs a refresh every ~8 minutes and
// must not run out of them halfway through.
const MAX_REFRESHES = 3;
const REFRESH_WINDOW_MS = 60_000;
// Re-mint well before the token lapses so a segment request never races the expiry.
const REFRESH_AT_FRACTION = 0.8;
const MIN_REFRESH_DELAY_MS = 15_000;

type PlayerState =
  | { name: 'idle' }
  | { name: 'loading' }
  | { name: 'ready' }
  | { name: 'error'; message: string; canRetry: boolean };

class PlaybackAuthError extends Error {
  constructor(readonly status: number) {
    super(`Playback authorization failed (${status})`);
  }
}

function describeFailure(error: unknown): { message: string; canRetry: boolean } {
  const status = error instanceof PlaybackAuthError ? error.status : 0;
  if (status === 401) {
    return { message: 'Your viewing session expired', canRetry: true };
  }
  if (status === 403 || status === 404) {
    return { message: 'This video is no longer available.', canRetry: false };
  }
  return { message: 'Playback failed. Check your connection and try again.', canRetry: true };
}

export function HlsPlayer({
  videoId,
  title,
  posterUrl,
}: {
  videoId: string;
  title: string;
  posterUrl?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsJs | null>(null);
  const isNativeRef = useRef(false);
  const tokenRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  const refreshTimesRef = useRef<number[]>([]);
  const recoveredNetworkRef = useRef(false);
  const recoveredMediaRef = useRef(false);

  const [state, setState] = useState<PlayerState>({ name: 'idle' });
  const [buffering, setBuffering] = useState(false);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    // Captured here rather than read in the cleanup: the element React rendered on mount is the
    // one whose source we must release, and by cleanup time the ref may already be detached.
    const video = videoRef.current;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      // load() on an element that never had a source aborts into NotSupportedError, which React's
      // StrictMode double-invoked cleanup would surface on every mount in dev.
      if (video?.getAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [videoId]);

  function absolute(url: string): URL {
    return new URL(url, window.location.href);
  }

  async function mint(): Promise<PlaybackToken> {
    const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}/playback-token`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new PlaybackAuthError(response.status);
    return (await response.json()) as PlaybackToken;
  }

  function scheduleRefresh(expiresInSecs: number): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = Math.max(MIN_REFRESH_DELAY_MS, expiresInSecs * REFRESH_AT_FRACTION * 1000);
    timerRef.current = setTimeout(() => void refresh('scheduled'), delay);
  }

  function withinRefreshBudget(): boolean {
    const now = Date.now();
    refreshTimesRef.current = refreshTimesRef.current.filter((at) => now - at < REFRESH_WINDOW_MS);
    if (refreshTimesRef.current.length >= MAX_REFRESHES) return false;
    refreshTimesRef.current.push(now);
    return true;
  }

  // Safari's native HLS exposes no per-request hook, so the only way to hand it a fresh token is
  // to swap the source: every segment URL was baked into the playlist it already parsed. Costs
  // one brief hiccup per refresh, which hls.js browsers do not pay.
  function reattachNative(manifestUrl: string): void {
    const video = videoRef.current;
    if (!video) return;
    const resumeAt = video.currentTime;
    const wasPlaying = !video.paused;
    video.addEventListener(
      'loadedmetadata',
      () => {
        video.currentTime = resumeAt;
        if (wasPlaying) playIfAllowed(video);
      },
      { once: true },
    );
    video.src = manifestUrl;
    video.load();
  }

  async function refresh(reason: 'scheduled' | 'error'): Promise<void> {
    if (refreshingRef.current) return;
    if (!withinRefreshBudget()) {
      setState({ message: 'Playback failed. Check your connection and try again.', canRetry: true, name: 'error' });
      return;
    }
    refreshingRef.current = true;
    try {
      const fresh = await mint();
      tokenRef.current = absolute(fresh.manifestUrl).searchParams.get('t') ?? '';
      scheduleRefresh(fresh.expiresInSecs);
      if (isNativeRef.current) {
        reattachNative(fresh.manifestUrl);
      } else if (reason === 'error') {
        // The loader picks the new token up on its own; hls.js just needs telling to resume,
        // because a fatal error stopped it.
        hlsRef.current?.startLoad();
      }
      setState((previous) => (previous.name === 'error' ? { name: 'ready' } : previous));
    } catch (error) {
      setState({ ...describeFailure(error), name: 'error' });
    } finally {
      refreshingRef.current = false;
    }
  }

  async function start(): Promise<void> {
    const video = videoRef.current;
    if (!video) return;
    setState({ name: 'loading' });
    recoveredNetworkRef.current = false;
    recoveredMediaRef.current = false;
    refreshTimesRef.current = [];

    let ticket: PlaybackToken;
    try {
      ticket = await mint();
    } catch (error) {
      setState({ ...describeFailure(error), name: 'error' });
      return;
    }
    tokenRef.current = absolute(ticket.manifestUrl).searchParams.get('t') ?? '';
    scheduleRefresh(ticket.expiresInSecs);

    // hls.js first, native second — hls.js's own documented order, and it must stay that way.
    // Chromium reports canPlayType('application/vnd.apple.mpegurl') as "maybe" while being
    // unable to play an .m3u8 from src at all, so probing native first hands Chrome and Brave a
    // source they reject with NotSupportedError. Native is really the iOS path, where MSE — and
    // therefore hls.js — is unavailable.
    let Hls: typeof HlsJs | null = null;
    try {
      ({ default: Hls } = await import('hls.js'));
    } catch {
      Hls = null;
    }

    if (!Hls?.isSupported()) {
      if (!video.canPlayType(NATIVE_HLS_TYPE)) {
        setState({ name: 'error', message: 'This browser cannot play this video.', canRetry: false });
        return;
      }
      isNativeRef.current = true;
      video.src = ticket.manifestUrl;
      setState({ name: 'ready' });
      playIfAllowed(video);
      return;
    }

    // Segment URLs arrive with whatever token was current when their playlist was fetched.
    // Rewriting `t` per request is what makes a refresh seamless — loadSource() would tear the
    // media down and rebuffer, which is exactly what the acceptance criteria rule out.
    const BaseLoader = Hls.DefaultConfig.loader;
    class TokenLoader extends BaseLoader {
      load(
        context: LoaderContext,
        config: LoaderConfiguration,
        callbacks: LoaderCallbacks<LoaderContext>,
      ): void {
        const url = absolute(context.url);
        url.searchParams.set('t', tokenRef.current);
        context.url = url.toString();
        super.load(context, config, callbacks);
      }
    }

    const hls = new Hls({ loader: TokenLoader });
    hlsRef.current = hls;
    hls.on(Hls.Events.ERROR, (_event: unknown, data: ErrorData) => {
      if (!data.fatal) return;
      const status = data.response?.code;
      // 401 comes from the Nest delivery routes in `api` mode, 403 from the Worker in `edge`
      // mode. Both mean the same thing: the token lapsed.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && (status === 401 || status === 403)) {
        void refresh('error');
        return;
      }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !recoveredNetworkRef.current) {
        recoveredNetworkRef.current = true;
        hls.startLoad();
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaRef.current) {
        recoveredMediaRef.current = true;
        hls.recoverMediaError();
        return;
      }
      setState({
        name: 'error',
        message: 'Playback failed. Check your connection and try again.',
        canRetry: true,
      });
    });
    hls.once(Hls.Events.MANIFEST_PARSED, () => {
      setState({ name: 'ready' });
      playIfAllowed(video);
    });
    hls.loadSource(ticket.manifestUrl);
    hls.attachMedia(video);
  }

  // Brave, Safari and Chrome all refuse a programmatic play() that they no longer attribute to a
  // user gesture, and the mint + dynamic import between the click and this call is enough to lose
  // that attribution. A rejection is not a failure: the media is loaded and the native controls
  // are showing, so leave it paused and let the user press play. Swallowing it silently is what
  // stranded the spinner over a healthy video.
  function playIfAllowed(video: HTMLVideoElement): void {
    video.play().catch(() => setBuffering(false));
  }

  function retry(): void {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    void start();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    // Native <video controls> already handles these when the element itself has focus; only act
    // when the wrapper is the focused target, so nothing fires twice.
    if (event.target !== wrapperRef.current) return;
    const video = videoRef.current;
    if (!video || state.name !== 'ready') return;

    switch (event.key) {
      case ' ':
      case 'k':
        event.preventDefault();
        if (video.paused) playIfAllowed(video);
        else video.pause();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_SECONDS);
        break;
      case 'ArrowRight':
        event.preventDefault();
        video.currentTime = video.currentTime + SEEK_STEP_SECONDS;
        break;
      case 'm':
        event.preventDefault();
        video.muted = !video.muted;
        break;
      case 'f':
        event.preventDefault();
        // Fullscreen the wrapper, not the video, so the spinner and error overlays stay visible.
        if (document.fullscreenElement) void document.exitFullscreen();
        else void wrapperRef.current?.requestFullscreen();
        break;
      default:
        break;
    }
  }

  // A paused player must never spin. `waiting` sets buffering and only `playing`/`canplay` clear
  // it, so a blocked or user-paused video would otherwise sit under a spinner indefinitely.
  const showSpinner = state.name === 'loading' || (state.name === 'ready' && buffering && !paused);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      role="region"
      aria-label={`Video player: ${title}`}
      onKeyDown={handleKeyDown}
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-black focus:outline-none focus:ring-2 focus:ring-gray-400"
    >
      <video
        ref={videoRef}
        controls={state.name !== 'idle'}
        playsInline
        poster={posterUrl}
        className="h-full w-full"
        onWaiting={() => setBuffering(true)}
        onStalled={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false);
          setPaused(false);
        }}
        onCanPlay={() => setBuffering(false)}
        onSeeked={() => setBuffering(false)}
        onPlay={() => setPaused(false)}
        onPause={() => {
          setPaused(true);
          setBuffering(false);
        }}
      />

      {state.name === 'idle' && (
        <button
          type="button"
          onClick={() => void start()}
          aria-label={`Play ${title}`}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="ml-1 h-7 w-7 text-gray-900" aria-hidden="true" />
          </span>
        </button>
      )}

      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-white" aria-hidden="true" />
          <span className="sr-only">Loading video</span>
        </div>
      )}

      {state.name === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          {state.message === 'Your viewing session expired' ? (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
              <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </span>
          ) : null}
          <p role="alert" className="text-sm text-white">
            {state.message}
          </p>
          {state.canRetry && (
            <button
              type="button"
              onClick={retry}
              className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
            >
              {state.message === 'Your viewing session expired' ? 'Reload video' : 'Retry'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

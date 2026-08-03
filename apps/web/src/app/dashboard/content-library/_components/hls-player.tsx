'use client';

import { useEffect, useRef, useState } from 'react';

export function HlsPlayer({ manifestUrl, posterUrl }: { manifestUrl: string; posterUrl?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let destroy: (() => void) | undefined;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl;
    } else {
      void import('hls.js').then(({ default: Hls }) => {
        const hls = new Hls(); // withCredentials remains false: object storage permits wildcard CORS.
        hls.loadSource(manifestUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError(data.response?.code === 401 ? 'This preview link has expired — reload the page.' : 'Preview playback failed.');
          }
        });
        destroy = () => hls.destroy();
      }).catch(() => setError('Preview playback is unavailable.'));
    }
    return () => { destroy?.(); video.removeAttribute('src'); video.load(); };
  }, [manifestUrl]);

  return <div><video ref={ref} controls poster={posterUrl} className="aspect-video w-full rounded-lg bg-black" />{error && <p className="mt-2 text-sm text-red-600">{error}</p>}</div>;
}

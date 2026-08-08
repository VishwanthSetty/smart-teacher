// `12:34` under an hour, `1:02:33` over. Callers render a null duration as an em dash rather
// than passing it here — the API leaves durationSecs null until transcoding probes the source.
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const padded = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(rest).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}

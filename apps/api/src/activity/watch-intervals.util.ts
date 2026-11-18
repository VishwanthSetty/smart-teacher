export type WatchInterval = readonly [number, number];

const JOIN_TOLERANCE_SECS = 1;

export function mergeWatchIntervals(
  intervals: readonly WatchInterval[],
  durationSecs: number,
): WatchInterval[] {
  const normalized = intervals
    .map(([start, end]) => [clamp(start, 0, durationSecs), clamp(end, 0, durationSecs)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);

  const merged: WatchInterval[] = [];
  for (const interval of normalized) {
    const previous = merged.at(-1);
    if (!previous || interval[0] > previous[1] + JOIN_TOLERANCE_SECS) {
      merged.push(interval);
      continue;
    }
    merged[merged.length - 1] = [previous[0], Math.max(previous[1], interval[1])];
  }
  return merged;
}

export function limitIntervalsToCoverage(
  intervals: readonly WatchInterval[],
  durationSecs: number,
  maximumCoverageSecs: number,
): WatchInterval[] {
  const normalized = mergeWatchIntervals(intervals, durationSecs);
  let remaining = Math.max(0, maximumCoverageSecs);
  const accepted: WatchInterval[] = [];

  for (const [start, end] of normalized) {
    if (remaining <= 0) break;
    const length = end - start;
    const acceptedEnd = start + Math.min(length, remaining);
    accepted.push([start, acceptedEnd]);
    remaining -= acceptedEnd - start;
  }
  return accepted;
}

export function coveredSeconds(intervals: readonly WatchInterval[]): number {
  return Math.round(intervals.reduce((total, [start, end]) => total + end - start, 0));
}

export function parseWatchIntervals(value: unknown): WatchInterval[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== 'number' ||
      typeof item[1] !== 'number'
    ) {
      return [];
    }
    return [[item[0], item[1]] as WatchInterval];
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

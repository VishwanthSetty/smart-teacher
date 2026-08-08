/**
 * Materialized-path helpers for the content tree.
 *
 * A node's `path` is "/<rootId>/<childId>/.../<selfId>/" — every ancestor id in order,
 * with a leading AND trailing slash. Both slashes matter: without them a prefix match for
 * "/abc1" would also select "/abc10", silently pulling an unrelated subtree into a move
 * or a delete.
 *
 * The path exists so a subtree is one indexed `startsWith` query instead of a recursive
 * CTE. A CTE would need a raw-SQL escape hatch, which raw-sql-guard.spec.ts fails the
 * build on outside its documented allow-list.
 *
 * These are pure functions with no Prisma dependency so the tree arithmetic — the part
 * that is easy to get subtly wrong — can be tested without a database.
 */

export const ROOT_PATH = '/';

// Siblings are spaced rather than consecutive so a drag-reorder rewrites one row instead
// of renumbering the whole sibling set.
export const SORT_ORDER_GAP = 1000;

/** The path a node gets given its parent's path (or ROOT_PATH for a depth-1 node). */
export function buildPath(parentPath: string, nodeId: string): string {
  return `${parentPath}${nodeId}/`;
}

/** Depth is simply how many ids the path carries; a depth-1 node has one. */
export function depthOfPath(path: string): number {
  return path.split('/').filter((segment) => segment.length > 0).length;
}

/** The node's own id — the last segment. */
export function idOfPath(path: string): string | null {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments.length === 0 ? null : segments[segments.length - 1];
}

/**
 * True when `candidatePath` is the node at `nodePath` or anything beneath it.
 *
 * This is the guard against a move that would make a node its own ancestor: re-parenting
 * a node under one of its own descendants would detach the whole subtree from the root
 * and leave a cycle no read could terminate on.
 */
export function isSelfOrDescendant(nodePath: string, candidatePath: string): boolean {
  return candidatePath.startsWith(nodePath);
}

/**
 * Rewrites a descendant's path when its ancestor moves.
 *
 * Only the prefix changes — the portion of the path below the moved node is preserved
 * exactly, so the subtree's internal structure survives a move untouched.
 */
export function rewritePathPrefix(
  descendantPath: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  if (!descendantPath.startsWith(oldPrefix)) {
    // A caller that gets here has selected the wrong rows; silently returning the input
    // would write a subtly wrong tree rather than failing where the bug is.
    throw new Error(`Path "${descendantPath}" is not inside "${oldPrefix}"`);
  }
  return `${newPrefix}${descendantPath.slice(oldPrefix.length)}`;
}

/** The sortOrder for a node appended after the given siblings. */
export function nextSortOrder(siblingSortOrders: readonly number[]): number {
  if (siblingSortOrders.length === 0) {
    return SORT_ORDER_GAP;
  }
  return Math.max(...siblingSortOrders) + SORT_ORDER_GAP;
}

/**
 * The sortOrder that lands a node at `position` among `siblingSortOrders`.
 *
 * Midpoint insertion keeps every other sibling untouched. The gap eventually exhausts
 * after enough insertions at the same spot; when the midpoint collides with the row
 * before it, the caller re-spaces that sibling set with `respace`.
 */
export function sortOrderForPosition(
  siblingSortOrders: readonly number[],
  position: number,
): number | null {
  const sorted = [...siblingSortOrders].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(position, sorted.length));

  if (sorted.length === 0) {
    return SORT_ORDER_GAP;
  }
  if (index === 0) {
    const first = sorted[0];
    // No room below the first sibling — re-spacing is the caller's job.
    return first <= 1 ? null : Math.floor(first / 2);
  }
  if (index >= sorted.length) {
    return sorted[sorted.length - 1] + SORT_ORDER_GAP;
  }

  const before = sorted[index - 1];
  const after = sorted[index];
  const midpoint = Math.floor((before + after) / 2);
  return midpoint === before ? null : midpoint;
}

/** Evenly spaced sortOrders for a sibling set that has run out of room. */
export function respace(count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => (index + 1) * SORT_ORDER_GAP);
}

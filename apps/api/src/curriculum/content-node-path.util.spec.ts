import {
  buildPath,
  depthOfPath,
  idOfPath,
  isSelfOrDescendant,
  nextSortOrder,
  respace,
  rewritePathPrefix,
  ROOT_PATH,
  SORT_ORDER_GAP,
  sortOrderForPosition,
} from './content-node-path.util';

describe('content node path arithmetic', () => {
  describe('buildPath', () => {
    it('roots a top-level node directly under the curriculum', () => {
      expect(buildPath(ROOT_PATH, 'ch1')).toBe('/ch1/');
    });

    it('appends to the parent path so the full ancestry is spelled out', () => {
      expect(buildPath('/ch1/', 'tp1')).toBe('/ch1/tp1/');
      expect(buildPath('/ch1/tp1/', 'st1')).toBe('/ch1/tp1/st1/');
    });
  });

  describe('depthOfPath', () => {
    it('counts the ids in the path', () => {
      expect(depthOfPath('/ch1/')).toBe(1);
      expect(depthOfPath('/ch1/tp1/')).toBe(2);
      expect(depthOfPath('/ch1/tp1/st1/')).toBe(3);
    });

    it('treats the bare root as depth zero', () => {
      expect(depthOfPath(ROOT_PATH)).toBe(0);
    });
  });

  describe('idOfPath', () => {
    it('returns the last segment', () => {
      expect(idOfPath('/ch1/tp1/')).toBe('tp1');
    });

    it('returns null for the bare root', () => {
      expect(idOfPath(ROOT_PATH)).toBeNull();
    });
  });

  describe('isSelfOrDescendant', () => {
    it('matches the node itself', () => {
      expect(isSelfOrDescendant('/ch1/', '/ch1/')).toBe(true);
    });

    it('matches anything beneath it', () => {
      expect(isSelfOrDescendant('/ch1/', '/ch1/tp1/')).toBe(true);
      expect(isSelfOrDescendant('/ch1/', '/ch1/tp1/st1/')).toBe(true);
    });

    it('does not match a sibling', () => {
      expect(isSelfOrDescendant('/ch1/', '/ch2/')).toBe(false);
    });

    it('does not match an ancestor', () => {
      expect(isSelfOrDescendant('/ch1/tp1/', '/ch1/')).toBe(false);
    });

    // The whole reason the path carries a trailing slash. Without it "/ch1" is a prefix
    // of "/ch10", and a move would silently drag an unrelated subtree along.
    it('does not match a node whose id merely starts with the same characters', () => {
      expect(isSelfOrDescendant('/ch1/', '/ch10/')).toBe(false);
      expect(isSelfOrDescendant('/ch1/', '/ch1extra/tp1/')).toBe(false);
    });
  });

  describe('rewritePathPrefix', () => {
    it('swaps the prefix and preserves the structure below it', () => {
      expect(rewritePathPrefix('/ch1/tp1/st1/', '/ch1/', '/ch2/ch1/')).toBe('/ch2/ch1/tp1/st1/');
    });

    it('rewrites the moved node itself', () => {
      expect(rewritePathPrefix('/ch1/', '/ch1/', '/ch2/ch1/')).toBe('/ch2/ch1/');
    });

    // Silently returning the input would write a subtly wrong tree instead of failing
    // where the caller selected the wrong rows.
    it('throws when the path is not inside the prefix', () => {
      expect(() => rewritePathPrefix('/ch2/', '/ch1/', '/ch3/')).toThrow();
    });
  });

  describe('nextSortOrder', () => {
    it('starts at one gap for the first child', () => {
      expect(nextSortOrder([])).toBe(SORT_ORDER_GAP);
    });

    it('appends a gap past the highest sibling', () => {
      expect(nextSortOrder([1000, 3000, 2000])).toBe(4000);
    });
  });

  describe('sortOrderForPosition', () => {
    it('places the only child at one gap', () => {
      expect(sortOrderForPosition([], 0)).toBe(SORT_ORDER_GAP);
    });

    it('appends past the end when the position is at or beyond the last sibling', () => {
      expect(sortOrderForPosition([1000, 2000], 2)).toBe(3000);
      expect(sortOrderForPosition([1000, 2000], 99)).toBe(3000);
    });

    it('halves below the first sibling when inserting at the front', () => {
      expect(sortOrderForPosition([1000, 2000], 0)).toBe(500);
    });

    it('takes the midpoint between two siblings', () => {
      expect(sortOrderForPosition([1000, 2000], 1)).toBe(1500);
    });

    // The gap is finite. Signalling exhaustion rather than colliding is what lets the
    // caller re-space instead of writing a duplicate order.
    it('returns null when the gap between neighbours is exhausted', () => {
      expect(sortOrderForPosition([1000, 1001], 1)).toBeNull();
    });

    it('returns null when there is no room below the first sibling', () => {
      expect(sortOrderForPosition([1], 0)).toBeNull();
    });
  });

  describe('respace', () => {
    it('spreads siblings a full gap apart so midpoints exist again', () => {
      expect(respace(3)).toEqual([1000, 2000, 3000]);
    });

    it('handles an empty sibling set', () => {
      expect(respace(0)).toEqual([]);
    });
  });
});

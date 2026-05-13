import { describe, expect, it } from 'vitest';
import { getScrollToAnchorReason } from 'foliate-js/paginator.js';

describe('Paginator navigation selection restoration', () => {
  it('treats string scroll reasons as reasons instead of selection requests', () => {
    const reason = getScrollToAnchorReason('pagination');

    expect(reason).toBe('pagination');
    expect(reason).not.toBe('selection');
  });

  it('keeps the legacy boolean select flag for explicit selection scrolls', () => {
    expect(getScrollToAnchorReason(true)).toBe('selection');
    expect(getScrollToAnchorReason(false)).toBe('navigation');
    expect(getScrollToAnchorReason()).toBe('navigation');
  });
});

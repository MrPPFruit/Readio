import { describe, expect, it } from 'vitest';

import { shouldHandleSelectionChange } from '@/app/reader/hooks/useTextSelector';

describe('useTextSelector', () => {
  it('ignores Android selectionchange events that were not caused by recent user touch', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'mouse',
        now: 10_000,
        lastSelectionInputAt: 0,
      }),
    ).toBe(false);
  });

  it('handles Android selectionchange events after a recent touch selection gesture', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_400,
      }),
    ).toBe(true);
  });

  it('handles touch selectionchange events on web after recent touch input', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'macos',
        isAndroidApp: false,
        lastPointerType: 'pen',
        now: 10_000,
        lastSelectionInputAt: 9_700,
      }),
    ).toBe(true);
  });

  it('ignores stale touch selectionchange events after the reader reopens', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 7_000,
      }),
    ).toBe(false);
  });
});

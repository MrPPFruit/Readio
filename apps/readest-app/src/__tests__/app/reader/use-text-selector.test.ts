import { describe, expect, it } from 'vitest';

import {
  shouldHandleSelectionChange,
  shouldProcessPendingAndroidSelection,
} from '@/app/reader/hooks/useTextSelector';

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

  it('handles Android selectionchange events after a completed recent touch selection gesture', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_400,
        hasCompletedSelectionInput: true,
      }),
    ).toBe(true);
  });

  it('ignores Android selectionchange events before touchend to avoid restored WebView selections', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_900,
        hasCompletedSelectionInput: false,
      }),
    ).toBe(false);
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

  it('processes a pending Android selection on touchend after a valid in-gesture selectionchange', () => {
    expect(
      shouldProcessPendingAndroidSelection({
        osPlatform: 'android',
        isAndroidApp: true,
        hasPendingSelectionChange: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_500,
      }),
    ).toBe(true);
  });

  it('ignores pending Android selections from stale gestures', () => {
    expect(
      shouldProcessPendingAndroidSelection({
        osPlatform: 'android',
        isAndroidApp: true,
        hasPendingSelectionChange: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 7_000,
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isProbablyInvalidAndroidSelection,
  isReaderContentTouchTarget,
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

  it('handles Android selectionchange events after a completed recent reader touch selection gesture', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_400,
        hasCompletedSelectionInput: true,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(true);
  });

  it('ignores Android selectionchange events after non-reader UI touches', () => {
    expect(
      shouldHandleSelectionChange({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_400,
        hasCompletedSelectionInput: true,
        hasActiveReaderSelectionGesture: false,
      }),
    ).toBe(false);
  });

  it('rejects native touches covered by a reader overlay even when coordinates are inside the iframe', () => {
    const frame = document.createElement('iframe');
    const overlay = document.createElement('div');
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 800, width: 500, height: 800 }) as DOMRect;

    expect(isReaderContentTouchTarget({ frame, topElement: overlay, x: 250, y: 400 })).toBe(false);
  });

  it('rejects native touches shortly after a captured non-reader UI touch', () => {
    const frame = document.createElement('iframe');
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 800, width: 500, height: 800 }) as DOMRect;

    expect(
      isReaderContentTouchTarget({
        frame,
        topElement: frame,
        x: 250,
        y: 400,
        now: 10_000,
        lastNonReaderTouchAt: 9_950,
      }),
    ).toBe(false);
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

  it('keeps intentional single-character Android selections valid', () => {
    expect(
      isProbablyInvalidAndroidSelection({ text: '字', bounds: { width: 12, height: 20 } }),
    ).toBe(false);
  });

  it('rejects obviously oversized Android selections', () => {
    expect(
      isProbablyInvalidAndroidSelection({
        text: '字'.repeat(2001),
        bounds: { width: 320, height: 1200 },
      }),
    ).toBe(true);
  });

  it('rejects Android selections with unusable bounds', () => {
    expect(
      isProbablyInvalidAndroidSelection({ text: '有效文本', bounds: { width: 0, height: 0 } }),
    ).toBe(true);
  });
});

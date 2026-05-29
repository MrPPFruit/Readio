import { describe, expect, it } from 'vitest';

import {
  getAndroidSelectionProcessingDelay,
  isProbablyInvalidAndroidSelection,
  isReaderContentTouchTarget,
  shouldDismissClearedAndroidSelection,
  shouldHandleSelectionChange,
  shouldMarkAndroidSelectionInputProcessed,
  shouldProcessAndroidSelectionOnContextMenu,
  shouldProcessAndroidSelectionOnTouchEnd,
  shouldProcessPendingAndroidSelection,
  shouldScheduleAndroidSelectionTouchEndRetry,
} from '@/app/reader/hooks/useTextSelector';
import { getCurrentDocumentSelectionRange } from '@/utils/sel';

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

  it('accepts Android selection-handle touches when the coordinates are inside the reader iframe', () => {
    const frame = document.createElement('iframe');
    const selectionHandle = document.createElement('div');
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 800, width: 500, height: 800 }) as DOMRect;

    expect(isReaderContentTouchTarget({ frame, topElement: selectionHandle, x: 250, y: 400 })).toBe(
      true,
    );
  });

  it('rejects native touches covered by a reader overlay even when coordinates are inside the iframe', () => {
    const frame = document.createElement('iframe');
    const overlay = document.createElement('div');
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 800, width: 500, height: 800 }) as DOMRect;

    expect(
      isReaderContentTouchTarget({
        frame,
        topElement: overlay,
        x: 250,
        y: 400,
        isReaderOverlayVisible: true,
      }),
    ).toBe(false);
  });

  it('rejects multi-touch gestures inside the reader iframe', () => {
    const frame = document.createElement('iframe');
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 800, width: 500, height: 800 }) as DOMRect;

    expect(
      isReaderContentTouchTarget({ frame, topElement: frame, x: 250, y: 400, pointerCount: 2 }),
    ).toBe(false);
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

  it('accepts reader iframe touches while reader controls are visible', () => {
    const frame = document.createElement('iframe');
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 800, width: 500, height: 800 }) as DOMRect;

    expect(
      isReaderContentTouchTarget({
        frame,
        topElement: frame,
        x: 250,
        y: 400,
        isReaderOverlayVisible: true,
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

  it('processes Android touchend even when no selectionchange event was seen yet', () => {
    expect(
      shouldProcessAndroidSelectionOnTouchEnd({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_500,
        hasPendingSelectionChange: false,
        hadTextSelected: false,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(true);
  });

  it('processes Android contextmenu selections before WebView clears them on touchend', () => {
    expect(
      shouldProcessAndroidSelectionOnContextMenu({
        osPlatform: 'android',
        isAndroidApp: true,
        hasProcessedSelectionInput: false,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_500,
        hadTextSelected: false,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(true);
  });

  it('processes Android contextmenu selections even when a previous text-selected state is stale', () => {
    expect(
      shouldProcessAndroidSelectionOnContextMenu({
        osPlatform: 'android',
        isAndroidApp: true,
        hasProcessedSelectionInput: false,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_500,
        hadTextSelected: true,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(true);
  });

  it('does not reprocess Android contextmenu selections already handled during the same gesture', () => {
    expect(
      shouldProcessAndroidSelectionOnContextMenu({
        osPlatform: 'android',
        isAndroidApp: true,
        hasProcessedSelectionInput: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_500,
        hadTextSelected: true,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(false);
  });

  it('keeps Android contextmenu recovery available after an early invalid selection read', () => {
    expect(
      shouldMarkAndroidSelectionInputProcessed({
        osPlatform: 'android',
        isAndroidApp: true,
        isInvalidAndroidSelection: true,
      }),
    ).toBe(false);
  });

  it('schedules a short Android touchend retry when the first selection read may be early', () => {
    expect(
      shouldScheduleAndroidSelectionTouchEndRetry({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 9_500,
        hadTextSelected: false,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(true);
  });

  it('does not schedule Android touchend retries for stale gestures', () => {
    expect(
      shouldScheduleAndroidSelectionTouchEndRetry({
        osPlatform: 'android',
        isAndroidApp: true,
        lastPointerType: 'touch',
        now: 10_000,
        lastSelectionInputAt: 7_000,
        hadTextSelected: false,
        hasActiveReaderSelectionGesture: true,
      }),
    ).toBe(false);
  });

  it('dismisses Android selection popup immediately when the active reader selection is cleared', () => {
    expect(
      shouldDismissClearedAndroidSelection({
        osPlatform: 'android',
        isAndroidApp: true,
        hadTextSelected: true,
      }),
    ).toBe(true);
  });

  it('dismisses Android selection popup immediately when a selected reader receives a non-reader touch', () => {
    expect(
      shouldDismissClearedAndroidSelection({
        osPlatform: 'android',
        isAndroidApp: true,
        hadTextSelected: true,
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

  it('processes Android selections immediately after touchend when the selection is already valid', () => {
    expect(getAndroidSelectionProcessingDelay(true)).toBe(0);
  });

  it('reads the current document selection range instead of a stale stored range', () => {
    const node = document.createTextNode('第一个字后面还有很多已框选文字');
    document.body.appendChild(node);
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, node.textContent!.length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(getCurrentDocumentSelectionRange(document)?.toString()).toBe(
      '第一个字后面还有很多已框选文字',
    );

    document.getSelection()?.removeAllRanges();
    document.body.removeChild(node);
  });
});

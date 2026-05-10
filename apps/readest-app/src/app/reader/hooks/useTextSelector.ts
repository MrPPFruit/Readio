import { useEffect, useRef } from 'react';
import { BookNote } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { getOSPlatform } from '@/utils/misc';
import { eventDispatcher } from '@/utils/event';
import { isPointerInsideSelection, Point, TextSelection } from '@/utils/sel';
import { useInstantAnnotation } from './useInstantAnnotation';

const SELECTION_INPUT_GRACE_MS = 1_200;
const ANDROID_SELECTION_STABILITY_MS = 100;
const ANDROID_NATIVE_TOUCH_UI_GRACE_MS = 300;
const ANDROID_SELECTION_SUPPRESSION_MS = 700;
const ANDROID_MAX_SELECTION_TEXT_LENGTH = 2_000;

export const isProbablyInvalidAndroidSelection = ({
  text,
  bounds,
}: {
  text: string;
  bounds?: Pick<DOMRect, 'width' | 'height'>;
}) => {
  const trimmedText = text.trim();
  if (!trimmedText) return true;
  if (trimmedText.length > ANDROID_MAX_SELECTION_TEXT_LENGTH) return true;
  if (bounds && (bounds.width <= 0 || bounds.height <= 0)) return true;
  return false;
};

export const isReaderContentTouchTarget = ({
  frame,
  topElement,
  x,
  y,
  now = 0,
  lastNonReaderTouchAt = 0,
  isReaderOverlayVisible = false,
}: {
  frame?: Element | null;
  topElement?: Element | null;
  x: number;
  y: number;
  now?: number;
  lastNonReaderTouchAt?: number;
  isReaderOverlayVisible?: boolean;
}) => {
  const rect = frame?.getBoundingClientRect();
  if (isReaderOverlayVisible || !frame || !rect || topElement !== frame) return false;
  if (lastNonReaderTouchAt > 0 && now - lastNonReaderTouchAt <= ANDROID_NATIVE_TOUCH_UI_GRACE_MS) {
    return false;
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

export const shouldSuppressAndroidSelection = ({
  now,
  selectionSuppressedUntil = 0,
}: {
  now: number;
  selectionSuppressedUntil?: number;
}) => now < selectionSuppressedUntil;

export const shouldClearAndroidSelectionOnIgnoredChange = ({
  osPlatform,
  isAndroidApp,
  now,
  selectionSuppressedUntil = 0,
}: {
  osPlatform: string;
  isAndroidApp?: boolean;
  now: number;
  selectionSuppressedUntil?: number;
}) =>
  osPlatform === 'android' &&
  !!isAndroidApp &&
  shouldSuppressAndroidSelection({ now, selectionSuppressedUntil });

export const clearAndroidNativeSelection = (
  view?: {
    deselect: () => void;
    renderer?: { getContents?: () => { doc: Document }[] };
  } | null,
) => {
  for (const { doc } of view?.renderer?.getContents?.() || []) {
    doc.getSelection()?.removeAllRanges();
  }
  view?.deselect();
};

export const shouldHandleSelectionChange = ({
  osPlatform,
  isAndroidApp,
  lastPointerType,
  now,
  lastSelectionInputAt,
  hasCompletedSelectionInput = true,
  hasActiveReaderSelectionGesture = true,
  selectionSuppressedUntil = 0,
}: {
  osPlatform: string;
  isAndroidApp?: boolean;
  lastPointerType: string;
  now: number;
  lastSelectionInputAt: number;
  hasCompletedSelectionInput?: boolean;
  hasActiveReaderSelectionGesture?: boolean;
  selectionSuppressedUntil?: number;
}) => {
  const isRecentSelectionInput = now - lastSelectionInputAt <= SELECTION_INPUT_GRACE_MS;
  const isTouchInput = lastPointerType === 'touch' || lastPointerType === 'pen';
  const isAndroid = osPlatform === 'android' && isAndroidApp;
  if (isAndroid) {
    return (
      !shouldSuppressAndroidSelection({ now, selectionSuppressedUntil }) &&
      isRecentSelectionInput &&
      hasCompletedSelectionInput &&
      hasActiveReaderSelectionGesture
    );
  }
  return isRecentSelectionInput && isTouchInput;
};

export const shouldProcessPendingAndroidSelection = ({
  osPlatform,
  isAndroidApp,
  hasPendingSelectionChange,
  lastPointerType,
  now,
  lastSelectionInputAt,
  selectionSuppressedUntil = 0,
}: {
  osPlatform: string;
  isAndroidApp?: boolean;
  hasPendingSelectionChange: boolean;
  lastPointerType: string;
  now: number;
  lastSelectionInputAt: number;
  selectionSuppressedUntil?: number;
}) =>
  osPlatform === 'android' &&
  !!isAndroidApp &&
  hasPendingSelectionChange &&
  lastPointerType === 'touch' &&
  !shouldSuppressAndroidSelection({ now, selectionSuppressedUntil }) &&
  now - lastSelectionInputAt <= SELECTION_INPUT_GRACE_MS;

export const useTextSelector = (
  bookKey: string,
  setSelection: React.Dispatch<React.SetStateAction<TextSelection | null>>,
  setEditingAnnotation: React.Dispatch<React.SetStateAction<BookNote | null>>,
  setExternalDragPoint: React.Dispatch<React.SetStateAction<Point | null>>,
  getAnnotationText: (range: Range) => Promise<string>,
  handleDismissPopup: () => void,
) => {
  const { appService } = useEnv();
  const { getBookData } = useBookDataStore();
  const { getView, getViewSettings, getProgress } = useReaderStore();
  const view = getView(bookKey);
  const bookData = getBookData(bookKey);
  const osPlatform = getOSPlatform();

  const isPopuped = useRef(false);
  const isUpToPopup = useRef(false);
  const isTextSelected = useRef(false);
  const isTouchStarted = useRef(false);
  const selectionPosition = useRef<number | null>(null);
  const lastPointerType = useRef<string>('mouse');
  const lastSelectionInputAt = useRef(0);
  const hasCompletedSelectionInput = useRef(false);
  const hasPendingAndroidSelectionChange = useRef(false);
  const hasActiveReaderSelectionGesture = useRef(false);
  const androidSelectionSuppressedUntil = useRef(0);
  const androidSelectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInstantAnnotating = useRef(false);
  const isInstantAnnotated = useRef(false);
  const annotationStartPoint = useRef<Point | null>(null);

  const {
    isInstantAnnotationEnabled,
    handleInstantAnnotationPointerDown,
    handleInstantAnnotationPointerMove,
    handleInstantAnnotationPointerCancel,
    handleInstantAnnotationPointerUp,
  } = useInstantAnnotation({
    bookKey,
    getAnnotationText,
    setSelection,
    setEditingAnnotation,
    setExternalDragPoint,
  });

  const isValidSelection = (sel: Selection) => {
    return sel && sel.toString().trim().length > 0 && sel.rangeCount > 0;
  };

  const makeSelection = async (sel: Selection, index: number, rebuildRange = false) => {
    isTextSelected.current = true;
    const range = sel.getRangeAt(0);
    if (rebuildRange) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const progress = getProgress(bookKey);
    setSelection({
      key: bookKey,
      text: await getAnnotationText(range),
      cfi: view?.getCFI(index, range),
      page: bookData?.isFixedLayout ? index + 1 : progress?.page || 0,
      range,
      index,
    });
  };
  // FIXME: extremely hacky way to dismiss system selection tools on iOS
  const makeSelectionOnIOS = async (sel: Selection, index: number) => {
    isTextSelected.current = true;
    const range = sel.getRangeAt(0);
    setTimeout(() => {
      sel.removeAllRanges();
      setTimeout(async () => {
        if (!isTextSelected.current) return;
        sel.addRange(range);
        const progress = getProgress(bookKey);
        setSelection({
          key: bookKey,
          text: await getAnnotationText(range),
          cfi: view?.getCFI(index, range),
          page: bookData?.isFixedLayout ? index + 1 : progress?.page || 0,
          range,
          index,
        });
      }, 30);
    }, 30);
  };

  const startInstantAnnotating = (ev: PointerEvent) => {
    isInstantAnnotating.current = true;
    isInstantAnnotated.current = false;
    annotationStartPoint.current = { x: ev.clientX, y: ev.clientY };
    if (view) view.renderer.scrollLocked = true;
    (ev.target as HTMLElement).style.userSelect = 'none';
  };

  const stopInstantAnnotating = (ev: PointerEvent) => {
    isInstantAnnotating.current = false;
    isInstantAnnotated.current = false;
    annotationStartPoint.current = null;
    if (view) view.renderer.scrollLocked = false;
    (ev.target as HTMLElement).style.userSelect = '';
  };

  const handlePointerDown = (doc: Document, index: number, ev: PointerEvent) => {
    lastPointerType.current = ev.pointerType;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      lastSelectionInputAt.current = Date.now();
      hasCompletedSelectionInput.current = false;
    }

    if (isInstantAnnotationEnabled()) {
      const handled = handleInstantAnnotationPointerDown(doc, index, ev);
      if (handled) {
        ev.preventDefault();
        startInstantAnnotating(ev);
      }
    }
  };

  const handlePointerMove = (doc: Document, index: number, ev: PointerEvent) => {
    if (isInstantAnnotating.current) {
      // In scroll mode, detect gesture direction before committing to annotation.
      // Cancel if the gesture is along the scroll axis (vertical for normal, horizontal
      // for vertical writing mode) since the user likely intends to scroll.
      if (!isInstantAnnotated.current && annotationStartPoint.current) {
        const dx = Math.abs(ev.clientX - annotationStartPoint.current.x);
        const dy = Math.abs(ev.clientY - annotationStartPoint.current.y);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const viewSettings = getViewSettings(bookKey);
        const isScrollGesture = viewSettings?.vertical ? dy < 3 * dx : dx < 3 * dy;
        if (distance >= 10 && isScrollGesture) {
          stopInstantAnnotating(ev);
          handleInstantAnnotationPointerCancel();
          return;
        }
      }
      ev.preventDefault();
      isInstantAnnotated.current = handleInstantAnnotationPointerMove(doc, index, ev);
    }
  };

  const handlePointerCancel = (_doc: Document, _index: number, ev: PointerEvent) => {
    if (isInstantAnnotating.current) {
      stopInstantAnnotating(ev);
      handleInstantAnnotationPointerCancel();
    }
  };

  const handlePointerUp = async (doc: Document, index: number, ev?: PointerEvent) => {
    if (isInstantAnnotating.current && ev) {
      stopInstantAnnotating(ev);
      const handled = await handleInstantAnnotationPointerUp(doc, index, ev);
      if (handled) {
        isTextSelected.current = true;
        setTimeout(() => {
          isTextSelected.current = false;
        }, 200);
        return;
      } else {
        // If instant annotation was not created, we let the event propagate
        // as an iframe click event which relies on a mousedown event
        (ev.target as Element)?.dispatchEvent(
          new MouseEvent('mousedown', {
            ...ev,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    }

    // Available on iOS and Desktop, fired at touchend or mouseup
    // Note that on Android, we mock pointer events with native touch events
    const sel = doc.getSelection() as Selection;
    if (isValidSelection(sel)) {
      const isPointerInside = ev && isPointerInsideSelection(sel, ev);
      const isIOS = osPlatform === 'ios' || appService?.isIOSApp;

      if (isPointerInside && isIOS) {
        makeSelectionOnIOS(sel, index);
      } else if (isPointerInside) {
        isUpToPopup.current = true;
        makeSelection(sel, index, true);
      } else if (appService?.isAndroidApp) {
        isUpToPopup.current = false;
      }
    }
  };
  const handleTouchMove = (ev: TouchEvent) => {
    if (isInstantAnnotating.current) {
      ev.preventDefault();
    }
  };
  const processPendingSelectionChange = (doc: Document, index: number) => {
    const sel = doc.getSelection() as Selection;
    if (isValidSelection(sel)) {
      const range = sel.getRangeAt(0);
      if (
        appService?.isAndroidApp &&
        isProbablyInvalidAndroidSelection({
          text: sel.toString(),
          bounds: range.getBoundingClientRect(),
        })
      ) {
        selectionPosition.current = null;
        return;
      }
      if (!selectionPosition.current) {
        selectionPosition.current = view?.renderer?.start || null;
      }
      makeSelection(sel, index, false);
    } else {
      selectionPosition.current = null;
    }
  };

  const clearAndroidSelectionTimer = () => {
    if (!androidSelectionTimerRef.current) return;
    clearTimeout(androidSelectionTimerRef.current);
    androidSelectionTimerRef.current = null;
  };

  const resetSelectionInputTracking = () => {
    isTouchStarted.current = false;
    lastPointerType.current = 'mouse';
    lastSelectionInputAt.current = 0;
    hasCompletedSelectionInput.current = false;
    hasPendingAndroidSelectionChange.current = false;
    hasActiveReaderSelectionGesture.current = false;
    clearAndroidSelectionTimer();
  };

  const suppressAndroidSelection = (durationMs = ANDROID_SELECTION_SUPPRESSION_MS) => {
    if (!appService?.isAndroidApp) return;
    androidSelectionSuppressedUntil.current = Date.now() + durationMs;
    clearAndroidNativeSelection(view);
    setTimeout(() => clearAndroidNativeSelection(view), 50);
    setTimeout(() => clearAndroidNativeSelection(view), 200);
    setTimeout(() => clearAndroidNativeSelection(view), durationMs);
    resetSelectionInputTracking();
  };

  const handleTouchStart = (isReaderContentTouch = true) => {
    if (!isReaderContentTouch) {
      suppressAndroidSelection();
      return;
    }
    isTouchStarted.current = true;
    lastPointerType.current = 'touch';
    lastSelectionInputAt.current = Date.now();
    hasCompletedSelectionInput.current = false;
    hasPendingAndroidSelectionChange.current = false;
    hasActiveReaderSelectionGesture.current = true;
  };

  const scheduleAndroidSelectionProcessing = (doc: Document, index: number) => {
    clearAndroidSelectionTimer();
    androidSelectionTimerRef.current = setTimeout(() => {
      androidSelectionTimerRef.current = null;
      if (
        shouldSuppressAndroidSelection({
          now: Date.now(),
          selectionSuppressedUntil: androidSelectionSuppressedUntil.current,
        })
      ) {
        hasPendingAndroidSelectionChange.current = false;
        return;
      }
      processPendingSelectionChange(doc, index);
      hasPendingAndroidSelectionChange.current = false;
    }, ANDROID_SELECTION_STABILITY_MS);
  };

  const handleTouchEnd = (doc: Document, index: number) => {
    if (!hasActiveReaderSelectionGesture.current) return;
    isTouchStarted.current = false;
    hasCompletedSelectionInput.current = true;
    if (
      shouldProcessPendingAndroidSelection({
        osPlatform,
        isAndroidApp: appService?.isAndroidApp,
        hasPendingSelectionChange: hasPendingAndroidSelectionChange.current,
        lastPointerType: lastPointerType.current,
        now: Date.now(),
        lastSelectionInputAt: lastSelectionInputAt.current,
        selectionSuppressedUntil: androidSelectionSuppressedUntil.current,
      })
    ) {
      scheduleAndroidSelectionProcessing(doc, index);
      return;
    }
    hasPendingAndroidSelectionChange.current = false;
  };
  const handleSelectionchange = (doc: Document, index: number) => {
    // Available on iOS, Android and Desktop, fired when the selection is changed.
    // On Android native app, this is the primary way to detect text selection.
    // On web with touch/pen in scroll mode, pointerup never fires (pointercancel
    // fires instead when browser takes over for scrolling), so we also handle
    // selectionchange for touch/pen input to pick up native text selections.
    const now = Date.now();
    if (
      !shouldHandleSelectionChange({
        osPlatform,
        isAndroidApp: appService?.isAndroidApp,
        lastPointerType: lastPointerType.current,
        now,
        lastSelectionInputAt: lastSelectionInputAt.current,
        hasCompletedSelectionInput: hasCompletedSelectionInput.current,
        hasActiveReaderSelectionGesture: hasActiveReaderSelectionGesture.current,
        selectionSuppressedUntil: androidSelectionSuppressedUntil.current,
      })
    ) {
      if (
        shouldClearAndroidSelectionOnIgnoredChange({
          osPlatform,
          isAndroidApp: appService?.isAndroidApp,
          now,
          selectionSuppressedUntil: androidSelectionSuppressedUntil.current,
        })
      ) {
        clearAndroidNativeSelection(view);
      }
      hasPendingAndroidSelectionChange.current = shouldProcessPendingAndroidSelection({
        osPlatform,
        isAndroidApp: appService?.isAndroidApp,
        hasPendingSelectionChange: true,
        lastPointerType: lastPointerType.current,
        now,
        lastSelectionInputAt: lastSelectionInputAt.current,
        selectionSuppressedUntil: androidSelectionSuppressedUntil.current,
      });
      return;
    }

    if (appService?.isAndroidApp) {
      hasPendingAndroidSelectionChange.current = true;
      scheduleAndroidSelectionProcessing(doc, index);
      return;
    }

    processPendingSelectionChange(doc, index);
  };
  const handleScroll = () => {
    // Prevent the container from scrolling when text is selected in paginated mode
    // FIXME: this is a workaround for issue #873
    // TODO: support text selection across pages
    if (osPlatform !== 'android' || !appService?.isAndroidApp) return;

    const viewSettings = getViewSettings(bookKey);
    if (viewSettings?.scrolled) return;

    if (isTextSelected.current && view?.renderer?.containerPosition && selectionPosition.current) {
      console.warn('Keep container position', selectionPosition.current);
      view.renderer.containerPosition = selectionPosition.current;
    }
  };

  const handleShowPopup = (showPopup: boolean) => {
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    if (showPopup) {
      if (!isPopuped.current) {
        isUpToPopup.current = false;
      }
      isPopuped.current = true;
      return;
    }
    popupTimerRef.current = setTimeout(() => {
      isPopuped.current = false;
      popupTimerRef.current = null;
    }, 100);
  };

  const handleUpToPopup = () => {
    isUpToPopup.current = true;
  };

  const handleContextmenu = (event: Event) => {
    if (appService?.isMobile) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    } else if (lastPointerType.current === 'touch' || lastPointerType.current === 'pen') {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return;
  };

  useEffect(() => {
    const handleAndroidSelectionSuppress = () => suppressAndroidSelection();
    eventDispatcher.on('android-selection-suppress', handleAndroidSelectionSuppress);
    return () => {
      eventDispatcher.off('android-selection-suppress', handleAndroidSelectionSuppress);
      clearAndroidSelectionTimer();
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleSingleClick = (): boolean => {
      if (isUpToPopup.current) {
        isUpToPopup.current = false;
        return true;
      }
      if (isTextSelected.current) {
        handleDismissPopup();
        isTextSelected.current = false;
        view?.deselect();
        return true;
      }
      if (isPopuped.current) {
        handleDismissPopup();
        return true;
      }
      return false;
    };

    eventDispatcher.onSync('iframe-single-click', handleSingleClick);
    return () => {
      eventDispatcher.offSync('iframe-single-click', handleSingleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isTextSelected,
    isInstantAnnotating,
    handleScroll,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerCancel,
    handlePointerUp,
    handleSelectionchange,
    handleShowPopup,
    handleUpToPopup,
    clearPendingSelectionProcessing: clearAndroidSelectionTimer,
    resetSelectionInputTracking,
    handleContextmenu,
  };
};

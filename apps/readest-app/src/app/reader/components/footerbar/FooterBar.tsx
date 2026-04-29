import clsx from 'clsx';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { readioFeatures } from '@/config/features';
import { useEnv } from '@/context/EnvContext';
import { useSpatialNavigation } from '@/app/reader/hooks/useSpatialNavigation';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useDeviceControlStore } from '@/store/deviceStore';
import { eventDispatcher } from '@/utils/event';
import { FooterBarProps, NavigationHandlers, FooterBarChildProps } from './types';
import { debounce } from '@/utils/debounce';
import { RSVPControl } from '../rsvp';
import MobileFooterBar from './MobileFooterBar';
import DesktopFooterBar from './DesktopFooterBar';
import TTSControl from '../tts/TTSControl';

const FooterBar: React.FC<FooterBarProps> = ({
  bookKey,
  bookFormat,
  section,
  pageinfo,
  toc,
  isHoveredAnim,
  gridInsets,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { getConfig, setConfig, getBookData } = useBookDataStore();
  const { hoveredBookKey, setHoveredBookKey, setFooterActionTab } = useReaderStore();
  const { getView, getViewState, getProgress, getViewSettings } = useReaderStore();
  const { isSideBarVisible, setSideBarVisible } = useSidebarStore();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();

  const view = getView(bookKey);
  const config = getConfig(bookKey);
  const bookData = getBookData(bookKey);
  const viewState = getViewState(bookKey);
  const progress = getProgress(bookKey);
  const viewSettings = getViewSettings(bookKey);

  const [userSelectedTab, setUserSelectedTab] = useState('');
  const actionTab = hoveredBookKey === bookKey ? userSelectedTab : '';
  const isVisible = hoveredBookKey === bookKey;

  useEffect(() => {
    setFooterActionTab(bookKey, actionTab);
  }, [actionTab, bookKey, setFooterActionTab]);

  const docs = view?.renderer.getContents() ?? [];
  const pointerInDoc = docs.some(({ doc }) => doc?.body?.style.cursor === 'pointer');

  const progressInfo = useMemo(
    () => (bookFormat === 'PDF' ? section : pageinfo),
    [bookFormat, section, pageinfo],
  );

  const progressValid = !!progressInfo && progressInfo.total > 0 && progressInfo.current >= 0;
  const progressFraction = useMemo(() => {
    if (progressValid && progressInfo.total > 0 && progressInfo.current >= 0) {
      return (progressInfo.current + 1) / progressInfo.total;
    }
    return 0;
  }, [progressValid, progressInfo]);

  const tocItems = useMemo(() => {
    const items: NonNullable<typeof toc> = [];
    const collectItems = (list?: typeof toc) => {
      list?.forEach((item) => {
        items.push(item);
        collectItems(item.subitems);
      });
    };

    collectItems(toc);
    return items.sort((a, b) => {
      const aPage = a.location?.current ?? a.index ?? 0;
      const bPage = b.location?.current ?? b.index ?? 0;
      return bPage - aPage;
    });
  }, [toc]);

  const getProgressPreview = useCallback(
    (value: number) => {
      if (!progressValid || !progressInfo) return undefined;
      const targetPage = Math.max(
        1,
        Math.min(progressInfo.total, Math.round((value / 100) * progressInfo.total)),
      );
      const targetIndex = targetPage - 1;
      const sectionLabel =
        tocItems.find((item) => {
          const itemPage = item.location?.current ?? item.index;
          return itemPage !== undefined && itemPage <= targetIndex;
        })?.label ||
        progress?.sectionLabel ||
        '';

      return {
        sectionLabel,
        pageLabel: `${targetPage} / ${progressInfo.total}`,
      };
    },
    [progress?.sectionLabel, progressInfo, progressValid, tocItems],
  );

  const handleProgressChange = useMemo(
    () =>
      debounce((value: number) => {
        view?.goToFraction(value / 100.0);
      }, 100),
    [view],
  );

  const handleGoPrevPage = useCallback(() => {
    view?.renderer.prev();
  }, [view]);

  const handleGoNextPage = useCallback(() => {
    view?.renderer.next();
  }, [view]);

  const handleGoPrevSection = useCallback(() => {
    view?.renderer.prevSection?.();
  }, [view]);

  const handleGoNextSection = useCallback(() => {
    view?.renderer.nextSection?.();
  }, [view]);

  const handleGoBack = useCallback(() => {
    view?.history.back();
  }, [view]);

  const handleGoForward = useCallback(() => {
    view?.history.forward();
  }, [view]);

  const handleSpeakText = useCallback(async () => {
    if (!readioFeatures.tts || !view || !progress || !viewState) return;

    const eventType = viewState.ttsEnabled ? 'tts-stop' : 'tts-speak';
    eventDispatcher.dispatch(eventType, { bookKey });
  }, [view, progress, viewState, bookKey]);

  const handleSetActionTab = useCallback(
    (tab: string) => {
      setUserSelectedTab((prevTab) => (prevTab === tab ? '' : tab));

      if (tab === 'tts') {
        if (!readioFeatures.tts) return;
        if (viewState?.ttsEnabled) {
          setHoveredBookKey('');
        }
        handleSpeakText();
      } else if (tab === 'toc') {
        setHoveredBookKey('');
        if (config?.viewSettings) {
          setConfig(bookKey, { viewSettings: { ...config.viewSettings, sideBarTab: 'toc' } });
        }
        setSideBarVisible(true);
      } else if (tab === 'note') {
        setHoveredBookKey('');
        setSideBarVisible(true);
        if (config?.viewSettings) {
          setConfig(bookKey, {
            viewSettings: { ...config.viewSettings, sideBarTab: 'annotations' },
          });
        }
      }
    },
    [
      config,
      bookKey,
      viewState?.ttsEnabled,
      setConfig,
      setSideBarVisible,
      setHoveredBookKey,
      handleSpeakText,
    ],
  );

  const navigationHandlers: NavigationHandlers = useMemo(
    () => ({
      onPrevPage: handleGoPrevPage,
      onNextPage: handleGoNextPage,
      onPrevSection: handleGoPrevSection,
      onNextSection: handleGoNextSection,
      onGoBack: handleGoBack,
      onGoForward: handleGoForward,
      onProgressChange: handleProgressChange,
    }),
    [
      handleGoPrevPage,
      handleGoNextPage,
      handleGoPrevSection,
      handleGoNextSection,
      handleGoBack,
      handleGoForward,
      handleProgressChange,
    ],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent | CustomEvent) => {
      if (event instanceof CustomEvent) {
        if (event.detail.keyName === 'Back') {
          setHoveredBookKey('');
          (document.activeElement as HTMLElement)?.blur();
          return true;
        }
      } else {
        if (event.key === 'Escape') {
          setHoveredBookKey('');
          (document.activeElement as HTMLElement)?.blur();
        }
        event.stopPropagation();
      }
      return false;
    },
    [setHoveredBookKey],
  );

  useEffect(() => {
    if (!appService?.isAndroidApp) return;

    if (hoveredBookKey) {
      acquireBackKeyInterception();
      eventDispatcher.onSync('native-key-down', handleKeyDown);
    }
    return () => {
      if (hoveredBookKey) {
        releaseBackKeyInterception();
        eventDispatcher.offSync('native-key-down', handleKeyDown);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredBookKey]);

  const footerBarRef = useRef<HTMLDivElement>(null);
  useSpatialNavigation(footerBarRef, isVisible);

  // Force the mobile footer bar on mobile tablets/foldables in portrait mode
  // where the viewport width exceeds the `sm:` (640px) breakpoint. Phones
  // (innerWidth < 640) are intentionally excluded so their styling and panel
  // slide-down animation remain exactly as before — see #3742 / #3746.
  const forceMobileLayout =
    !!appService?.isMobile && window.innerWidth >= 640 && window.innerWidth <= window.innerHeight;

  const commonProps: FooterBarChildProps = {
    bookKey,
    gridInsets,
    actionTab,
    progressValid,
    progressFraction,
    getProgressPreview,
    navigationHandlers,
    forceMobileLayout,
    onSetActionTab: handleSetActionTab,
    onSpeakText: handleSpeakText,
    ttsEnabled: readioFeatures.tts,
  };

  const needHorizontalScroll =
    (viewSettings?.vertical && viewSettings?.scrolled) ||
    (bookData?.isFixedLayout && viewSettings?.zoomLevel && viewSettings.zoomLevel > 100);

  const containerClasses = clsx(
    'footer-bar shadow-xs bottom-0 left-0 z-10 flex w-full flex-col',
    !forceMobileLayout && 'sm:h-[52px] sm:bg-base-100 sm:border-none',
    'border-base-300/50 border-t',
    'transition-[opacity,transform] duration-300',
    forceMobileLayout || window.innerWidth < 640 ? 'fixed' : 'absolute',
    appService?.hasRoundedWindow && 'rounded-window-bottom-right',
    !isSideBarVisible && appService?.hasRoundedWindow && 'rounded-window-bottom-left',
    isHoveredAnim && 'hover-bar-anim',
    !forceMobileLayout &&
      (needHorizontalScroll ? 'sm:!bottom-3 sm:!h-10 sm:justify-end' : 'sm:justify-center'),
    isVisible
      ? 'pointer-events-auto translate-y-0 opacity-100'
      : forceMobileLayout
        ? 'pointer-events-none translate-y-full opacity-0'
        : 'pointer-events-none translate-y-full opacity-0 sm:translate-y-0',
  );

  const isMobile = appService?.isMobile || window.innerWidth < 640;

  return (
    <>
      {/* Hover trigger area */}
      <div
        role='none'
        tabIndex={-1}
        className={clsx(
          'absolute bottom-0 left-0 z-10 flex h-[52px] w-full',
          needHorizontalScroll && 'sm:!bottom-3 sm:!h-7',
          isMobile || pointerInDoc ? 'pointer-events-none' : '',
        )}
        onMouseEnter={() => !isMobile && setHoveredBookKey(bookKey)}
        onTouchStart={() => !isMobile && setHoveredBookKey(bookKey)}
      />

      {/* Main footer container */}
      <div
        ref={footerBarRef}
        role='contentinfo'
        aria-label={_('Footer Bar')}
        className={containerClasses}
        dir={viewSettings?.rtl ? 'rtl' : 'ltr'}
        onFocus={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onMouseLeave={() => window.innerWidth >= 640 && setHoveredBookKey('')}
      >
        <MobileFooterBar {...commonProps} />
        <DesktopFooterBar {...commonProps} />
      </div>
      {isVisible && needHorizontalScroll && (
        <div className='bg-base-100 pointer-events-none absolute bottom-0 left-0 hidden h-3 w-full sm:block' />
      )}

      {readioFeatures.tts && <TTSControl bookKey={bookKey} gridInsets={gridInsets} />}
      {readioFeatures.speedReading && <RSVPControl bookKey={bookKey} gridInsets={gridInsets} />}
    </>
  );
};

export default FooterBar;

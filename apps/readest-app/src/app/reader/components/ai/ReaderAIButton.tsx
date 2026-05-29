import clsx from 'clsx';
import React, { useLayoutEffect, useState } from 'react';
import { MdAutoAwesome, MdMenuBook } from 'react-icons/md';

import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';

interface ReaderAIButtonProps {
  bookKey: string;
  onClick: () => void;
}

const READER_AI_BUTTON_BOTTOM_OFFSET = {
  default: 64,
  panelGap: 0,
} as const;

const MOBILE_FOOTER_PANEL_SELECTORS = {
  progress: '.footerbar-progress-mobile',
  font: '.footerbar-font-mobile',
  color: '.footerbar-color-mobile',
} as const;

type MobileFooterPanelTab = keyof typeof MOBILE_FOOTER_PANEL_SELECTORS;

const MOBILE_FOOTER_PANEL_HEIGHTS: Record<MobileFooterPanelTab, number> = {
  progress: 143,
  font: 140,
  color: 283,
};

const MOBILE_FOOTER_PANEL_TABS = new Set<MobileFooterPanelTab>(['progress', 'font', 'color']);

const ReaderAIButton: React.FC<ReaderAIButtonProps> = ({ bookKey, onClick }) => {
  const { appService } = useEnv();
  const { hoveredBookKey, getFooterActionTab, getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);
  const footerActionTab = getFooterActionTab(bookKey);
  const isMobileFooter =
    appService?.isMobile || window.innerWidth < 640 || window.innerHeight < 640;
  const footerPanelTab = MOBILE_FOOTER_PANEL_TABS.has(footerActionTab as MobileFooterPanelTab)
    ? (footerActionTab as MobileFooterPanelTab)
    : null;
  const isMobileFooterPanelOpen = isMobileFooter && footerPanelTab;
  const expectedMobileFooterPanelHeight = footerPanelTab
    ? MOBILE_FOOTER_PANEL_HEIGHTS[footerPanelTab]
    : 0;
  const [mobileFooterPanelHeight, setMobileFooterPanelHeight] = useState(
    expectedMobileFooterPanelHeight,
  );

  useLayoutEffect(() => {
    if (!isMobileFooterPanelOpen || !footerPanelTab) {
      setMobileFooterPanelHeight(0);
      return;
    }

    const expectedPanelHeight = MOBILE_FOOTER_PANEL_HEIGHTS[footerPanelTab];
    setMobileFooterPanelHeight(expectedPanelHeight);

    const measurePanelHeight = () => {
      const panel = document.querySelector<HTMLElement>(
        MOBILE_FOOTER_PANEL_SELECTORS[footerPanelTab],
      );
      if (!panel) return;

      const panelHeight = Math.round(panel.getBoundingClientRect().height);
      if (panelHeight > expectedPanelHeight) setMobileFooterPanelHeight(panelHeight);
    };

    const animationFrame = window.requestAnimationFrame(measurePanelHeight);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [footerPanelTab, isMobileFooterPanelOpen]);

  const bottomOffset =
    READER_AI_BUTTON_BOTTOM_OFFSET.default +
    mobileFooterPanelHeight +
    (isMobileFooterPanelOpen ? READER_AI_BUTTON_BOTTOM_OFFSET.panelGap : 0);
  const stopAIButtonPointerPropagation = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const openAIOnClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };

  if (hoveredBookKey !== bookKey && !isMobileFooterPanelOpen) return null;

  return (
    <div
      className={clsx(
        'absolute z-40 h-12 w-12 transition-[bottom] duration-300 sm:h-12 sm:w-12',
        viewSettings?.rtl ? 'left-4 sm:left-5' : 'right-4 sm:right-5',
      )}
      style={{
        bottom: isMobileFooterPanelOpen
          ? `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`
          : appService?.hasSafeAreaInset
            ? `calc(env(safe-area-inset-bottom, 0px) * ${appService?.isIOSApp ? 0.33 : 1} + ${bottomOffset}px)`
            : `${bottomOffset}px`,
      }}
    >
      <button
        type='button'
        onPointerDown={stopAIButtonPointerPropagation}
        onClick={openAIOnClick}
        className={clsx(
          'border-base-content/10 bg-base-100/95 text-base-content relative h-12 min-h-12 w-12 rounded-2xl border shadow-xl backdrop-blur-md sm:h-12 sm:min-h-12 sm:w-12',
          'font-sans transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-95',
          'focus-visible:ring-primary focus-visible:ring-offset-base-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'eink:border-base-content eink:bg-base-100 eink:shadow-none not-eink:hover:border-primary/40 not-eink:hover:bg-base-200',
        )}
        aria-label='打开 AI 阅读助手'
        aria-haspopup='dialog'
      >
        <span className='border-base-100 bg-primary text-primary-content absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border'>
          <MdAutoAwesome size={12} aria-hidden='true' />
        </span>
        <span
          className='text-primary flex h-full w-full items-center justify-center'
          aria-hidden='true'
        >
          <MdMenuBook size={23} />
        </span>
      </button>
    </div>
  );
};

export default ReaderAIButton;

import clsx from 'clsx';
import React from 'react';
import { MdAutoAwesome, MdMenuBook } from 'react-icons/md';

import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';

interface ReaderAIButtonProps {
  bookKey: string;
  onClick: () => void;
}

const READER_AI_BUTTON_BOTTOM_OFFSET = {
  default: 64,
  progress: 184,
  font: 210,
  color: 280,
} as const;

const ReaderAIButton: React.FC<ReaderAIButtonProps> = ({ bookKey, onClick }) => {
  const { appService } = useEnv();
  const { hoveredBookKey, getFooterActionTab, getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);
  const footerActionTab = getFooterActionTab(bookKey);
  const isMobileFooter =
    appService?.isMobile || window.innerWidth < 640 || window.innerHeight < 640;
  const bottomOffset =
    isMobileFooter && footerActionTab in READER_AI_BUTTON_BOTTOM_OFFSET
      ? READER_AI_BUTTON_BOTTOM_OFFSET[
          footerActionTab as keyof typeof READER_AI_BUTTON_BOTTOM_OFFSET
        ]
      : READER_AI_BUTTON_BOTTOM_OFFSET.default;

  if (hoveredBookKey !== bookKey) return null;

  return (
    <div
      className={clsx(
        'absolute z-40 h-12 w-12 transition-[bottom] duration-300 sm:h-12 sm:w-12',
        viewSettings?.rtl ? 'left-4 sm:left-5' : 'right-4 sm:right-5',
      )}
      style={{
        bottom: appService?.hasSafeAreaInset
          ? `calc(env(safe-area-inset-bottom, 0px) * ${appService?.isIOSApp ? 0.33 : 1} + ${bottomOffset}px)`
          : `${bottomOffset}px`,
      }}
    >
      <button
        type='button'
        onClick={onClick}
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

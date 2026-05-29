import clsx from 'clsx';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { MdArrowBackIosNew, MdArrowForwardIos } from 'react-icons/md';
import { useEnv } from '@/context/EnvContext';
import { useDrag } from '@/hooks/useDrag';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useDeviceControlStore } from '@/store/deviceStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { impactFeedback } from '@tauri-apps/plugin-haptics';
import { getDirFromUILanguage } from '@/utils/rtl';
import { eventDispatcher } from '@/utils/event';
import { Overlay } from './Overlay';

const VELOCITY_THRESHOLD = 0.5;
const SNAP_THRESHOLD = 0.2;
const openDialogStack: symbol[] = [];

const registerOpenDialog = (dialogId: symbol) => {
  const existingIndex = openDialogStack.indexOf(dialogId);
  if (existingIndex !== -1) openDialogStack.splice(existingIndex, 1);
  openDialogStack.push(dialogId);
};

const unregisterOpenDialog = (dialogId: symbol) => {
  const existingIndex = openDialogStack.indexOf(dialogId);
  if (existingIndex !== -1) openDialogStack.splice(existingIndex, 1);
};

const isTopOpenDialog = (dialogId: symbol) =>
  openDialogStack[openDialogStack.length - 1] === dialogId;

interface DialogProps {
  id?: string;
  isOpen: boolean;
  children: ReactNode;
  snapHeight?: number;
  dismissible?: boolean;
  header?: ReactNode;
  title?: string;
  ariaDescribedBy?: string;
  dragHandleLabel?: string;
  className?: string;
  bgClassName?: string;
  boxClassName?: string;
  contentClassName?: string;
  onClose: () => void;
}

const Dialog: React.FC<DialogProps> = ({
  id,
  isOpen,
  children,
  snapHeight,
  dismissible = true,
  header,
  title,
  ariaDescribedBy,
  dragHandleLabel,
  className,
  bgClassName,
  boxClassName,
  contentClassName,
  onClose,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { systemUIVisible, statusBarHeight, safeAreaInsets } = useThemeStore();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();
  const [isFullHeightInMobile, setIsFullHeightInMobile] = useState(!snapHeight);
  const [isRtl] = useState(() => getDirFromUILanguage() === 'rtl');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogIdRef = useRef(Symbol('Dialog'));
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const iconSize22 = useResponsiveSize(22);
  const isMobile = window.innerWidth < 640 || window.innerHeight < 640;

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [dismissible, onClose]);

  const restorePreviousFocus = (dialogElement: HTMLDialogElement | null) => {
    const previousActiveElement = previousActiveElementRef.current;
    if (!previousActiveElement) return;

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (
      !activeElement ||
      activeElement === document.body ||
      dialogElement?.contains(activeElement)
    ) {
      previousActiveElement.focus({ preventScroll: true });
      previousActiveElementRef.current = null;
    }
  };

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) return;

    if (!dialogRef.current.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
    } else if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent | CustomEvent) => {
    if (!isTopOpenDialog(dialogIdRef.current)) return false;

    if (event instanceof CustomEvent) {
      if (event.detail.keyName === 'Back') {
        if (dismissibleRef.current) onCloseRef.current();
        return true;
      }
    } else {
      if (event.key === 'Escape') {
        if (dismissibleRef.current) onCloseRef.current();
      } else {
        trapFocus(event);
      }
      event.stopPropagation();
    }
    return false;
  };

  useEffect(() => {
    if (!isOpen) {
      restorePreviousFocus(dialogRef.current);
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    registerOpenDialog(dialogIdRef.current);
    setIsFullHeightInMobile(!snapHeight && isMobile);
    window.addEventListener('keydown', handleKeyDown);
    if (dialogRef.current) {
      dialogRef.current.addEventListener('keydown', handleKeyDown);
    }
    if (appService?.isAndroidApp) {
      acquireBackKeyInterception();
      eventDispatcher.onSync('native-key-down', handleKeyDown);
    }

    const dialogElement = dialogRef.current;
    const initialFocusTarget = dragHandleLabel
      ? dialogElement?.querySelector<HTMLElement>('.drag-handle')
      : dialogElement;
    initialFocusTarget?.focus({ preventScroll: true });

    return () => {
      unregisterOpenDialog(dialogIdRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      dialogElement?.removeEventListener('keydown', handleKeyDown);
      if (appService?.isAndroidApp) {
        releaseBackKeyInterception();
        eventDispatcher.offSync('native-key-down', handleKeyDown);
      }
      restorePreviousFocus(dialogElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDragMove = (data: { clientY: number; deltaY: number }) => {
    if (!dismissible || (!isMobile && !snapHeight) || !dialogRef.current) return;

    const modal = dialogRef.current.querySelector('.modal-box') as HTMLElement;
    const overlay = dialogRef.current.querySelector('.overlay') as HTMLElement;

    const heightFraction = data.clientY / window.innerHeight;
    const newTop = Math.max(0.0, Math.min(1, heightFraction));

    if (modal && overlay) {
      modal.style.height = '100%';
      modal.style.transform = `translateY(${newTop * 100}%)`;
      overlay.style.opacity = `${1 - heightFraction}`;

      setIsFullHeightInMobile(data.clientY < 44);
      modal.style.transition = `padding-top 0.3s ease-out`;
    }
  };

  const handleDragEnd = (data: { velocity: number; clientY: number }) => {
    if (!dismissible || (!isMobile && !snapHeight) || !dialogRef.current) return;
    const modal = dialogRef.current.querySelector('.modal-box') as HTMLElement;
    const overlay = dialogRef.current.querySelector('.overlay') as HTMLElement;
    if (!modal || !overlay) return;

    const snapUpper = snapHeight ? 1 - snapHeight - SNAP_THRESHOLD : 0.5;
    const snapLower = snapHeight ? 1 - snapHeight + SNAP_THRESHOLD : 0.5;
    if (
      data.velocity > VELOCITY_THRESHOLD ||
      (data.velocity >= 0 && data.clientY >= window.innerHeight * snapLower)
    ) {
      // dialog is dismissed
      const transitionDuration = 0.15 / Math.max(data.velocity, 0.5);
      modal.style.height = '100%';
      modal.style.transition = `transform ${transitionDuration}s ease-out`;
      modal.style.transform = 'translateY(100%)';
      overlay.style.transition = `opacity ${transitionDuration}s ease-out`;
      overlay.style.opacity = '0';
      onCloseRef.current();
      setTimeout(() => {
        modal.style.transform = 'translateY(0%)';
      }, 300);
    } else if (
      snapHeight &&
      data.clientY > window.innerHeight * snapUpper &&
      data.clientY < window.innerHeight * snapLower
    ) {
      // dialog is snapped
      overlay.style.transition = `opacity 0.3s ease-out`;
      overlay.style.opacity = `${1 - snapHeight}`;
      modal.style.height = `${snapHeight * 100}%`;
      modal.style.bottom = '0';
      modal.style.transition = `transform 0.3s ease-out`;
      modal.style.transform = '';
    } else {
      // dialog is opened without snap
      setIsFullHeightInMobile(true);
      modal.style.height = '100%';
      modal.style.transition = `transform 0.3s ease-out`;
      modal.style.transform = `translateY(0%)`;
      overlay.style.opacity = '0';
    }
    if (appService?.hasHaptics) {
      impactFeedback('medium');
    }
  };

  const handleDragKeyDown = () => {};

  const { handleDragStart } = useDrag(handleDragMove, handleDragKeyDown, handleDragEnd);
  const closeIfDismissible = () => {
    if (dismissibleRef.current) onCloseRef.current();
  };

  return (
    <dialog
      ref={dialogRef}
      id={id ?? 'dialog'}
      tabIndex={-1}
      open={isOpen}
      aria-label={title}
      aria-describedby={ariaDescribedBy}
      aria-modal='true'
      aria-hidden={!isOpen}
      className={clsx(
        'modal sm:min-w-90 z-50 h-full w-full !items-start !bg-transparent sm:w-full sm:!items-center',
        className,
      )}
      dir={isRtl ? 'rtl' : undefined}
    >
      <Overlay
        className={clsx(
          'dialog-overlay z-10 bg-black/50 sm:bg-black/50',
          appService?.hasRoundedWindow && 'rounded-window',
          bgClassName,
        )}
        onDismiss={dismissible ? closeIfDismissible : () => undefined}
      />
      <div
        className={clsx(
          'modal-box settings-content absolute z-20 flex flex-col rounded-none rounded-tl-2xl rounded-tr-2xl p-0 sm:rounded-2xl',
          'h-full max-h-full w-full max-w-full',
          window.innerWidth < window.innerHeight
            ? 'sm:h-[50%] sm:w-3/4'
            : 'sm:h-[65%] sm:w-1/2 sm:max-w-[600px]',
          boxClassName,
        )}
        style={{
          paddingTop:
            appService?.hasSafeAreaInset && isFullHeightInMobile
              ? `${Math.max(safeAreaInsets?.top || 0, systemUIVisible ? statusBarHeight : 0)}px`
              : '0px',
          ...(isMobile
            ? snapHeight
              ? { height: `${snapHeight * 100}%`, top: 'auto', bottom: 0 }
              : { height: '100%', bottom: 0 }
            : {}),
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        {dragHandleLabel ? (
          <button
            type='button'
            className={clsx(
              'drag-handle group mb-2 flex h-6 max-h-6 min-h-6 w-full cursor-row-resize touch-none items-center justify-center bg-transparent p-0',
              'transition-padding-top duration-300 ease-out focus-visible:outline-none sm:hidden',
            )}
            onClick={closeIfDismissible}
            onMouseDown={dismissible ? handleDragStart : undefined}
            onTouchStart={dismissible ? handleDragStart : undefined}
            disabled={!dismissible}
            aria-label={dragHandleLabel}
          >
            <span className='bg-base-content/50 group-focus-visible:ring-primary/40 h-1 w-10 rounded-full group-focus-visible:ring-2'></span>
          </button>
        ) : (
          <div
            className={clsx(
              'drag-handle mb-2 h-6 max-h-6 min-h-6 w-full cursor-row-resize items-center justify-center',
              'transition-padding-top flex duration-300 ease-out sm:hidden',
            )}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className='bg-base-content/50 h-1 w-10 rounded-full'></div>
          </div>
        )}
        <div className='dialog-header sticky top-1 z-10 flex items-center justify-between px-2 sm:pe-3 sm:ps-2'>
          {header ? (
            header
          ) : (
            <div className='flex h-11 w-full items-center justify-between'>
              <button
                aria-label={_('Close')}
                aria-hidden={!isOpen}
                onClick={closeIfDismissible}
                disabled={!dismissible}
                className={
                  'btn btn-ghost btn-circle flex h-8 min-h-8 w-8 hover:bg-transparent focus:outline-none disabled:bg-transparent sm:hidden'
                }
              >
                {isRtl ? (
                  <MdArrowForwardIos size={iconSize22} />
                ) : (
                  <MdArrowBackIosNew size={iconSize22} />
                )}
              </button>
              <div className='z-15 pointer-events-none absolute inset-0 flex h-11 items-center justify-center'>
                <span className='line-clamp-1 text-center font-bold'>{title ?? ''}</span>
              </div>
              <button
                aria-label={_('Close')}
                aria-hidden={!isOpen}
                onClick={closeIfDismissible}
                disabled={!dismissible}
                className={
                  'bg-base-300/65 btn btn-ghost btn-circle ml-auto hidden h-6 min-h-6 w-6 focus:outline-none sm:flex'
                }
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  width='1em'
                  height='1em'
                  viewBox='0 0 24 24'
                >
                  <path
                    fill='currentColor'
                    d='M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z'
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div
          className={clsx(
            'text-base-content my-2 flex-grow overflow-y-auto px-6 sm:px-[10%]',
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </dialog>
  );
};

export default Dialog;

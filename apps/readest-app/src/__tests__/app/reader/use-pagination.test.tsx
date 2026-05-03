import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePagination } from '@/app/reader/hooks/usePagination';
import type { FoliateView } from '@/types/view';

const readerStoreMock = vi.hoisted(() => ({
  getProgress: vi.fn(),
  getViewSettings: vi.fn(),
  getViewState: vi.fn(),
  hoveredBookKey: null as string | null,
  setHoveredBookKey: vi.fn(),
  setPendingPageInfo: vi.fn(),
}));

const bookDataStoreMock = vi.hoisted(() => ({
  getBookData: vi.fn(),
}));

const mockView = {
  book: { dir: 'ltr', rendition: { layout: 'reflowable' } },
  renderer: {
    scrolled: false,
    atStart: false,
    atEnd: false,
    size: 800,
    prevSection: vi.fn(),
    nextSection: vi.fn(),
  },
  prev: vi.fn(),
  next: vi.fn(),
  pan: vi.fn(),
  isOverflowX: vi.fn(() => false),
  isOverflowY: vi.fn(() => false),
  history: {
    back: vi.fn(),
    forward: vi.fn(),
  },
};

const baseViewSettings = {
  disableClick: false,
  fullscreenClickArea: false,
  readingRulerEnabled: false,
  rtl: false,
  scrolled: false,
  showBarsOnScroll: false,
  showFooter: false,
  showHeader: false,
  scrollingOverlap: 0,
  swapClickArea: false,
  volumeKeysToFlip: false,
  zoomLevel: 100,
  zoomMode: 'fit-page',
};

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isMobileApp: false, isMobile: false } }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => bookDataStoreMock,
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => readerStoreMock,
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireVolumeKeyInterception: vi.fn(),
    releaseVolumeKeyInterception: vi.fn(),
  }),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatchSync: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

vi.mock('@/utils/window', () => ({
  tauriGetWindowLogicalPosition: vi.fn(),
}));

vi.mock('@/app/reader/hooks/useTouchInterceptor', () => ({
  useTouchInterceptor: vi.fn(),
}));

const Harness = () => {
  const viewRef = React.useRef(mockView as unknown as FoliateView);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { handlePageFlip } = usePagination('book-1', viewRef, containerRef);

  return <div ref={containerRef} data-testid='page-target' onClick={handlePageFlip} />;
};

describe('usePagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    mockView.renderer.scrolled = false;
    mockView.renderer.atStart = false;
    mockView.renderer.atEnd = false;
    readerStoreMock.getViewSettings.mockReturnValue(baseViewSettings);
    readerStoreMock.getViewState.mockReturnValue({
      inited: true,
      pendingPageInfo: null,
    });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 8, total: 100 },
      pageinfo: { current: 4055, total: 10397 },
    });
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: false });
  });

  it('continues pending full-book page info for unsettled tap page turns', () => {
    readerStoreMock.getViewState.mockReturnValue({
      inited: true,
      pendingPageInfo: { current: 4056, total: 10397 },
    });

    render(<Harness />);
    fireEvent.click(screen.getByTestId('page-target'), { clientX: 300 });

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4057,
      total: 10397,
    });
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DesktopFooterBar from '@/app/reader/components/footerbar/DesktopFooterBar';

const readerStoreMock = vi.hoisted(() => ({
  getView: vi.fn(),
  getViewState: vi.fn(),
  getProgress: vi.fn(),
  getViewSettings: vi.fn(),
  hoveredBookKey: 'book-1' as string | null,
}));

const bookDataStoreMock = vi.hoisted(() => ({
  getBookData: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, params?: Record<string, number>) =>
    params ? text.replace(/{{(\w+)}}/g, (_, key) => String(params[key] ?? '')) : text,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => bookDataStoreMock,
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => readerStoreMock,
}));

vi.mock('@/components/Button', () => ({
  default: ({ label }: { label: string }) => <button type='button'>{label}</button>,
}));

const navigationHandlers = {
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
  onPrevSection: vi.fn(),
  onNextSection: vi.fn(),
  onGoBack: vi.fn(),
  onGoForward: vi.fn(),
  onProgressChange: vi.fn(),
};

const renderDesktopFooterBar = () =>
  render(
    <DesktopFooterBar
      bookKey='book-1'
      navigationHandlers={navigationHandlers}
      progressFraction={0.4}
      progressValid={true}
      gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      actionTab=''
      forceMobileLayout={false}
      onSetActionTab={vi.fn()}
      onSpeakText={vi.fn()}
      ttsEnabled={false}
    />,
  );

describe('DesktopFooterBar pagination state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    readerStoreMock.getView.mockReturnValue({
      renderer: { scrolled: false, page: 3, pages: 20 },
      history: { canGoBack: false, canGoForward: false },
    });
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      renderedPageInfo: { current: 3, total: 20 },
      paginationRecalculating: false,
      ttsEnabled: false,
    });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 0, total: 2 },
      pageinfo: { current: 4055, total: 10397 },
    });
    readerStoreMock.getViewSettings.mockReturnValue({
      progressStyle: 'fraction',
      showPaginationButtons: false,
      rtl: false,
    });
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: false });
  });

  afterEach(() => cleanup());

  it('shows full-book page progress instead of chapter-local renderer pages for reflowable books', () => {
    renderDesktopFooterBar();

    expect(screen.getByText('4056 / 10397')).not.toBeNull();
    expect(screen.queryByText('4 / 20')).toBeNull();
  });

  it('announces full-book page progress to assistive technology', () => {
    renderDesktopFooterBar();

    expect(screen.getByLabelText('Reading Progress: Page 4056 of 10397')).not.toBeNull();
  });

  it('includes full-book page progress in desktop footer page button labels', () => {
    renderDesktopFooterBar();

    expect(
      screen.getByRole('button', { name: 'Previous Page, Page 4056 of 10397' }),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Next Page, Page 4056 of 10397' })).not.toBeNull();
  });

  it('uses fixed-layout section info for desktop footer page progress', () => {
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: true });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 8, total: 100 },
      pageinfo: { current: 4055, total: 10397 },
    });

    renderDesktopFooterBar();

    expect(screen.getByText('9 / 100')).not.toBeNull();
    expect(screen.getByLabelText('Reading Progress: Page 9 of 100')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Next Page, Page 9 of 100' })).not.toBeNull();
  });

  it('hides desktop footer page progress while pagination is recalculating', () => {
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      renderedPageInfo: { current: 3, total: 20 },
      paginationRecalculating: true,
      ttsEnabled: false,
    });

    renderDesktopFooterBar();

    expect(screen.queryByText('4056 / 10397')).toBeNull();
    expect(screen.queryByLabelText('Reading Progress: Page 4056 of 10397')).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous Page' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Next Page' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Next Page, Page 4056 of 10397' })).toBeNull();
  });
});

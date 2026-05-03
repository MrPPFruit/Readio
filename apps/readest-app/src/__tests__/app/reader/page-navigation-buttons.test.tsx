import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PageNavigationButtons from '@/app/reader/components/PageNavigationButtons';

const readerStoreMock = vi.hoisted(() => ({
  getView: vi.fn(),
  getProgress: vi.fn(),
  getViewState: vi.fn(),
  getViewSettings: vi.fn(),
  setPendingPageInfo: vi.fn(),
}));

const bookDataStoreMock = vi.hoisted(() => ({
  getBookData: vi.fn(),
}));

const mockRenderer = {
  scrolled: false,
  pages: 10,
  page: 3,
  atStart: false,
  atEnd: false,
};

const mockView = {
  renderer: mockRenderer,
  prev: vi.fn(),
  next: vi.fn(),
};

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: { isAndroidApp: true },
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, params?: Record<string, number>) =>
    params ? text.replace(/{{(\w+)}}/g, (_, key) => String(params[key] ?? '')) : text,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => bookDataStoreMock,
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    hoveredBookKey: 'book-1',
    ...readerStoreMock,
  }),
}));

describe('PageNavigationButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderer.scrolled = false;
    mockRenderer.pages = 10;
    mockRenderer.page = 3;
    mockRenderer.atStart = false;
    mockRenderer.atEnd = false;
    readerStoreMock.getView.mockReturnValue(mockView);
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      renderedPageInfo: null,
      paginationRecalculating: false,
    });
    readerStoreMock.getProgress.mockReturnValue({ pageinfo: { current: 4055, total: 10397 } });
    readerStoreMock.getViewSettings.mockReturnValue({ showPaginationButtons: true, rtl: false });
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: false });
  });

  afterEach(() => cleanup());

  it('marks pending full-book page info when visible navigation buttons flip pages', () => {
    render(<PageNavigationButtons bookKey='book-1' isDropdownOpen={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next Page, Page 4056 of 10397' }));

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4056,
      total: 10397,
    });
  });

  it('continues pending full-book page info from an unsettled page turn', () => {
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: { current: 4056, total: 10397 },
      renderedPageInfo: null,
    });

    render(<PageNavigationButtons bookKey='book-1' isDropdownOpen={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next Page, Page 4057 of 10397' }));

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4057,
      total: 10397,
    });
  });

  it('uses fixed-layout section info for pending page state', () => {
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 8, total: 100 },
      pageinfo: { current: 4055, total: 10397 },
    });
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: true });

    render(<PageNavigationButtons bookKey='book-1' isDropdownOpen={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next Page, Page 9 of 100' }));

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 9,
      total: 100,
    });
  });

  it('hides stale page labels while pagination is recalculating after layout changes', () => {
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      renderedPageInfo: null,
      paginationRecalculating: true,
    });

    render(<PageNavigationButtons bookKey='book-1' isDropdownOpen={false} />);

    expect(screen.getByRole('button', { name: 'Next Page' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Next Page, Page 4056 of 10397' })).toBeNull();
    expect(screen.queryByText('Page 4056 of 10397')).toBeNull();
  });
});

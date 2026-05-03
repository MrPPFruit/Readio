import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProgressBar from '@/app/reader/components/ProgressBar';

const readerStoreMock = vi.hoisted(() => ({
  getProgress: vi.fn(),
  getViewSettings: vi.fn(),
  getView: vi.fn(),
  getViewState: vi.fn(),
}));

const bookDataStoreMock = vi.hoisted(() => ({
  getBookData: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { isMobile: true, hasSafeAreaInset: false },
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, values?: Record<string, unknown>) =>
    values ? text.replace(/{{(\w+)}}/g, (_, key) => String(values[key] ?? '')) : text,
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: vi.fn(),
}));

vi.mock('@/components/Spinner', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/StatusInfo.tsx', () => ({
  default: () => <span data-testid='status-info' />,
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => readerStoreMock,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => bookDataStoreMock,
}));

const baseViewSettings = {
  vertical: false,
  doubleBorder: false,
  scrolled: false,
  isEink: false,
  progressStyle: 'fraction',
  progressInfoMode: 'all',
  showProgressInfo: true,
  showRemainingTime: false,
  showRemainingPages: false,
  showCurrentTime: false,
  showCurrentBatteryStatus: false,
  tapToToggleFooter: false,
  use24HourClock: true,
  showBatteryPercentage: false,
};

const renderProgressBar = () =>
  render(
    <ProgressBar
      bookKey='bookid-0'
      horizontalGap={0}
      contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />,
  );

describe('ProgressBar pagination state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn(() => 'en') },
      configurable: true,
    });
    readerStoreMock.getViewSettings.mockReturnValue(baseViewSettings);
    readerStoreMock.getView.mockReturnValue({ renderer: { page: 0, pages: 10 } });
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      paginationRecalculating: false,
    });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 0, total: 2 },
      pageinfo: { current: 2, total: 10 },
    });
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: false });
  });

  afterEach(() => cleanup());

  it('shows pending full-book page info immediately while a page turn is settling', () => {
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: { current: 4056, total: 10397 },
      paginationRecalculating: false,
    });

    renderProgressBar();

    expect(screen.getByText('4057 / 10397')).not.toBeNull();
    expect(screen.getByLabelText(/^On 4057 of 10397 page/)).not.toBeNull();
    expect(screen.queryByText('3 / 10')).toBeNull();
  });

  it('hides page progress while pagination is recalculating after layout changes', () => {
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      paginationRecalculating: true,
    });

    renderProgressBar();

    expect(screen.queryByText('3 / 10')).toBeNull();
  });

  it('hides remaining page info while pagination is recalculating after layout changes', () => {
    readerStoreMock.getViewSettings.mockReturnValue({
      ...baseViewSettings,
      showRemainingPages: true,
    });
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      paginationRecalculating: true,
    });

    const { container } = renderProgressBar();

    expect(container.textContent).not.toContain('pages left in chapter');
  });

  it('shows full-book page progress instead of chapter-local renderer pages for reflowable books', () => {
    readerStoreMock.getView.mockReturnValue({ renderer: { page: 3, pages: 20 } });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 0, total: 2 },
      pageinfo: { current: 4055, total: 10397 },
    });

    renderProgressBar();

    expect(screen.getByText('4056 / 10397')).not.toBeNull();
    expect(screen.queryByText('4 / 20')).toBeNull();
  });

  it('uses recalculated full-book pages after layout changes settle', () => {
    readerStoreMock.getView.mockReturnValue({ renderer: { page: 8, pages: 120 } });
    readerStoreMock.getViewState.mockReturnValue({
      pendingPageInfo: null,
      paginationRecalculating: false,
    });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 0, total: 2 },
      pageinfo: { current: 5000, total: 12000 },
    });

    renderProgressBar();

    expect(screen.getByText('5001 / 12000')).not.toBeNull();
    expect(screen.queryByText('9 / 120')).toBeNull();
  });
});

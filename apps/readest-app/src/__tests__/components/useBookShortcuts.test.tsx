import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBookShortcuts from '@/app/reader/hooks/useBookShortcuts';
import { eventDispatcher } from '@/utils/event';

const shortcutState = {
  actions: null as Record<
    string,
    ((event?: KeyboardEvent | MessageEvent) => void) | undefined
  > | null,
};

const mockView = {
  book: { dir: 'ltr' },
  prev: vi.fn(),
  next: vi.fn(),
  pan: vi.fn(),
  renderer: {
    scrolled: false,
    pages: 10,
    page: 3,
    atStart: false,
    atEnd: false,
    setAttribute: vi.fn(),
  },
  history: {
    back: vi.fn(),
    forward: vi.fn(),
  },
};

const currentViewSettings = {
  defaultFontSize: 16,
  lineHeight: 1.5,
  readingRulerEnabled: true,
  writingMode: 'horizontal-tb',
  vertical: false,
  rtl: false,
  paragraphMode: { enabled: false },
};

const readerStoreMock = vi.hoisted(() => ({
  getProgress: vi.fn(),
  getViewState: vi.fn(),
  setPendingPageInfo: vi.fn(),
}));

const bookDataStoreMock = vi.hoisted(() => ({
  getBookData: vi.fn(),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getProgress: readerStoreMock.getProgress,
    getView: () => mockView,
    getViewState: readerStoreMock.getViewState,
    getViewSettings: () => currentViewSettings,
    setViewSettings: vi.fn(),
    setPendingPageInfo: readerStoreMock.setPendingPageInfo,
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    toggleSideBar: vi.fn(),
    setSideBarBookKey: vi.fn(),
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    setSettingsDialogOpen: vi.fn(),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => bookDataStoreMock,
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({
    toggleNotebook: vi.fn(),
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    safeAreaInsets: null,
  }),
}));

vi.mock('@/components/command-palette', () => ({
  useCommandPalette: () => ({
    open: vi.fn(),
  }),
}));

vi.mock('@/hooks/useShortcuts', () => ({
  default: (actions: typeof shortcutState.actions) => {
    shortcutState.actions = actions;
  },
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

vi.mock('@/utils/window', () => ({
  tauriHandleClose: vi.fn(),
  tauriHandleToggleFullScreen: vi.fn(),
  tauriQuitApp: vi.fn(),
}));

vi.mock('@/utils/style', () => ({
  getStyles: vi.fn(),
}));

vi.mock('@/services/constants', () => ({
  MAX_ZOOM_LEVEL: 200,
  MIN_ZOOM_LEVEL: 50,
  ZOOM_STEP: 10,
}));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({
    getNextBookKey: () => 'book-1',
  }),
}));

const Harness = () => {
  useBookShortcuts({ sideBarBookKey: 'book-1', bookKeys: ['book-1'] });
  return null;
};

describe('useBookShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortcutState.actions = null;
    currentViewSettings.readingRulerEnabled = true;
    currentViewSettings.writingMode = 'horizontal-tb';
    currentViewSettings.vertical = false;
    currentViewSettings.rtl = false;
    currentViewSettings.paragraphMode.enabled = false;
    mockView.book.dir = 'ltr';
    mockView.renderer.scrolled = false;
    mockView.renderer.pages = 10;
    mockView.renderer.page = 3;
    mockView.renderer.atStart = false;
    mockView.renderer.atEnd = false;
    readerStoreMock.getViewState.mockReturnValue({ ttsEnabled: false, pendingPageInfo: null });
    readerStoreMock.getProgress.mockReturnValue({ pageinfo: { current: 3, total: 10 } });
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('routes page-turn shortcuts to reading ruler movement when enabled', () => {
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatchSync').mockReturnValue(true);

    render(<Harness />);
    shortcutState.actions?.['onGoNext']?.();

    expect(dispatchSpy).toHaveBeenCalledWith('reading-ruler-move', {
      bookKey: 'book-1',
      direction: 'forward',
    });
    expect(mockView.next).not.toHaveBeenCalled();
  });

  it('uses reading order when directional shortcuts are handled in rtl books', () => {
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatchSync').mockReturnValue(true);
    mockView.book.dir = 'rtl';

    render(<Harness />);
    shortcutState.actions?.['onGoRight']?.();

    expect(dispatchSpy).toHaveBeenCalledWith('reading-ruler-move', {
      bookKey: 'book-1',
      direction: 'backward',
    });
  });

  it('falls back to normal page navigation when the ruler is disabled', () => {
    currentViewSettings.readingRulerEnabled = false;

    render(<Harness />);
    shortcutState.actions?.['onGoNext']?.();

    expect(mockView.next).toHaveBeenCalled();
  });

  it('falls back to normal page navigation when the ruler cannot move further', () => {
    vi.spyOn(eventDispatcher, 'dispatchSync').mockReturnValue(false);

    render(<Harness />);
    shortcutState.actions?.['onGoNext']?.();

    expect(mockView.next).toHaveBeenCalled();
  });

  it('marks pending page info when keyboard page shortcuts flip pages', () => {
    currentViewSettings.readingRulerEnabled = false;

    render(<Harness />);
    shortcutState.actions?.['onGoRight']?.();

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4,
      total: 10,
    });
  });

  it('continues pending full-book page info for unsettled keyboard page turns', () => {
    currentViewSettings.readingRulerEnabled = false;
    mockView.renderer.pages = 20;
    mockView.renderer.page = 3;
    readerStoreMock.getViewState.mockReturnValue({
      ttsEnabled: false,
      pendingPageInfo: { current: 4056, total: 10397 },
    });
    readerStoreMock.getProgress.mockReturnValue({ pageinfo: { current: 4055, total: 10397 } });

    render(<Harness />);
    shortcutState.actions?.['onGoRight']?.();

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4057,
      total: 10397,
    });
  });

  it('continues pending full-book page info for next and previous page shortcuts', () => {
    currentViewSettings.readingRulerEnabled = false;
    readerStoreMock.getViewState.mockReturnValue({
      ttsEnabled: false,
      pendingPageInfo: { current: 4056, total: 10397 },
    });
    readerStoreMock.getProgress.mockReturnValue({ pageinfo: { current: 4055, total: 10397 } });

    render(<Harness />);
    shortcutState.actions?.['onGoNext']?.();
    shortcutState.actions?.['onGoPrev']?.();

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4057,
      total: 10397,
    });
    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 4055,
      total: 10397,
    });
  });

  it('uses fixed-layout section info for keyboard shortcut pending page state', () => {
    currentViewSettings.readingRulerEnabled = false;
    bookDataStoreMock.getBookData.mockReturnValue({ isFixedLayout: true });
    readerStoreMock.getProgress.mockReturnValue({
      section: { current: 8, total: 100 },
      pageinfo: { current: 4055, total: 10397 },
    });

    render(<Harness />);
    shortcutState.actions?.['onGoRight']?.();

    expect(readerStoreMock.setPendingPageInfo).toHaveBeenCalledWith('book-1', {
      current: 9,
      total: 100,
    });
  });
});

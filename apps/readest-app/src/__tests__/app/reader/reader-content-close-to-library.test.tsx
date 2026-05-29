import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderContent from '@/app/reader/components/ReaderContent';

const {
  clearViewStateMock,
  getViewMock,
  navigateToLibraryMock,
  saveConfigMock,
  saveSettingsMock,
  settingsState,
} = vi.hoisted(() => ({
  clearViewStateMock: vi.fn(),
  getViewMock: vi.fn(() => ({ close: vi.fn(), remove: vi.fn() })),
  navigateToLibraryMock: vi.fn(),
  saveConfigMock: vi.fn(),
  saveSettingsMock: vi.fn(),
  settingsState: {},
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', close: vi.fn() }),
}));

vi.mock('@/utils/window', () => ({
  tauriHandleClose: vi.fn(),
  tauriHandleOnCloseWindow: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

vi.mock('@/helpers/openWith', () => ({
  parseOpenWithFiles: vi.fn(async () => []),
}));

vi.mock('@/utils/misc', () => ({
  uniqueId: () => 'reader-key',
  stubTranslation: (text: string) => text,
}));

vi.mock('@/services/constants', () => ({
  BOOK_IDS_SEPARATOR: ',',
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    onSync: vi.fn(),
    offSync: vi.fn(),
  },
}));

vi.mock('@/utils/nav', () => ({
  navigateToLibrary: navigateToLibraryMock,
}));

vi.mock('@/utils/discord', () => ({
  clearDiscordPresence: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { isDesktopApp: false, hasWindow: false },
  }),
}));

vi.mock('@/store/settingsStore', () => {
  const useSettingsStore = Object.assign(
    vi.fn(() => ({
      saveSettings: saveSettingsMock,
      isSettingsDialogOpen: false,
      settingsDialogBookKey: null,
    })),
    { getState: vi.fn(() => ({ settings: settingsState })) },
  );
  return { useSettingsStore };
});

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: vi.fn(() => ({ progress: [1, 100] })),
    getBookData: vi.fn(() => ({
      book: { title: 'Readable Book' },
      bookDoc: {},
      config: { progress: [1, 100] },
    })),
    saveConfig: saveConfigMock,
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    sideBarBookKey: 'book1-reader-key',
    setSideBarBookKey: vi.fn(),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: getViewMock,
    setBookKeys: vi.fn(),
    getViewSettings: vi.fn(() => ({})),
    initViewState: vi.fn(async () => {}),
    getViewState: vi.fn(() => ({ isPrimary: true })),
    clearViewState: clearViewStateMock,
  }),
}));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({
    bookKeys: ['book1-reader-key'],
    dismissBook: vi.fn(),
    getNextBookKey: vi.fn(),
  }),
}));

vi.mock('@/app/reader/hooks/useBookShortcuts', () => ({
  default: vi.fn(),
}));

vi.mock('@/hooks/useGamepad', () => ({
  useGamepad: vi.fn(),
}));

vi.mock('@/components/metadata', () => ({
  BookDetailModal: () => null,
}));

vi.mock('@/components/Spinner', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/sidebar/SideBar', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/notebook/Notebook', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/BooksGrid', () => ({
  default: ({
    onCloseBook,
    onGoToLibrary,
  }: {
    onCloseBook: (bookKey: string) => void;
    onGoToLibrary: () => void;
  }) => (
    <>
      <button type='button' onClick={onGoToLibrary}>
        Go to Library
      </button>
      <button type='button' onClick={() => onCloseBook('book1-reader-key')}>
        Close Book
      </button>
    </>
  ),
}));

vi.mock('@/components/settings/SettingsDialog', () => ({
  default: () => null,
}));

describe('ReaderContent close to library', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearViewStateMock.mockClear();
    getViewMock.mockClear();
    navigateToLibraryMock.mockClear();
    saveConfigMock.mockClear();
    saveSettingsMock.mockClear();
  });

  it('waits for reading progress to save before returning to the library', async () => {
    let resolveSaveConfig: () => void = () => {};
    saveConfigMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSaveConfig = resolve;
        }),
    );
    saveSettingsMock.mockResolvedValue(undefined);

    render(<ReaderContent ids='book1' settings={settingsState as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to Library' }));

    expect(saveConfigMock).toHaveBeenCalledOnce();
    expect(navigateToLibraryMock).not.toHaveBeenCalled();

    resolveSaveConfig();

    await waitFor(() => {
      expect(navigateToLibraryMock).toHaveBeenCalledOnce();
    });
  });

  it('waits for reading progress to save before navigating when closing the last book', async () => {
    let resolveSaveConfig: () => void = () => {};
    saveConfigMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSaveConfig = resolve;
        }),
    );
    saveSettingsMock.mockResolvedValue(undefined);

    render(<ReaderContent ids='book1' settings={settingsState as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close Book' }));

    await waitFor(() => {
      expect(saveConfigMock).toHaveBeenCalledOnce();
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(saveSettingsMock).not.toHaveBeenCalled();
    expect(navigateToLibraryMock).not.toHaveBeenCalled();

    resolveSaveConfig();

    await waitFor(() => {
      expect(navigateToLibraryMock).toHaveBeenCalledOnce();
    });
  });
});

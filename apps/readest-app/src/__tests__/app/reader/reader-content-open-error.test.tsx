import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookFileNotFoundError } from '@/services/errors';
import ReaderContent from '@/app/reader/components/ReaderContent';
import { eventDispatcher } from '@/utils/event';

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
  parseOpenWithFiles: vi.fn(),
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
  navigateToLibrary: vi.fn(),
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

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    saveSettings: vi.fn(),
    isSettingsDialogOpen: false,
    settingsDialogBookKey: null,
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: vi.fn(),
    getBookData: vi.fn(),
    saveConfig: vi.fn(),
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    sideBarBookKey: null,
    setSideBarBookKey: vi.fn(),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: vi.fn(),
    setBookKeys: vi.fn(),
    getViewSettings: vi.fn(),
    initViewState: vi.fn(() => Promise.reject(new BookFileNotFoundError())),
    getViewState: vi.fn(() => null),
    clearViewState: vi.fn(),
  }),
}));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({
    bookKeys: [],
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
  default: () => null,
}));

vi.mock('@/components/settings/SettingsDialog', () => ({
  default: () => null,
}));

describe('ReaderContent open errors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a recovery message when the local source file is missing', async () => {
    render(<ReaderContent ids='book-1' settings={{} as never} />);

    await waitFor(() => {
      expect(eventDispatcher.dispatch).toHaveBeenCalledWith(
        'toast',
        expect.objectContaining({
          message: 'The local book file is missing. Import this book again to continue reading.',
          type: 'error',
        }),
      );
    });
  });
});

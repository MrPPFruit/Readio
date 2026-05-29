import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Reader from '@/app/reader/components/Reader';

const { backHandlerRef, dispatchMock, replaceMock, useReaderStoreMock } = vi.hoisted(() => {
  const storeState = {
    hoveredBookKey: '',
    getView: vi.fn(),
    setHoveredBookKey: vi.fn(),
  };
  const storeMock = () => storeState;
  storeMock.getState = () => storeState;
  return {
    backHandlerRef: { current: null as ((event: CustomEvent) => boolean) | null },
    dispatchMock: vi.fn(),
    replaceMock: vi.fn(),
    useReaderStoreMock: storeMock,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    replace: replaceMock,
  }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: { isAndroidApp: true, isMobileApp: true, hasScreenBrightness: false },
  }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));
vi.mock('@/hooks/useLibrary', () => ({ useLibrary: () => ({ libraryLoaded: true }) }));
vi.mock('@/hooks/useScreenWakeLock', () => ({ useScreenWakeLock: vi.fn() }));
vi.mock('@/hooks/useTransferQueue', () => ({ useTransferQueue: vi.fn() }));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      globalReadSettings: {},
      alwaysShowStatusBar: false,
      screenWakeLock: false,
      screenBrightness: -1,
      autoScreenBrightness: true,
    },
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    sideBarBookKey: 'book-1',
    isSideBarVisible: false,
    isSideBarPinned: false,
    getIsSideBarVisible: () => false,
    setSideBarVisible: vi.fn(),
  }),
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({
    isNotebookVisible: false,
    isNotebookPinned: false,
    getIsNotebookVisible: () => false,
    setNotebookVisible: vi.fn(),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: useReaderStoreMock,
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    showSystemUI: vi.fn(),
    dismissSystemUI: vi.fn(),
    isDarkMode: false,
    systemUIAlwaysHidden: false,
    isRoundedWindow: false,
  }),
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    getScreenBrightness: vi.fn(async () => 0.5),
    setScreenBrightness: vi.fn(),
    acquireBackKeyInterception: vi.fn(),
    releaseBackKeyInterception: vi.fn(),
  }),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: dispatchMock,
    onSync: vi.fn((event: string, handler: (event: CustomEvent) => boolean) => {
      if (event === 'native-key-down') backHandlerRef.current = handler;
    }),
    offSync: vi.fn(),
  },
}));

vi.mock('@/utils/open', () => ({ interceptWindowOpen: vi.fn() }));
vi.mock('@/styles/fonts', () => ({ mountAdditionalFonts: vi.fn() }));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => false }));
vi.mock('@/utils/bridge', () => ({
  getSysFontsList: vi.fn(),
  setSystemUIVisibility: vi.fn(),
}));
vi.mock('@/utils/misc', () => ({
  getLocale: () => 'en',
  stubTranslation: (text: string) => text,
}));
vi.mock('@/utils/time', () => ({ initDayjs: vi.fn() }));
vi.mock('@/components/AboutWindow', () => ({ AboutWindow: () => null }));
vi.mock('@/components/KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));
vi.mock('@/components/UpdaterWindow', () => ({ UpdaterWindow: () => null }));
vi.mock('@/app/reader/components/KOSyncSettings', () => ({ KOSyncSettingsWindow: () => null }));
vi.mock('@/app/reader/components/ReadwiseSettings', () => ({ ReadwiseSettingsWindow: () => null }));
vi.mock('@/app/reader/components/HardcoverSettings', () => ({
  HardcoverSettingsWindow: () => null,
}));
vi.mock('@/app/reader/components/ProofreadRules', () => ({ ProofreadRulesManager: () => null }));
vi.mock('@/components/Toast', () => ({ Toast: () => null }));
vi.mock('@/app/reader/components/ReaderContent', () => ({
  default: () => <div data-testid='reader-content' />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  backHandlerRef.current = null;
});

describe('Reader Android back handling', () => {
  it('requests a saved close before returning to the library from the reader root', async () => {
    render(<Reader ids='book-1' />);

    await waitFor(() => expect(backHandlerRef.current).toBeTruthy());
    const consumed = backHandlerRef.current?.(
      new CustomEvent('native-key-down', { detail: { keyName: 'Back' } }),
    );

    expect(consumed).toBe(true);
    expect(dispatchMock).toHaveBeenCalledWith('close-reader-to-library');
    expect(replaceMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalledWith('close-reader');
  });
});

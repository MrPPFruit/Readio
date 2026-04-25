import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@/types/book';
import BookItem from '@/app/library/components/BookItem';
import SettingsMenu from '@/app/library/components/SettingsMenu';

const readioFeaturesMock = vi.hoisted(() => ({
  readioFeatures: {
    auth: false,
    cloudSync: false,
    commerce: false,
    ai: false,
    opds: false,
    tts: false,
    annotations: false,
    notebook: false,
    proofreading: false,
    translation: false,
    parallelRead: false,
    speedReading: false,
    updater: false,
    telemetry: false,
    advancedSettings: false,
    localLibrary: true,
    localImport: true,
    reader: true,
    progress: true,
    basicReaderSettings: true,
  },
}));

const settingsMock = vi.hoisted(() => ({
  settings: {
    autoUpload: true,
    autoCheckUpdates: false,
    alwaysOnTop: false,
    alwaysShowStatusBar: false,
    screenWakeLock: false,
    openLastBooks: false,
    autoImportBooksOnOpen: false,
    telemetryEnabled: false,
    alwaysInForeground: false,
    savedBookCoverForLockScreen: '',
    savedBookCoverForLockScreenPath: '',
    openBookInNewWindow: false,
    lastSyncedAtBooks: null,
  },
  setSettingsDialogOpen: vi.fn(),
}));

vi.mock('@/config/features', () => readioFeaturesMock);

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      isMobile: true,
      isMobileApp: true,
      isAndroidApp: true,
      hasWindow: false,
      hasContextMenu: false,
      hasUpdater: false,
      canCustomizeRootDir: false,
      distChannel: 'readio',
    },
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => settingsMock,
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: 'auto',
    setThemeMode: vi.fn(),
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({
    isSyncing: false,
    setLibrary: vi.fn(),
  }),
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useTransferQueue', () => ({
  useTransferQueue: () => ({
    stats: { active: 0, pending: 0, failed: 0 },
    hasActiveTransfers: false,
    setIsTransferQueueOpen: vi.fn(),
  }),
}));

vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => ({
    userProfilePlan: 'free',
    quotas: null,
  }),
}));

vi.mock('@/hooks/useKeyDownActions', () => ({
  useKeyDownActions: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
  isWebAppPlatform: () => false,
}));

vi.mock('@/services/constants', () => ({
  DOWNLOAD_READEST_URL: '',
  SHOW_UNREAD_STATUS_BADGE: false,
}));

vi.mock('@/utils/book', () => ({
  formatAuthors: (author: string) => author,
  formatDescription: (description?: string) => description || '',
  formatLocaleDateTime: () => '',
}));

vi.mock('@/utils/nav', () => ({
  navigateToLogin: vi.fn(),
  navigateToProfile: vi.fn(),
}));

vi.mock('@/utils/window', () => ({
  tauriHandleSetAlwaysOnTop: vi.fn(),
  tauriHandleToggleFullScreen: vi.fn(),
}));

vi.mock('@/utils/telemetry', () => ({
  optInTelemetry: vi.fn(),
  optOutTelemetry: vi.fn(),
}));

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: vi.fn(),
}));

vi.mock('@/utils/permission', () => ({
  requestStoragePermission: vi.fn(),
}));

vi.mock('@/utils/bridge', () => ({
  selectDirectory: vi.fn(),
}));

vi.mock('@/components/BookCover', () => ({
  default: () => <div data-testid='book-cover' />,
}));

vi.mock('@/components/AboutWindow', () => ({
  setAboutDialogVisible: vi.fn(),
}));

vi.mock('@/app/library/components/BackupWindow', () => ({
  setBackupDialogVisible: vi.fn(),
}));

vi.mock('@/app/library/components/MigrateDataWindow', () => ({
  setMigrateDataDirDialogVisible: vi.fn(),
}));

vi.mock('@/components/UserAvatar', () => ({
  default: () => <div data-testid='user-avatar' />,
}));

vi.mock('@/components/Quota', () => ({
  default: () => <div data-testid='quota' />,
}));

const localBook = {
  hash: 'book-1',
  format: 'EPUB',
  title: 'Local Book',
  author: 'Author',
  createdAt: 1,
  updatedAt: 1,
} as Book;

afterEach(cleanup);

describe('Readio library home polish', () => {
  it('hides cloud upload and download actions on book cards when cloud sync is disabled', () => {
    render(
      <BookItem
        book={localBook}
        mode='grid'
        coverFit='crop'
        isSelectMode={false}
        bookSelected={false}
        transferProgress={null}
        handleBookUpload={vi.fn()}
        handleBookDownload={vi.fn()}
        showBookDetailsModal={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Upload Book' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download Book' })).toBeNull();
  });

  it('hides the confusing mobile status bar toggle in the Readio MVP menu', () => {
    render(<SettingsMenu onPullLibrary={vi.fn()} />);

    expect(screen.queryByText('Always Show Status Bar')).toBeNull();
  });
});

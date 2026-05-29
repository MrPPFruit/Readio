import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SettingsMenu from '@/app/library/components/SettingsMenu';

const diagnosticsMock = vi.hoisted(() => ({
  clearDiagnosticsLogs: vi.fn().mockResolvedValue(undefined),
  configureDiagnosticsLogger: vi.fn(),
  exportDiagnosticsBundle: vi.fn().mockResolvedValue(undefined),
  logDiagnosticError: vi.fn().mockResolvedValue(undefined),
  logDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
}));

const saveSettingsMock = vi.hoisted(() => ({
  saveSysSettings: vi.fn().mockResolvedValue(undefined),
}));

const appServiceMock = vi.hoisted(() => ({
  isMobile: true,
  isMobileApp: true,
  isAndroidApp: true,
  hasWindow: false,
  hasContextMenu: false,
  hasUpdater: false,
  canCustomizeRootDir: false,
  distChannel: 'readio',
}));

const settingsMock = vi.hoisted(() => ({
  settings: {
    autoUpload: false,
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
    diagnostics: { enabled: true, includeDebugEvents: false },
  },
  setSettingsDialogOpen: vi.fn(),
}));

vi.mock('@/config/features', () => ({
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
    advancedSettings: true,
    localLibrary: true,
    localImport: true,
    reader: true,
    progress: true,
    basicReaderSettings: true,
  },
}));

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
    appService: appServiceMock,
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

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
  isWebAppPlatform: () => false,
}));

vi.mock('@/services/constants', () => ({
  DOWNLOAD_READEST_URL: '',
  SHOW_UNREAD_STATUS_BADGE: false,
}));

vi.mock('@/utils/book', () => ({
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

vi.mock('@/helpers/settings', () => saveSettingsMock);

vi.mock('@/services/diagnostics/logger', () => diagnosticsMock);

vi.mock('@/utils/permission', () => ({
  requestStoragePermission: vi.fn(),
}));

vi.mock('@/utils/bridge', () => ({
  interceptKeys: vi.fn(),
  selectDirectory: vi.fn(),
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  settingsMock.settings.diagnostics = { enabled: true, includeDebugEvents: false };
});

describe('SettingsMenu diagnostics actions', () => {
  it('exposes diagnostics state and calls export and clear actions', async () => {
    render(<SettingsMenu onPullLibrary={vi.fn()} />);

    expect(screen.getByText('Advanced Settings')).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Local Diagnostic Logs - ON' })).not.toBeNull();
    expect(screen.getByText('Enabled')).not.toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export Diagnostic Logs' }));
    await waitFor(() => expect(diagnosticsMock.exportDiagnosticsBundle).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear Diagnostic Logs' }));
    await waitFor(() => expect(diagnosticsMock.clearDiagnosticsLogs).toHaveBeenCalledTimes(1));
  });

  it('persists diagnostics toggle and reconfigures logger', async () => {
    render(<SettingsMenu onPullLibrary={vi.fn()} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Local Diagnostic Logs - ON' }));

    const nextDiagnostics = { enabled: false, includeDebugEvents: false };
    await waitFor(() => {
      expect(saveSettingsMock.saveSysSettings).toHaveBeenCalledWith(
        {},
        'diagnostics',
        nextDiagnostics,
      );
    });
    expect(diagnosticsMock.configureDiagnosticsLogger).toHaveBeenCalledWith(
      appServiceMock,
      nextDiagnostics,
    );
    expect(diagnosticsMock.logDiagnosticEvent).toHaveBeenCalledWith('diagnostics.toggled', 'info', {
      enabled: false,
    });
    expect(screen.getByRole('menuitem', { name: 'Local Diagnostic Logs - OFF' })).not.toBeNull();
    expect(screen.getByText('Disabled')).not.toBeNull();
  });
});

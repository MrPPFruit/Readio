import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockOpen = vi.fn();
const mockCopyURIToPath = vi.fn();
const mockBasename = vi.fn();

vi.mock('@tauri-apps/plugin-os', () => ({
  type: () => 'android',
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {
    AppConfig: 1,
    AppCache: 2,
    AppLog: 3,
    AppData: 4,
    Temp: 5,
  },
  SeekMode: { Start: 0 },
  open: (...args: unknown[]) => mockOpen(...args),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  readFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
  copyFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')),
  basename: (...args: unknown[]) => mockBasename(...args),
  appDataDir: () => Promise.resolve('/tmp/app-data'),
  appConfigDir: () => Promise.resolve('/tmp/app-config'),
  appCacheDir: () => Promise.resolve('/tmp/app-cache'),
  appLogDir: () => Promise.resolve('/tmp/app-log'),
  tempDir: () => Promise.resolve('/tmp'),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
  ask: vi.fn(),
}));

vi.mock('@choochmeque/tauri-plugin-sharekit-api', () => ({
  shareFile: vi.fn(),
}));

vi.mock('@/utils/bridge', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  copyURIToPath: (request: unknown) => mockCopyURIToPath(request),
}));

vi.mock('@/services/appService', () => ({
  BaseAppService: class {},
}));

import { nativeFileSystem } from '@/services/nativeAppService';

describe('nativeFileSystem.openFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBasename.mockRejectedValue(new Error('path does not have a basename'));
    mockCopyURIToPath.mockResolvedValue({ success: true });
    mockOpen.mockResolvedValue({
      stat: vi.fn().mockResolvedValue({ size: 12, mtime: new Date(0) }),
      close: vi.fn(),
    });
  });

  test('copies Android document content URIs to cache before opening', async () => {
    const uri =
      'content://com.android.externalstorage.documents/document/primary%3ADownload%2Flord-of-mysteries.epub';
    mockCopyURIToPath.mockResolvedValue({
      success: true,
      path: '/tmp/app-cache/lord-of-mysteries.epub',
      displayName: 'lord-of-mysteries.epub',
    });

    const file = await nativeFileSystem.openFile(uri, 'None');

    expect(mockCopyURIToPath).toHaveBeenCalledWith({
      uri,
      dst: '/tmp/app-cache/lord-of-mysteries.epub',
    });
    expect(mockOpen).toHaveBeenCalledWith('/tmp/app-cache/lord-of-mysteries.epub', undefined);
    expect(file.name).toBe('lord-of-mysteries.epub');
  });

  test('uses Android content URI display name returned by native bridge when document URI path has no extension', async () => {
    const uri = 'content://com.android.providers.downloads.documents/document/msf%3A42';
    mockCopyURIToPath.mockResolvedValue({
      success: true,
      path: '/tmp/app-cache/sample.txt',
      displayName: 'sample.txt',
    });

    const file = await nativeFileSystem.openFile(uri, 'None');

    expect(mockCopyURIToPath).toHaveBeenCalledWith({
      uri,
      dst: '/tmp/app-cache/msf:42',
    });
    expect(mockOpen).toHaveBeenCalledWith('/tmp/app-cache/sample.txt', undefined);
    expect(file.name).toBe('sample.txt');
  });
});

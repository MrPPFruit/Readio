import { describe, expect, it, vi } from 'vitest';
import type { BaseDir, FileInfo, FileItem, FileSystem, ResolvedPath } from '@/types/system';
import { loadSettings } from '@/services/settingsService';

vi.mock('@/utils/misc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/misc')>();
  return {
    ...actual,
    isCJKEnv: vi.fn(() => true),
    getTargetLang: vi.fn(() => 'ZH-CN'),
  };
});

const memoryFs = (files: Record<string, string>): FileSystem => ({
  resolvePath: (path: string, base: BaseDir): ResolvedPath => ({
    baseDir: 0,
    basePrefix: async () => '',
    fp: `${base}/${path}`,
    base,
  }),
  getURL: (path: string) => path,
  getBlobURL: async (path: string) => path,
  getImageURL: async (path: string) => path,
  openFile: async () => new File([], 'mock'),
  copyFile: async () => {},
  readFile: async (path: string) => {
    const file = files[path];
    if (!file) throw new Error(`Missing file: ${path}`);
    return file;
  },
  writeFile: async (path: string, _base: BaseDir, content: string | ArrayBuffer | File) => {
    files[path] = typeof content === 'string' ? content : '';
  },
  removeFile: async () => {},
  readDir: async (): Promise<FileItem[]> => [],
  createDir: async () => {},
  removeDir: async () => {},
  exists: async (path: string) => path in files,
  stats: async (): Promise<FileInfo> => ({
    isFile: true,
    isDirectory: false,
    size: 0,
    mtime: null,
    atime: null,
    birthtime: null,
  }),
  getPrefix: async (base: BaseDir) => base,
});

describe('reader font settings migration', () => {
  it('moves the previous bundled CJK default font to Luo on existing settings', async () => {
    const fs = memoryFs({
      'settings.json': JSON.stringify({
        version: 1,
        kosync: { deviceId: 'existing-device' },
        globalReadSettings: {},
        globalViewSettings: {
          defaultCJKFont: 'LXGW WenKai GB Screen',
        },
      }),
    });

    const settings = await loadSettings({
      fs,
      isMobile: true,
      isEink: false,
      isAppDataSandbox: false,
    });

    expect(settings.globalViewSettings.defaultCJKFont).toBe('Luo');
  });

  it('preserves a user-selected CJK font on existing settings', async () => {
    const fs = memoryFs({
      'settings.json': JSON.stringify({
        version: 1,
        kosync: { deviceId: 'existing-device' },
        globalReadSettings: {},
        globalViewSettings: {
          defaultCJKFont: 'Source Han Serif CN',
        },
      }),
    });

    const settings = await loadSettings({
      fs,
      isMobile: true,
      isEink: false,
      isAppDataSandbox: false,
    });

    expect(settings.globalViewSettings.defaultCJKFont).toBe('Source Han Serif CN');
  });

  it('preserves the previous bundled CJK font when settings are already migrated', async () => {
    const fs = memoryFs({
      'settings.json': JSON.stringify({
        version: 2,
        kosync: { deviceId: 'existing-device' },
        globalReadSettings: {},
        globalViewSettings: {
          defaultCJKFont: 'LXGW WenKai GB Screen',
        },
      }),
    });

    const settings = await loadSettings({
      fs,
      isMobile: true,
      isEink: false,
      isAppDataSandbox: false,
    });

    expect(settings.globalViewSettings.defaultCJKFont).toBe('LXGW WenKai GB Screen');
  });
});

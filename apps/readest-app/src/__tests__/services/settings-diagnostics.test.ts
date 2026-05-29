import { describe, expect, it, vi } from 'vitest';
import type { BaseDir, FileInfo, FileItem, FileSystem, ResolvedPath } from '@/types/system';
import { loadSettings } from '@/services/settingsService';

vi.mock('@/utils/misc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/misc')>();
  return {
    ...actual,
    isCJKEnv: vi.fn(() => false),
    getTargetLang: vi.fn(() => 'EN'),
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

const loadWithFiles = (files: Record<string, string>) =>
  loadSettings({
    fs: memoryFs(files),
    isMobile: false,
    isEink: false,
    isAppDataSandbox: false,
  });

describe('diagnostics settings', () => {
  it('uses diagnostics defaults on fresh install', async () => {
    const settings = await loadWithFiles({});

    expect(settings.diagnostics).toEqual({
      enabled: true,
      includeDebugEvents: false,
    });
  });

  it('adds diagnostics defaults to existing settings without diagnostics', async () => {
    const settings = await loadWithFiles({
      'settings.json': JSON.stringify({
        version: 1,
        kosync: { deviceId: 'existing-device' },
        globalReadSettings: {},
        globalViewSettings: {},
      }),
    });

    expect(settings.diagnostics).toEqual({
      enabled: true,
      includeDebugEvents: false,
    });
  });

  it('preserves existing diagnostics settings while filling missing diagnostics fields', async () => {
    const settings = await loadWithFiles({
      'settings.json': JSON.stringify({
        version: 1,
        kosync: { deviceId: 'existing-device' },
        diagnostics: { enabled: false },
        globalReadSettings: {},
        globalViewSettings: {},
      }),
    });

    expect(settings.diagnostics).toEqual({
      enabled: false,
      includeDebugEvents: false,
    });
  });
});

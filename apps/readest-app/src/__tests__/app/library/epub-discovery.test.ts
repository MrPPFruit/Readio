import { describe, expect, it, vi } from 'vitest';
import type { AppService } from '@/types/system';

const bridgeMock = vi.hoisted(() => ({
  findLocalEpubFiles: vi.fn(),
}));

const permissionMock = vi.hoisted(() => ({
  requestStoragePermission: vi.fn(),
}));

vi.mock('@/utils/bridge', () => bridgeMock);
vi.mock('@/utils/permission', () => permissionMock);

import { resolveEpubImportFiles } from '@/app/library/utils/epubDiscovery';
import { isEpubPath } from '@/app/library/utils/libraryUtils';

describe('EPUB discovery filtering', () => {
  it('matches EPUB files case-insensitively and excludes other document formats', () => {
    expect(isEpubPath('Books/Alice.epub')).toBe(true);
    expect(isEpubPath('Books/SnowSword.EPUB')).toBe(true);
    expect(isEpubPath('Books/notes.pdf')).toBe(false);
    expect(isEpubPath('Books/draft.txt')).toBe(false);
    expect(isEpubPath('Books/README')).toBe(false);
  });

  it('uses Android global EPUB scan without opening a directory picker', async () => {
    permissionMock.requestStoragePermission.mockResolvedValue(true);
    bridgeMock.findLocalEpubFiles.mockResolvedValue({
      files: [
        {
          path: '/storage/emulated/0/Download/book.epub',
          basePath: '/storage/emulated/0',
          size: 123,
        },
      ],
    });
    const appService = {
      isAndroidApp: true,
      readDirectory: vi.fn(),
    } as unknown as AppService;
    const selectImportDirectory = vi.fn();

    const files = await resolveEpubImportFiles(appService, selectImportDirectory);

    expect(selectImportDirectory).not.toHaveBeenCalled();
    expect(appService.readDirectory).not.toHaveBeenCalled();
    expect(bridgeMock.findLocalEpubFiles).toHaveBeenCalledTimes(1);
    expect(files).toEqual([
      {
        path: '/storage/emulated/0/Download/book.epub',
        basePath: '/storage/emulated/0',
      },
    ]);
  });
});

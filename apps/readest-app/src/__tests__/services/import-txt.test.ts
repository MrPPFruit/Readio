import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { BaseDir, FileSystem, ResolvedPath } from '@/types/system';
import type { DatabaseOpts, DatabaseService } from '@/types/database';
import type { SchemaType } from '@/services/database/migrate';

const mockOpen = vi.hoisted(() => vi.fn());
const mockPartialMD5 = vi.hoisted(() => vi.fn());
const mockConvertTxtToEpubWithFallback = vi.hoisted(() => vi.fn());

vi.mock('@/utils/md5', async () => {
  const actual = await vi.importActual<typeof import('@/utils/md5')>('@/utils/md5');
  return { ...actual, partialMD5: mockPartialMD5 };
});

vi.mock('@/libs/document', async () => {
  const actual = await vi.importActual<typeof import('@/libs/document')>('@/libs/document');
  class MockDocumentLoader {
    open() {
      return mockOpen();
    }
  }
  return { ...actual, DocumentLoader: MockDocumentLoader };
});

vi.mock('@/utils/txt-worker', () => ({
  convertTxtToEpubWithFallback: mockConvertTxtToEpubWithFallback,
}));

vi.mock('@/utils/svg', () => ({ svg2png: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
vi.mock('@/libs/storage', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  createProgressHandler: vi.fn(),
  batchGetDownloadUrls: vi.fn(),
}));

import { BaseAppService } from '@/services/appService';

class TestAppService extends BaseAppService {
  fs: FileSystem;

  constructor(fs: FileSystem) {
    super();
    this.fs = fs;
  }

  resolvePath(fp: string, base: BaseDir): ResolvedPath {
    return this.fs.resolvePath(fp, base);
  }

  async init() {}
  async setCustomRootDir() {}
  async selectDirectory() {
    return '';
  }
  async selectFiles() {
    return [];
  }
  async saveFile() {
    return false;
  }
  async ask() {
    return false;
  }
  async openDatabase(
    _schema: SchemaType,
    _path: string,
    _base: BaseDir,
    _opts?: DatabaseOpts,
  ): Promise<DatabaseService> {
    return {} as DatabaseService;
  }
}

const makeFs = (): FileSystem =>
  ({
    resolvePath: vi
      .fn()
      .mockReturnValue({ fp: '', base: 'Books', baseDir: 0, basePrefix: async () => '' }),
    getURL: vi.fn().mockReturnValue('url'),
    getBlobURL: vi.fn().mockResolvedValue(''),
    getImageURL: vi.fn(),
    openFile: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn(),
    removeFile: vi.fn(),
    readDir: vi.fn(),
    createDir: vi.fn().mockResolvedValue(undefined),
    removeDir: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    stats: vi.fn(),
    getPrefix: vi.fn(),
  }) as unknown as FileSystem;

describe('TXT import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPartialMD5.mockResolvedValue('txt-hash');
    mockOpen.mockResolvedValue({
      book: {
        metadata: { title: 'Sample TXT', author: 'Author', language: 'zh' },
        getCover: vi.fn().mockResolvedValue(null),
      },
      format: 'EPUB',
    });
  });

  it('uses the TXT conversion wrapper before opening it as an EPUB', async () => {
    const fs = makeFs();
    const service = new TestAppService(fs);
    const txtFile = new File(['第一章\n正文'], 'sample.txt', { type: 'text/plain' });
    const epubFile = new File(['converted epub'], 'sample.epub', { type: 'application/epub+zip' });
    mockConvertTxtToEpubWithFallback.mockResolvedValue({
      file: epubFile,
      bookTitle: 'Sample TXT',
      chapterCount: 1,
      language: 'zh',
    });

    const books: Book[] = [];
    const result = await service.importBook(txtFile, books);

    expect(mockConvertTxtToEpubWithFallback).toHaveBeenCalledWith({ file: txtFile });
    expect(mockPartialMD5).toHaveBeenCalledWith(epubFile);
    expect(fs.writeFile).toHaveBeenCalledWith('txt-hash/Sample TXT.epub', 'Books', epubFile);
    expect(result?.format).toBe('EPUB');
  });
});

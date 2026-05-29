import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LibraryPage from '@/app/library/page';
import { findLocalEpubFiles } from '@/utils/bridge';
import { eventDispatcher } from '@/utils/event';

const testMocks = vi.hoisted(() => {
  const appServiceMock = {
    isAndroidApp: true,
    isMobile: true,
    isMobileApp: true,
    isLinuxApp: false,
    hasRoundedWindow: false,
    hasWindow: false,
    hasUpdater: false,
    canReadExternalDir: true,
    loadSettings: vi.fn(async () => ({
      globalViewSettings: {},
      screenWakeLock: false,
      libraryGroupBy: 'none',
      autoCheckUpdates: false,
      alwaysOnTop: false,
      keepLogin: false,
      openLastBooks: false,
      lastOpenBooks: [],
      autoUpload: false,
    })),
    loadLibraryBooks: vi.fn(async () => []),
    saveLibraryBooks: vi.fn(async () => undefined),
    importBook: vi.fn(),
    downloadBook: vi.fn(),
    deleteBook: vi.fn(async () => undefined),
  };

  const libraryStoreState = {
    library: [{ hash: 'existing-book', title: 'Existing Book', deletedAt: null }],
    isSyncing: false,
    syncProgress: 0,
    updateBook: vi.fn(),
    updateBooks: vi.fn(),
    setLibrary: vi.fn(),
    getGroupId: vi.fn(() => ''),
    getGroupName: vi.fn(() => ''),
    checkOpenWithBooks: false,
    checkLastOpenBooks: false,
    setCheckOpenWithBooks: vi.fn(),
    setCheckLastOpenBooks: vi.fn(),
  };
  const libraryStoreMock = Object.assign(
    vi.fn(() => libraryStoreState),
    {
      getState: () => libraryStoreState,
    },
  );

  const transferManagerMock = {
    queueUpload: vi.fn(),
    queueDownload: vi.fn(),
    queueDelete: vi.fn(),
  };
  const deleteResults: boolean[] = [];
  const logDiagnosticError = vi.fn().mockResolvedValue(undefined);
  const logDiagnosticEvent = vi.fn().mockResolvedValue(undefined);

  return {
    appServiceMock,
    libraryStoreMock,
    transferManagerMock,
    deleteResults,
    logDiagnosticError,
    logDiagnosticEvent,
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useAppRouter', () => ({
  useAppRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: testMocks.appServiceMock,
    envConfig: {
      getAppService: vi.fn(async () => testMocks.appServiceMock),
    },
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null, user: null }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, values?: Record<string, string | number>) =>
    text.replace(/{{(\w+)}}/g, (_, key) => `${values?.[key] ?? ''}`),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    isRoundedWindow: false,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      globalViewSettings: {},
      screenWakeLock: false,
      libraryGroupBy: 'none',
      autoCheckUpdates: false,
      alwaysOnTop: false,
      keepLogin: false,
      openLastBooks: false,
      lastOpenBooks: [],
      autoUpload: false,
    },
    setSettings: vi.fn(),
    saveSettings: vi.fn(),
    isSettingsDialogOpen: false,
    setSettingsDialogOpen: vi.fn(),
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: testMocks.libraryStoreMock,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ clearBookData: vi.fn() }),
}));

vi.mock('@/store/transferStore', () => ({
  useTransferStore: () => ({ isTransferQueueOpen: false }),
}));

vi.mock('@/utils/bridge', () => ({
  findLocalEpubFiles: vi.fn(),
  lockScreenOrientation: vi.fn(),
  selectDirectory: vi.fn(),
}));

vi.mock('@/utils/permission', () => ({
  requestStoragePermission: vi.fn(async () => true),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => true,
  isWebAppPlatform: () => false,
}));

vi.mock('@/services/transferManager', () => ({
  transferManager: testMocks.transferManagerMock,
}));

vi.mock('@/services/diagnostics/logger', () => ({
  logDiagnosticError: testMocks.logDiagnosticError,
  logDiagnosticEvent: testMocks.logDiagnosticEvent,
}));

vi.mock('@/utils/window', () => ({
  tauriHandleClose: vi.fn(),
  tauriHandleSetAlwaysOnTop: vi.fn(),
  tauriHandleToggleFullScreen: vi.fn(),
  tauriQuitApp: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-haptics', () => ({ impactFeedback: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }));

vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));
vi.mock('@/hooks/usePullToRefresh', () => ({ usePullToRefresh: vi.fn() }));
vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));
vi.mock('@/hooks/useUICSS', () => ({ useUICSS: vi.fn() }));
vi.mock('@/hooks/useScreenWakeLock', () => ({ useScreenWakeLock: vi.fn() }));
vi.mock('@/hooks/useOpenWithBooks', () => ({ useOpenWithBooks: vi.fn() }));
vi.mock('@/hooks/useKeyDownActions', () => ({ useKeyDownActions: vi.fn() }));
vi.mock('@/hooks/useShortcuts', () => ({ default: vi.fn() }));
vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: vi.fn() }),
}));
vi.mock('@/hooks/useTransferQueue', () => ({ useTransferQueue: vi.fn() }));
vi.mock('@/app/library/hooks/useDemoBooks', () => ({ useDemoBooks: () => [] }));
vi.mock('@/app/library/hooks/useBooksSync', () => ({
  useBooksSync: () => ({ pullLibrary: vi.fn(), pushLibrary: vi.fn() }),
}));
vi.mock('@/app/library/hooks/useDragDropImport', () => ({
  useDragDropImport: () => ({ isDragging: false }),
}));

vi.mock('@/app/library/components/LibraryHeader', () => ({
  default: ({ onImportEpubsFromDirectory }: { onImportEpubsFromDirectory?: () => void }) => (
    <div>
      <button type='button' onClick={onImportEpubsFromDirectory}>
        一键导入本地 EPUB
      </button>
    </div>
  ),
}));

vi.mock('@/components/Spinner', () => ({ default: () => null }));
vi.mock('@/components/DropIndicator', () => ({ default: () => null }));
vi.mock('@/components/Toast', () => ({ Toast: () => null }));
vi.mock('@/components/AboutWindow', () => ({ AboutWindow: () => null }));
vi.mock('@/components/KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));
vi.mock('@/components/UpdaterWindow', () => ({ UpdaterWindow: () => null }));
vi.mock('@/components/settings/SettingsDialog', () => ({ default: () => null }));
vi.mock('@/components/metadata', () => ({
  BookDetailModal: ({
    book,
    handleBookDelete,
  }: {
    book: unknown;
    handleBookDelete?: (book: unknown, options?: { deleteLocalFile?: boolean }) => Promise<boolean>;
  }) => (
    <button type='button' onClick={() => handleBookDelete?.(book)}>
      删除书籍
    </button>
  ),
}));
vi.mock('@/app/library/components/MigrateDataWindow', () => ({ MigrateDataWindow: () => null }));
vi.mock('@/app/library/components/BackupWindow', () => ({ BackupWindow: () => null }));
vi.mock('@/app/library/components/OPDSDialog', () => ({ CatalogDialog: () => null }));
vi.mock('@/app/library/components/TransferQueuePanel', () => ({ default: () => null }));
vi.mock('@/app/library/components/AIBookSearchDialog', () => ({
  default: () => <section>AI 搜书全屏</section>,
}));
vi.mock('@/app/library/components/ContinueReadingCard', () => ({ default: () => null }));
vi.mock('@/app/library/components/LibraryEmptyState', () => ({ default: () => null }));
vi.mock('@/app/library/components/Bookshelf', () => ({
  default: ({
    libraryBooks,
    handleBookDelete,
    handleBookDownload,
    onOpenAIBookSearch,
  }: {
    libraryBooks: Array<{ title: string }>;
    handleBookDelete: (book: unknown, options?: { deleteLocalFile?: boolean }) => Promise<boolean>;
    handleBookDownload: (
      book: unknown,
      options?: { redownload?: boolean; queued?: boolean },
    ) => Promise<boolean>;
    onOpenAIBookSearch: () => void;
  }) => (
    <div>
      {libraryBooks.map((book) => (
        <div key={book.title}>
          <button
            type='button'
            onClick={async () => {
              testMocks.deleteResults.push(await handleBookDelete(book, { deleteLocalFile: true }));
            }}
          >
            删除 {book.title}
          </button>
          <button type='button' onClick={() => handleBookDownload(book, { redownload: true })}>
            下载 {book.title}
          </button>
        </div>
      ))}
      <button type='button' onClick={onOpenAIBookSearch}>
        全网搜书
      </button>
    </div>
  ),
}));
vi.mock('@/app/library/components/GroupHeader', () => ({ default: () => null }));

let resolveScan: ((value: { files: { path: string; basePath: string }[] }) => void) | undefined;
let progressHandler: ((progress: { scannedCount: number; file?: string }) => void) | undefined;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  testMocks.libraryStoreMock.getState().library = [
    { hash: 'existing-book', title: 'Existing Book', deletedAt: null },
  ];
  testMocks.deleteResults.length = 0;
  resolveScan = undefined;
  progressHandler = undefined;
});

describe('Library EPUB scan import flow', () => {
  it('opens AI book search from the bookshelf footer as a full-screen portal without modal overlay', () => {
    render(<LibraryPage />);

    expect(screen.queryByRole('button', { name: 'AI 搜书' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '全网搜书' }));

    const aiSurface = screen.getByText('AI 搜书全屏');
    const portalRoot = aiSurface.parentElement;
    expect(portalRoot?.className).not.toContain('bg-black');
    expect(portalRoot?.className).not.toContain('bg-opacity-50');
  });

  it('opens the scan dialog and streams found EPUB rows before import', async () => {
    vi.mocked(findLocalEpubFiles).mockImplementation((handler) => {
      progressHandler = handler;
      return new Promise((resolve) => {
        resolveScan = resolve;
      });
    });

    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: '一键导入本地 EPUB' }));

    await waitFor(() => expect(findLocalEpubFiles).toHaveBeenCalledTimes(1));

    act(() => {
      progressHandler?.({
        scannedCount: 37,
        file: '/storage/emulated/0/Download/雪中悍刀行.epub',
      });
    });

    expect(screen.getByRole('dialog', { name: '正在搜索本地 EPUB' })).toBeTruthy();
    expect(screen.getByText('正在搜索 37 个文件')).toBeTruthy();
    expect(screen.getByText('雪中悍刀行.epub')).toBeTruthy();

    await act(async () => {
      resolveScan?.({
        files: [
          {
            path: '/storage/emulated/0/Download/雪中悍刀行.epub',
            basePath: '/storage/emulated/0',
          },
        ],
      });
    });

    await waitFor(() => expect(screen.getByText('搜索完成，发现 1 个 EPUB 文件')).toBeTruthy());
    expect(screen.getByRole('button', { name: '导入 1 个文件' })).toBeTruthy();
  });

  it('does not clear grouping from an already visible EPUB that is marked existing', async () => {
    const existingVisibleBook = {
      hash: '/storage/emulated/0/Download/readio-test.epub',
      title: 'readio-test.epub',
      format: 'EPUB',
      author: '',
      groupId: 'old-folder-id',
      groupName: 'Download',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      downloadedAt: 0,
    };
    testMocks.libraryStoreMock.getState().library = [existingVisibleBook] as never[];
    testMocks.appServiceMock.importBook.mockResolvedValue(existingVisibleBook);
    testMocks.libraryStoreMock().updateBooks.mockImplementation(async () => undefined);

    vi.mocked(findLocalEpubFiles).mockResolvedValue({
      files: [
        {
          path: '/storage/emulated/0/Download/readio-test.epub',
          basePath: '/storage/emulated/0',
        },
      ],
    });

    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: '一键导入本地 EPUB' }));

    await waitFor(() => expect(screen.getByText('搜索完成，发现 1 个 EPUB 文件')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('button', { name: '取消全选' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '导入 1 个文件' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('listitem', { name: /readio-test.epub/ })).getByText('内容已存在'),
      ).toBeTruthy();
    });
    expect(existingVisibleBook.groupId).toBe('old-folder-id');
    expect(existingVisibleBook.groupName).toBe('Download');
  });

  it('logs import failures and completion counts without leaking file paths', async () => {
    testMocks.appServiceMock.importBook.mockImplementation(async (file: string) => {
      if (file.endsWith('private-failure.epub')) throw new Error('cannot parse epub');
      return {
        hash: file,
        title: 'safe imported title',
        format: 'EPUB',
        author: '',
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        downloadedAt: 0,
      };
    });
    vi.mocked(findLocalEpubFiles).mockResolvedValue({
      files: [
        {
          path: '/storage/emulated/0/Download/private-success.epub',
          basePath: '/storage/emulated/0',
        },
        {
          path: '/storage/emulated/0/Download/private-failure.epub',
          basePath: '/storage/emulated/0',
        },
      ],
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: '一键导入本地 EPUB' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '导入 2 个文件' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    await waitFor(() => expect(testMocks.appServiceMock.importBook).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(testMocks.logDiagnosticError).toHaveBeenCalledWith(
        'library.import_failed',
        expect.any(Error),
        expect.objectContaining({
          filenameLength: 'private-failure.epub'.length,
          extension: 'epub',
        }),
      ),
    );
    expect(testMocks.logDiagnosticEvent).toHaveBeenCalledWith(
      'library.import_completed',
      'info',
      expect.objectContaining({
        attemptedCount: 1,
        successCount: 1,
        failedCount: 0,
      }),
    );
    expect(testMocks.logDiagnosticEvent).toHaveBeenCalledWith(
      'library.import_completed',
      'info',
      expect.objectContaining({
        attemptedCount: 1,
        successCount: 0,
        failedCount: 1,
      }),
    );
    const calls = JSON.stringify([
      testMocks.logDiagnosticError.mock.calls,
      testMocks.logDiagnosticEvent.mock.calls,
    ]);
    expect(calls).not.toContain('/storage/emulated/0/Download');
    expect(calls).not.toContain('private-failure.epub');
    expect(calls).not.toContain('private-success.epub');
    errorSpy.mockRestore();
  });

  it('reports how many scanned EPUB files were newly added versus already existing', async () => {
    const existingBooks = Array.from({ length: 4 }, (_, index) => ({
      hash: `existing-${index}`,
      title: `existing-${index}.epub`,
      format: 'EPUB',
      author: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      downloadedAt: 0,
    }));
    const newBook = {
      hash: 'new-book',
      title: 'new-book.epub',
      format: 'EPUB',
      author: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      downloadedAt: 0,
    };
    testMocks.libraryStoreMock.getState().library = existingBooks as never[];
    testMocks.appServiceMock.importBook.mockImplementation(async (file: string) => {
      const filename = file.split('/').pop();
      return filename === 'new-book.epub'
        ? newBook
        : existingBooks.find((book) => book.title === filename);
    });
    testMocks
      .libraryStoreMock()
      .updateBooks.mockImplementation(async (_envConfig, books: Array<{ hash: string }>) => {
        testMocks.libraryStoreMock.getState().library = Array.from(
          new Map(
            [
              ...(testMocks.libraryStoreMock.getState().library as Array<{ hash: string }>),
              ...books,
            ].map((book) => [book.hash, book]),
          ).values(),
        ) as never[];
      });
    vi.mocked(findLocalEpubFiles).mockResolvedValue({
      files: [...existingBooks, newBook].map((book) => ({
        path: `/storage/emulated/0/Download/${book.title}`,
        basePath: '/storage/emulated/0',
      })),
    });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');

    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: '一键导入本地 EPUB' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '导入 5 个文件' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '导入 5 个文件' }));

    await waitFor(() => expect(testMocks.appServiceMock.importBook).toHaveBeenCalledTimes(5));
    expect(dispatchSpy).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ message: '新增 1 本，4 个文件内容已在书架中，失败 0 个' }),
    );
    expect(
      screen.getByText('处理完成，发现 5 个 EPUB 文件，新增 1 本，4 个文件内容已在书架中'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: '已全部处理' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ message: 'Successfully imported 1 book(s)' }),
    );
  });

  it('logs download failures without leaking book title', async () => {
    testMocks.libraryStoreMock.getState().library = [
      {
        hash: 'private-book-hash',
        title: 'Private Download Title',
        format: 'EPUB',
        author: '',
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        downloadedAt: null,
      },
    ] as never[];
    testMocks.appServiceMock.downloadBook.mockRejectedValueOnce(new Error('download failed'));

    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: '下载 Private Download Title' }));

    await waitFor(() =>
      expect(testMocks.logDiagnosticError).toHaveBeenCalledWith(
        'library.download_failed',
        expect.any(Error),
        expect.objectContaining({
          bookHashPresent: true,
          redownload: true,
          queued: false,
        }),
      ),
    );
    const calls = JSON.stringify(testMocks.logDiagnosticError.mock.calls);
    expect(calls).not.toContain('Private Download Title');
    expect(calls).not.toContain('private-book-hash');
  });

  it('deduplicates scan results, imports every selected EPUB, keeps them ungrouped, and can delete them', async () => {
    const importedBooks: unknown[] = [];
    testMocks.libraryStoreMock.getState().library = [
      {
        hash: '/storage/emulated/0/Download/readio-test.epub',
        title: 'readio-test.epub',
        format: 'EPUB',
        author: '',
        createdAt: 0,
        updatedAt: 0,
        deletedAt: Date.now(),
        downloadedAt: null,
      },
    ] as never[];
    testMocks.transferManagerMock.queueDelete.mockReturnValue(null);
    testMocks.appServiceMock.importBook.mockImplementation(async (file: string) => ({
      hash: file,
      title: file.split('/').pop(),
      format: 'EPUB',
      author: '',
      groupId: 'old-folder-id',
      groupName: 'Download',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      downloadedAt: 0,
    }));
    testMocks
      .libraryStoreMock()
      .updateBooks.mockImplementation(async (_envConfig, books: Array<{ hash: string }>) => {
        const existingBooks = testMocks.libraryStoreMock.getState().library as Array<{
          hash: string;
        }>;
        importedBooks.splice(
          0,
          importedBooks.length,
          ...Array.from(
            new Map([...existingBooks, ...books].map((book) => [book.hash, book])).values(),
          ),
        );
        testMocks.libraryStoreMock.getState().library = importedBooks as never[];
      });

    vi.mocked(findLocalEpubFiles).mockResolvedValue({
      files: [
        {
          path: '/storage/emulated/0/Download/readio-test.epub',
          basePath: '/storage/emulated/0',
        },
        {
          path: '/storage/emulated/0/Download/readio-test.epub',
          basePath: '/storage/emulated/0',
        },
        {
          path: '/storage/emulated/0/Books/readio-test.epub',
          basePath: '/storage/emulated/0',
        },
        {
          path: '/storage/emulated/0/Download/lord-of-mysteries.epub',
          basePath: '/storage/emulated/0',
        },
      ],
    });

    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: '一键导入本地 EPUB' }));

    await waitFor(() => expect(screen.getByText('搜索完成，发现 2 个 EPUB 文件')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('button', { name: '取消全选' })).toBeTruthy());
    expect(screen.getAllByText('readio-test.epub')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    await waitFor(() => expect(testMocks.appServiceMock.importBook).toHaveBeenCalledTimes(2));
    expect(testMocks.libraryStoreMock().updateBooks).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.not.objectContaining({ groupId: expect.any(String) }),
        expect.not.objectContaining({ groupName: expect.any(String) }),
      ]),
      expect.anything(),
    );
    await waitFor(() => {
      expect(
        within(screen.getByRole('listitem', { name: /readio-test.epub/ })).getByText('✓'),
      ).toBeTruthy();
      expect(
        within(screen.getByRole('listitem', { name: /lord-of-mysteries.epub/ })).getByText('✓'),
      ).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '完成' }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '删除 readio-test.epub' })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: '删除 readio-test.epub' }));

    await waitFor(() =>
      expect(testMocks.appServiceMock.deleteBook).toHaveBeenCalledWith(expect.anything(), 'local'),
    );
    expect(testMocks.deleteResults).toEqual([true]);
    expect(testMocks.libraryStoreMock().updateBook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'readio-test.epub', deletedAt: expect.any(Number) }),
    );
  });
});

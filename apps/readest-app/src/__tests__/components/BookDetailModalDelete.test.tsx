import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookDetailModal } from '@/components/metadata';
import { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

const appServiceMock = {
  fetchBookDetails: vi.fn(async () => null),
  getBookFileSize: vi.fn(async () => 1024),
  exportBook: vi.fn(async () => true),
};

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { getAppService: vi.fn(async () => appServiceMock) },
    appService: appServiceMock,
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { bottom: 0 } }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      metadataSeriesCollapsed: true,
      metadataOthersCollapsed: true,
      metadataDescriptionCollapsed: true,
    },
  }),
}));

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => false,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn() },
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    children,
    title,
    header,
    onClose,
  }: {
    children: React.ReactNode;
    title?: string;
    header?: React.ReactNode;
    onClose: () => void;
  }) => (
    <div role='dialog' aria-label={title} className='modal'>
      <button type='button' className='dialog-overlay' onClick={onClose} aria-label='Backdrop' />
      <div className='modal-box'>
        <div className='drag-handle' />
        {header}
        {children}
      </div>
    </div>
  ),
}));

vi.mock('@/components/Alert', () => ({
  default: ({
    title,
    message,
    children,
    onConfirm,
  }: {
    title: string;
    message: string;
    children?: React.ReactNode;
    onConfirm: () => void;
  }) => (
    <div role='alert'>
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
      <button type='button' onClick={onConfirm}>
        Confirm
      </button>
    </div>
  ),
}));

vi.mock('@/components/BookCover', () => ({
  default: ({ book }: { book: Book }) => <div>{book.title}</div>,
}));

vi.mock('@/components/Dropdown', () => ({
  default: ({
    children,
    toggleButton,
  }: {
    children: React.ReactNode;
    toggleButton: React.ReactNode;
  }) => (
    <div>
      {toggleButton}
      {children}
    </div>
  ),
}));

vi.mock('@/components/MenuItem', () => ({
  default: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type='button' onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));

vi.mock('@/components/Spinner', () => ({
  default: () => null,
}));

vi.mock('@/components/metadata/BookDetailEdit', () => ({
  default: () => null,
}));

vi.mock('@/components/metadata/SourceSelector', () => ({
  default: () => null,
}));

vi.mock('@/components/metadata/useMetadataEdit', () => ({
  useMetadataEdit: () => ({
    editedMeta: null,
    fieldSources: {},
    lockedFields: {},
    fieldErrors: {},
    searchLoading: false,
    showSourceSelection: false,
    availableSources: [],
    handleFieldChange: vi.fn(),
    handleToggleFieldLock: vi.fn(),
    handleLockAll: vi.fn(),
    handleUnlockAll: vi.fn(),
    handleAutoRetrieve: vi.fn(),
    handleSourceSelection: vi.fn(),
    handleCloseSourceSelection: vi.fn(),
    resetToOriginal: vi.fn(),
  }),
}));

const makeBook = (): Book => ({
  hash: 'book-1',
  title: 'Alice',
  author: 'Lewis Carroll',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 2,
  downloadedAt: 3,
});

afterEach(cleanup);

describe('BookDetailModal delete options', () => {
  it('does not delete the local file by default when removing a book', async () => {
    const handleBookDelete = vi.fn();

    render(
      <BookDetailModal
        book={makeBook()}
        isOpen
        onClose={vi.fn()}
        handleBookDelete={handleBookDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from Library' }));

    expect(await screen.findByRole('dialog', { name: '删除这本书？' })).toBeTruthy();
    expect(
      screen.getByText('这本书将从书架中移除，阅读进度和相关记录可能也会被删除。'),
    ).toBeTruthy();

    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox', { name: '同时删除本地文件' });
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(handleBookDelete).toHaveBeenCalledWith(makeBook(), { deleteLocalFile: false });
  });

  it('can delete the local file when explicitly selected', async () => {
    const handleBookDelete = vi.fn();

    render(
      <BookDetailModal
        book={makeBook()}
        isOpen
        onClose={vi.fn()}
        handleBookDelete={handleBookDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from Library' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '同时删除本地文件' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(handleBookDelete).toHaveBeenCalledWith(makeBook(), { deleteLocalFile: true });
  });

  it('hides the cloud upload action from book details', () => {
    render(
      <BookDetailModal book={makeBook()} isOpen onClose={vi.fn()} handleBookUpload={vi.fn()} />,
    );

    expect(screen.queryByTitle('Upload to Cloud')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload to Cloud' })).toBeNull();
  });

  it('uses a shared bottom-sheet dialog for delete confirmation without closing book details on cancel', async () => {
    const handleClose = vi.fn();

    render(
      <BookDetailModal book={makeBook()} isOpen onClose={handleClose} handleBookDelete={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from Library' }));

    const dialogs = screen.getAllByRole('dialog');
    const deleteDialog = dialogs.find(
      (dialog) => dialog.getAttribute('aria-label') === '删除这本书？',
    );
    expect(deleteDialog).toBeTruthy();
    expect(deleteDialog?.className).toContain('modal');
    expect(deleteDialog?.querySelector('.dialog-overlay')).toBeTruthy();
    expect(deleteDialog?.querySelector('.modal-box')).toBeTruthy();
    expect(deleteDialog?.querySelector('.drag-handle')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '删除这本书？' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Book Details' })).toBeTruthy();
  });
});

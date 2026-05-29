import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Bookshelf from '@/app/library/components/Bookshelf';
import { eventDispatcher } from '@/utils/event';
import type { Book } from '@/types/book';

interface VirtuosoMockComponents {
  Footer?: React.ComponentType<{ context?: unknown }>;
}

interface VirtuosoMockProps {
  totalCount: number;
  itemContent: (index: number) => React.ReactNode;
  components?: VirtuosoMockComponents;
  context?: unknown;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('react-virtuoso', () => ({
  VirtuosoGrid: ({ totalCount, itemContent, components, context }: VirtuosoMockProps) => (
    <div>
      {Array.from({ length: totalCount }, (_, index) => (
        <div key={index}>{itemContent(index)}</div>
      ))}
      {components?.Footer ? <components.Footer context={context} /> : null}
    </div>
  ),
  Virtuoso: ({ totalCount, itemContent, components, context }: VirtuosoMockProps) => (
    <div>
      {Array.from({ length: totalCount }, (_, index) => (
        <div key={index}>{itemContent(index)}</div>
      ))}
      {components?.Footer ? <components.Footer context={context} /> : null}
    </div>
  ),
}));

vi.mock('overlayscrollbars-react', () => ({
  useOverlayScrollbars: () => [vi.fn(), vi.fn(() => ({ destroy: vi.fn() }))],
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { hasWindow: false },
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      libraryViewMode: 'grid',
      librarySortBy: 'updated',
      librarySortAscending: false,
      libraryGroupBy: 'none',
      libraryCoverFit: 'crop',
      libraryAutoColumns: true,
      libraryColumns: 3,
      openBookInNewWindow: false,
    },
  }),
}));

const libraryStoreState = {
  setCurrentBookshelf: vi.fn(),
  setLibrary: vi.fn(),
  updateBooks: vi.fn(),
  setSelectedBooks: vi.fn(),
  getSelectedBooks: vi.fn(() => []),
  toggleSelectedBook: vi.fn(),
  getGroupName: vi.fn(() => ''),
};

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => libraryStoreState,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useAutoFocus', () => ({
  useAutoFocus: () => React.createRef<HTMLDivElement>(),
}));

vi.mock('@/app/library/hooks/useSpatialNavigation', () => ({
  useSpatialNavigation: vi.fn(),
}));

vi.mock('@/app/library/utils/libraryUtils', () => ({
  createBookFilter: () => () => true,
  createBookGroups: (books: Book[]) => books,
  createBookSorter: () => () => 0,
  createGroupSorter: () => () => 0,
  createWithinGroupSorter: () => () => 0,
  ensureLibraryGroupByType: (value: string | null, fallback: string) => value || fallback,
  ensureLibrarySortByType: (value: string | null, fallback: string) => value || fallback,
  getBookSortValue: () => '',
  getGroupSortValue: () => '',
  compareSortValues: () => 0,
}));

vi.mock('@/app/library/components/BookshelfItem', () => ({
  default: ({ item }: { item: Book }) => <div>{item.title}</div>,
  generateBookshelfItems: (books: Book[]) => books,
}));

vi.mock('@/components/Spinner', () => ({ default: () => null }));
vi.mock('@/components/ModalPortal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/Dialog', () => ({
  default: ({
    title,
    header,
    children,
    onClose,
  }: {
    title: string;
    header?: React.ReactNode;
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div role='dialog' aria-label={title} data-testid='dialog-sheet'>
      {header}
      {children}
      <button type='button' onClick={onClose}>
        Backdrop close
      </button>
    </div>
  ),
}));
vi.mock('@/app/library/components/SelectModeActions', () => ({ default: () => null }));
vi.mock('@/app/library/components/GroupingModal', () => ({ default: () => null }));
vi.mock('@/app/library/components/SetStatusAlert', () => ({ default: () => null }));
vi.mock('@/components/Alert', () => ({ default: () => null }));

const renderBookshelf = (props: Partial<React.ComponentProps<typeof Bookshelf>> = {}) => (
  <Bookshelf
    libraryBooks={[book]}
    isSelectMode={false}
    isSelectAll={false}
    isSelectNone={false}
    onScrollerRef={vi.fn()}
    handleImportBooks={vi.fn()}
    handleBookDownload={vi.fn(async () => true)}
    handleBookUpload={vi.fn(async () => true)}
    handleBookDelete={vi.fn(async () => true)}
    handleSetSelectMode={vi.fn()}
    handleShowDetailsBook={vi.fn()}
    handleLibraryNavigation={vi.fn()}
    handlePushLibrary={vi.fn(async () => undefined)}
    booksTransferProgress={{}}
    onOpenAIBookSearch={vi.fn()}
    {...props}
  />
);

const book = {
  hash: 'book-1',
  title: 'Existing Book',
  format: 'EPUB',
  deletedAt: null,
} as Book;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Bookshelf AI search CTA', () => {
  it('shows a global book search CTA below the final shelf item', () => {
    const onOpenAIBookSearch = vi.fn();

    render(
      <Bookshelf
        libraryBooks={[book]}
        isSelectMode={false}
        isSelectAll={false}
        isSelectNone={false}
        onScrollerRef={vi.fn()}
        handleImportBooks={vi.fn()}
        handleBookDownload={vi.fn(async () => true)}
        handleBookUpload={vi.fn(async () => true)}
        handleBookDelete={vi.fn(async () => true)}
        handleSetSelectMode={vi.fn()}
        handleShowDetailsBook={vi.fn()}
        handleLibraryNavigation={vi.fn()}
        handlePushLibrary={vi.fn(async () => undefined)}
        booksTransferProgress={{}}
        onOpenAIBookSearch={onOpenAIBookSearch}
      />,
    );

    expect(screen.getByText('Existing Book')).toBeTruthy();
    expect(screen.getByText('书不在架上，也许在远处？')).toBeTruthy();
    expect(screen.getByText('想读的那本，或许正在等你。')).toBeTruthy();

    const footer = screen.getByTestId('bookshelf-global-search-footer');
    expect(footer.className).toContain('text-center');
    expect(footer.className).not.toContain('rounded-3xl');
    expect(footer.className).not.toContain('bg-base-200/40');
    expect(footer.className).not.toContain('shadow');

    const button = screen.getByRole('button', { name: '寻书' });
    expect(button.className).toContain('border');
    expect(button.className).toContain('rounded-full');
    fireEvent.click(button);

    expect(onOpenAIBookSearch).toHaveBeenCalledTimes(1);
  });

  it('uses a localized Readio sheet for multi-select delete confirmation', async () => {
    render(renderBookshelf());

    await eventDispatcher.dispatch('delete-books', { ids: ['book-1'] });

    const dialog = await screen.findByRole('dialog', { name: '删除选中的书？' });
    expect(dialog).toBeTruthy();
    expect(
      screen.getByText('将从书架中移除 {{count}} 本书，阅读进度和相关记录可能也会被删除。'),
    ).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '同时删除本地文件' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();
    expect(
      screen.queryByText(/This removes|Also delete the local file|Confirm Deletion|Confirm|Cancel/),
    ).toBeNull();
  });
});

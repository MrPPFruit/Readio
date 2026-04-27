import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ImportMenu from '@/app/library/components/ImportMenu';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useKeyDownActions', () => ({
  useKeyDownActions: vi.fn(),
}));

vi.mock('@/config/features', () => ({
  readioFeatures: {
    opds: false,
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      isOnlineCatalogsAccessible: false,
    },
  }),
}));

afterEach(cleanup);

describe('ImportMenu', () => {
  it('shows clear Readio import actions and help text', () => {
    render(
      <ImportMenu
        onImportBooksFromFiles={vi.fn()}
        onImportBooksFromDirectory={vi.fn()}
        onImportEpubsFromDirectory={vi.fn()}
        onOpenCatalogManager={vi.fn()}
      />,
    );

    expect(screen.getByRole('menuitem', { name: /选择文件导入/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /选择文件夹导入/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /一键导入本地 EPUB/ })).toBeTruthy();
    expect(screen.getByText('选择一个或多个 EPUB、PDF、TXT 文件导入。')).toBeTruthy();
    expect(screen.getByText('选择文件夹，导入其中所有支持的书籍文件。')).toBeTruthy();
    expect(screen.getByText('自动搜索本机 EPUB 文件并批量导入。')).toBeTruthy();

    expect(screen.getByRole('button', { name: /选择文件导入说明/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /选择文件夹导入说明/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /一键导入本地 EPUB说明/ })).toBeTruthy();
  });

  it('keeps the menu open when tapping an import explanation icon', () => {
    const onImportBooksFromFiles = vi.fn();
    const setIsDropdownOpen = vi.fn();

    render(
      <ImportMenu
        setIsDropdownOpen={setIsDropdownOpen}
        onImportBooksFromFiles={onImportBooksFromFiles}
        onImportBooksFromDirectory={vi.fn()}
        onImportEpubsFromDirectory={vi.fn()}
        onOpenCatalogManager={vi.fn()}
      />,
    );

    expect(screen.getByRole('menuitem', { name: /选择文件导入/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /选择文件导入说明/ }));

    expect(onImportBooksFromFiles).not.toHaveBeenCalled();
    expect(setIsDropdownOpen).not.toHaveBeenCalled();
  });

  it('shows an EPUB scan action when provided and closes the menu after click', () => {
    const onImportEpubsFromDirectory = vi.fn();
    const setIsDropdownOpen = vi.fn();

    render(
      <ImportMenu
        setIsDropdownOpen={setIsDropdownOpen}
        onImportBooksFromFiles={vi.fn()}
        onImportEpubsFromDirectory={onImportEpubsFromDirectory}
        onOpenCatalogManager={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /一键导入本地 EPUB/ }));

    expect(onImportEpubsFromDirectory).toHaveBeenCalledTimes(1);
    expect(setIsDropdownOpen).toHaveBeenCalledWith(false);
  });

  it('hides the EPUB scan action when no scan callback is provided', () => {
    render(<ImportMenu onImportBooksFromFiles={vi.fn()} onOpenCatalogManager={vi.fn()} />);

    expect(screen.queryByRole('menuitem', { name: /一键导入本地 EPUB/ })).toBeNull();
  });
});

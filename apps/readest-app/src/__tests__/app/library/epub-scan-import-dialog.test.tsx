import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EpubScanImportDialog from '@/app/library/components/EpubScanImportDialog';
import { SelectedFile } from '@/hooks/useFileSelector';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, values?: Record<string, string | number>) =>
    text.replace(/{{(\w+)}}/g, (_, key) => `${values?.[key] ?? ''}`),
}));

afterEach(cleanup);

const files: SelectedFile[] = [
  {
    path: '/storage/emulated/0/Download/雪中悍刀行.epub',
    basePath: '/storage/emulated/0',
  },
  {
    path: '/storage/emulated/0/Books/三体.epub',
    basePath: '/storage/emulated/0',
  },
];

describe('EpubScanImportDialog', () => {
  it('shows live scan progress and defaults discovered books to selected after scan completes', () => {
    const { rerender } = render(
      <EpubScanImportDialog
        isScanning
        scannedCount={37}
        files={files.slice(0, 1)}
        onCancel={vi.fn()}
        onImportBook={vi.fn(async () => 'success' as const)}
      />,
    );

    expect(screen.getByRole('dialog', { name: '正在搜索本地 EPUB' })).toBeTruthy();
    expect(screen.getByText('正在搜索 37 个文件')).toBeTruthy();
    expect(screen.getByText('雪中悍刀行.epub')).toBeTruthy();

    rerender(
      <EpubScanImportDialog
        isScanning={false}
        scannedCount={58}
        files={files}
        onCancel={vi.fn()}
        onImportBook={vi.fn(async () => 'success' as const)}
      />,
    );

    expect(screen.getByText('搜索完成，发现 2 个 EPUB 文件')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: /雪中悍刀行.epub/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByRole('checkbox', { name: /三体.epub/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: '取消全选' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '导入 2 个文件' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消全选' }));
    expect(
      (screen.getByRole('checkbox', { name: /雪中悍刀行.epub/ }) as HTMLInputElement).checked,
    ).toBe(false);
    expect((screen.getByRole('checkbox', { name: /三体.epub/ }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByRole('button', { name: '全选' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(screen.getByRole('button', { name: '取消全选' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '导入 2 个文件' })).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /雪中悍刀行.epub/ }));
    expect(screen.getByRole('button', { name: '全选' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '导入 1 个文件' })).toBeTruthy();
  });

  it('imports selected books one by one and marks each successful row with a check', async () => {
    let resolveFirstImport: () => void = () => undefined;
    const firstImport = new Promise<'success'>((resolve) => {
      resolveFirstImport = () => resolve('success');
    });
    const onImportBook = vi.fn((file: SelectedFile) => {
      if (file.path?.includes('雪中悍刀行')) return firstImport;
      return Promise.resolve('success' as const);
    });

    render(
      <EpubScanImportDialog
        isScanning={false}
        scannedCount={58}
        files={files}
        onCancel={vi.fn()}
        onImportBook={onImportBook}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    expect(onImportBook).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByRole('listitem', { name: /雪中悍刀行.epub/ })).getByText('正在导入'),
    ).toBeTruthy();

    await act(async () => {
      resolveFirstImport();
      await firstImport;
    });

    await waitFor(() => expect(onImportBook).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(
        within(screen.getByRole('listitem', { name: /雪中悍刀行.epub/ })).getByText('✓'),
      ).toBeTruthy();
      expect(
        within(screen.getByRole('listitem', { name: /三体.epub/ })).getByText('✓'),
      ).toBeTruthy();
    });
  });

  it('continues importing remaining books after a row fails', async () => {
    const onImportBook = vi.fn((file: SelectedFile) => {
      if (file.path?.includes('雪中悍刀行')) return Promise.reject(new Error('open failed'));
      return Promise.resolve('success' as const);
    });

    render(
      <EpubScanImportDialog
        isScanning={false}
        scannedCount={58}
        files={files}
        onCancel={vi.fn()}
        onImportBook={onImportBook}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    await waitFor(() => expect(onImportBook).toHaveBeenCalledTimes(2));
    expect(
      within(screen.getByRole('listitem', { name: /雪中悍刀行.epub/ })).getByText('导入失败'),
    ).toBeTruthy();
    expect(within(screen.getByRole('listitem', { name: /三体.epub/ })).getByText('✓')).toBeTruthy();
  });

  it('marks rows as already existing when the import does not add a book', async () => {
    const onImportBook = vi.fn((file: SelectedFile) => {
      if (file.path?.includes('雪中悍刀行')) return Promise.resolve('skipped' as const);
      return Promise.resolve('success' as const);
    });

    render(
      <EpubScanImportDialog
        isScanning={false}
        scannedCount={58}
        files={files}
        onCancel={vi.fn()}
        onImportBook={onImportBook}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    await waitFor(() => expect(onImportBook).toHaveBeenCalledTimes(2));
    expect(
      within(screen.getByRole('listitem', { name: /雪中悍刀行.epub/ })).getByText('内容已存在'),
    ).toBeTruthy();
    expect(within(screen.getByRole('listitem', { name: /三体.epub/ })).getByText('✓')).toBeTruthy();
  });

  it('labels discovered EPUBs as files and reports skipped rows in the final summary', async () => {
    const onImportComplete = vi.fn();
    const onImportBook = vi.fn((file: SelectedFile) => {
      if (file.path?.includes('雪中悍刀行')) return Promise.resolve('skipped' as const);
      return Promise.resolve('success' as const);
    });

    render(
      <EpubScanImportDialog
        isScanning={false}
        scannedCount={58}
        files={files}
        onCancel={vi.fn()}
        onImportBook={onImportBook}
        onImportComplete={onImportComplete}
      />,
    );

    expect(screen.getByText('搜索完成，发现 2 个 EPUB 文件')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    await waitFor(() =>
      expect(onImportComplete).toHaveBeenCalledWith({
        successCount: 1,
        skippedCount: 1,
        failedCount: 0,
      }),
    );
    expect(
      screen.getByText('处理完成，发现 2 个 EPUB 文件，新增 1 本，1 个文件内容已在书架中'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
    expect((screen.getByRole('button', { name: '已全部处理' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '全选' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not offer to import again when every scanned EPUB already exists', async () => {
    const onImportBook = vi.fn(async () => 'skipped' as const);

    render(
      <EpubScanImportDialog
        isScanning={false}
        scannedCount={58}
        files={files}
        onCancel={vi.fn()}
        onImportBook={onImportBook}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导入 2 个文件' }));

    await waitFor(() => expect(onImportBook).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText('处理完成，发现 2 个 EPUB 文件，新增 0 本，2 个文件内容已在书架中'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
    expect((screen.getByRole('button', { name: '已全部处理' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '全选' }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('checkbox', { name: /雪中悍刀行.epub/ }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('checkbox', { name: /三体.epub/ }) as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});

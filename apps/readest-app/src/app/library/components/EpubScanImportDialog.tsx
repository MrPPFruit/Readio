import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

import { SelectedFile } from '@/hooks/useFileSelector';
import { useTranslation } from '@/hooks/useTranslation';
import { getFilename } from '@/utils/path';

export type EpubScanImportResult = 'success' | 'skipped';
type ImportStatus = 'pending' | 'importing' | 'success' | 'skipped' | 'failed';

interface EpubScanImportDialogProps {
  isScanning: boolean;
  scannedCount: number;
  files: SelectedFile[];
  onCancel: () => void;
  onImportBook: (file: SelectedFile) => Promise<EpubScanImportResult>;
  onImportComplete?: (summary: {
    successCount: number;
    skippedCount: number;
    failedCount: number;
  }) => void;
}

const getFileKey = (file: SelectedFile, index: number) =>
  file.path || file.file?.name || `${index}`;
const getFileName = (file: SelectedFile) => getFilename(file.path || file.file?.name || '');

const EpubScanImportDialog = ({
  isScanning,
  scannedCount,
  files,
  onCancel,
  onImportBook,
  onImportComplete,
}: EpubScanImportDialogProps) => {
  const _ = useTranslation();
  const fileKeys = useMemo(() => files.map(getFileKey), [files]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(fileKeys));
  const [statuses, setStatuses] = useState<Record<string, ImportStatus>>({});
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    setSelectedKeys(new Set(fileKeys));
    setStatuses({});
    setIsImporting(false);
  }, [fileKeys]);

  const foundCount = files.length;
  const importableKeys = useMemo(
    () =>
      fileKeys.filter(
        (key) => !['success', 'skipped', 'importing'].includes(statuses[key] || 'pending'),
      ),
    [fileKeys, statuses],
  );
  const selectedCount = importableKeys.filter((key) => selectedKeys.has(key)).length;
  const canSelect = !isScanning && !isImporting;
  const canImport = canSelect && selectedCount > 0;
  const isAllSelected = importableKeys.length > 0 && selectedCount === importableKeys.length;
  const hasImportResult = Object.values(statuses).some((status) =>
    ['success', 'skipped', 'failed'].includes(status),
  );
  const isAllProcessed = !isScanning && foundCount > 0 && importableKeys.length === 0;

  const toggleFile = (key: string) => {
    if (!canSelect || !importableKeys.includes(key)) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!canSelect) return;
    setSelectedKeys(isAllSelected ? new Set() : new Set(importableKeys));
  };

  const importSelected = async () => {
    if (!canImport) return;
    setIsImporting(true);
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const [index, file] of files.entries()) {
      const key = getFileKey(file, index);
      if (!selectedKeys.has(key) || !importableKeys.includes(key)) continue;

      setStatuses((prev) => ({ ...prev, [key]: 'importing' }));
      try {
        const result = await onImportBook(file);
        if (result === 'success') successCount += 1;
        if (result === 'skipped') skippedCount += 1;
        setStatuses((prev) => ({ ...prev, [key]: result }));
      } catch {
        failedCount += 1;
        setStatuses((prev) => ({ ...prev, [key]: 'failed' }));
      }
    }

    setIsImporting(false);
    onImportComplete?.({ successCount, skippedCount, failedCount });
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={_('正在搜索本地 EPUB')}
      className='modal-box bg-base-100 flex max-h-[85vh] w-[92vw] max-w-xl flex-col gap-4 rounded-2xl p-5 shadow-xl'
    >
      <div>
        <h2 className='text-lg font-semibold'>{_('正在搜索本地 EPUB')}</h2>
        <p className='text-base-content/70 mt-1 text-sm'>
          {isScanning
            ? _('正在搜索 {{count}} 个文件', { count: scannedCount })
            : isAllProcessed
              ? _(
                  '处理完成，发现 {{foundCount}} 个 EPUB 文件，新增 {{successCount}} 本，{{skippedCount}} 个文件内容已在书架中',
                  {
                    foundCount,
                    successCount: Object.values(statuses).filter((status) => status === 'success')
                      .length,
                    skippedCount: Object.values(statuses).filter((status) => status === 'skipped')
                      .length,
                  },
                )
              : _('搜索完成，发现 {{count}} 个 EPUB 文件', { count: foundCount })}
        </p>
      </div>

      <div className='border-base-300 max-h-80 overflow-auto rounded-xl border'>
        {files.length === 0 ? (
          <div className='text-base-content/60 px-4 py-8 text-center text-sm'>
            {isScanning ? _('正在查找 EPUB 文件...') : _('未找到 EPUB 文件')}
          </div>
        ) : (
          <ul className='divide-base-300 divide-y'>
            {files.map((file, index) => {
              const key = getFileKey(file, index);
              const checked = selectedKeys.has(key);
              const status = statuses[key] || 'pending';
              const filename = getFileName(file);
              const isImportable = importableKeys.includes(key);

              return (
                <li key={key} aria-label={filename} className='flex items-center gap-3 px-4 py-3'>
                  <input
                    type='checkbox'
                    className='checkbox checkbox-sm'
                    aria-label={filename}
                    checked={checked}
                    disabled={!canSelect || !isImportable}
                    onChange={() => toggleFile(key)}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='truncate text-sm font-medium'>{filename}</div>
                    {file.path && (
                      <div className='text-base-content/50 truncate text-xs'>{file.path}</div>
                    )}
                  </div>
                  <span
                    className={clsx(
                      'min-w-14 text-right text-sm',
                      status === 'success' && 'text-success text-lg font-semibold',
                      status === 'skipped' && 'text-base-content/60',
                      status === 'failed' && 'text-error',
                      status === 'importing' && 'text-primary',
                    )}
                  >
                    {status === 'success' && '✓'}
                    {status === 'skipped' && _('内容已存在')}
                    {status === 'failed' && _('导入失败')}
                    {status === 'importing' && _('正在导入')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className='flex items-center justify-end gap-2'>
        <button
          type='button'
          className='btn btn-ghost btn-sm'
          onClick={onCancel}
          disabled={isImporting}
        >
          {hasImportResult ? _('完成') : _('取消')}
        </button>
        <button
          type='button'
          className='btn btn-outline btn-sm'
          onClick={toggleSelectAll}
          disabled={!canSelect || importableKeys.length === 0}
        >
          {isAllSelected ? _('取消全选') : _('全选')}
        </button>
        <button
          type='button'
          className='btn btn-primary btn-sm'
          onClick={importSelected}
          disabled={!canImport}
        >
          {importableKeys.length === 0
            ? _('已全部处理')
            : _('导入 {{count}} 个文件', { count: selectedCount })}
        </button>
      </div>
    </div>
  );
};

export default EpubScanImportDialog;

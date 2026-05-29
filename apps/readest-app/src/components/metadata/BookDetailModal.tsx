import clsx from 'clsx';
import React, { useEffect, useState } from 'react';

import { Book, DeleteBookOptions } from '@/types/book';
import { BookMetadata } from '@/libs/document';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useMetadataEdit } from './useMetadataEdit';
import { DeleteAction } from '@/types/system';
import { eventDispatcher } from '@/utils/event';
import { isWebAppPlatform } from '@/services/environment';
import Dialog from '@/components/Dialog';
import BookDetailView from './BookDetailView';
import BookDetailEdit from './BookDetailEdit';
import SourceSelector from './SourceSelector';
import Spinner from '../Spinner';

interface BookDetailModalProps {
  book: Book;
  isOpen: boolean;
  onClose: () => void;
  handleBookDownload?: (book: Book, options?: { redownload?: boolean; queued?: boolean }) => void;
  handleBookUpload?: (book: Book) => void;
  handleBookDelete?: (book: Book, options?: DeleteBookOptions) => void;
  handleBookDeleteCloudBackup?: (book: Book) => void;
  handleBookDeleteLocalCopy?: (book: Book) => void;
  handleBookMetadataUpdate?: (book: Book, updatedMetadata: BookMetadata) => void;
}

interface DeleteConfig {
  title: string;
  message: string;
  handler?: (book: Book, options?: DeleteBookOptions) => void;
}

const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  onClose,
  handleBookDownload,
  handleBookUpload,
  handleBookDelete,
  handleBookDeleteCloudBackup,
  handleBookDeleteLocalCopy,
  handleBookMetadataUpdate,
}) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const [activeDeleteAction, setActiveDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteLocalFile, setDeleteLocalFile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [bookMeta, setBookMeta] = useState<BookMetadata | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  // Initialize metadata edit hook
  const {
    editedMeta,
    fieldSources,
    lockedFields,
    fieldErrors,
    searchLoading,
    showSourceSelection,
    availableSources,
    handleFieldChange,
    handleToggleFieldLock,
    handleLockAll,
    handleUnlockAll,
    handleAutoRetrieve,
    handleSourceSelection,
    handleCloseSourceSelection,
    resetToOriginal,
  } = useMetadataEdit(bookMeta);

  const deleteConfigs: Record<DeleteAction, DeleteConfig> = {
    both: {
      title: _('删除这本书？'),
      message: _('这本书将从书架中移除，阅读进度和相关记录可能也会被删除。'),
      handler: handleBookDelete,
    },
    cloud: {
      title: _('删除这本书？'),
      message: _('这将删除这本书的云端备份。'),
      handler: handleBookDeleteCloudBackup,
    },
    local: {
      title: _('删除这本书？'),
      message: _('这将删除这本书在当前设备上的本地副本。'),
      handler: handleBookDeleteLocalCopy,
    },
  };

  useEffect(() => {
    const fetchBookDetails = async () => {
      const appService = await envConfig.getAppService();
      try {
        let details = book.metadata || null;
        if (!details && book.downloadedAt) {
          details = await appService.fetchBookDetails(book);
        }
        setBookMeta(details);
        const size = await appService.getBookFileSize(book);
        setFileSize(size);
      } finally {
      }
    };
    fetchBookDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  const handleClose = () => {
    setBookMeta(null);
    setEditMode(false);
    setActiveDeleteAction(null);
    onClose();
  };

  const handleEditMetadata = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    resetToOriginal();
    setEditMode(false);
  };

  const handleSaveMetadata = () => {
    if (editedMeta && handleBookMetadataUpdate) {
      setBookMeta({ ...editedMeta });
      handleBookMetadataUpdate(book, editedMeta);
      setEditMode(false);
    }
  };

  const handleDeleteAction = (action: DeleteAction) => {
    setDeleteLocalFile(false);
    setActiveDeleteAction(action);
  };

  const confirmDeleteAction = async () => {
    if (!activeDeleteAction) return;

    const config = deleteConfigs[activeDeleteAction];
    handleClose();

    if (config.handler) {
      config.handler(book, activeDeleteAction === 'both' ? { deleteLocalFile } : undefined);
    }
  };

  const cancelDeleteAction = () => {
    setActiveDeleteAction(null);
    setDeleteLocalFile(false);
  };

  const handleDelete = () => handleDeleteAction('both');
  const handleDeleteCloudBackup = () => handleDeleteAction('cloud');
  const handleDeleteLocalCopy = () => handleDeleteAction('local');

  const handleRedownload = async () => {
    handleClose();
    if (handleBookDownload) {
      handleBookDownload(book, { redownload: true, queued: false });
    }
  };

  const handleReupload = async () => {
    handleClose();
    if (handleBookUpload) {
      handleBookUpload(book);
    }
  };

  const handleBookExport = async () => {
    setIsLoading(true);
    setTimeout(async () => {
      const success = await appService?.exportBook(book);
      setIsLoading(false);
      if (!isWebAppPlatform()) {
        eventDispatcher.dispatch('toast', {
          type: success ? 'info' : 'error',
          message: success ? _('Book exported successfully.') : _('Failed to export the book.'),
        });
      }
    }, 0);
  };

  const currentDeleteConfig = activeDeleteAction ? deleteConfigs[activeDeleteAction] : null;

  return (
    <>
      <div className='fixed inset-0 z-50 flex items-center justify-center'>
        <Dialog
          title={editMode ? _('Edit Metadata') : _('Book Details')}
          isOpen={isOpen}
          onClose={handleClose}
          boxClassName={clsx(
            editMode ? 'sm:min-w-[600px] sm:max-w-[600px]' : 'sm:min-w-[480px] sm:max-w-[480px]',
            'sm:h-auto sm:max-h-[90%]',
          )}
          contentClassName='!px-6 !py-4'
        >
          <div className='flex w-full select-text items-start justify-center'>
            {editMode && bookMeta ? (
              <BookDetailEdit
                book={book}
                metadata={editedMeta}
                fieldSources={fieldSources}
                lockedFields={lockedFields}
                fieldErrors={fieldErrors}
                searchLoading={searchLoading}
                onFieldChange={handleFieldChange}
                onToggleFieldLock={handleToggleFieldLock}
                onAutoRetrieve={handleAutoRetrieve}
                onLockAll={handleLockAll}
                onUnlockAll={handleUnlockAll}
                onCancel={handleCancelEdit}
                onReset={resetToOriginal}
                onSave={handleSaveMetadata}
              />
            ) : (
              <BookDetailView
                book={book}
                metadata={bookMeta}
                fileSize={fileSize}
                onEdit={handleBookMetadataUpdate ? handleEditMetadata : undefined}
                onDelete={handleBookDelete ? handleDelete : undefined}
                onDeleteCloudBackup={
                  handleBookDeleteCloudBackup ? handleDeleteCloudBackup : undefined
                }
                onDeleteLocalCopy={handleBookDeleteLocalCopy ? handleDeleteLocalCopy : undefined}
                onDownload={handleBookDownload ? handleRedownload : undefined}
                onUpload={handleBookUpload ? handleReupload : undefined}
                onExport={handleBookExport}
              />
            )}
          </div>
        </Dialog>

        {/* Source Selection Modal */}
        {showSourceSelection && (
          <SourceSelector
            sources={availableSources}
            isOpen={showSourceSelection}
            onSelect={handleSourceSelection}
            onClose={handleCloseSourceSelection}
          />
        )}

        {isLoading && (
          <div className='fixed inset-0 z-50 flex items-center justify-center'>
            <Spinner loading />
          </div>
        )}

        {activeDeleteAction && currentDeleteConfig && (
          <Dialog
            title={currentDeleteConfig.title}
            isOpen={true}
            snapHeight={0.38}
            dragHandleLabel={_('下拉关闭删除确认')}
            header={<div className='sr-only'>{currentDeleteConfig.title}</div>}
            boxClassName='sm:h-auto sm:max-h-[90%] sm:max-w-md'
            contentClassName='!my-0 !px-5 !pb-5 !pt-0'
            onClose={cancelDeleteAction}
          >
            <div className='space-y-4'>
              <div>
                <h3 className='text-base font-semibold'>{currentDeleteConfig.title}</h3>
                <p className='text-base-content/70 mt-2 text-sm leading-6'>
                  {currentDeleteConfig.message}
                </p>
              </div>
              {activeDeleteAction === 'both' && (
                <label className='text-base-content/80 flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm leading-5'>
                  <input
                    type='checkbox'
                    className='checkbox checkbox-sm'
                    checked={deleteLocalFile}
                    onChange={(event) => setDeleteLocalFile(event.target.checked)}
                  />
                  <span>{_('同时删除本地文件')}</span>
                </label>
              )}
              <div className='flex justify-end gap-2'>
                <button
                  type='button'
                  className='btn btn-ghost btn-sm rounded-full px-4'
                  onClick={cancelDeleteAction}
                >
                  {_('取消')}
                </button>
                <button
                  type='button'
                  className='btn btn-error btn-sm rounded-full px-4'
                  onClick={confirmDeleteAction}
                >
                  {_('删除')}
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    </>
  );
};

export default BookDetailModal;

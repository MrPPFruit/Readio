'use client';

import clsx from 'clsx';
import dayjs from 'dayjs';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  LuMessageSquare,
  LuTrash2,
  LuPencil,
  LuCheck,
  LuX,
  LuPlus,
  LuMessageSquareMore,
  LuStar,
  LuArchive,
} from 'react-icons/lu';

import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { useAIChatStore } from '@/store/aiChatStore';
import { eventDispatcher } from '@/utils/event';
import type { AIConversation } from '@/services/ai/types';
import { useEnv } from '@/context/EnvContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHistoryViewProps {
  bookKey: string;
}

const ChatHistoryView: React.FC<ChatHistoryViewProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { getBookData } = useBookDataStore();
  const {
    conversations,
    isLoadingHistory,
    loadConversations,
    setActiveConversation,
    deleteConversation,
    renameConversation,
    createConversation,
    toggleFavoriteConversation,
    archiveConversation,
    favoriteConversations,
    archiveConversations,
    deleteConversations,
  } = useAIChatStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [revealedAction, setRevealedAction] = useState<{
    id: string;
    direction: 'left' | 'right';
  } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pointerStartRef = useRef<{
    id: string;
    x: number;
    y: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  const bookData = getBookData(bookKey);
  const bookHash = bookKey.split('-')[0] || '';
  const bookTitle = bookData?.book?.title || 'Unknown';

  // Load conversations for this book
  useEffect(() => {
    if (bookHash) {
      loadConversations(bookHash);
    }
  }, [bookHash, loadConversations]);

  useEffect(() => {
    if (selectionMode && selectedIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectedIds.length, selectionMode]);

  useEffect(() => {
    if (!selectionMode) return;
    const visibleIds = new Set(conversations.map((conversation) => conversation.id));
    setSelectedIds((ids) => {
      const visibleSelectedIds = ids.filter((id) => visibleIds.has(id));
      return visibleSelectedIds.length === ids.length ? ids : visibleSelectedIds;
    });
  }, [conversations, selectionMode]);

  const selectedCount = selectedIds.length;

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }, []);

  const enterSelectionMode = useCallback((id: string) => {
    setSelectionMode(true);
    setRevealedAction(null);
    setOpenMenuId(null);
    setSelectedIds((ids) => (ids.includes(id) ? ids : [id, ...ids]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const handleSelectConversation = useCallback(
    async (conversation: AIConversation) => {
      if (suppressClickRef.current === conversation.id) {
        suppressClickRef.current = null;
        return;
      }
      if (selectionMode) {
        toggleSelected(conversation.id);
        return;
      }
      await setActiveConversation(conversation.id);
      await eventDispatcher.dispatch('reader-ai-open-history', {
        bookKey,
        conversationId: conversation.id,
      });
    },
    [bookKey, selectionMode, setActiveConversation, toggleSelected],
  );

  const handleNewConversation = useCallback(async () => {
    const conversationId = await createConversation(bookHash, `Chat about ${bookTitle}`);
    await eventDispatcher.dispatch('reader-ai-open-history', {
      bookKey,
      conversationId,
    });
  }, [bookHash, bookKey, bookTitle, createConversation]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (!appService) return;
      if (await appService.ask(_('Delete this conversation?'))) {
        await deleteConversation(id);
      }
    },
    [deleteConversation, _, appService],
  );

  const handleBulkDelete = useCallback(async () => {
    if (!appService || selectedIds.length === 0) return;
    if (await appService.ask(`Delete ${selectedIds.length} conversations?`)) {
      await deleteConversations(selectedIds);
      exitSelectionMode();
    }
  }, [appService, deleteConversations, exitSelectionMode, selectedIds]);

  const handleBulkFavorite = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await favoriteConversations(selectedIds);
  }, [favoriteConversations, selectedIds]);

  const handleBulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await archiveConversations(selectedIds);
  }, [archiveConversations, selectedIds]);

  const handleSaveRename = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (editingId && editTitle.trim()) {
        await renameConversation(editingId, editTitle.trim());
      }
      setEditingId(null);
      setEditTitle('');
    },
    [editingId, editTitle, renameConversation],
  );

  const handleCancelRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveRename(e);
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setEditTitle('');
      }
    },
    [handleSaveRename],
  );

  const getRevealedOffset = useCallback(
    (id: string) => {
      if (selectionMode || revealedAction?.id !== id) return 0;
      return revealedAction.direction === 'left' ? -128 : 80;
    },
    [revealedAction, selectionMode],
  );

  const handlePointerDown = useCallback(
    (conversation: AIConversation, e: React.PointerEvent) => {
      if (selectionMode) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointerStartRef.current = {
        id: conversation.id,
        x: e.clientX,
        y: e.clientY,
        horizontal: false,
      };
    },
    [selectionMode],
  );

  const handlePointerMove = useCallback((conversation: AIConversation, e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== conversation.id) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.horizontal && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      start.horizontal = true;
    }
  }, []);

  const handlePointerUp = useCallback((conversation: AIConversation, e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.id !== conversation.id || !start.horizontal) return;

    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 56) {
      suppressClickRef.current = conversation.id;
      setRevealedAction({ id: conversation.id, direction: dx < 0 ? 'left' : 'right' });
    }
  }, []);

  if (isLoadingHistory) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <div className='border-primary size-5 animate-spin rounded-full border-2 border-t-transparent' />
      </div>
    );
  }

  return (
    <div className='relative flex h-full flex-col'>
      {/* Conversation list */}
      <div className='flex-1 overflow-y-auto'>
        {conversations.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
            <div className='bg-base-300/50 rounded-full p-3'>
              <LuMessageSquare className='text-base-content/50 size-6' />
            </div>
            <div>
              <p className='text-base-content/70 text-sm'>{_('No conversations yet')}</p>
              <p className='text-base-content/50 text-xs'>
                {_('Start a new chat to ask questions about this book')}
              </p>
            </div>
          </div>
        ) : (
          <ul className='divide-base-300/30 divide-y pb-16'>
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                data-testid={`conversation-row-${conversation.id}`}
                className={clsx(
                  'group relative overflow-hidden',
                  'hover:bg-base-300/50 transition-colors duration-150',
                  selectionMode && selectedIds.includes(conversation.id) && 'bg-base-300/40',
                )}
                onPointerDown={(e) => handlePointerDown(conversation, e)}
                onPointerMove={(e) => handlePointerMove(conversation, e)}
                onPointerUp={(e) => handlePointerUp(conversation, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selectionMode) setOpenMenuId(conversation.id);
                }}
              >
                {!selectionMode && revealedAction?.id === conversation.id && (
                  <div
                    className={clsx(
                      'bg-base-200 absolute inset-y-0 flex items-stretch',
                      revealedAction.direction === 'left' ? 'right-0' : 'left-0',
                    )}
                  >
                    {revealedAction.direction === 'right' ? (
                      <button
                        type='button'
                        className='text-base-content flex min-w-20 items-center justify-center px-3 text-xs'
                        aria-label={`${conversation.favoritedAt ? 'Unfavorite' : 'Favorite'} ${conversation.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteConversation(conversation.id);
                          setRevealedAction(null);
                        }}
                      >
                        {conversation.favoritedAt ? 'Unfavorite' : 'Favorite'}
                      </button>
                    ) : (
                      <>
                        <button
                          type='button'
                          className='text-base-content flex min-w-16 items-center justify-center px-3 text-xs'
                          aria-label={`Archive ${conversation.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveConversation(conversation.id);
                            setRevealedAction(null);
                          }}
                        >
                          Archive
                        </button>
                        <button
                          type='button'
                          className='bg-error text-error-content flex min-w-16 items-center justify-center px-3 text-xs'
                          aria-label={`Delete ${conversation.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conversation.id);
                            setRevealedAction(null);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div
                  data-testid={`conversation-row-content-${conversation.id}`}
                  className='bg-base-100 relative flex cursor-pointer items-start gap-2 px-3 py-2.5 transition-transform duration-150 ease-out'
                  style={{ transform: `translateX(${getRevealedOffset(conversation.id)}px)` }}
                >
                  {selectionMode && (
                    <input
                      type='checkbox'
                      className='checkbox checkbox-sm border-base-content/40 mt-0.5 min-h-6 min-w-6'
                      aria-label={`选择对话：${conversation.title}`}
                      checked={selectedIds.includes(conversation.id)}
                      readOnly
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelected(conversation.id);
                      }}
                    />
                  )}
                  <div
                    className='flex flex-1 items-start gap-2'
                    tabIndex={0}
                    role='button'
                    aria-pressed={selectionMode ? selectedIds.includes(conversation.id) : undefined}
                    aria-label={`${conversation.title} ${dayjs(conversation.updatedAt).format('MMM D, YYYY h:mm A')}${conversation.favoritedAt ? ' Favorited' : ''}`}
                    onClick={() => handleSelectConversation(conversation)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectConversation(conversation);
                      }
                    }}
                  >
                    <div className='min-w-0 flex-1'>
                      {editingId === conversation.id ? (
                        <div
                          className='flex items-center gap-1'
                          role='presentation'
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type='text'
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className={clsx(
                              'input input-xs input-bordered w-full',
                              'bg-base-100 text-base-content',
                            )}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                          />
                          <button
                            onClick={handleSaveRename}
                            className='btn btn-ghost btn-xs text-success'
                            aria-label={_('Save')}
                          >
                            <LuCheck size={14} />
                          </button>
                          <button
                            onClick={handleCancelRename}
                            className='btn btn-ghost btn-xs text-error'
                            aria-label={_('Cancel')}
                          >
                            <LuX size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className='text-base-content line-clamp-1 text-sm font-medium'>
                            {conversation.title}
                          </p>
                          <div className='flex items-center gap-1.5'>
                            <p className='text-base-content/50 text-xs'>
                              {dayjs(conversation.updatedAt).format('MMM D, YYYY h:mm A')}
                            </p>
                            {conversation.favoritedAt && (
                              <span className='text-primary inline-flex items-center gap-0.5 text-[10px] font-medium'>
                                <LuStar size={10} aria-hidden='true' />
                                Favorited
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {!selectionMode && editingId !== conversation.id && (
                    <div className='flex flex-shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100'>
                      <DropdownMenu
                        open={openMenuId === conversation.id}
                        onOpenChange={(open) => setOpenMenuId(open ? conversation.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            type='button'
                            className='btn btn-ghost min-h-11 min-w-11 p-0'
                            aria-label={`更多操作：${conversation.title}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <LuMessageSquareMore size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align='end'
                          className='bg-base-100 border-base-content/10'
                        >
                          <DropdownMenuItem
                            onSelect={() => toggleFavoriteConversation(conversation.id)}
                          >
                            <LuStar size={14} />
                            {conversation.favoritedAt ? 'Unfavorite' : 'Favorite'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              setOpenMenuId(null);
                              enterSelectionMode(conversation.id);
                            }}
                          >
                            <LuCheck size={14} />
                            选择
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              setOpenMenuId(null);
                              setEditingId(conversation.id);
                              setEditTitle(conversation.title);
                            }}
                          >
                            <LuPencil size={14} />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => archiveConversation(conversation.id)}>
                            <LuArchive size={14} />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className='text-error focus:text-error'
                            onSelect={() => handleDeleteConversation(conversation.id)}
                          >
                            <LuTrash2 size={14} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectionMode && (
        <div className='bg-base-100/95 border-base-content/10 absolute inset-x-3 bottom-4 rounded-2xl border p-2 shadow-lg backdrop-blur'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-base-content/70 px-2 text-sm' aria-live='polite'>
              已选择 {selectedCount} 项
            </span>
            <div className='flex items-center gap-1'>
              <button
                type='button'
                className='btn btn-ghost btn-sm min-h-10 px-2'
                aria-label={`收藏所选 ${selectedCount} 段对话`}
                disabled={selectedCount === 0}
                onClick={handleBulkFavorite}
              >
                <LuStar size={16} aria-hidden='true' />
              </button>
              <button
                type='button'
                className='btn btn-ghost btn-sm min-h-10 px-2'
                aria-label={`归档所选 ${selectedCount} 段对话`}
                disabled={selectedCount === 0}
                onClick={handleBulkArchive}
              >
                <LuArchive size={16} aria-hidden='true' />
              </button>
              <button
                type='button'
                className='btn btn-ghost btn-sm text-error min-h-10 px-2'
                aria-label={`删除所选 ${selectedCount} 段对话`}
                disabled={selectedCount === 0}
                onClick={handleBulkDelete}
              >
                <LuTrash2 size={16} aria-hidden='true' />
              </button>
              <button
                type='button'
                className='btn btn-ghost btn-sm min-h-10 px-2'
                aria-label={_('Cancel')}
                onClick={exitSelectionMode}
              >
                <LuX size={16} aria-hidden='true' />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating New Chat button at bottom right */}
      {!selectionMode && (
        <div className='absolute bottom-4 right-4'>
          <button
            onClick={handleNewConversation}
            className={clsx(
              'flex items-center gap-2 rounded-full px-4 py-2',
              'bg-base-300 text-base-content',
              'hover:bg-base-content/10',
              'border-base-content/10 border',
              'shadow-sm',
              'transition-all duration-200 ease-out',
              'active:scale-[0.97]',
            )}
            aria-label={_('New Chat')}
          >
            <LuPlus size={16} />
            <span className='text-sm font-medium'>{_('New Chat')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatHistoryView;

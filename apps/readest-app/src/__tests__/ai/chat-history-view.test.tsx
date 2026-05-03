import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIConversation } from '@/services/ai/types';
import ChatHistoryView from '@/app/reader/components/sidebar/ChatHistoryView';

const mocks = vi.hoisted(() => ({
  conversations: [] as AIConversation[],
  isLoadingHistory: false,
  loadConversations: vi.fn(),
  setActiveConversation: vi.fn(),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
  createConversation: vi.fn(),
  toggleFavoriteConversation: vi.fn(),
  archiveConversation: vi.fn(),
  favoriteConversations: vi.fn(),
  archiveConversations: vi.fn(),
  deleteConversations: vi.fn(),
  setNotebookVisible: vi.fn(),
  setNotebookActiveTab: vi.fn(),
  ask: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { ask: mocks.ask } }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ book: { title: 'Mock Book' } }),
  }),
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({
    setNotebookVisible: mocks.setNotebookVisible,
    setNotebookActiveTab: mocks.setNotebookActiveTab,
  }),
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: () => ({
    conversations: mocks.conversations,
    isLoadingHistory: mocks.isLoadingHistory,
    loadConversations: mocks.loadConversations,
    setActiveConversation: mocks.setActiveConversation,
    deleteConversation: mocks.deleteConversation,
    renameConversation: mocks.renameConversation,
    createConversation: mocks.createConversation,
    toggleFavoriteConversation: mocks.toggleFavoriteConversation,
    archiveConversation: mocks.archiveConversation,
    favoriteConversations: mocks.favoriteConversations,
    archiveConversations: mocks.archiveConversations,
    deleteConversations: mocks.deleteConversations,
  }),
}));

function renderView() {
  render(<ChatHistoryView bookKey='book-1-reader' />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLoadingHistory = false;
  mocks.ask.mockResolvedValue(true);
  mocks.setActiveConversation.mockResolvedValue(undefined);
  mocks.deleteConversation.mockResolvedValue(undefined);
  mocks.renameConversation.mockResolvedValue(undefined);
  mocks.createConversation.mockResolvedValue('new-conversation');
  mocks.toggleFavoriteConversation.mockResolvedValue(undefined);
  mocks.archiveConversation.mockResolvedValue(undefined);
  mocks.favoriteConversations.mockResolvedValue(undefined);
  mocks.archiveConversations.mockResolvedValue(undefined);
  mocks.deleteConversations.mockResolvedValue(undefined);
  mocks.conversations = [
    {
      id: 'c1',
      bookHash: 'book',
      title: 'First chat',
      createdAt: 100,
      updatedAt: 200,
      favoritedAt: 250,
    },
    { id: 'c2', bookHash: 'book', title: 'Second chat', createdAt: 100, updatedAt: 300 },
  ];
});

afterEach(cleanup);

describe('ChatHistoryView', () => {
  it('opens the selected conversation in the reader AI history panel', async () => {
    const { eventDispatcher } = await import('@/utils/event');
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    renderView();

    fireEvent.click(screen.getByRole('button', { name: /^First chat Jan/ }));

    await waitFor(() => expect(mocks.setActiveConversation).toHaveBeenCalledWith('c1'));
    expect(dispatchSpy).toHaveBeenCalledWith('reader-ai-open-history', {
      bookKey: 'book-1-reader',
      conversationId: 'c1',
    });
    expect(mocks.setNotebookVisible).not.toHaveBeenCalled();
    expect(mocks.setNotebookActiveTab).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('opens a new conversation in the reader AI history panel', async () => {
    const { eventDispatcher } = await import('@/utils/event');
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));

    await waitFor(() =>
      expect(mocks.createConversation).toHaveBeenCalledWith('book', 'Chat about Mock Book'),
    );
    expect(dispatchSpy).toHaveBeenCalledWith('reader-ai-open-history', {
      bookKey: 'book-1-reader',
      conversationId: 'new-conversation',
    });
    expect(mocks.setNotebookVisible).not.toHaveBeenCalled();
    expect(mocks.setNotebookActiveTab).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('shows accessible favorite state and row actions', () => {
    renderView();

    expect(screen.getByText('Favorited')).toBeTruthy();
    const moreButton = screen.getByRole('button', { name: '更多操作：First chat' });
    expect(moreButton).toBeTruthy();
    expect(moreButton.className).toContain('min-h-11');
    expect(moreButton.className).toContain('min-w-11');
  });

  it('does not enter multi-select mode during a horizontal swipe gesture', () => {
    vi.useFakeTimers();
    renderView();

    const row = screen.getByTestId('conversation-row-c2');
    fireEvent.pointerDown(row, { clientX: 900, clientY: 20, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(row, { clientX: 840, clientY: 22, pointerId: 1, pointerType: 'touch' });
    vi.advanceTimersByTime(550);
    fireEvent.pointerUp(row, { clientX: 760, clientY: 22, pointerId: 1, pointerType: 'touch' });
    vi.useRealTimers();

    expect(screen.queryByText('已选择 1 项')).toBeNull();
    expect(screen.getByRole('button', { name: 'Archive Second chat' })).toBeTruthy();
  });

  it('toggles favorite from the visible actions menu', async () => {
    renderView();

    fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作：Second chat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Favorite' }));

    await waitFor(() => expect(mocks.toggleFavoriteConversation).toHaveBeenCalledWith('c2'));
  });

  it('archives from the visible actions menu', async () => {
    renderView();

    fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作：Second chat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => expect(mocks.archiveConversation).toHaveBeenCalledWith('c2'));
  });

  it('confirms before deleting from the visible actions menu', async () => {
    renderView();

    fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作：Second chat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith('Delete this conversation?'));
    expect(mocks.deleteConversation).toHaveBeenCalledWith('c2');
  });

  it('reveals left-swipe shortcut buttons without selecting the conversation', async () => {
    renderView();

    const row = screen.getByTestId('conversation-row-c2');
    fireEvent.pointerDown(row, { clientX: 180, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 60, clientY: 24, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 60, clientY: 24, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: /^Second chat Jan/ }));

    expect(screen.getByRole('button', { name: 'Archive Second chat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Second chat' })).toBeTruthy();
    expect(screen.getByTestId('conversation-row-content-c2').style.transform).toBe(
      'translateX(-128px)',
    );
    expect(mocks.setActiveConversation).not.toHaveBeenCalled();
  });

  it('keeps delete confirmed from the left-swipe shortcut', async () => {
    renderView();

    const row = screen.getByTestId('conversation-row-c2');
    fireEvent.pointerDown(row, { clientX: 180, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 60, clientY: 24, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 60, clientY: 24, pointerId: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Second chat' }));

    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith('Delete this conversation?'));
    expect(mocks.deleteConversation).toHaveBeenCalledWith('c2');
  });

  it('reveals a right-swipe favorite button instead of immediately toggling favorite', async () => {
    renderView();

    const row = screen.getByTestId('conversation-row-c2');
    fireEvent.pointerDown(row, { clientX: 60, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 180, clientY: 24, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 180, clientY: 24, pointerId: 1 });

    expect(mocks.toggleFavoriteConversation).not.toHaveBeenCalled();
    expect(screen.getByTestId('conversation-row-content-c2').style.transform).toBe(
      'translateX(80px)',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Second chat' }));

    await waitFor(() => expect(mocks.toggleFavoriteConversation).toHaveBeenCalledWith('c2'));
  });

  it('keeps long press from entering hidden multi-select mode', async () => {
    const { eventDispatcher } = await import('@/utils/event');
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    vi.useFakeTimers();
    renderView();

    const row = screen.getByTestId('conversation-row-c2');
    fireEvent.pointerDown(row, { clientX: 80, clientY: 20, pointerId: 1, pointerType: 'touch' });
    vi.advanceTimersByTime(550);
    fireEvent.pointerUp(row, { clientX: 80, clientY: 20, pointerId: 1, pointerType: 'touch' });
    vi.useRealTimers();

    expect(screen.queryByText('已选择 1 项')).toBeNull();
    expect(mocks.setActiveConversation).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith('reader-ai-open-history', expect.anything());
    dispatchSpy.mockRestore();
  });

  it('enters multi-select mode from the row actions menu for keyboard access', async () => {
    renderView();

    fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作：Second chat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '选择' }));

    expect(screen.getByText('已选择 1 项')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: '选择对话：Second chat' }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('bulk archives, favorites, and confirms delete for selected conversations', async () => {
    renderView();

    fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作：Second chat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '选择' }));
    fireEvent.click(screen.getByRole('button', { name: /^First chat Jan/ }));
    fireEvent.click(screen.getByRole('button', { name: '收藏所选 2 段对话' }));
    await waitFor(() => expect(mocks.favoriteConversations).toHaveBeenCalledWith(['c2', 'c1']));

    fireEvent.click(screen.getByRole('button', { name: '归档所选 2 段对话' }));
    await waitFor(() => expect(mocks.archiveConversations).toHaveBeenCalledWith(['c2', 'c1']));

    fireEvent.click(screen.getByRole('button', { name: '删除所选 2 段对话' }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith('Delete 2 conversations?'));
    expect(mocks.deleteConversations).toHaveBeenCalledWith(['c2', 'c1']);
  });
});

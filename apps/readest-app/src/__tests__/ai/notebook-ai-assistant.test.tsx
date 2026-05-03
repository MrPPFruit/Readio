import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIMessage, AISettings } from '@/services/ai/types';
import AIAssistant from '@/app/reader/components/notebook/AIAssistant';

const mocks = vi.hoisted(() => ({
  aiSettings: { enabled: true } as AISettings,
  activeConversationId: 'c1' as string | null,
  storedMessages: [
    { id: 'm1', conversationId: 'c1', role: 'user', content: 'saved question', createdAt: 100 },
  ] as AIMessage[],
  isLoadingHistory: false,
  historyError: null as string | null,
  addMessage: vi.fn(),
  setActiveConversation: vi.fn(),
  isBookIndexed: vi.fn(),
  indexBook: vi.fn(),
  clearBook: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { ask: vi.fn(async () => true) } }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { aiSettings: mocks.aiSettings } }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ book: { title: 'Book', author: 'Author' }, bookDoc: {} }),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getProgress: () => ({ pageinfo: { current: 12 } }) }),
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: () => ({
    activeConversationId: mocks.activeConversationId,
    messages: mocks.storedMessages,
    addMessage: mocks.addMessage,
    isLoadingHistory: mocks.isLoadingHistory,
    historyError: mocks.historyError,
    setActiveConversation: mocks.setActiveConversation,
  }),
}));

vi.mock('@/services/ai', () => ({
  indexBook: mocks.indexBook,
  isBookIndexed: mocks.isBookIndexed,
  aiStore: { clearBook: mocks.clearBook },
  aiLogger: { rag: { indexError: vi.fn() } },
  createTauriAdapter: vi.fn(() => ({ run: vi.fn() })),
  getLastSources: vi.fn(() => []),
  clearLastSources: vi.fn(),
}));

vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useLocalRuntime: vi.fn(() => ({})),
  useAssistantRuntime: () => ({ switchToNewThread: vi.fn() }),
}));

vi.mock('@/components/assistant/Thread', () => ({
  Thread: ({ hasActiveConversation }: { hasActiveConversation: boolean }) => (
    <div>{hasActiveConversation ? 'chat-history-visible' : 'no-chat'}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeConversationId = 'c1';
  mocks.isBookIndexed.mockResolvedValue(false);
});

afterEach(cleanup);

describe('AIAssistant history access', () => {
  it('shows the chat history path for an active conversation even when the book is unindexed', async () => {
    render(<AIAssistant bookKey='book-1-reader' />);

    await waitFor(() => expect(mocks.isBookIndexed).toHaveBeenCalled());
    expect(screen.getByText('chat-history-visible')).toBeTruthy();
    expect(screen.queryByText('Index This Book')).toBeNull();
  });

  it('keeps the indexing call-to-action when there is no active conversation', async () => {
    mocks.activeConversationId = null;

    render(<AIAssistant bookKey='book-1-reader' />);

    await waitFor(() => expect(screen.getByText('Index This Book')).toBeTruthy());
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIConversation, AISettings } from '@/services/ai/types';

const mocks = vi.hoisted(() => ({
  indexBook: vi.fn(),
  isBookIndexed: vi.fn(),
  streamReaderAIAnswer: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  getBookData: vi.fn(),
  getProgress: vi.fn(),
  useKeyDownActions: vi.fn(),
  setActiveSettingsItemId: vi.fn(),
  setSettingsDialogBookKey: vi.fn(),
  setSettingsDialogOpen: vi.fn(),
  settingsListeners: new Set<() => void>(),
  settingsVersion: { current: 0 },
}));

const settings: AISettings = {
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openrouter',
  providerApiKeys: { openrouter: 'openrouter-key' },
  providerModels: { openrouter: 'google/gemini-2.5-flash-lite' },
  spoilerProtection: true,
  maxContextChunks: 3,
  indexingMode: 'on-demand',
};

let storeState: {
  activeConversationId: string | null;
  conversations: AIConversation[];
  createConversation: typeof mocks.createConversation;
  addMessage: typeof mocks.addMessage;
};

vi.mock('@/services/ai/ragService', () => ({
  indexBook: mocks.indexBook,
  isBookIndexed: mocks.isBookIndexed,
}));

vi.mock('@/services/ai/readerChatService', () => ({
  streamReaderAIAnswer: mocks.streamReaderAIAnswer,
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: {
    getState: () => storeState,
  },
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({ getBookData: mocks.getBookData }),
  },
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: {
    getState: () => ({ getProgress: mocks.getProgress }),
  },
}));

vi.mock('@/store/settingsStore', () => {
  const useSettingsStore = () => {
    mocks.settingsVersion.current;
    return { settings: { aiSettings: settings } };
  };
  useSettingsStore.getState = () => ({
    settings: { aiSettings: settings },
    setActiveSettingsItemId: mocks.setActiveSettingsItemId,
    setSettingsDialogBookKey: mocks.setSettingsDialogBookKey,
    setSettingsDialogOpen: mocks.setSettingsDialogOpen,
  });
  useSettingsStore.subscribe = (listener: () => void) => {
    mocks.settingsListeners.add(listener);
    return () => mocks.settingsListeners.delete(listener);
  };
  return { useSettingsStore };
});

vi.mock('@/hooks/useKeyDownActions', () => ({
  useKeyDownActions: mocks.useKeyDownActions,
}));

vi.mock('@/app/reader/components/ai/ReaderAIButton', () => ({
  default: ({ onClick }: { onClick: () => void }) => <button onClick={onClick}>open-ai</button>,
}));

vi.mock('@/app/reader/components/ai/ReaderAIAskBox', () => ({
  default: ({
    spoilerProtection,
    onSpoilerProtectionChange,
    onSubmit,
    onClose,
  }: {
    spoilerProtection: boolean;
    onSpoilerProtectionChange: (enabled: boolean) => void;
    onSubmit: (question: string) => void;
    onClose: () => void;
  }) => (
    <div>
      <div data-testid='ask-spoiler-state'>{spoilerProtection ? 'protected' : 'unprotected'}</div>
      <button onClick={() => onSpoilerProtectionChange(false)}>allow-spoilers</button>
      <button onClick={() => onSubmit('question')}>ask-question</button>
      <button onClick={onClose}>close-ask</button>
    </div>
  ),
}));

vi.mock('@/app/reader/components/ai/ReaderAIAnswerPanel', () => ({
  default: ({
    messages,
    loading,
    spoilerProtection,
    onSpoilerProtectionChange,
    onSubmit,
    onClose,
    setupAction,
  }: {
    messages: { role: string; content: string }[];
    loading: boolean;
    spoilerProtection: boolean;
    onSpoilerProtectionChange: (enabled: boolean) => void;
    onSubmit: (question: string) => void;
    onClose: () => void;
    setupAction?: { label: string; onClick: () => void };
  }) => (
    <div data-testid='answer-panel' data-loading={loading ? 'true' : 'false'}>
      <div data-testid='answer-spoiler-state'>
        {spoilerProtection ? 'protected' : 'unprotected'}
      </div>
      <button onClick={() => onSpoilerProtectionChange(false)}>allow-spoilers-answer</button>
      <div data-testid='messages'>
        {messages.map((message) => `${message.role}:${message.content}`).join('|')}
      </div>
      {setupAction && <button onClick={setupAction.onClick}>{setupAction.label}</button>}
      <button onClick={() => onSubmit('follow-up')}>ask-follow-up</button>
      <button onClick={onClose}>close-answer</button>
    </div>
  ),
}));

import ReaderAIAssistant from '@/app/reader/components/ai/ReaderAIAssistant';

async function* streamChunks(chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function rejectedStream(error: Error) {
  return (async function* () {
    yield '';
    throw error;
  })();
}

function pendingStream(signal?: AbortSignal) {
  return (async function* () {
    yield 'partial';
    await new Promise<void>((resolve) => {
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  })();
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.enabled = true;
  settings.showReaderAIEntrypoints = true;
  mocks.settingsListeners.clear();
  mocks.settingsVersion.current = 0;
  settings.provider = 'openrouter';
  settings.providerApiKeys = { openrouter: 'openrouter-key' };
  settings.providerModels = { openrouter: 'google/gemini-2.5-flash-lite' };
  mocks.indexBook.mockResolvedValue(undefined);
  mocks.isBookIndexed.mockResolvedValue(true);
  mocks.streamReaderAIAnswer.mockReturnValue(streamChunks(['answer']));
  mocks.createConversation.mockResolvedValue('new-conversation');
  mocks.addMessage.mockResolvedValue(undefined);
  mocks.getBookData.mockReturnValue({
    book: { title: 'Current Book', author: 'Author' },
    bookDoc: { metadata: { title: 'Current Book', author: 'Author' } },
  });
  mocks.getProgress.mockReturnValue({ page: 7 });
  mocks.useKeyDownActions.mockReturnValue({ current: null });
  storeState = {
    activeConversationId: null,
    conversations: [],
    createConversation: mocks.createConversation,
    addMessage: mocks.addMessage,
  };
});

afterEach(() => {
  cleanup();
});

describe('ReaderAIAssistant integration safeguards', () => {
  it('hides the floating reader AI button when entry points are turned off', () => {
    settings.showReaderAIEntrypoints = false;

    render(<ReaderAIAssistant bookKey='current-book-instance' />);

    expect(screen.queryByText('open-ai')).toBeNull();
  });

  it('updates the floating reader AI button when entry point settings change while mounted', () => {
    const { rerender } = render(<ReaderAIAssistant bookKey='current-book-instance' />);

    expect(screen.getByText('open-ai')).toBeTruthy();

    settings.showReaderAIEntrypoints = false;
    rerender(<ReaderAIAssistant bookKey='current-book-instance' />);

    expect(screen.queryByText('open-ai')).toBeNull();
  });

  it('shows an enable AI settings message from the entry point and does not wait for a question when AI is disabled', async () => {
    settings.enabled = false;

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain('AI 助手尚未开启'),
    );
    expect(screen.queryByText('ask-question')).toBeNull();
    expect(mocks.streamReaderAIAnswer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('去设置 AI'));

    expect(mocks.setSettingsDialogBookKey).toHaveBeenCalledWith('current-book-instance');
    expect(mocks.setActiveSettingsItemId).toHaveBeenCalledWith('settings.ai.enableAssistant');
    expect(mocks.setSettingsDialogOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('answer-panel')).toBeNull();
  });

  it('shows a custom endpoint setup action from the entry point without a custom base URL', async () => {
    settings.provider = 'custom-openai-compatible';
    settings.providerApiKeys = { 'custom-openai-compatible': 'custom-key' };
    settings.providerModels = { 'custom-openai-compatible': 'custom-model' };
    settings.customProviderBaseUrl = '';

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain('需要填写自定义基础 URL'),
    );
    expect(screen.queryByText('ask-question')).toBeNull();
    expect(mocks.streamReaderAIAnswer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('去设置 AI'));

    expect(mocks.setSettingsDialogBookKey).toHaveBeenCalledWith('current-book-instance');
    expect(mocks.setActiveSettingsItemId).toHaveBeenCalledWith('settings.ai.customBaseUrl');
    expect(mocks.setSettingsDialogOpen).toHaveBeenCalledWith(true);
  });

  it('shows a provider-neutral API key setup action from the entry point before asking', async () => {
    settings.provider = 'openrouter';
    settings.providerApiKeys = { openrouter: '' };

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain('需要填写 OpenRouter API Key'),
    );
    expect(screen.queryByText('ask-question')).toBeNull();
    expect(mocks.streamReaderAIAnswer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('去设置 AI'));

    expect(mocks.setSettingsDialogBookKey).toHaveBeenCalledWith('current-book-instance');
    expect(mocks.setActiveSettingsItemId).toHaveBeenCalledWith('settings.ai.apiKey');
    expect(mocks.setSettingsDialogOpen).toHaveBeenCalledWith(true);
  });

  it('asks users to set up a supported cloud provider from the entry point for legacy providers', async () => {
    settings.provider = 'ollama' as AISettings['provider'];

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain(
        '请先在设置中选择支持的云端 AI 服务',
      ),
    );
    expect(screen.queryByText('ask-question')).toBeNull();
    expect(mocks.streamReaderAIAnswer).not.toHaveBeenCalled();
  });

  it('passes spoiler protection state to answer streaming and defaults to protected mode', async () => {
    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    expect(screen.getByTestId('ask-spoiler-state').textContent).toBe('protected');
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    expect(mocks.streamReaderAIAnswer.mock.calls[0]![0].settings.spoilerProtection).toBe(true);
  });

  it('passes disabled spoiler protection to answer streaming when the user allows spoilers', async () => {
    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('allow-spoilers'));
    expect(screen.getByTestId('ask-spoiler-state').textContent).toBe('unprotected');
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    expect(mocks.streamReaderAIAnswer.mock.calls[0]![0].settings.spoilerProtection).toBe(false);
    await waitFor(() =>
      expect(screen.getByTestId('answer-spoiler-state').textContent).toBe('unprotected'),
    );
  });

  it('indexes an unindexed book and then streams the answer', async () => {
    mocks.isBookIndexed.mockResolvedValue(false);

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.indexBook).toHaveBeenCalled());
    expect(mocks.indexBook.mock.calls[0]![4]).toBeInstanceOf(AbortSignal);
    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('messages').textContent).toContain('answer'));
  });

  it('explains likely recovery steps when the provider request fails', async () => {
    mocks.streamReaderAIAnswer.mockReturnValue(
      rejectedStream(new Error('Provider request failed')),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain(
        'AI 请求失败，请检查 API Key、额度、模型名称或服务商状态后重试。',
      ),
    );
    expect(screen.getByTestId('answer-panel').textContent).toContain('去设置 AI');
  });

  it('shows a clear error when indexing fails', async () => {
    mocks.isBookIndexed.mockResolvedValue(false);
    mocks.indexBook.mockRejectedValue(new Error('index failed'));

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain('索引本书失败，请稍后重试。'),
    );
    expect(mocks.streamReaderAIAnswer).not.toHaveBeenCalled();
  });

  it('does not stream or persist if closed while indexing', async () => {
    mocks.isBookIndexed.mockResolvedValue(false);
    let resolveIndexing: (() => void) | undefined;
    mocks.indexBook.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveIndexing = resolve;
        }),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.indexBook).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close-answer'));
    resolveIndexing?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.streamReaderAIAnswer).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it('creates a new conversation when the active conversation belongs to another book', async () => {
    storeState.activeConversationId = 'other-conversation';
    storeState.conversations = [
      {
        id: 'other-conversation',
        bookHash: 'other-book',
        title: 'Other',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    mocks.streamReaderAIAnswer.mockReturnValue(streamChunks(['answer']));

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(mocks.createConversation).toHaveBeenCalledWith('current', 'question'),
    );
    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith({
        conversationId: 'new-conversation',
        role: 'assistant',
        content: 'answer',
      }),
    );
  });

  it('removes an aborted partial exchange so it is not sent as future context', async () => {
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      pendingStream(signal),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(screen.getByTestId('messages').textContent).toContain('partial'));
    fireEvent.click(screen.getByText('close-answer'));

    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalledTimes(2));
    expect(mocks.streamReaderAIAnswer.mock.calls[1]![0].messages).toEqual([]);
  });

  it('does not let an old request finalizer clear loading for a newer request', async () => {
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      pendingStream(signal),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(screen.getByTestId('messages').textContent).toContain('partial'));
    fireEvent.click(screen.getByText('ask-follow-up'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalledTimes(2));
    expect(mocks.streamReaderAIAnswer.mock.calls[1]![0].messages).toEqual([]);
    await waitFor(() =>
      expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('true'),
    );
  });

  it('registers Android back handling for open AI panels', async () => {
    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));

    await waitFor(() =>
      expect(mocks.useKeyDownActions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          onCancel: expect.any(Function),
        }),
      ),
    );

    const lastCall = mocks.useKeyDownActions.mock.calls.at(-1)![0];
    lastCall.onCancel();

    await waitFor(() => expect(screen.queryByText('ask-question')).toBeNull());
  });
});

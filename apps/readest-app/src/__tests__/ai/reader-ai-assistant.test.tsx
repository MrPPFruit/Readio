import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIConversation, AIMessage, AISettings } from '@/services/ai/types';

const mocks = vi.hoisted(() => ({
  indexBook: vi.fn(),
  isBookIndexed: vi.fn(),
  streamReaderAIAnswer: vi.fn(),
  generateReaderAISuggestions: vi.fn(),
  refineReaderAIAnswerCitations: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  getBookData: vi.fn(),
  getProgress: vi.fn(),
  getView: vi.fn(),
  getViewState: vi.fn(),
  useKeyDownActions: vi.fn(),
  setActiveSettingsItemId: vi.fn(),
  setSettingsDialogBookKey: vi.fn(),
  setSettingsDialogOpen: vi.fn(),
  logDiagnosticError: vi.fn().mockResolvedValue(undefined),
  logDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
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
  messages: AIMessage[];
  historyError: string | null;
  setActiveConversation: ReturnType<typeof vi.fn>;
  createConversation: typeof mocks.createConversation;
  addMessage: typeof mocks.addMessage;
};

vi.mock('@/services/ai/ragService', () => ({
  indexBook: mocks.indexBook,
  isBookIndexed: mocks.isBookIndexed,
}));

vi.mock('@/services/ai/readerChatService', () => ({
  streamReaderAIAnswer: mocks.streamReaderAIAnswer,
  generateReaderAISuggestions: mocks.generateReaderAISuggestions,
}));

vi.mock('@/services/ai/citationVerifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai/citationVerifier')>();
  return {
    ...actual,
    refineReaderAIAnswerCitations: mocks.refineReaderAIAnswerCitations,
  };
});

vi.mock('@/services/diagnostics/logger', () => ({
  logDiagnosticError: mocks.logDiagnosticError,
  logDiagnosticEvent: mocks.logDiagnosticEvent,
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
    getState: () => ({
      getProgress: mocks.getProgress,
      getView: mocks.getView,
      getViewState: mocks.getViewState,
    }),
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
    suggestions,
    suggestionsLoading,
    onSpoilerProtectionChange,
    onSubmit,
    onClose,
  }: {
    spoilerProtection: boolean;
    suggestions: string[];
    suggestionsLoading?: boolean;
    onSpoilerProtectionChange: (enabled: boolean) => void;
    onSubmit: (question: string) => void;
    onClose: () => void;
  }) => (
    <div>
      <div data-testid='ask-spoiler-state'>{spoilerProtection ? 'protected' : 'unprotected'}</div>
      <div data-testid='ask-suggestions'>{suggestions.join('|')}</div>
      <div data-testid='ask-suggestions-loading'>{suggestionsLoading ? 'loading' : 'idle'}</div>
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
    suggestions,
    suggestionsLoading,
    generationStatus,
    onSubmit,
    onClose,
    setupAction,
    indexingProgress,
  }: {
    messages: {
      role: string;
      content: string;
      quotedText?: string;
      sources?: {
        id: string;
        cfi?: string;
        href?: string;
        highlightSpans?: { quote: string; source: string }[];
      }[];
    }[];
    loading: boolean;
    spoilerProtection: boolean;
    suggestions: string[];
    suggestionsLoading?: boolean;
    generationStatus?: string;
    onSpoilerProtectionChange: (enabled: boolean) => void;
    onSubmit: (question: string) => void;
    onClose: () => void;
    setupAction?: { label: string; onClick: () => void };
    indexingProgress?: { current: number; total: number; phase: string };
  }) => {
    return (
      <div data-testid='answer-panel' data-loading={loading ? 'true' : 'false'}>
        <div data-testid='answer-spoiler-state'>
          {spoilerProtection ? 'protected' : 'unprotected'}
        </div>
        <div data-testid='answer-suggestions'>{suggestions.join('|')}</div>
        <div data-testid='answer-suggestions-loading'>
          {suggestionsLoading ? 'loading' : 'idle'}
        </div>
        <div data-testid='generation-status'>{generationStatus ?? 'none'}</div>
        {indexingProgress && (
          <div data-testid='indexing-progress'>
            {indexingProgress.phase}:{indexingProgress.current}/{indexingProgress.total}
          </div>
        )}
        <button onClick={() => onSpoilerProtectionChange(false)}>allow-spoilers-answer</button>
        <div data-testid='messages'>
          {messages
            .map((message) =>
              [message.role, message.content, message.quotedText].filter(Boolean).join(':'),
            )
            .join('|')}
        </div>
        <div data-testid='message-source-quotes'>
          {messages
            .flatMap(
              (message) =>
                message.sources?.flatMap(
                  (source) =>
                    source.highlightSpans?.map((span) => `${span.source}:${span.quote}`) ?? [],
                ) ?? [],
            )
            .join('|')}
        </div>
        {setupAction && <button onClick={setupAction.onClick}>{setupAction.label}</button>}
        <button onClick={() => onSubmit('follow-up')}>ask-follow-up</button>
        <button onClick={onClose}>close-answer</button>
      </div>
    );
  },
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

function delayedStream(chunks: string[], delayMs: number) {
  return (async function* () {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    for (const chunk of chunks) yield chunk;
  })();
}

type IndexBookOptions = {
  onProgress: (progress: { current: number; total: number; phase: string }) => void;
  signal: AbortSignal;
};

function getIndexBookOptions(): IndexBookOptions {
  return mocks.indexBook.mock.calls[0]![3] as IndexBookOptions;
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
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
  mocks.generateReaderAISuggestions.mockResolvedValue(['生成建议一', '生成建议二', '生成建议三']);
  mocks.refineReaderAIAnswerCitations.mockImplementation(
    async ({ answer, sources }: { answer: string; sources: unknown[] }) => ({ answer, sources }),
  );
  mocks.createConversation.mockResolvedValue('new-conversation');
  mocks.addMessage.mockResolvedValue(undefined);
  mocks.getBookData.mockReturnValue({
    book: { title: 'Current Book', author: 'Author' },
    bookDoc: { metadata: { title: 'Current Book', author: 'Author' } },
  });
  mocks.getProgress.mockReturnValue({ page: 7 });
  mocks.getView.mockReturnValue({ goTo: vi.fn() });
  mocks.getViewState.mockReturnValue({ renderedPageInfo: null });
  mocks.useKeyDownActions.mockReturnValue({ current: null });
  storeState = {
    activeConversationId: null,
    conversations: [],
    messages: [],
    historyError: null,
    setActiveConversation: vi.fn(async (id: string | null) => {
      storeState.activeConversationId = id;
    }),
    createConversation: mocks.createConversation,
    addMessage: mocks.addMessage,
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it('opens stored conversation history in the reader AI answer panel', async () => {
    storeState.messages = [
      {
        id: 'history-user',
        conversationId: 'conversation-1',
        role: 'user',
        content: '这里发生了什么？',
        createdAt: 1,
      },
      {
        id: 'history-assistant',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '这是已经保存的回答。',
        createdAt: 2,
      },
    ];

    render(<ReaderAIAssistant bookKey='current-book-instance' />);

    await import('@/utils/event').then(({ eventDispatcher }) =>
      eventDispatcher.dispatch('reader-ai-open-history', {
        bookKey: 'current-book-instance',
        conversationId: 'conversation-1',
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toBe(
        'user:这里发生了什么？|assistant:这是已经保存的回答。',
      ),
    );
    expect(storeState.setActiveConversation).toHaveBeenCalledWith('conversation-1');
    expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('false');
  });

  it('generates ask-box suggestions from selected text context', async () => {
    let resolveSuggestions: ((value: string[]) => void) | undefined;
    mocks.generateReaderAISuggestions.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        resolveSuggestions = resolve;
      }),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);

    await import('@/utils/event').then(({ eventDispatcher }) =>
      eventDispatcher.dispatch('reader-ai-open', {
        bookKey: 'current-book-instance',
        source: 'selection',
        selection: { text: '克莱恩看见灰雾之上出现新的线索', page: 7 },
      }),
    );

    await waitFor(() =>
      expect(mocks.generateReaderAISuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'selection',
          selectionText: '克莱恩看见灰雾之上出现新的线索',
          messages: [],
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ask-suggestions-loading').textContent).toBe('loading'),
    );
    resolveSuggestions?.(['生成建议一', '生成建议二', '生成建议三']);
    await waitFor(() =>
      expect(screen.getByTestId('ask-suggestions').textContent).toBe(
        '生成建议一|生成建议二|生成建议三',
      ),
    );
    expect(screen.getByTestId('ask-suggestions-loading').textContent).toBe('idle');
  });

  it('clears the reader selection when opening AI from selected text', async () => {
    const deselect = vi.fn();
    mocks.getView.mockReturnValue({ goTo: vi.fn(), deselect });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    await import('@/utils/event').then(({ eventDispatcher }) =>
      eventDispatcher.dispatch('reader-ai-open', {
        bookKey: 'current-book-instance',
        source: 'selection',
        selection: { text: '克莱恩看见灰雾之上出现新的线索', page: 7 },
      }),
    );

    expect(deselect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('ask-question')).toBeTruthy());
  });

  it('keeps selected text as quote metadata when asking from a selection', async () => {
    mocks.streamReaderAIAnswer.mockReturnValue(streamChunks(['answer']));

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    await import('@/utils/event').then(({ eventDispatcher }) =>
      eventDispatcher.dispatch('reader-ai-open', {
        bookKey: 'current-book-instance',
        source: 'selection',
        selection: { text: '克莱恩看见灰雾之上出现新的线索', page: 7 },
      }),
    );
    await waitFor(() => expect(screen.getByText('ask-question')).toBeTruthy());
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain(
        'user:question:克莱恩看见灰雾之上出现新的线索',
      ),
    );
    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith({
        conversationId: 'new-conversation',
        role: 'user',
        content: 'question',
        quotedText: '克莱恩看见灰雾之上出现新的线索',
      }),
    );
  });

  it('passes an opaque per-turn runId to the Reader AI stream instead of UI message ids', async () => {
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('turn-run-id' as `${string}-${string}-${string}-${string}-${string}`);

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    const options = mocks.streamReaderAIAnswer.mock.calls[0]?.[0] as { runId?: string };
    expect(options.runId).toBe('turn-run-id');
    expect(options.runId).not.toContain('-0.');
    randomUUID.mockRestore();
  });

  it('logs failed asks without leaking the question or selected text', async () => {
    mocks.streamReaderAIAnswer.mockReturnValue(
      rejectedStream(new Error('Provider request failed')),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    await import('@/utils/event').then(({ eventDispatcher }) =>
      eventDispatcher.dispatch('reader-ai-open', {
        bookKey: 'current-book-instance',
        source: 'selection',
        selection: { text: '克莱恩看见灰雾之上出现新的线索', page: 7 },
      }),
    );
    await waitFor(() => expect(screen.getByText('ask-question')).toBeTruthy());
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(mocks.logDiagnosticError).toHaveBeenCalledWith(
        'reader_ai.ask_failed',
        expect.any(Error),
        expect.objectContaining({
          provider: 'openrouter',
          model: 'google/gemini-2.5-flash-lite',
          priorMessageCount: 0,
        }),
      ),
    );
    expect(mocks.logDiagnosticEvent).toHaveBeenCalledWith(
      'reader_ai.ask_started',
      'info',
      expect.objectContaining({
        bookHashPresent: true,
        hasSelection: true,
        priorMessageCount: 0,
        spoilerProtection: true,
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
      }),
    );
    const diagnosticCalls = JSON.stringify([
      mocks.logDiagnosticError.mock.calls,
      mocks.logDiagnosticEvent.mock.calls,
    ]);
    expect(diagnosticCalls).not.toContain('克莱恩看见灰雾之上出现新的线索');
    expect(diagnosticCalls).not.toContain('question');
  });

  it('emits persistence and suggestion trace diagnostics after streaming completes', async () => {
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('trace-turn-run' as `${string}-${string}-${string}-${string}-${string}`);
    mocks.streamReaderAIAnswer.mockReturnValue(streamChunks(['answer']));
    mocks.generateReaderAISuggestions.mockResolvedValueOnce(['初始建议一']);
    mocks.generateReaderAISuggestions.mockResolvedValueOnce(['后续建议一']);

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.addMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.generateReaderAISuggestions).toHaveBeenCalledTimes(2));

    const traceCalls = mocks.logDiagnosticEvent.mock.calls.filter(
      ([event]) => event === 'reader_ai.trace',
    );
    expect(traceCalls).toEqual(
      expect.arrayContaining([
        [
          'reader_ai.trace',
          'debug',
          expect.objectContaining({
            runId: 'trace-turn-run',
            stage: 'persistence',
            action: 'persist_turn',
            status: 'completed',
            sourceCount: 0,
          }),
        ],
        [
          'reader_ai.trace',
          'debug',
          expect.objectContaining({
            runId: 'trace-turn-run',
            stage: 'suggestions',
            action: 'refresh_suggestions',
            status: 'started',
          }),
        ],
      ]),
    );
    expect(JSON.stringify(traceCalls)).not.toContain('question');
    expect(JSON.stringify(traceCalls)).not.toContain('answer');
    randomUUID.mockRestore();
  });

  it('generates follow-up suggestions from the previous answer after streaming completes', async () => {
    mocks.streamReaderAIAnswer.mockReturnValue(streamChunks(['这段回答提到了灰雾和线索']));
    mocks.generateReaderAISuggestions.mockResolvedValueOnce([
      '初始建议一',
      '初始建议二',
      '初始建议三',
    ]);
    mocks.generateReaderAISuggestions.mockResolvedValueOnce([
      '可以追问灰雾吗？',
      '线索指向谁？',
      '和前文关系？',
    ]);

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('answer-suggestions').textContent).toBe(
        '可以追问灰雾吗？|线索指向谁？|和前文关系？',
      ),
    );
    expect(mocks.generateReaderAISuggestions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: 'follow-up',
        messages: [
          { role: 'user', content: 'question' },
          { role: 'assistant', content: '这段回答提到了灰雾和线索' },
        ],
      }),
    );
  });

  it('shows follow-up suggestion loading only after streaming completes', async () => {
    let resolveAnswer: (() => void) | undefined;
    let resolveSuggestions: ((value: string[]) => void) | undefined;
    mocks.streamReaderAIAnswer.mockReturnValue(
      (async function* () {
        yield 'partial';
        await new Promise<void>((resolve) => {
          resolveAnswer = resolve;
        });
        yield ' done';
      })(),
    );
    mocks.generateReaderAISuggestions.mockResolvedValueOnce(['初始建议一']);

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    await waitFor(() =>
      expect(screen.getByTestId('ask-suggestions').textContent).toBe('初始建议一'),
    );
    mocks.generateReaderAISuggestions.mockClear();
    mocks.generateReaderAISuggestions.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        resolveSuggestions = resolve;
      }),
    );
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('generation-status').textContent).toBe('generating'),
    );
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
    expect(screen.getByTestId('answer-suggestions-loading').textContent).toBe('idle');
    expect(screen.getByTestId('answer-suggestions').textContent).toBe('');

    resolveAnswer?.();
    await waitFor(() =>
      expect(screen.getByTestId('answer-suggestions-loading').textContent).toBe('loading'),
    );
    expect(screen.getByTestId('answer-suggestions').textContent).toBe('');

    resolveSuggestions?.(['真正建议一', '真正建议二', '真正建议三']);
    await waitFor(() =>
      expect(screen.getByTestId('answer-suggestions').textContent).toBe(
        '真正建议一|真正建议二|真正建议三',
      ),
    );
  });

  it('does not persist an empty answer after generation timeout', async () => {
    vi.useFakeTimers();
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      (async function* () {
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      })(),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(mocks.streamReaderAIAnswer).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushAsyncWork();

    expect(screen.getByTestId('messages').textContent).toContain(
      'AI 生成超时，请稍后重试，或切换更快的模型。',
    );
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it('allows DeepSeek thinking answers to exceed the default 60 second answer budget', async () => {
    vi.useFakeTimers();
    settings.provider = 'deepseek';
    settings.providerApiKeys = { deepseek: 'deepseek-key' };
    settings.providerModels = { deepseek: 'deepseek-v4-flash' };
    mocks.streamReaderAIAnswer.mockReturnValue(delayedStream(['deepseek answer'], 90_000));

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(mocks.streamReaderAIAnswer).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(screen.getByTestId('messages').textContent).not.toContain('AI 生成超时');
    expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flushAsyncWork();

    expect(screen.getByTestId('messages').textContent).toContain('deepseek answer');
    expect(mocks.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'new-conversation',
        role: 'assistant',
        content: 'deepseek answer',
      }),
    );
  });

  it('does not show buffered partial answer text after generation timeout', async () => {
    vi.useFakeTimers();
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      pendingStream(signal),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(screen.getByTestId('generation-status').textContent).toBe('generating');
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(screen.getByTestId('messages').textContent).toContain(
      'AI 生成超时，请稍后重试，或切换更快的模型。',
    );
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it('shows a timeout message when the stream finishes cleanly after timeout abort', async () => {
    vi.useFakeTimers();
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      (async function* () {
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      })(),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(mocks.streamReaderAIAnswer).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(screen.getByTestId('messages').textContent).toContain(
      'AI 生成超时，请稍后重试，或切换更快的模型。',
    );
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it('shows a clear message when generation returns sources but no answer text', async () => {
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: unknown[]) => void }) => {
        onSources?.([
          {
            id: 'rag-source',
            chapterTitle: '第四章 占卜',
            sectionIndex: 4,
            snippet: '克莱恩正在梳理当前章节的信息。',
            confidence: 'approximate',
          },
        ]);
        return streamChunks([]);
      },
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain(
        'AI 没有返回正文，请重试或切换模型。',
      ),
    );
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it('shows a clear message when generation only returns invisible text', async () => {
    mocks.streamReaderAIAnswer.mockReturnValue(streamChunks(['<!-- empty -->', '\u200B']));

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain(
        'AI 没有返回正文，请重试或切换模型。',
      ),
    );
    expect(screen.getByTestId('messages').textContent).not.toContain('AI 回答AI 回答');
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it('updates assistant message with refined citation answer and spans, then persists them', async () => {
    const fallbackSources = [
      {
        id: 'rag-source',
        chapterTitle: '第五章 线索',
        sectionIndex: 5,
        snippet: 'fallback snippet',
        previewText: '前文。精确证据原文。后文。',
        highlightSpans: [{ start: 0, end: 8, quote: 'fallback', source: 'chunk' as const }],
        confidence: 'approximate' as const,
      },
    ];
    const refinedSources = [
      {
        ...fallbackSources[0]!,
        highlightSpans: [{ start: 3, end: 9, quote: '精确证据原文', source: 'reviewer' as const }],
      },
    ];
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: typeof fallbackSources) => void }) => {
        onSources?.(fallbackSources);
        return streamChunks(['answer [1]']);
      },
    );
    mocks.refineReaderAIAnswerCitations.mockResolvedValue({
      answer: 'answer [1]',
      sources: refinedSources,
    });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('message-source-quotes').textContent).toContain(
        'reviewer:精确证据原文',
      ),
    );
    expect(mocks.refineReaderAIAnswerCitations).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ provider: 'openrouter' }),
        answer: 'answer [1]',
        sources: fallbackSources,
      }),
    );
    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'answer [1]',
          sources: refinedSources,
        }),
      ),
    );
  });

  it('preserves source highlight spans when citation refinement omits them', async () => {
    const fallbackSources = [
      {
        id: 'rag-source',
        chapterTitle: 'Chapter 2 - The Pool of Tears',
        sectionIndex: 2,
        snippet: 'fallback snippet',
        previewText: 'Alice cried until there was a large pool all round her.',
        highlightSpans: [
          {
            start: 0,
            end: 57,
            quote: 'Alice cried until there was a large pool all round her.',
            source: 'chunk' as const,
          },
        ],
        confidence: 'approximate' as const,
      },
    ];
    const refinedSources = [
      {
        id: 'rag-source',
        chapterTitle: 'Chapter 2 - The Pool of Tears',
        sectionIndex: 2,
        snippet: 'fallback snippet',
        previewText: 'Alice cried until there was a large pool all round her.',
        confidence: 'approximate' as const,
      },
    ];
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: typeof fallbackSources) => void }) => {
        onSources?.(fallbackSources);
        return streamChunks(['answer [1]']);
      },
    );
    mocks.refineReaderAIAnswerCitations.mockResolvedValue({
      answer: 'answer [1]',
      sources: refinedSources,
    });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'answer [1]',
        }),
      ),
    );
    expect(screen.getByTestId('message-source-quotes').textContent).toContain(
      'chunk:Alice cried until there was a large pool all round her.',
    );
    expect(mocks.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        sources: [
          expect.objectContaining({
            highlightSpans: fallbackSources[0]!.highlightSpans,
          }),
        ],
      }),
    );
  });

  it('does not reuse source highlight spans when citation refinement changes preview text', async () => {
    const fallbackSources = [
      {
        id: 'rag-source',
        chapterTitle: 'Chapter 2 - The Pool of Tears',
        sectionIndex: 2,
        snippet: 'fallback snippet',
        previewText: 'Alice cried until there was a large pool all round her.',
        highlightSpans: [
          {
            start: 0,
            end: 57,
            quote: 'Alice cried until there was a large pool all round her.',
            source: 'chunk' as const,
          },
        ],
        confidence: 'approximate' as const,
      },
    ];
    const refinedSources = [
      {
        id: 'rag-source',
        chapterTitle: 'Chapter 2 - The Pool of Tears',
        sectionIndex: 2,
        snippet: 'refined snippet',
        previewText: 'Different refined preview text.',
        confidence: 'approximate' as const,
      },
    ];
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: typeof fallbackSources) => void }) => {
        onSources?.(fallbackSources);
        return streamChunks(['answer [1]']);
      },
    );
    mocks.refineReaderAIAnswerCitations.mockResolvedValue({
      answer: 'answer [1]',
      sources: refinedSources,
    });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'answer [1]',
          sources: refinedSources,
        }),
      ),
    );
    expect(screen.getByTestId('message-source-quotes').textContent).not.toContain(
      'chunk:Alice cried until there was a large pool all round her.',
    );
  });

  it('does not let highlight refinement delete already grounded citation markers', async () => {
    const fallbackSources = [
      {
        id: 'rag-source',
        chapterTitle: '第五章 线索',
        sectionIndex: 5,
        snippet: 'fallback snippet',
        previewText: '前文。精确证据原文。后文。',
        confidence: 'approximate' as const,
      },
    ];
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: typeof fallbackSources) => void }) => {
        onSources?.(fallbackSources);
        return streamChunks(['unsupported [1][2]']);
      },
    );
    mocks.refineReaderAIAnswerCitations.mockResolvedValue({
      answer: 'unsupported [2]',
      sources: fallbackSources,
    });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain('assistant:unsupported [1][2]'),
    );
    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'unsupported [1][2]',
          sources: fallbackSources,
        }),
      ),
    );
  });

  it('keeps streamed citation markers and sources visible when citation refinement fails', async () => {
    const fallbackSources = [
      {
        id: 'rag-source',
        chapterTitle: '第五章 线索',
        sectionIndex: 5,
        snippet: 'fallback snippet',
        previewText: '前文。精确证据原文。后文。',
        highlightSpans: [{ start: 0, end: 8, quote: 'fallback', source: 'chunk' as const }],
        confidence: 'approximate' as const,
      },
    ];
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: typeof fallbackSources) => void }) => {
        onSources?.(fallbackSources);
        return streamChunks(['answer [1]']);
      },
    );
    mocks.refineReaderAIAnswerCitations.mockRejectedValue(new Error('reviewer failed'));

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'answer [1]',
          sources: fallbackSources,
        }),
      ),
    );
    expect(screen.getByTestId('messages').textContent).toContain('assistant:answer [1]');
    expect(screen.getByTestId('message-source-quotes').textContent).toContain('chunk:fallback');
  });

  it('keeps streamed citation markers and narrows broad source highlights when citation refinement exceeds its timeout', async () => {
    vi.useFakeTimers();
    const previewText =
      'Letter 1\n\nTo Mrs. Saville, England.\n\nI feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.\n\nYet some feelings, unallied to the dross of human nature, beat even in these rugged bosoms.';
    const fallbackSources = [
      {
        id: 'rag-source',
        chapterTitle: 'Letter 1',
        sectionIndex: 5,
        snippet: 'fallback snippet',
        previewText,
        highlightSpans: [
          { start: 0, end: previewText.length, quote: previewText, source: 'chunk' as const },
        ],
        confidence: 'approximate' as const,
      },
    ];
    let refinementSignal: AbortSignal | undefined;
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: typeof fallbackSources) => void }) => {
        onSources?.(fallbackSources);
        return streamChunks([
          'The cold northern breeze braces the narrator’s nerves and fills him with delight. [1]',
        ]);
      },
    );
    mocks.refineReaderAIAnswerCitations.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) => {
        refinementSignal = signal;
        return new Promise(() => {});
      },
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(mocks.refineReaderAIAnswerCitations).toHaveBeenCalled();
    expect(refinementSignal).toBeDefined();
    expect(screen.getByTestId('messages').textContent).toContain(
      'assistant:The cold northern breeze braces the narrator’s nerves and fills him with delight. [1]',
    );
    expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('true');

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(refinementSignal?.aborted).toBe(true);
    expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('false');
    expect(screen.getByTestId('messages').textContent).toContain(
      'assistant:The cold northern breeze braces the narrator’s nerves and fills him with delight. [1]',
    );
    const sourceQuotes = screen.getByTestId('message-source-quotes').textContent ?? '';
    expect(sourceQuotes).toContain(
      'chunk:I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
    );
    expect(sourceQuotes).not.toContain('Yet some feelings');
    expect(mocks.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content:
          'The cold northern breeze braces the narrator’s nerves and fills him with delight. [1]',
        sources: [
          expect.objectContaining({
            highlightSpans: [
              expect.objectContaining({
                quote:
                  'I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('keeps selected text out of assistant source references', async () => {
    mocks.streamReaderAIAnswer.mockImplementation(
      ({ onSources }: { onSources?: (sources: unknown[]) => void }) => {
        onSources?.([
          {
            id: 'rag-source',
            chapterTitle: '第五章 线索',
            sectionIndex: 5,
            snippet: '灰雾之上的线索再次出现。',
            confidence: 'approximate',
          },
        ]);
        return streamChunks(['answer']);
      },
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    await import('@/utils/event').then(({ eventDispatcher }) =>
      eventDispatcher.dispatch('reader-ai-open', {
        bookKey: 'current-book-instance',
        source: 'selection',
        selection: {
          text: '克莱恩看见灰雾之上出现新的线索',
          page: 7,
          cfi: 'epubcfi(/6/2)',
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('ask-question')).toBeTruthy());
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(mocks.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'new-conversation',
          role: 'assistant',
          content: 'answer',
          sources: [expect.objectContaining({ id: 'rag-source' })],
        }),
      ),
    );
    expect(mocks.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        sources: expect.arrayContaining([expect.objectContaining({ chapterTitle: '选中的原文' })]),
      }),
    );
  });

  it('passes spoiler protection state to answer streaming and defaults to protected mode', async () => {
    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    expect(screen.getByTestId('ask-spoiler-state').textContent).toBe('protected');
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    expect(mocks.streamReaderAIAnswer.mock.calls[0]![0].settings.spoilerProtection).toBe(true);
  });

  it('passes a section text loader to answer streaming that prefers createDocument over loadText', async () => {
    const sectionDocument = document.implementation.createHTMLDocument(
      'section with distinctive createDocument text',
    );
    sectionDocument.body.textContent = 'distinctive createDocument text for section loader';
    const createDocument = vi.fn(() => sectionDocument);
    const loadText = vi.fn(async () => 'fallback loadText content');
    mocks.getBookData.mockReturnValue({
      book: { title: 'Current Book', author: 'Author' },
      bookDoc: {
        metadata: { title: 'Current Book', author: 'Author' },
        sections: [{ createDocument, loadText }],
      },
    });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    const loadSectionText = mocks.streamReaderAIAnswer.mock.calls[0]![0].loadSectionText;
    const sectionText = await loadSectionText(0);

    expect(sectionText).toContain('distinctive createDocument text');
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(loadText).not.toHaveBeenCalled();
  });

  it('passes the AI chunk page boundary when reflowable renderer pages differ from chunk pages', async () => {
    mocks.getProgress.mockReturnValue({
      page: 3104,
      section: { current: 1, total: 2 },
    });
    mocks.getBookData.mockReturnValue({
      book: { title: 'Current Book', author: 'Author' },
      bookDoc: {
        metadata: { title: 'Current Book', author: 'Author' },
        sections: [
          { size: 2_982_000, linear: 'yes' },
          { size: 6_000, linear: 'yes' },
        ],
      },
      isFixedLayout: false,
    });
    mocks.getViewState.mockReturnValue({ renderedPageInfo: { current: 3, total: 6 } });

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    expect(mocks.streamReaderAIAnswer.mock.calls[0]![0]).toMatchObject({
      currentPage: 3104,
      currentAIPage: 1990,
    });
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
    expect(getIndexBookOptions().onProgress).toEqual(expect.any(Function));
    expect(getIndexBookOptions().signal).toBeInstanceOf(AbortSignal);
    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('messages').textContent).toContain('answer'));
  });

  it('does not show detailed indexing progress before the first-use threshold', async () => {
    vi.useFakeTimers();
    mocks.isBookIndexed.mockResolvedValue(false);
    mocks.indexBook.mockImplementation(
      () =>
        new Promise<void>(() => {
          // keep indexing pending
        }),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(mocks.indexBook).toHaveBeenCalled();
    const { onProgress } = getIndexBookOptions();
    act(() => {
      onProgress({ current: 1, total: 4, phase: 'chunking' });
      vi.advanceTimersByTime(4999);
    });

    expect(screen.queryByTestId('indexing-progress')).toBeNull();
  });

  it('shows detailed indexing progress after the first-use threshold', async () => {
    vi.useFakeTimers();
    mocks.isBookIndexed.mockResolvedValue(false);
    mocks.indexBook.mockImplementation(
      () =>
        new Promise<void>(() => {
          // keep indexing pending
        }),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await flushAsyncWork();
    expect(mocks.indexBook).toHaveBeenCalled();
    const { onProgress } = getIndexBookOptions();
    act(() => {
      onProgress({ current: 2, total: 4, phase: 'chunking' });
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('indexing-progress').textContent).toBe('chunking:2/4');
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

  it('keeps the answer panel open when a follow-up provider request fails', async () => {
    mocks.streamReaderAIAnswer.mockReturnValueOnce(streamChunks(['first answer']));
    mocks.streamReaderAIAnswer.mockReturnValueOnce(
      rejectedStream(new Error('Provider request failed')),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));
    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain('first answer'),
    );

    fireEvent.click(screen.getByText('ask-follow-up'));

    await waitFor(() =>
      expect(screen.getByTestId('messages').textContent).toContain(
        'AI 请求失败，请检查 API Key、额度、模型名称或服务商状态后重试。',
      ),
    );
    expect(screen.getByTestId('answer-panel')).toBeTruthy();
    expect(screen.getByTestId('messages').textContent).toContain('first answer');
    expect(screen.getByTestId('messages').textContent).toContain('user:follow-up');
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

    await flushAsyncWork();
    expect(mocks.indexBook).toHaveBeenCalled();
    const { onProgress } = getIndexBookOptions();
    onProgress({ current: 1, total: 4, phase: 'chunking' });
    fireEvent.click(screen.getByText('close-answer'));
    resolveIndexing?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('indexing-progress')).toBeNull();
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

  it('removes an aborted unfinished exchange so it is not sent as future context', async () => {
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      pendingStream(signal),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('generation-status').textContent).toBe('generating'),
    );
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
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

    await waitFor(() =>
      expect(screen.getByTestId('generation-status').textContent).toBe('generating'),
    );
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
    fireEvent.click(screen.getByText('ask-follow-up'));

    await waitFor(() => expect(mocks.streamReaderAIAnswer).toHaveBeenCalledTimes(2));
    expect(mocks.streamReaderAIAnswer.mock.calls[1]![0].messages).toEqual([]);
    await waitFor(() =>
      expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('true'),
    );
  });

  it('keeps the answer panel open when Android back cancels a loading answer', async () => {
    mocks.streamReaderAIAnswer.mockImplementation(({ signal }: { signal?: AbortSignal }) =>
      pendingStream(signal),
    );

    render(<ReaderAIAssistant bookKey='current-book-instance' />);
    fireEvent.click(screen.getByText('open-ai'));
    fireEvent.click(screen.getByText('ask-question'));

    await waitFor(() =>
      expect(screen.getByTestId('generation-status').textContent).toBe('generating'),
    );
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
    const lastCall = mocks.useKeyDownActions.mock.calls.at(-1)![0];
    lastCall.onCancel();

    await waitFor(() => expect(screen.getByTestId('answer-panel')).toBeTruthy());
    expect(screen.getByTestId('answer-panel').getAttribute('data-loading')).toBe('false');
    expect(screen.getByTestId('messages').textContent).not.toContain('partial');
  });

  it('registers Android back handling for open idle AI panels', async () => {
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

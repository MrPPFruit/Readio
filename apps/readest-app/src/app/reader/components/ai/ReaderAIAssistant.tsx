import React, { useEffect, useRef, useState } from 'react';

import { useKeyDownActions } from '@/hooks/useKeyDownActions';
import { getAIAvailability } from '@/services/ai/availability';
import { indexBook, isBookIndexed, type BookDocType } from '@/services/ai/ragService';
import type { EmbeddingProgress } from '@/services/ai/types';
import { generateReaderAISuggestions, streamReaderAIAnswer } from '@/services/ai/readerChatService';
import { useAIChatStore } from '@/store/aiChatStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Insets } from '@/types/misc';
import type {
  ReaderAIGenerationStatus,
  ReaderAIEntrySource,
  ReaderAIHistoryOpenEventPayload,
  ReaderAIMessage,
  ReaderAIMode,
  ReaderAIOpenEventPayload,
  ReaderAISelectionContext,
  ReaderAISource,
} from '@/types/readerAI';
import { formatAuthors, formatTitle } from '@/utils/book';
import { eventDispatcher } from '@/utils/event';
import ReaderAIAnswerPanel from './ReaderAIAnswerPanel';
import ReaderAIAskBox from './ReaderAIAskBox';
import ReaderAIButton from './ReaderAIButton';

interface ReaderAIAssistantProps {
  bookKey: string;
  gridInsets?: Insets;
}

const READER_AI_ANSWER_TIMEOUT_MS = 60_000;
const READER_AI_SUGGESTIONS_TIMEOUT_MS = 20_000;

const createMessage = (
  role: ReaderAIMessage['role'],
  content: string,
  quotedText?: string,
  sources?: ReaderAISource[],
): ReaderAIMessage => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  role,
  content,
  ...(quotedText ? { quotedText } : {}),
  ...(sources?.length ? { sources } : {}),
  createdAt: Date.now(),
});

const getBookTitle = (bookKey: string) => {
  const bookData = useBookDataStore.getState().getBookData(bookKey);
  return (
    bookData?.book?.title || formatTitle(bookData?.bookDoc?.metadata.title || '') || '当前书籍'
  );
};

const ReaderAIAssistant: React.FC<ReaderAIAssistantProps> = ({ bookKey, gridInsets }) => {
  const [mode, setMode] = useState<ReaderAIMode>('closed');
  const [source, setSource] = useState<ReaderAIEntrySource>('control');
  const [selection, setSelection] = useState<ReaderAISelectionContext | undefined>();
  const [initialQuestion, setInitialQuestion] = useState('');
  const [messages, setMessages] = useState<ReaderAIMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [spoilerProtection, setSpoilerProtection] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<ReaderAIGenerationStatus>('idle');
  const [error, setError] = useState<string>();
  const [setupSettingsItemId, setSetupSettingsItemId] = useState<string>();
  const [indexingProgress, setIndexingProgress] = useState<EmbeddingProgress>();
  const [showIndexingProgress, setShowIndexingProgress] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightMessageIdsRef = useRef<{ userId: string; assistantId: string } | null>(null);
  const indexingProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);
  const { settings } = useSettingsStore();

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const clearIndexingProgress = () => {
    if (indexingProgressTimerRef.current) {
      clearTimeout(indexingProgressTimerRef.current);
      indexingProgressTimerRef.current = null;
    }
    setIndexingProgress(undefined);
    setShowIndexingProgress(false);
  };

  const openSetupPanel = (message: string, settingsItemId: string) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    inFlightMessageIdsRef.current = null;
    setMessages([createMessage('assistant', message)]);
    setSuggestions([]);
    setSuggestionsLoading(false);
    setGenerationStatus('idle');
    setError(undefined);
    setLoading(false);
    setSetupSettingsItemId(settingsItemId);
    clearIndexingProgress();
    setMode('answer');
  };

  const refreshSuggestions = async (
    suggestionSource: 'selection' | 'initial' | 'follow-up',
    nextMessages: ReaderAIMessage[] = messages,
    entrySelection = selection,
  ) => {
    const currentSettings = useSettingsStore.getState().settings.aiSettings;
    if (getAIAvailability(currentSettings).status !== 'ready') return;

    const bookHash = bookKey.split('-')[0]!;
    const bookData = useBookDataStore.getState().getBookData(bookKey);
    const progress = useReaderStore.getState().getProgress(bookKey);
    const bookTitle =
      bookData?.book?.title || formatTitle(bookData?.bookDoc?.metadata.title || '') || '当前书籍';
    const authorName =
      bookData?.book?.author ||
      (bookData?.bookDoc?.metadata.author ? formatAuthors(bookData.bookDoc.metadata.author) : '');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), READER_AI_SUGGESTIONS_TIMEOUT_MS);
    setSuggestions([]);
    setSuggestionsLoading(true);
    try {
      const generatedSuggestions = await generateReaderAISuggestions({
        settings: { ...currentSettings, spoilerProtection },
        bookHash,
        bookTitle,
        authorName,
        currentPage: entrySelection?.page || progress?.page || 1,
        source: suggestionSource,
        selectionText: entrySelection?.text,
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
      });
      setSuggestions(generatedSuggestions);
    } catch {
      setSuggestions([]);
    } finally {
      clearTimeout(timeoutId);
      setSuggestionsLoading(false);
    }
  };

  const openReadyAskBox = (
    entrySource: ReaderAIEntrySource,
    entrySelection?: ReaderAISelectionContext,
  ) => {
    if (entrySource === 'selection') useReaderStore.getState().getView(bookKey)?.deselect?.();
    setSource(entrySource);
    setSelection(entrySelection);
    setInitialQuestion(entrySource === 'selection' ? '解释这段' : '');
    setSuggestions([]);
    setSetupSettingsItemId(undefined);
    setMode('ask');
    void refreshSuggestions(
      entrySource === 'selection' ? 'selection' : 'initial',
      [],
      entrySelection,
    );
  };

  const openFromEntryPoint = (
    entrySource: ReaderAIEntrySource,
    entrySelection?: ReaderAISelectionContext,
  ) => {
    const currentSettings = useSettingsStore.getState().settings.aiSettings;
    const availability = getAIAvailability(currentSettings);
    if (availability.status === 'entrypoints-hidden') return;
    if (availability.status !== 'ready') {
      openSetupPanel(availability.message, availability.settingsItemId);
      return;
    }
    openReadyAskBox(entrySource, entrySelection);
  };

  useEffect(() => {
    const handleOpen = (event: CustomEvent) => {
      const detail = event.detail as ReaderAIOpenEventPayload;
      if (detail.bookKey !== bookKey) return;
      openFromEntryPoint(detail.source, detail.selection);
    };

    const handleOpenHistory = async (event: CustomEvent) => {
      const detail = event.detail as ReaderAIHistoryOpenEventPayload;
      if (detail.bookKey !== bookKey) return;

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      inFlightMessageIdsRef.current = null;
      useSidebarStore.getState().setSideBarVisible(false);
      clearIndexingProgress();
      await useAIChatStore.getState().setActiveConversation(detail.conversationId);
      const historyMessages = useAIChatStore
        .getState()
        .messages.map(({ id, role, content, quotedText, sources, createdAt }) => ({
          id,
          role,
          content,
          quotedText,
          sources,
          createdAt,
        }));
      setSource('control');
      setSelection(undefined);
      setInitialQuestion('');
      setMessages(historyMessages);
      setSuggestions([]);
      setSuggestionsLoading(false);
      setGenerationStatus('idle');
      setError(useAIChatStore.getState().historyError || undefined);
      setSetupSettingsItemId(undefined);
      setLoading(false);
      setMode('answer');
    };

    eventDispatcher.on('reader-ai-open', handleOpen);
    eventDispatcher.on('reader-ai-open-history', handleOpenHistory);
    return () => {
      eventDispatcher.off('reader-ai-open', handleOpen);
      eventDispatcher.off('reader-ai-open-history', handleOpenHistory);
    };
  }, [bookKey]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (indexingProgressTimerRef.current) clearTimeout(indexingProgressTimerRef.current);
    };
  }, []);

  const openAskBox = () => {
    openFromEntryPoint('control');
  };

  const openAISettings = (itemId: string) => {
    const { setActiveSettingsItemId, setSettingsDialogBookKey, setSettingsDialogOpen } =
      useSettingsStore.getState();
    setSettingsDialogBookKey(bookKey);
    setActiveSettingsItemId(itemId);
    setSettingsDialogOpen(true);
    closeAssistant();
  };

  const removeInFlightMessages = () => {
    const inFlightMessageIds = inFlightMessageIdsRef.current;
    if (!inFlightMessageIds) return;
    setMessages((currentMessages) =>
      currentMessages.filter(
        (message) =>
          message.id !== inFlightMessageIds.userId && message.id !== inFlightMessageIds.assistantId,
      ),
    );
    inFlightMessageIdsRef.current = null;
  };

  const cancelInFlightRequest = ({ removeMessages }: { removeMessages: boolean }) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    clearIndexingProgress();
    if (removeMessages) removeInFlightMessages();
  };

  const closeAssistant = () => {
    cancelInFlightRequest({ removeMessages: true });
    setSuggestions([]);
    setSuggestionsLoading(false);
    setGenerationStatus('idle');
    setSetupSettingsItemId(undefined);
    setMode('closed');
  };

  const handleCancel = () => {
    if (loadingRef.current) {
      cancelInFlightRequest({ removeMessages: false });
      setGenerationStatus('idle');
      return;
    }
    closeAssistant();
  };

  useKeyDownActions({ onCancel: handleCancel, enabled: mode !== 'closed' });

  const persistCompletedExchange = async (
    question: string,
    answer: string,
    bookHash: string,
    quotedText?: string,
    sources?: ReaderAISource[],
  ) => {
    const { activeConversationId, conversations, createConversation, addMessage } =
      useAIChatStore.getState();
    const activeConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId,
    );
    const conversationId =
      activeConversation?.bookHash === bookHash
        ? activeConversation.id
        : await createConversation(bookHash, question || `Chat about ${getBookTitle(bookKey)}`);
    await addMessage({
      conversationId,
      role: 'user',
      content: question,
      ...(quotedText ? { quotedText } : {}),
    });
    await addMessage({
      conversationId,
      role: 'assistant',
      content: answer,
      ...(sources?.length ? { sources } : {}),
    });
  };

  const askAI = async (question: string) => {
    const previousInFlightMessageIds = inFlightMessageIdsRef.current;
    if (abortControllerRef.current) {
      cancelInFlightRequest({ removeMessages: true });
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage = createMessage('user', question, selection?.text);
    const assistantMessage = createMessage('assistant', '');
    inFlightMessageIdsRef.current = { userId: userMessage.id, assistantId: assistantMessage.id };
    const priorMessages = previousInFlightMessageIds
      ? messages.filter(
          (message) =>
            message.id !== previousInFlightMessageIds.userId &&
            message.id !== previousInFlightMessageIds.assistantId,
        )
      : messages;
    setMessages([...priorMessages, userMessage, assistantMessage]);
    setMode('answer');
    setLoading(true);
    setGenerationStatus('retrieving');
    setSuggestions([]);
    setSuggestionsLoading(false);
    setError(undefined);
    setSetupSettingsItemId(undefined);
    clearIndexingProgress();

    const settings = useSettingsStore.getState().settings.aiSettings;
    const requestSettings = { ...settings, spoilerProtection };
    const availability = getAIAvailability(requestSettings);
    if (availability.status !== 'ready') {
      setMessages([
        ...priorMessages,
        userMessage,
        { ...assistantMessage, content: availability.message },
      ]);
      setSetupSettingsItemId(availability.settingsItemId);
      inFlightMessageIdsRef.current = null;
      setLoading(false);
      return;
    }

    const bookHash = bookKey.split('-')[0]!;
    const bookData = useBookDataStore.getState().getBookData(bookKey);
    const indexed = await isBookIndexed(bookHash, requestSettings);
    if (controller.signal.aborted) return;
    if (!indexed) {
      if (!bookData?.bookDoc) {
        setMessages([
          ...priorMessages,
          userMessage,
          { ...assistantMessage, content: '当前书籍尚未完成加载，无法索引。' },
        ]);
        inFlightMessageIdsRef.current = null;
        setLoading(false);
        return;
      }

      try {
        setGenerationStatus('indexing');
        setMessages([
          ...priorMessages,
          userMessage,
          { ...assistantMessage, content: '正在索引本书，完成后会继续回答…' },
        ]);
        indexingProgressTimerRef.current = setTimeout(() => {
          setShowIndexingProgress(true);
        }, 5000);
        await indexBook(bookData.bookDoc as BookDocType, bookHash, requestSettings, {
          onProgress: setIndexingProgress,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        clearIndexingProgress();
        setMessages([...priorMessages, userMessage, assistantMessage]);
      } catch {
        if (controller.signal.aborted) return;
        clearIndexingProgress();
        setError('索引本书失败，请稍后重试。');
        setMessages([
          ...priorMessages,
          userMessage,
          { ...assistantMessage, content: '索引本书失败，请稍后重试。' },
        ]);
        inFlightMessageIdsRef.current = null;
        setLoading(false);
        return;
      }
    }

    const progress = useReaderStore.getState().getProgress(bookKey);
    const bookTitle =
      bookData?.book?.title || formatTitle(bookData?.bookDoc?.metadata.title || '') || '当前书籍';
    const authorName =
      bookData?.book?.author ||
      (bookData?.bookDoc?.metadata.author ? formatAuthors(bookData.bookDoc.metadata.author) : '');
    const currentPage = selection?.page || progress?.page || 1;
    let answer = '';
    let answerSources: ReaderAISource[] = [];
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, READER_AI_ANSWER_TIMEOUT_MS);

    try {
      setGenerationStatus('connecting');
      for await (const chunk of streamReaderAIAnswer({
        settings: requestSettings,
        bookHash,
        bookTitle,
        authorName,
        currentPage,
        messages: priorMessages.map(({ role, content }) => ({ role, content })),
        question,
        selectionText: selection?.text,
        signal: controller.signal,
        onSources: (sources) => {
          answerSources = sources;
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMessage.id ? { ...message, sources: answerSources } : message,
            ),
          );
        },
      })) {
        if (chunk && generationStatus !== 'generating') setGenerationStatus('generating');
        answer += chunk;
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: answer, sources: answerSources }
              : message,
          ),
        );
      }

      clearTimeout(timeoutId);
      if (!controller.signal.aborted && answer.trim()) {
        await persistCompletedExchange(
          question,
          answer,
          bookHash,
          userMessage.quotedText,
          answerSources,
        );
        inFlightMessageIdsRef.current = null;
        void refreshSuggestions('follow-up', [
          ...priorMessages,
          userMessage,
          { ...assistantMessage, content: answer, sources: answerSources },
        ]);
      }
    } catch (streamError) {
      clearTimeout(timeoutId);
      if (timedOut) {
        setGenerationStatus('timeout');
        const timeoutMessage = answer.trim()
          ? `${answer}\n\n回答生成超时，以上是已生成的部分内容。`
          : 'AI 生成超时，请稍后重试，或切换更快的模型。';
        setError(timeoutMessage);
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: timeoutMessage, sources: answerSources }
              : message,
          ),
        );
      } else if ((streamError as Error).name !== 'AbortError') {
        setGenerationStatus('error');
        const providerFailureMessage =
          'AI 请求失败，请检查 API Key、额度、模型名称或服务商状态后重试。';
        setError(providerFailureMessage);
        setSetupSettingsItemId('settings.ai.apiKey');
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: providerFailureMessage }
              : message,
          ),
        );
      }
    } finally {
      clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleSourceClick = (source: ReaderAISource) => {
    if (source.cfi) {
      useReaderStore.getState().getView(bookKey)?.goTo(source.cfi);
    } else if (source.href) {
      useReaderStore.getState().getView(bookKey)?.goTo(source.href);
    }
  };

  const showReaderAIButton = settings.aiSettings.showReaderAIEntrypoints;
  const sectionLabel = useReaderStore.getState().getProgress(bookKey)?.sectionLabel;

  return (
    <>
      {showReaderAIButton && <ReaderAIButton bookKey={bookKey} onClick={openAskBox} />}
      {mode === 'ask' && (
        <ReaderAIAskBox
          source={source}
          gridInsets={gridInsets}
          initialQuestion={initialQuestion}
          sectionLabel={sectionLabel}
          suggestions={suggestions}
          spoilerProtection={spoilerProtection}
          onSpoilerProtectionChange={setSpoilerProtection}
          onSubmit={askAI}
          onClose={closeAssistant}
        />
      )}
      {(mode === 'answer' || mode === 'error') && (
        <ReaderAIAnswerPanel
          messages={messages}
          gridInsets={gridInsets}
          loading={loading}
          error={error}
          generationStatus={generationStatus}
          setupAction={
            setupSettingsItemId
              ? {
                  label: '去设置 AI',
                  onClick: () => openAISettings(setupSettingsItemId),
                }
              : undefined
          }
          spoilerProtection={spoilerProtection}
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          indexingProgress={showIndexingProgress ? indexingProgress : undefined}
          onSourceClick={handleSourceClick}
          onSpoilerProtectionChange={setSpoilerProtection}
          onSubmit={askAI}
          onClose={closeAssistant}
        />
      )}
    </>
  );
};

export default ReaderAIAssistant;

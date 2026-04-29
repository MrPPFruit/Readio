import React, { useEffect, useRef, useState } from 'react';

import { useKeyDownActions } from '@/hooks/useKeyDownActions';
import { getAIAvailability } from '@/services/ai/availability';
import { indexBook, isBookIndexed, type BookDocType } from '@/services/ai/ragService';
import { generateReaderAISuggestions, streamReaderAIAnswer } from '@/services/ai/readerChatService';
import { useAIChatStore } from '@/store/aiChatStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Insets } from '@/types/misc';
import type {
  ReaderAIEntrySource,
  ReaderAIMessage,
  ReaderAIMode,
  ReaderAIOpenEventPayload,
  ReaderAISelectionContext,
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

const createMessage = (role: ReaderAIMessage['role'], content: string): ReaderAIMessage => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  role,
  content,
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
  const [spoilerProtection, setSpoilerProtection] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [setupSettingsItemId, setSetupSettingsItemId] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightMessageIdsRef = useRef<{ userId: string; assistantId: string } | null>(null);
  const { settings } = useSettingsStore();

  const openSetupPanel = (message: string, settingsItemId: string) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    inFlightMessageIdsRef.current = null;
    setMessages([createMessage('assistant', message)]);
    setSuggestions([]);
    setError(undefined);
    setLoading(false);
    setSetupSettingsItemId(settingsItemId);
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
      });
      setSuggestions(generatedSuggestions);
    } catch {
      setSuggestions([]);
    }
  };

  const openReadyAskBox = (
    entrySource: ReaderAIEntrySource,
    entrySelection?: ReaderAISelectionContext,
  ) => {
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

    eventDispatcher.on('reader-ai-open', handleOpen);
    return () => {
      eventDispatcher.off('reader-ai-open', handleOpen);
    };
  }, [bookKey]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
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

  const closeAssistant = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    removeInFlightMessages();
    setSuggestions([]);
    setSetupSettingsItemId(undefined);
    setMode('closed');
  };

  useKeyDownActions({ onCancel: closeAssistant, enabled: mode !== 'closed' });

  const persistCompletedExchange = async (question: string, answer: string, bookHash: string) => {
    const { activeConversationId, conversations, createConversation, addMessage } =
      useAIChatStore.getState();
    const activeConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId,
    );
    const conversationId =
      activeConversation?.bookHash === bookHash
        ? activeConversation.id
        : await createConversation(bookHash, question || `Chat about ${getBookTitle(bookKey)}`);
    await addMessage({ conversationId, role: 'user', content: question });
    await addMessage({ conversationId, role: 'assistant', content: answer });
  };

  const askAI = async (question: string) => {
    const previousInFlightMessageIds = inFlightMessageIdsRef.current;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      removeInFlightMessages();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage = createMessage('user', question);
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
    setError(undefined);
    setSetupSettingsItemId(undefined);

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
    const indexed = await isBookIndexed(bookHash);
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
        setMessages([
          ...priorMessages,
          userMessage,
          { ...assistantMessage, content: '正在索引本书，完成后会继续回答…' },
        ]);
        await indexBook(
          bookData.bookDoc as BookDocType,
          bookHash,
          requestSettings,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setMessages([...priorMessages, userMessage, assistantMessage]);
      } catch {
        if (controller.signal.aborted) return;
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

    try {
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
      })) {
        answer += chunk;
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id ? { ...message, content: answer } : message,
          ),
        );
      }

      if (!controller.signal.aborted) {
        await persistCompletedExchange(question, answer, bookHash);
        inFlightMessageIdsRef.current = null;
        void refreshSuggestions('follow-up', [
          ...priorMessages,
          userMessage,
          { ...assistantMessage, content: answer },
        ]);
      }
    } catch (streamError) {
      if ((streamError as Error).name !== 'AbortError') {
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
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const showReaderAIButton = settings.aiSettings.showReaderAIEntrypoints;

  return (
    <>
      {showReaderAIButton && <ReaderAIButton bookKey={bookKey} onClick={openAskBox} />}
      {mode === 'ask' && (
        <ReaderAIAskBox
          source={source}
          gridInsets={gridInsets}
          initialQuestion={initialQuestion}
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
          onSpoilerProtectionChange={setSpoilerProtection}
          onSubmit={askAI}
          onClose={closeAssistant}
        />
      )}
    </>
  );
};

export default ReaderAIAssistant;

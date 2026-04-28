import React, { useEffect, useRef, useState } from 'react';

import { useKeyDownActions } from '@/hooks/useKeyDownActions';
import { indexBook, isBookIndexed, type BookDocType } from '@/services/ai/ragService';
import { streamReaderAIAnswer } from '@/services/ai/readerChatService';
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
  const [spoilerProtection, setSpoilerProtection] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightMessageIdsRef = useRef<{ userId: string; assistantId: string } | null>(null);

  useEffect(() => {
    const handleOpen = (event: CustomEvent) => {
      const detail = event.detail as ReaderAIOpenEventPayload;
      if (detail.bookKey !== bookKey) return;
      setSource(detail.source);
      setSelection(detail.selection);
      setInitialQuestion(detail.source === 'selection' ? '解释这段' : '');
      setMode('ask');
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
    setSource('control');
    setSelection(undefined);
    setInitialQuestion('');
    setMode('ask');
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

    const settings = useSettingsStore.getState().settings.aiSettings;
    const requestSettings = { ...settings, spoilerProtection };
    if (!requestSettings.enabled) {
      setMessages([
        ...priorMessages,
        userMessage,
        { ...assistantMessage, content: '请先在设置中启用 AI' },
      ]);
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
      }
    } catch (streamError) {
      if ((streamError as Error).name !== 'AbortError') {
        setError('AI 阅读助手暂时不可用，请稍后再试。');
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: 'AI 阅读助手暂时不可用，请稍后再试。' }
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

  return (
    <>
      <ReaderAIButton bookKey={bookKey} onClick={openAskBox} />
      {mode === 'ask' && (
        <ReaderAIAskBox
          source={source}
          gridInsets={gridInsets}
          initialQuestion={initialQuestion}
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
          spoilerProtection={spoilerProtection}
          onSpoilerProtectionChange={setSpoilerProtection}
          onSubmit={askAI}
          onClose={closeAssistant}
        />
      )}
    </>
  );
};

export default ReaderAIAssistant;

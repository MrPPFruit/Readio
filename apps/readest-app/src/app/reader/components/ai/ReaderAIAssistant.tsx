import React, { useEffect, useRef, useState } from 'react';

import { useKeyDownActions } from '@/hooks/useKeyDownActions';
import { getAIAvailability } from '@/services/ai/availability';
import { AI_PROVIDER_CATALOG } from '@/services/ai/constants';
import { getReflowableAIPageBoundary } from '@/app/reader/utils/pageInfo';
import { indexBook, isBookIndexed, type BookDocType } from '@/services/ai/ragService';
import type { AISettings, EmbeddingProgress } from '@/services/ai/types';
import {
  narrowReaderAISourceFallbackHighlights,
  refineReaderAIAnswerCitations,
} from '@/services/ai/citationVerifier';
import { generateReaderAISuggestions, streamReaderAIAnswer } from '@/services/ai/readerChatService';
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
import { logReaderAITraceEvent } from '@/services/diagnostics/readerAITrace';
import { extractTextFromDocument } from '@/services/ai/utils/chunker';
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
const READER_AI_THINKING_ANSWER_TIMEOUT_MS = 180_000;
const READER_AI_CITATION_REFINEMENT_TIMEOUT_MS = 15_000;
const READER_AI_SUGGESTIONS_TIMEOUT_MS = 20_000;
const READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS = 15_000;

const getReaderAIAnswerTimeoutMs = (settings: AISettings): number =>
  AI_PROVIDER_CATALOG[settings.provider].chatRequestOptions?.thinking?.type === 'enabled'
    ? READER_AI_THINKING_ANSWER_TIMEOUT_MS
    : READER_AI_ANSWER_TIMEOUT_MS;

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

const extractPlainTextFromHtml = (html: string): string => {
  if (!html.trim()) return '';
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || '';
  } catch {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
};

const hasVisibleAnswerText = (answer: string): boolean => {
  const visibleCandidate = answer
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
  return extractPlainTextFromHtml(visibleCandidate).length > 0;
};

const getReaderAISourcePreviewText = (source: ReaderAISource): string =>
  source.previewText ?? source.contextText ?? source.snippet ?? '';

const canReuseSourceHighlights = (
  originalSource: ReaderAISource,
  refinedSource: ReaderAISource,
): boolean =>
  getReaderAISourcePreviewText(originalSource) === getReaderAISourcePreviewText(refinedSource) &&
  originalSource.previewStartOffset === refinedSource.previewStartOffset;

const preserveSourceHighlights = (
  originalSources: ReaderAISource[],
  refinedSources: ReaderAISource[],
): ReaderAISource[] =>
  refinedSources.map((source, index) => {
    if (source.highlightSpans?.length) return source;
    const originalSource =
      originalSources.find((candidate) => candidate.id === source.id) ?? originalSources[index];
    return originalSource?.highlightSpans?.length &&
      canReuseSourceHighlights(originalSource, source)
      ? { ...originalSource, ...source, highlightSpans: originalSource.highlightSpans }
      : source;
  });

const loadBookSectionText = async (
  bookDoc: BookDocType | undefined,
  sectionIndex: number,
): Promise<string | null> => {
  const section = bookDoc?.sections?.[sectionIndex];
  if (!section) return null;

  try {
    const doc = await section.createDocument?.();
    if (doc) {
      const text = extractTextFromDocument(doc);
      if (text) return text;
    }
  } catch {
    // Fall through to the section.loadText fallback below.
  }

  try {
    const loadedText = await section.loadText?.();
    if (!loadedText) return null;
    return extractPlainTextFromHtml(loadedText) || loadedText.trim() || null;
  } catch {
    return null;
  }
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
    runId?: string,
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
    if (runId) {
      void logReaderAITraceEvent({
        runId,
        stage: 'suggestions',
        action: 'refresh_suggestions',
        status: 'started',
      });
    }
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
    runId?: string,
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
    if (runId) {
      void logReaderAITraceEvent({
        runId,
        stage: 'persistence',
        action: 'persist_turn',
        status: 'completed',
        sourceCount: sources?.length ?? 0,
      });
    }
  };

  const askAI = async (question: string) => {
    const previousInFlightMessageIds = inFlightMessageIdsRef.current;
    if (abortControllerRef.current) {
      cancelInFlightRequest({ removeMessages: true });
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const runId = crypto.randomUUID();
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
    void logDiagnosticEvent('reader_ai.ask_started', 'info', {
      bookHashPresent: Boolean(bookKey.split('-')[0]),
      hasSelection: Boolean(selection?.text),
      priorMessageCount: priorMessages.length,
      spoilerProtection,
      provider: requestSettings.provider,
      model: requestSettings.providerModels[requestSettings.provider] ?? '',
    });
    void logReaderAITraceEvent({
      runId,
      stage: 'run',
      action: 'start_run',
      status: 'started',
      firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
    });
    if (availability.status !== 'ready') {
      void logDiagnosticEvent('reader_ai.unavailable', 'warn', {
        status: availability.status,
        provider: requestSettings.provider,
        model: requestSettings.providerModels[requestSettings.provider] ?? '',
      });
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
    const viewState = useReaderStore.getState().getViewState(bookKey);
    const currentAIPage =
      !selection?.page && !bookData?.isFixedLayout && bookData?.bookDoc && progress?.section
        ? getReflowableAIPageBoundary({
            bookDoc: bookData.bookDoc,
            section: progress.section,
            renderedPageInfo: viewState?.renderedPageInfo ?? null,
          })
        : null;
    let answer = '';
    let answerSources: ReaderAISource[] = [];
    let timedOut = false;
    const answerTimeoutMs = getReaderAIAnswerTimeoutMs(requestSettings);
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, answerTimeoutMs);

    try {
      setGenerationStatus('connecting');
      for await (const chunk of streamReaderAIAnswer({
        settings: requestSettings,
        bookHash,
        bookTitle,
        authorName,
        currentPage,
        ...(currentAIPage !== null ? { currentAIPage } : {}),
        messages: priorMessages.map(({ role, content }) => ({ role, content })),
        question,
        selectionText: selection?.text,
        signal: controller.signal,
        runId,
        loadSectionText: (sectionIndex) =>
          loadBookSectionText(bookData?.bookDoc as BookDocType | undefined, sectionIndex),
        onSources: (sources) => {
          answerSources = sources;
        },
      })) {
        if (chunk && generationStatus !== 'generating') setGenerationStatus('generating');
        answer += chunk;
      }

      clearTimeout(timeoutId);
      if (timedOut) {
        void logReaderAITraceEvent({
          runId,
          stage: 'run',
          action: 'complete_run',
          status: 'timeout',
          firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
          overBudgetStage: 'timeout',
          recoveryHint: 'ask_user_to_retry',
        });
        setGenerationStatus('timeout');
        const timeoutMessage = 'AI 生成超时，请稍后重试，或切换更快的模型。';
        setError(timeoutMessage);
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: timeoutMessage, sources: answerSources }
              : message,
          ),
        );
        return;
      }
      if (!controller.signal.aborted && hasVisibleAnswerText(answer)) {
        let finalSources = answerSources;
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: answer, sources: answerSources }
              : message,
          ),
        );
        if (answerSources.length > 0) {
          const refinementController = new AbortController();
          const abortRefinement = () => refinementController.abort();
          let refinementTimeoutId: ReturnType<typeof setTimeout> | undefined;
          const refinementTimeout = new Promise<never>((_, reject) => {
            refinementTimeoutId = setTimeout(() => {
              abortRefinement();
              reject(new DOMException('Citation refinement timed out', 'AbortError'));
            }, READER_AI_CITATION_REFINEMENT_TIMEOUT_MS);
          });
          controller.signal.addEventListener('abort', abortRefinement, { once: true });
          try {
            const refined = await Promise.race([
              refineReaderAIAnswerCitations({
                settings: requestSettings,
                answer,
                sources: answerSources,
                signal: refinementController.signal,
              }),
              refinementTimeout,
            ]);
            finalSources = preserveSourceHighlights(answerSources, refined.sources);
            answerSources = finalSources;
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: answer, sources: finalSources }
                  : message,
              ),
            );
          } catch {
            finalSources = narrowReaderAISourceFallbackHighlights({
              answer,
              sources: answerSources,
            });
            answerSources = finalSources;
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: answer, sources: finalSources }
                  : message,
              ),
            );
          } finally {
            if (refinementTimeoutId) clearTimeout(refinementTimeoutId);
            controller.signal.removeEventListener('abort', abortRefinement);
          }
        }
        if (controller.signal.aborted) return;
        void logDiagnosticEvent('reader_ai.ask_completed', 'info', {
          provider: requestSettings.provider,
          model: requestSettings.providerModels[requestSettings.provider] ?? '',
          answerLength: answer.length,
          sourceCount: finalSources.length,
          priorMessageCount: priorMessages.length,
        });
        void logReaderAITraceEvent({
          runId,
          stage: 'run',
          action: 'complete_run',
          status: 'completed',
          firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
        });
        await persistCompletedExchange(
          question,
          answer,
          bookHash,
          userMessage.quotedText,
          finalSources,
          runId,
        );
        inFlightMessageIdsRef.current = null;
        void refreshSuggestions(
          'follow-up',
          [
            ...priorMessages,
            userMessage,
            { ...assistantMessage, content: answer, sources: finalSources },
          ],
          selection,
          runId,
        );
      } else if (!controller.signal.aborted) {
        void logReaderAITraceEvent({
          runId,
          stage: 'run',
          action: 'complete_run',
          status: 'failed',
          firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
          recoveryHint: 'ask_user_to_retry',
        });
        setGenerationStatus('error');
        const emptyAnswerMessage = 'AI 没有返回正文，请重试或切换模型。';
        setError(emptyAnswerMessage);
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: emptyAnswerMessage, sources: answerSources }
              : message,
          ),
        );
        inFlightMessageIdsRef.current = null;
      }
    } catch (streamError) {
      clearTimeout(timeoutId);
      if (timedOut) {
        void logReaderAITraceEvent({
          runId,
          stage: 'run',
          action: 'complete_run',
          status: 'timeout',
          firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
          overBudgetStage: 'timeout',
          recoveryHint: 'ask_user_to_retry',
        });
        setGenerationStatus('timeout');
        const timeoutMessage = 'AI 生成超时，请稍后重试，或切换更快的模型。';
        setError(timeoutMessage);
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: timeoutMessage, sources: answerSources }
              : message,
          ),
        );
      } else if ((streamError as Error).name !== 'AbortError') {
        void logReaderAITraceEvent({
          runId,
          stage: 'run',
          action: 'complete_run',
          status: 'failed',
          firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
          recoveryHint: 'ask_user_to_retry',
        });
        void logDiagnosticError('reader_ai.ask_failed', streamError, {
          provider: requestSettings.provider,
          model: requestSettings.providerModels[requestSettings.provider] ?? '',
          priorMessageCount: priorMessages.length,
          sourceCount: answerSources.length,
        });
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

  const showReaderAIButton = settings.aiSettings.showReaderAIEntrypoints;

  return (
    <>
      {showReaderAIButton && <ReaderAIButton bookKey={bookKey} onClick={openAskBox} />}
      {mode === 'ask' && (
        <ReaderAIAskBox
          source={source}
          initialQuestion={initialQuestion}
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
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
          onSpoilerProtectionChange={setSpoilerProtection}
          onSubmit={askAI}
          onClose={closeAssistant}
        />
      )}
    </>
  );
};

export default ReaderAIAssistant;

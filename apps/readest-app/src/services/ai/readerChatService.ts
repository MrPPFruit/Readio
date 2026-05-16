import { generateText, streamText, type ModelMessage } from 'ai';

import { isWebAppPlatform } from '@/services/environment';
import { AI_PROVIDER_CATALOG } from './constants';
import { getAIProvider } from './providers';
import { buildSystemPrompt } from './prompts';
import { classifyReaderQuestion, type ReaderQuestionClassification } from './questionRouting';
import {
  getCurrentSectionContextChunks,
  getCurrentSectionSummaryChunks,
  hybridSearch,
} from './ragService';
import { packReaderContext } from './search/contextPack';
import { tokenizeSearchText } from './search/bm25';
import type { ReaderAISource } from '@/types/readerAI';
import type { AIProviderName, AISettings, ScoredChunk } from './types';

export interface ReaderChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamReaderAIAnswerOptions {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
  messages: ReaderChatMessage[];
  question: string;
  selectionText?: string;
  signal?: AbortSignal;
  onSources?: (sources: ReaderAISource[]) => void;
}

export interface GenerateReaderAISuggestionsOptions {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  source: 'selection' | 'initial' | 'follow-up';
  selectionText?: string;
  messages: ReaderChatMessage[];
  signal?: AbortSignal;
}

const currentContextQuestionPattern =
  /前面|发生了什么|本章|这章|这一章|当前章节|这里|当前|现在|目前|刚才|这段|上一段/;
const entityListQuestionPattern = /成员|都有谁|有谁|名单|包括谁/;
const currentContextScoreBoost = 1_000;
const analysisRetrievalMultiplier = 5;
const MIN_ENTITY_CURRENT_CONTEXT_TOKEN_LENGTH = 2;

const isSupportedProvider = (provider: string): provider is AIProviderName =>
  provider in AI_PROVIDER_CATALOG;

function buildQuestion(question: string, selectionText?: string): string {
  if (!selectionText?.trim()) return question;
  return `选中文本：\n${selectionText.trim()}\n\n问题：${question}`;
}

function parseSuggestions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function chunksToText(chunks: ScoredChunk[]): string {
  return chunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join('\n');
}

function getChunkBookOrder(chunk: ScoredChunk): number {
  return chunk.sortIndex ?? chunk.sectionIndex * 1_000_000 + chunk.pageNumber;
}

function sortChunksByBookOrder(chunks: ScoredChunk[]): ScoredChunk[] {
  return [...chunks].sort((a, b) => {
    const sortA = getChunkBookOrder(a);
    const sortB = getChunkBookOrder(b);
    if (sortA !== sortB) return sortA - sortB;
    return b.score - a.score;
  });
}

function sortCurrentChunksFirst(
  chunks: ScoredChunk[],
  currentChunkIds: Set<string>,
): ScoredChunk[] {
  return [...chunks].sort((a, b) => {
    const aIsCurrent = currentChunkIds.has(a.id);
    const bIsCurrent = currentChunkIds.has(b.id);
    if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;

    const sortA = getChunkBookOrder(a);
    const sortB = getChunkBookOrder(b);
    if (sortA !== sortB) return sortA - sortB;
    return b.score - a.score;
  });
}

function filterEntityCurrentChunks(chunks: ScoredChunk[], question: string): ScoredChunk[] {
  const tokens = tokenizeSearchText(question).filter(
    (token) => token.length >= MIN_ENTITY_CURRENT_CONTEXT_TOKEN_LENGTH,
  );
  if (tokens.length === 0) return chunks;

  const relevantChunks = chunks.filter((chunk) => {
    const text = `${chunk.chapterTitle}\n${chunk.text}`.toLowerCase();
    return tokens.some((token) => text.includes(token.toLowerCase()));
  });
  return relevantChunks.length > 0 ? relevantChunks : chunks;
}

function chunkToSource(chunk: ScoredChunk): ReaderAISource {
  return {
    id: chunk.id,
    chapterTitle: chunk.chapterTitle,
    sectionIndex: chunk.sectionIndex,
    sortIndex: chunk.sortIndex,
    ...(chunk.cfi ? { cfi: chunk.cfi } : {}),
    ...(chunk.href ? { href: chunk.href } : {}),
    snippet: chunk.text.trim().slice(0, 120),
    confidence: chunk.cfi || chunk.href ? 'section' : 'approximate',
  };
}

async function buildSuggestionContext({
  settings,
  bookHash,
  currentPage,
  source,
  selectionText,
  messages,
}: GenerateReaderAISuggestionsOptions): Promise<{ label: string; content: string }> {
  if (source === 'selection' && selectionText?.trim()) {
    return { label: '选中文本', content: selectionText.trim() };
  }

  if (source === 'follow-up') {
    const previousAnswer = [...messages].reverse().find((message) => message.role === 'assistant');
    if (previousAnswer?.content.trim()) {
      return { label: '先前回答', content: previousAnswer.content.trim() };
    }
  }

  const currentChunks = await getCurrentSectionContextChunks(bookHash, currentPage, 3);
  const currentPageText = chunksToText(currentChunks);
  if (currentPageText) return { label: '当前页面内容', content: currentPageText };

  const searchChunks = await hybridSearch(
    bookHash,
    '当前页面可提问的问题',
    settings,
    3,
    settings.spoilerProtection ? currentPage : undefined,
  );
  return { label: '当前页面内容', content: chunksToText(searchChunks) };
}

export async function generateReaderAISuggestions(
  options: GenerateReaderAISuggestionsOptions,
): Promise<string[]> {
  const { settings, bookTitle, authorName = '', currentPage, source, signal } = options;
  if (!isSupportedProvider(settings.provider)) return [];

  const context = await buildSuggestionContext(options);
  if (!context.content) return [];

  const provider = getAIProvider(settings);
  const result = await generateText({
    model: provider.getModel(),
    prompt: `你是阅读 AI 助手。请基于${context.label}，为读者生成 3 个适合继续提问的简短中文问题。\n\n书名：${bookTitle}\n作者：${authorName || '未知'}\n当前页：${currentPage}\n建议来源：${source}\n防剧透：${settings.spoilerProtection ? '开启，只能基于当前进度' : '关闭'}\n\n${context.label}：\n${context.content}\n\n要求：\n- 只输出 3 行，每行一个问题\n- 不要编号以外的解释\n- 不要包含未读后文剧透`,
    abortSignal: signal,
  });

  return parseSuggestions(result.text);
}

async function* streamViaApiRoute(
  messages: ModelMessage[],
  readerContext: {
    bookTitle: string;
    authorName: string;
    currentPage: number;
    readerPage?: number;
    spoilerProtection: boolean;
    classification?: ReaderQuestionClassification;
    chunks: ScoredChunk[];
  },
  settings: AISettings,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      readerContext,
      provider: settings.provider,
      apiKey: settings.providerApiKeys[settings.provider],
      baseUrl:
        settings.provider === 'custom-openai-compatible'
          ? settings.customProviderBaseUrl
          : AI_PROVIDER_CATALOG[settings.provider].baseUrl,
      model:
        settings.providerModels[settings.provider] ||
        AI_PROVIDER_CATALOG[settings.provider].defaultModel,
    }),
    signal,
  });

  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error('provider-auth-failed');
    if ([402, 429].includes(response.status)) throw new Error('provider-quota-failed');
    if (response.status === 404) throw new Error('provider-model-failed');
    if (response.status >= 500) throw new Error('provider-failed');
    throw new Error(`provider-request-failed:${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export async function* streamReaderAIAnswer({
  settings,
  bookHash,
  bookTitle,
  authorName = '',
  currentPage,
  currentAIPage,
  messages,
  question,
  selectionText,
  signal,
  onSources,
}: StreamReaderAIAnswerOptions): AsyncGenerator<string> {
  const query = buildQuestion(question, selectionText);
  const classification = classifyReaderQuestion({
    question,
    selectionText,
    spoilerProtection: settings.spoilerProtection,
  });
  let chunks: ScoredChunk[] = [];
  const currentChunkIds = new Set<string>();
  const sourceBoundaryPage = currentAIPage ?? currentPage;

  const maxContextChunks = settings.maxContextChunks || 5;
  const retrievalMultiplier =
    classification.intent === 'analysis' ? analysisRetrievalMultiplier : 3;
  const retrievalK = Math.max(maxContextChunks * retrievalMultiplier, 8);

  try {
    chunks = await hybridSearch(
      bookHash,
      query,
      settings,
      retrievalK,
      settings.spoilerProtection ? sourceBoundaryPage : undefined,
    );
    const shouldIncludeCurrentContext =
      currentContextQuestionPattern.test(question) || classification.intent === 'entity_lookup';
    if (shouldIncludeCurrentContext) {
      const sectionChunks =
        classification.intent === 'chapter_summary'
          ? await getCurrentSectionSummaryChunks(bookHash, sourceBoundaryPage, 4)
          : await getCurrentSectionContextChunks(bookHash, sourceBoundaryPage, 4);
      const currentChunks =
        classification.intent === 'entity_lookup'
          ? filterEntityCurrentChunks(sectionChunks, question)
          : sectionChunks;
      currentChunks.forEach((chunk) => currentChunkIds.add(chunk.id));
      const boostedCurrentChunks = currentChunks.map((chunk) => ({
        ...chunk,
        score: chunk.score + currentContextScoreBoost,
      }));
      chunks =
        classification.intent === 'chapter_summary' && boostedCurrentChunks.length
          ? boostedCurrentChunks
          : [...boostedCurrentChunks, ...chunks];
    }
    chunks = packReaderContext({
      question: query,
      chunks,
      currentPage: sourceBoundaryPage,
      maxContextChunks,
      spoilerProtection: settings.spoilerProtection,
      selectionText,
    });
  } catch {
    chunks = [];
  }

  const shouldPrioritizeCurrentChunks =
    currentChunkIds.size > 0 &&
    classification.intent !== 'current_recap' &&
    (classification.intent !== 'entity_lookup' ||
      entityListQuestionPattern.test(question) ||
      currentContextQuestionPattern.test(question));
  const orderedChunks = shouldPrioritizeCurrentChunks
    ? sortCurrentChunksFirst(chunks, currentChunkIds)
    : sortChunksByBookOrder(chunks);
  onSources?.(orderedChunks.map(chunkToSource));

  const systemPrompt = buildSystemPrompt(
    bookTitle,
    authorName,
    orderedChunks,
    sourceBoundaryPage,
    settings.spoilerProtection,
    classification,
    currentPage,
  );
  const aiMessages: ModelMessage[] = [
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: 'user', content: query },
  ];

  if (!isSupportedProvider(settings.provider)) throw new Error('Unsupported provider');

  if (isWebAppPlatform()) {
    yield* streamViaApiRoute(
      aiMessages,
      {
        bookTitle,
        authorName,
        currentPage: sourceBoundaryPage,
        readerPage: currentPage,
        spoilerProtection: settings.spoilerProtection,
        classification,
        chunks: orderedChunks,
      },
      settings,
      signal,
    );
    return;
  }

  const provider = getAIProvider(settings);
  const result = streamText({
    model: provider.getModel(),
    system: systemPrompt,
    messages: aiMessages,
    abortSignal: signal,
  });

  for await (const chunk of result.textStream) {
    if (chunk) yield chunk;
  }
}

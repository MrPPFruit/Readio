import { generateText, streamText, type ModelMessage } from 'ai';

import { isWebAppPlatform } from '@/services/environment';
import { AI_PROVIDER_CATALOG } from './constants';
import { getAIProvider } from './providers';
import { buildSystemPrompt } from './prompts';
import { getCurrentSectionContextChunks, hybridSearch } from './ragService';
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

const highRiskSpoilerPattern = /结局|谁是凶手|后面|最后|后来|最终|死了没|会死|真相|剧透/;
const currentContextQuestionPattern = /前面|发生了什么|本章|这里|当前|刚才|这段|上一段/;

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

function chunkToSource(chunk: ScoredChunk): ReaderAISource {
  return {
    id: chunk.id,
    chapterTitle: chunk.chapterTitle,
    pageNumber: chunk.pageNumber,
    sectionIndex: chunk.sectionIndex,
    snippet: chunk.text.trim().slice(0, 120),
    confidence: 'approximate',
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
    spoilerProtection: boolean;
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
  messages,
  question,
  selectionText,
  signal,
  onSources,
}: StreamReaderAIAnswerOptions): AsyncGenerator<string> {
  const query = buildQuestion(question, selectionText);
  let chunks: ScoredChunk[] = [];

  if (settings.spoilerProtection && highRiskSpoilerPattern.test(question)) {
    yield `我不能提前透露后文或结局。我们目前只读到第 ${currentPage} 页，我会只基于已读内容聊线索和理解；如果你想讨论具体段落，可以选中文本后问我。`;
    return;
  }

  try {
    chunks = await hybridSearch(
      bookHash,
      query,
      settings,
      settings.maxContextChunks || 5,
      settings.spoilerProtection ? currentPage : undefined,
    );
    if (settings.spoilerProtection && currentContextQuestionPattern.test(question)) {
      const currentChunks = await getCurrentSectionContextChunks(bookHash, currentPage, 4);
      const seen = new Set(currentChunks.map((chunk) => chunk.id));
      chunks = [...currentChunks, ...chunks.filter((chunk) => !seen.has(chunk.id))].slice(
        0,
        settings.maxContextChunks || 5,
      );
    }
  } catch {
    chunks = [];
  }

  onSources?.(chunks.map(chunkToSource));

  const systemPrompt = buildSystemPrompt(
    bookTitle,
    authorName,
    chunks,
    currentPage,
    settings.spoilerProtection,
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
      { bookTitle, authorName, currentPage, spoilerProtection: settings.spoilerProtection, chunks },
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

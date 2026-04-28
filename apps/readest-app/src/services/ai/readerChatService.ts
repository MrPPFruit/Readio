import { streamText, type ModelMessage } from 'ai';

import { AI_PROVIDER_CATALOG } from './constants';
import { getAIProvider } from './providers';
import { buildSystemPrompt } from './prompts';
import { hybridSearch } from './ragService';
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
}

const highRiskSpoilerPattern = /结局|谁是凶手|后面|最后|后来|最终|死了没|会死|真相|剧透/;

const isSupportedProvider = (provider: string): provider is AIProviderName =>
  provider in AI_PROVIDER_CATALOG;

function buildQuestion(question: string, selectionText?: string): string {
  if (!selectionText?.trim()) return question;
  return `选中文本：\n${selectionText.trim()}\n\n问题：${question}`;
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
  } catch {
    chunks = [];
  }

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

  if (typeof window !== 'undefined') {
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
    yield chunk;
  }
}

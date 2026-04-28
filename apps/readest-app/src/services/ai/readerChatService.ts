import { streamText, type ModelMessage } from 'ai';

import { getAIProvider } from './providers';
import { buildSystemPrompt } from './prompts';
import { hybridSearch } from './ragService';
import type { AISettings, ScoredChunk } from './types';

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
      apiKey: settings.aiGatewayApiKey,
      model: settings.aiGatewayModel || 'google/gemini-2.5-flash-lite',
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Chat failed: ${response.status}`);
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

  if (typeof window !== 'undefined' && settings.provider === 'ai-gateway') {
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

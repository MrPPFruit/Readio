import { streamText } from 'ai';
import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import { isWebAppPlatform } from '@/services/environment';
import { AI_PROVIDER_CATALOG } from '../constants';
import { getAIProvider } from '../providers';
import { hybridSearch, isBookIndexed } from '../ragService';
import { aiLogger } from '../logger';
import { buildSystemPrompt } from '../prompts';
import { classifyReaderQuestion } from '../questionRouting';
import { packReaderContext } from '../search/contextPack';
import type { AISettings, ScoredChunk } from '../types';

let lastSources: ScoredChunk[] = [];

export function getLastSources(): ScoredChunk[] {
  return lastSources;
}

export function clearLastSources(): void {
  lastSources = [];
}

interface TauriAdapterOptions {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName: string;
  currentPage: number;
}

async function* streamViaApiRoute(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  settings: AISettings,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      system: systemPrompt,
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
    signal: abortSignal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Chat failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export function createTauriAdapter(getOptions: () => TauriAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult> {
      const options = getOptions();
      const { settings, bookHash, bookTitle, authorName, currentPage } = options;
      const provider = getAIProvider(settings);
      let chunks: ScoredChunk[] = [];

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const query =
        lastUserMessage?.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join(' ') || '';

      aiLogger.chat.send(query.length, false);
      const classification = classifyReaderQuestion({
        question: query,
        spoilerProtection: settings.spoilerProtection,
      });

      if (await isBookIndexed(bookHash, settings)) {
        try {
          const maxContextChunks = settings.maxContextChunks || 5;
          const retrievalK = Math.max(maxContextChunks * 3, 8);
          chunks = await hybridSearch(
            bookHash,
            query,
            settings,
            retrievalK,
            settings.spoilerProtection ? currentPage : undefined,
          );
          chunks = packReaderContext({
            question: query,
            chunks,
            currentPage,
            maxContextChunks,
            spoilerProtection: settings.spoilerProtection,
          });
          aiLogger.chat.context(chunks.length, chunks.map((c) => c.text).join('').length);
          lastSources = chunks;
        } catch (e) {
          aiLogger.chat.error(`RAG failed: ${(e as Error).message}`);
          lastSources = [];
        }
      } else {
        lastSources = [];
        yield {
          content: [
            {
              type: 'text',
              text: '这本书还没有完成 AI 索引。请先点击“开始索引”，完成后我就可以基于书本内容继续回答。',
            },
          ],
        };
        return;
      }

      const systemPrompt = buildSystemPrompt(
        bookTitle,
        authorName,
        chunks,
        currentPage,
        settings.spoilerProtection,
        classification,
      );

      const aiMessages = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      }));

      try {
        const useApiRoute = isWebAppPlatform();

        let text = '';

        if (useApiRoute) {
          for await (const chunk of streamViaApiRoute(
            aiMessages,
            systemPrompt,
            settings,
            abortSignal,
          )) {
            text += chunk;
            yield { content: [{ type: 'text', text }] };
          }
        } else {
          const result = streamText({
            model: provider.getModel(),
            system: systemPrompt,
            messages: aiMessages,
            abortSignal,
          });

          for await (const chunk of result.textStream) {
            text += chunk;
            if (text) yield { content: [{ type: 'text', text }] };
          }
        }

        aiLogger.chat.complete(text.length);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          aiLogger.chat.error((error as Error).message);
          throw error;
        }
      }
    },
  };
}

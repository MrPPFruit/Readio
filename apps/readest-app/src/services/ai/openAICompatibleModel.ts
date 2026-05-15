import { isTauriAppPlatform } from '@/services/environment';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export interface OpenAICompatibleModelConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

type PromptPart = { type: string; text?: string };
type PromptMessage = { role: string; content: string | PromptPart[] };

type StreamPart =
  | { type: 'stream-start'; warnings: [] }
  | { type: 'response-metadata'; id?: string; modelId?: string; timestamp?: Date }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'finish'; finishReason: { unified: string; raw?: string }; usage: Usage };

type Usage = {
  inputTokens: { total?: number; noCache?: number; cacheRead?: number; cacheWrite?: number };
  outputTokens: { total?: number; text?: number; reasoning?: number };
  raw?: Record<string, unknown>;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const usageFrom = (usage?: Record<string, unknown>): Usage => ({
  inputTokens: {
    total: typeof usage?.['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total:
      typeof usage?.['completion_tokens'] === 'number' ? usage['completion_tokens'] : undefined,
    text: typeof usage?.['completion_tokens'] === 'number' ? usage['completion_tokens'] : undefined,
    reasoning: undefined,
  },
  raw: usage,
});

const textFromContent = (content: string | PromptPart[]) => {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
};

const messagesFromPrompt = (prompt: PromptMessage[]) =>
  prompt
    .filter((message) => ['system', 'user', 'assistant'].includes(message.role))
    .map((message) => ({ role: message.role, content: textFromContent(message.content) }));

const requestHeaders = (apiKey: string, headers?: Record<string, string | undefined>) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey}`,
  ...Object.fromEntries(Object.entries(headers ?? {}).filter(([, value]) => value !== undefined)),
});

const providerFetch = (input: string, init: RequestInit) =>
  isTauriAppPlatform() ? tauriFetch(input, init) : fetch(input, init);

const assertOk = async (response: Response) => {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  throw new Error(text || `Provider request failed: ${response.status}`);
};

export function createOpenAICompatibleModel(config: OpenAICompatibleModelConfig): LanguageModel {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  return {
    specificationVersion: 'v3',
    provider: config.provider,
    modelId: config.model,
    supportedUrls: {},
    async doGenerate(options: {
      prompt: PromptMessage[];
      abortSignal?: AbortSignal;
      headers?: Record<string, string | undefined>;
    }) {
      const body = {
        model: config.model,
        messages: messagesFromPrompt(options.prompt),
        stream: false,
      };
      const response = await providerFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: requestHeaders(config.apiKey, options.headers),
        body: JSON.stringify(body),
        redirect: 'error',
        signal: options.abortSignal,
      });
      await assertOk(response);
      const json = (await response.json()) as Record<string, unknown>;
      const choice = (json['choices'] as Record<string, unknown>[] | undefined)?.[0];
      const message = choice?.['message'] as Record<string, unknown> | undefined;
      const content = typeof message?.['content'] === 'string' ? message['content'] : '';
      const finishReason =
        typeof choice?.['finish_reason'] === 'string' ? choice['finish_reason'] : 'stop';

      return {
        content: [{ type: 'text', text: content }],
        finishReason: { unified: finishReason === 'length' ? 'length' : 'stop', raw: finishReason },
        usage: usageFrom(json['usage'] as Record<string, unknown> | undefined),
        response: {
          id: typeof json['id'] === 'string' ? json['id'] : undefined,
          timestamp: new Date(),
          modelId: typeof json['model'] === 'string' ? json['model'] : config.model,
        },
        warnings: [],
      };
    },
    async doStream(options: {
      prompt: PromptMessage[];
      abortSignal?: AbortSignal;
      headers?: Record<string, string | undefined>;
    }) {
      const body = {
        model: config.model,
        messages: messagesFromPrompt(options.prompt),
        stream: true,
      };
      const response = await providerFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: requestHeaders(config.apiKey, options.headers),
        body: JSON.stringify(body),
        redirect: 'error',
        signal: options.abortSignal,
      });
      await assertOk(response);

      const stream = new ReadableStream<StreamPart>({
        async start(controller) {
          const textId = 'text-0';
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: textId });
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let usage: Usage | undefined;
          let finishReason = 'stop';
          const processLine = (line: string) => {
            if (!line.startsWith('data:')) return;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') return;
            const json = JSON.parse(data) as Record<string, unknown>;
            if (typeof json['id'] === 'string' || typeof json['model'] === 'string') {
              controller.enqueue({
                type: 'response-metadata',
                id: typeof json['id'] === 'string' ? json['id'] : undefined,
                modelId: typeof json['model'] === 'string' ? json['model'] : config.model,
                timestamp: new Date(),
              });
            }
            const choice = (json['choices'] as Record<string, unknown>[] | undefined)?.[0];
            const delta = choice?.['delta'] as Record<string, unknown> | undefined;
            if (typeof delta?.['content'] === 'string' && delta['content']) {
              controller.enqueue({ type: 'text-delta', id: textId, delta: delta['content'] });
            }
            if (typeof choice?.['finish_reason'] === 'string')
              finishReason = choice['finish_reason'];
            if (json['usage']) usage = usageFrom(json['usage'] as Record<string, unknown>);
          };

          try {
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) processLine(line);
              }
            } else if (typeof response.text === 'function') {
              buffer = await response.text();
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) processLine(line);
            }
            if (buffer) processLine(buffer);
            controller.enqueue({ type: 'text-end', id: textId });
            controller.enqueue({
              type: 'finish',
              finishReason: {
                unified: finishReason === 'length' ? 'length' : 'stop',
                raw: finishReason,
              },
              usage: usage ?? usageFrom(),
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return { stream };
    },
  } as LanguageModel;
}

export function createOpenAICompatibleEmbeddingModel(
  config: OpenAICompatibleModelConfig,
): EmbeddingModel {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  return {
    specificationVersion: 'v3',
    provider: config.provider,
    modelId: config.model,
    maxEmbeddingsPerCall: 2048,
    supportsParallelCalls: true,
    async doEmbed(options: {
      values: string[];
      abortSignal?: AbortSignal;
      headers?: Record<string, string | undefined>;
    }) {
      const response = await providerFetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: requestHeaders(config.apiKey, options.headers),
        body: JSON.stringify({ model: config.model, input: options.values }),
        redirect: 'error',
        signal: options.abortSignal,
      });
      await assertOk(response);
      const json = (await response.json()) as Record<string, unknown>;
      const data = Array.isArray(json['data']) ? (json['data'] as Record<string, unknown>[]) : [];
      return {
        embeddings: data.map((item) => item['embedding'] as number[]),
        usage:
          typeof (json['usage'] as Record<string, unknown> | undefined)?.['total_tokens'] ===
          'number'
            ? { tokens: (json['usage'] as Record<string, number>)['total_tokens'] }
            : undefined,
        warnings: [],
      };
    },
  } as EmbeddingModel;
}

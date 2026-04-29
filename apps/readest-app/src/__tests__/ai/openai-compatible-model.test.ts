import { streamText } from 'ai';
import { describe, expect, test, vi } from 'vitest';

import { createOpenAICompatibleModel } from '@/services/ai/openAICompatibleModel';

const { tauriFetchMock } = vi.hoisted(() => ({
  tauriFetchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: tauriFetchMock,
}));

const runWithAppPlatform = async (platform: string | undefined, fn: () => Promise<void>) => {
  const originalPlatform = process.env['NEXT_PUBLIC_APP_PLATFORM'];
  if (platform) {
    process.env['NEXT_PUBLIC_APP_PLATFORM'] = platform;
  } else {
    delete process.env['NEXT_PUBLIC_APP_PLATFORM'];
  }
  try {
    await fn();
  } finally {
    if (originalPlatform) {
      process.env['NEXT_PUBLIC_APP_PLATFORM'] = originalPlatform;
    } else {
      delete process.env['NEXT_PUBLIC_APP_PLATFORM'];
    }
  }
};

describe('OpenAI-compatible model transport', () => {
  test('uses Tauri native HTTP for direct chat requests in the Tauri app', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('blocked'));
    tauriFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await runWithAppPlatform('tauri', async () => {
      const model = createOpenAICompatibleModel({
        provider: 'custom-openai-compatible',
        apiKey: 'key',
        baseUrl: 'http://192.168.5.205:8317/v1',
        model: 'custom-model',
      }) as unknown as {
        doGenerate: (options: { prompt: { role: string; content: string }[] }) => Promise<unknown>;
      };

      await model.doGenerate({ prompt: [{ role: 'user', content: 'hello' }] });
    });

    expect(tauriFetchMock).toHaveBeenCalledWith(
      'http://192.168.5.205:8317/v1/chat/completions',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  test('does not follow provider redirects for chat requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const model = createOpenAICompatibleModel({
      provider: 'custom-openai-compatible',
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      model: 'custom-model',
    }) as unknown as {
      doGenerate: (options: { prompt: { role: string; content: string }[] }) => Promise<unknown>;
    };

    await model.doGenerate({ prompt: [{ role: 'user', content: 'hello' }] });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/chat/completions',
      expect.objectContaining({ redirect: 'error' }),
    );

    fetchMock.mockRestore();
  });

  test('streams OpenAI-compatible text deltas through the AI SDK textStream', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"id":"chatcmpl-1","model":"custom-model","choices":[{"delta":{"content":"hello"}}]}\n\n',
              ),
            );
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n',
              ),
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        },
      ),
    );

    const model = createOpenAICompatibleModel({
      provider: 'custom-openai-compatible',
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      model: 'custom-model',
    });

    const chunks: string[] = [];
    for await (const chunk of streamText({ model, prompt: 'hello' }).textStream) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('hello world');

    fetchMock.mockRestore();
  });
});

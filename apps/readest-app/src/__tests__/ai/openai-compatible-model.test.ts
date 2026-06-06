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

  test('adds configured chat request options to non-streaming requests', async () => {
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
      provider: 'deepseek',
      apiKey: 'key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      chatRequestOptions: {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      },
    }) as unknown as {
      doGenerate: (options: { prompt: { role: string; content: string }[] }) => Promise<unknown>;
    };

    await model.doGenerate({ prompt: [{ role: 'user', content: 'hello' }] });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(requestInit?.body as string)).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: false,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });

    fetchMock.mockRestore();
  });

  test('does not expose non-streaming MiMo reasoning_content as answer text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '', reasoning_content: 'internal reasoning' },
              finish_reason: 'stop',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const model = createOpenAICompatibleModel({
      provider: 'mimo',
      apiKey: 'key',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
    }) as unknown as {
      doGenerate: (options: { prompt: { role: string; content: string }[] }) => Promise<{
        content: { type: string; text: string }[];
      }>;
    };

    const result = await model.doGenerate({ prompt: [{ role: 'user', content: 'hello' }] });

    expect(result.content).toEqual([{ type: 'text', text: '' }]);

    fetchMock.mockRestore();
  });

  test('adds configured chat request options to streaming requests', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
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
      provider: 'deepseek',
      apiKey: 'key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      chatRequestOptions: {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      },
    });

    const chunks: string[] = [];
    for await (const chunk of streamText({ model, prompt: 'hello' }).textStream) {
      chunks.push(chunk);
    }

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(requestInit?.body as string)).toMatchObject({
      model: 'deepseek-v4-pro',
      stream: true,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
    expect(chunks.join('')).toBe('ok');

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

  test('streams Tauri HTTP text bodies when a native response has no readable body', async () => {
    tauriFetchMock.mockResolvedValueOnce({
      ok: true,
      body: null,
      text: vi
        .fn()
        .mockResolvedValue(
          'data: {"id":"chatcmpl-1","model":"custom-model","choices":[{"delta":{"content":"hello"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
        ),
    });

    await runWithAppPlatform('tauri', async () => {
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
    });
  });

  test('does not expose MiMo reasoning_content when final content is streamed', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"id":"chatcmpl-1","model":"mimo-v2.5-pro","choices":[{"delta":{"reasoning_content":"internal reasoning"}}]}\n\n',
              ),
            );
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"visible answer"},"finish_reason":"stop"}]}\n\n',
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
      provider: 'mimo',
      apiKey: 'key',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
    });

    const chunks: string[] = [];
    for await (const chunk of streamText({ model, prompt: 'hello' }).textStream) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('visible answer');

    fetchMock.mockRestore();
  });
});

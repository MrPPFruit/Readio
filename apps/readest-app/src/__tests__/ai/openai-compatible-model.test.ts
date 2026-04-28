import { describe, expect, test, vi } from 'vitest';

import { createOpenAICompatibleModel } from '@/services/ai/openAICompatibleModel';

describe('OpenAI-compatible model transport', () => {
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
});

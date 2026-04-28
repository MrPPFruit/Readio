import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenAICompatibleModel: vi.fn((config) => ({ kind: 'chat-model', config })),
  streamText: vi.fn(() => ({
    toTextStreamResponse: vi.fn(() => new Response('ok')),
  })),
}));

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

vi.mock('ai', () => ({
  streamText: mocks.streamText,
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

vi.mock('@/services/ai/openAICompatibleModel', () => ({
  createOpenAICompatibleModel: mocks.createOpenAICompatibleModel,
}));

vi.mock('@/utils/access', () => ({
  validateUserAndToken: vi.fn(async () => ({ user: null, token: null })),
}));

import { POST } from '@/app/api/ai/chat/route';

const postRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/ai/chat BYOK provider routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('creates a direct OpenAI-compatible model from provider payload', async () => {
    const response = await POST(
      postRequest({
        provider: 'deepseek',
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createOpenAICompatibleModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      }),
    );
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.anything() }),
    );
  });

  it('rejects Vercel AI Gateway and Ollama provider ids', async () => {
    for (const provider of ['ai-gateway', 'ollama']) {
      const response = await POST(
        postRequest({
          provider,
          apiKey: 'key',
          model: 'model',
          readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
          messages: [{ role: 'user', content: 'hello' }],
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Unsupported provider' });
    }
  });

  it('ignores caller-supplied base URL for named providers', async () => {
    const response = await POST(
      postRequest({
        provider: 'openrouter',
        apiKey: 'openrouter-key',
        baseUrl: 'https://attacker.example/v1',
        model: 'google/gemini-2.5-flash-lite',
        readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createOpenAICompatibleModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
      }),
    );
  });

  it('requires a valid custom base URL for custom OpenAI-compatible providers', async () => {
    const response = await POST(
      postRequest({
        provider: 'custom-openai-compatible',
        apiKey: 'custom-key',
        baseUrl: 'notaurl',
        model: 'custom-model',
        readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid base URL' });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects localhost or non-HTTPS custom base URLs', async () => {
    for (const baseUrl of ['http://127.0.0.1:11434/v1', 'https://localhost/v1']) {
      const response = await POST(
        postRequest({
          provider: 'custom-openai-compatible',
          apiKey: 'custom-key',
          baseUrl,
          model: 'custom-model',
          readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
          messages: [{ role: 'user', content: 'hello' }],
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid base URL' });
    }
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects custom base URLs that resolve to private addresses', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '10.0.0.12', family: 4 }]);

    const response = await POST(
      postRequest({
        provider: 'custom-openai-compatible',
        apiKey: 'custom-key',
        baseUrl: 'https://rebind.example/v1',
        model: 'custom-model',
        readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid base URL' });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects IPv6 private or link-local custom base URLs', async () => {
    for (const baseUrl of ['https://[fc00::1]/v1', 'https://[fe80::1]/v1']) {
      const response = await POST(
        postRequest({
          provider: 'custom-openai-compatible',
          apiKey: 'custom-key',
          baseUrl,
          model: 'custom-model',
          readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
          messages: [{ role: 'user', content: 'hello' }],
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid base URL' });
    }
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('returns a generic error when providers fail', async () => {
    mocks.streamText.mockImplementationOnce(() => {
      throw new Error('upstream leaked provider detail');
    });

    const response = await POST(
      postRequest({
        provider: 'openrouter',
        apiKey: 'openrouter-key',
        model: 'google/gemini-2.5-flash-lite',
        readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Provider request failed' });
  });
});

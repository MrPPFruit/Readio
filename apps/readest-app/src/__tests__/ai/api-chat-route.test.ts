import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenAICompatibleModel: vi.fn((config) => ({ kind: 'chat-model', config })),
  streamText: vi.fn((_options: { system?: string }) => ({
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
        model: 'deepseek-v4-flash',
        readerContext: { bookTitle: 'Book', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createOpenAICompatibleModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        chatRequestOptions: {
          thinking: { type: 'enabled' },
          reasoning_effort: 'high',
        },
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

  it('rejects reader classification scope that conflicts with spoiler protection', async () => {
    const response = await POST(
      postRequest({
        provider: 'openrouter',
        apiKey: 'openrouter-key',
        model: 'google/gemini-2.5-flash-lite',
        readerContext: {
          bookTitle: 'Book',
          currentPage: 7,
          spoilerProtection: true,
          classification: { intent: 'entity_lookup', scope: 'whole_book_allowed' },
          chunks: [],
        },
        messages: [{ role: 'user', content: '戴里克是谁？' }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid reader context' });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('passes reader-visible page into the reader prompt separately from source page', async () => {
    const response = await POST(
      postRequest({
        provider: 'openrouter',
        apiKey: 'openrouter-key',
        model: 'google/gemini-2.5-flash-lite',
        readerContext: {
          bookTitle: 'Book',
          authorName: 'Author',
          currentPage: 1988,
          readerPage: 3104.9,
          spoilerProtection: true,
          classification: { intent: 'current_recap', scope: 'read_so_far' },
          chunks: [
            {
              text: 'Safe source text.',
              chapterTitle: 'Current chapter',
              sectionIndex: 5,
              pageNumber: 1988,
            },
          ],
        },
        messages: [{ role: 'user', content: '这章目前讲了什么？' }],
      }),
    );

    expect(response.status).toBe(200);
    const system = mocks.streamText.mock.calls[0]?.[0].system;
    expect(system).toContain('You are currently on page 3104');
    expect(system).toContain('reader-visible current page is 3104');
    expect(system).toContain('<BOOK_PASSAGES safe_boundary="filtered" reader_page="3104">');
    expect(system).not.toContain('You are currently on page 1988');
    expect(system).not.toContain('page_limit="1988"');
  });

  it('uses current page when reader-visible page is absent', async () => {
    const response = await POST(
      postRequest({
        provider: 'openrouter',
        apiKey: 'openrouter-key',
        model: 'google/gemini-2.5-flash-lite',
        readerContext: {
          bookTitle: 'Book',
          currentPage: 7,
          chunks: [
            {
              text: 'Safe source text.',
              chapterTitle: 'Current chapter',
              sectionIndex: 0,
              pageNumber: 7,
            },
          ],
        },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(200);
    const system = mocks.streamText.mock.calls[0]?.[0].system;
    expect(system).toContain('You are currently on page 7');
    expect(system).toContain('<BOOK_PASSAGES safe_boundary="filtered">');
    expect(system).not.toContain('reader_page=');
  });

  it('rejects non-numeric reader-visible page values', async () => {
    const response = await POST(
      postRequest({
        provider: 'openrouter',
        apiKey: 'openrouter-key',
        model: 'google/gemini-2.5-flash-lite',
        readerContext: {
          bookTitle: 'Book',
          currentPage: 7,
          readerPage: '3104',
          chunks: [],
        },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid reader context' });
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

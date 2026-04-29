import { beforeEach, describe, expect, test, vi } from 'vitest';

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(async () => ({ text: 'ok' })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@/services/ai/logger', () => ({
  aiLogger: {
    provider: {
      init: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock('@/services/ai/openAICompatibleModel', () => ({
  createOpenAICompatibleModel: vi.fn((config) => ({
    kind: 'chat-model',
    config,
    doGenerate: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  })),
  createOpenAICompatibleEmbeddingModel: vi.fn((config) => ({ kind: 'embedding-model', config })),
}));

import { AI_PROVIDER_CATALOG, DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import {
  createOpenAICompatibleEmbeddingModel,
  createOpenAICompatibleModel,
} from '@/services/ai/openAICompatibleModel';
import type { AIProviderName, AISettings } from '@/services/ai/types';

const settingsFor = (
  provider: AIProviderName,
  overrides: Partial<AISettings> = {},
): AISettings => ({
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  provider,
  providerApiKeys: { [provider]: `${provider}-key` },
  providerModels: { [provider]: AI_PROVIDER_CATALOG[provider].defaultModel },
  ...overrides,
});

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

describe('BYOK provider factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('creates configured OpenAI-compatible providers for every catalog provider', async () => {
    for (const providerId of Object.keys(AI_PROVIDER_CATALOG) as AIProviderName[]) {
      const provider = getAIProvider(settingsFor(providerId));
      const catalogEntry = AI_PROVIDER_CATALOG[providerId];

      expect(provider.id).toBe(providerId);
      expect(provider.name).toBe(catalogEntry.label);
      expect(provider.requiresAuth).toBe(true);
      await expect(provider.isAvailable()).resolves.toBe(true);

      provider.getModel();
      expect(createOpenAICompatibleModel).toHaveBeenLastCalledWith(
        expect.objectContaining({
          provider: providerId,
          apiKey: `${providerId}-key`,
          baseUrl: catalogEntry.baseUrl,
          model: catalogEntry.defaultModel,
        }),
      );
    }
  });

  test('uses custom base URL and custom model for OpenAI-compatible custom provider', () => {
    const provider = getAIProvider(
      settingsFor('custom-openai-compatible', {
        customProviderBaseUrl: 'https://llm.example.test/v1',
        providerModels: { 'custom-openai-compatible': 'vendor/custom-model' },
      }),
    );

    provider.getModel();

    expect(createOpenAICompatibleModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'custom-openai-compatible',
        apiKey: 'custom-openai-compatible-key',
        baseUrl: 'https://llm.example.test/v1',
        model: 'vendor/custom-model',
      }),
    );
  });

  test('allows custom local/LAN testing proxy without an API key', () => {
    const provider = getAIProvider(
      settingsFor('custom-openai-compatible', {
        allowUnsafeCustomProviderBaseUrl: true,
        providerApiKeys: {},
        customProviderBaseUrl: 'http://192.168.5.205:8317/v1',
        providerModels: { 'custom-openai-compatible': 'gpt-4o-mini' },
      }),
    );

    provider.getModel();

    expect(createOpenAICompatibleModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'custom-openai-compatible',
        apiKey: '',
        baseUrl: 'http://192.168.5.205:8317/v1',
        model: 'gpt-4o-mini',
      }),
    );
  });

  test('rejects non-local HTTP custom testing proxy without an API key', () => {
    expect(() =>
      getAIProvider(
        settingsFor('custom-openai-compatible', {
          allowUnsafeCustomProviderBaseUrl: true,
          providerApiKeys: {},
          customProviderBaseUrl: 'http://api.example.test/v1',
          providerModels: { 'custom-openai-compatible': 'custom-model' },
        }),
      ),
    ).toThrow('API key required for Custom OpenAI-compatible');
  });

  test('throws provider-specific setup error when API key is missing', () => {
    expect(() =>
      getAIProvider(
        settingsFor('openai', {
          providerApiKeys: { openai: '' },
        }),
      ),
    ).toThrow('API key required for OpenAI');
  });

  test('rejects legacy Vercel AI Gateway and Ollama providers', () => {
    expect(() =>
      getAIProvider({ ...DEFAULT_AI_SETTINGS, provider: 'ai-gateway' as AIProviderName }),
    ).toThrow('Unsupported provider');
    expect(() =>
      getAIProvider({ ...DEFAULT_AI_SETTINGS, provider: 'ollama' as AIProviderName }),
    ).toThrow('Unsupported provider');
  });

  test('healthCheck uses the browser API route on the web platform', async () => {
    await runWithAppPlatform('web', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const provider = getAIProvider(settingsFor('deepseek'));

      await expect(provider.healthCheck()).resolves.toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const requestInit = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(requestInit?.body).toBeDefined();
      const body = JSON.parse(requestInit?.body as string);
      expect(body).toMatchObject({
        provider: 'deepseek',
        apiKey: 'deepseek-key',
        baseUrl: AI_PROVIDER_CATALOG.deepseek.baseUrl,
        model: AI_PROVIDER_CATALOG.deepseek.defaultModel,
        readerContext: { bookTitle: 'Connection Test', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(createOpenAICompatibleModel).not.toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'deepseek' }),
      );
    });
  });

  test('healthCheck verifies the provider directly in the Tauri app', async () => {
    await runWithAppPlatform('tauri', async () => {
      const provider = getAIProvider(settingsFor('deepseek'));

      await expect(provider.healthCheck()).resolves.toBe(true);

      expect(createOpenAICompatibleModel).toHaveBeenLastCalledWith(
        expect.objectContaining({
          provider: 'deepseek',
          apiKey: 'deepseek-key',
          baseUrl: AI_PROVIDER_CATALOG.deepseek.baseUrl,
          model: AI_PROVIDER_CATALOG.deepseek.defaultModel,
        }),
      );
      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({ kind: 'chat-model' }),
          prompt: 'hi',
        }),
      );
      expect(mockFetch).not.toHaveBeenCalledWith('/api/ai/chat', expect.anything());
    });
  });

  test('embedding model is optional and uses provider embedding config only when configured', () => {
    const provider = getAIProvider(
      settingsFor('openai', {
        providerEmbeddingModels: { openai: 'text-embedding-3-small' },
      }),
    );

    provider.getEmbeddingModel();

    expect(createOpenAICompatibleEmbeddingModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'openai-key',
        baseUrl: AI_PROVIDER_CATALOG.openai.baseUrl,
        model: 'text-embedding-3-small',
      }),
    );
  });
});

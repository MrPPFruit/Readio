import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/services/ai/logger', () => ({
  aiLogger: {
    provider: {
      init: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock('@/services/ai/openAICompatibleModel', () => ({
  createOpenAICompatibleModel: vi.fn((config) => ({ kind: 'chat-model', config })),
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

  test('healthCheck sends provider, model, base URL, and key through the app route', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const provider = getAIProvider(settingsFor('deepseek'));

    await expect(provider.healthCheck()).resolves.toBe(true);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(mockFetch.mock.calls[0]![0]).toBe('/api/ai/chat');
    expect(body['provider']).toBe('deepseek');
    expect(body['apiKey']).toBe('deepseek-key');
    expect(body['model']).toBe(AI_PROVIDER_CATALOG.deepseek.defaultModel);
    expect(body['baseUrl']).toBe(AI_PROVIDER_CATALOG.deepseek.baseUrl);
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

import { describe, expect, test } from 'vitest';

import * as aiConstants from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';

const constants = aiConstants as unknown as Record<string, unknown>;
const providerIds = [
  'openrouter',
  'openai',
  'gemini',
  'deepseek',
  'dashscope',
  'kimi',
  'mimo',
  'custom-openai-compatible',
] as const;

type ProviderCatalogEntry = {
  id: string;
  label: string;
  protocol: string;
  baseUrl: string;
  apiKeyUrl: string;
  defaultModel: string;
  modelPresets: { id: string; label: string }[];
  apiKeyPlaceholder: string;
};

describe('DEFAULT_AI_SETTINGS', () => {
  test('defaults to disabled OpenRouter BYOK cloud AI with visible reader entry points', () => {
    expect(aiConstants.DEFAULT_AI_SETTINGS.enabled).toBe(false);
    expect(aiConstants.DEFAULT_AI_SETTINGS.showReaderAIEntrypoints).toBe(true);
    expect(aiConstants.DEFAULT_AI_SETTINGS.provider).toBe('openrouter');
    expect(aiConstants.DEFAULT_AI_SETTINGS.spoilerProtection).toBe(true);
    expect(aiConstants.DEFAULT_AI_SETTINGS.maxContextChunks).toBe(10);
    expect(aiConstants.DEFAULT_AI_SETTINGS.indexingMode).toBe('on-demand');
  });

  test('does not include Vercel AI Gateway or Ollama product defaults', () => {
    const defaults = aiConstants.DEFAULT_AI_SETTINGS as unknown as Record<string, unknown>;

    expect(defaults['aiGatewayApiKey']).toBeUndefined();
    expect(defaults['aiGatewayModel']).toBeUndefined();
    expect(defaults['aiGatewayEmbeddingModel']).toBeUndefined();
    expect(defaults['ollamaBaseUrl']).toBeUndefined();
    expect(defaults['ollamaModel']).toBeUndefined();
    expect(defaults['ollamaEmbeddingModel']).toBeUndefined();
  });
});

describe('BYOK provider catalog', () => {
  test('contains the alpha.9 cloud provider list in display order', () => {
    const providerOrder = constants['AI_PROVIDER_ORDER'] as string[];
    const catalog = constants['AI_PROVIDER_CATALOG'] as Record<string, ProviderCatalogEntry>;

    expect(providerOrder).toEqual([...providerIds]);
    expect(Object.keys(catalog)).toEqual([...providerIds]);
  });

  test('defines labels, API key links, model presets, and base URLs for every provider', () => {
    const catalog = constants['AI_PROVIDER_CATALOG'] as Record<string, ProviderCatalogEntry>;

    for (const id of providerIds) {
      const provider = catalog[id]!;
      expect(provider.id).toBe(id);
      expect(provider.label).toBeTruthy();
      expect(provider.protocol).toBeTruthy();
      expect(provider.baseUrl).toBeTruthy();
      expect(provider.apiKeyUrl).toMatch(/^https:\/\//);
      expect(provider.defaultModel).toBeTruthy();
      expect(provider.modelPresets.length).toBeGreaterThan(0);
      expect(provider.modelPresets.map((model) => model.id)).toContain(provider.defaultModel);
      expect(provider.apiKeyPlaceholder).toBeTruthy();
    }
  });

  test('configures Xiaomi MiMo with the token-plan OpenAI-compatible endpoint and best chat model', () => {
    const catalog = constants['AI_PROVIDER_CATALOG'] as Record<string, ProviderCatalogEntry>;

    expect(catalog['mimo']).toMatchObject({
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      defaultModel: 'mimo-v2.5-pro',
    });
    expect(catalog['mimo']!.modelPresets.map((model) => model.id)).toContain('mimo-v2.5-pro');
  });

  test('uses OpenAI-compatible protocol for aggregator and direct compatible vendors', () => {
    const catalog = constants['AI_PROVIDER_CATALOG'] as Record<string, ProviderCatalogEntry>;

    expect(catalog['openrouter']!.protocol).toBe('openai-compatible');
    expect(catalog['openai']!.protocol).toBe('openai-compatible');
    expect(catalog['deepseek']!.protocol).toBe('openai-compatible');
    expect(catalog['dashscope']!.protocol).toBe('openai-compatible');
    expect(catalog['kimi']!.protocol).toBe('openai-compatible');
    expect(catalog['mimo']!.protocol).toBe('openai-compatible');
    expect(catalog['custom-openai-compatible']!.protocol).toBe('openai-compatible');
  });
});

describe('AISettings Type', () => {
  test('supports provider-scoped API keys and models without gateway or local fields', () => {
    const settings: AISettings = {
      enabled: true,
      showReaderAIEntrypoints: true,
      provider: 'openrouter',
      providerApiKeys: { openrouter: 'sk-or-test' },
      providerModels: { openrouter: 'google/gemini-2.5-flash-lite' },
      spoilerProtection: false,
      maxContextChunks: 10,
      indexingMode: 'background',
    };

    expect(settings.provider).toBe('openrouter');
    expect(settings.providerApiKeys.openrouter).toBe('sk-or-test');
    expect(settings.providerModels.openrouter).toBe('google/gemini-2.5-flash-lite');
  });
});

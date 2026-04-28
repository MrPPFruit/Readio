import { describe, expect, test } from 'vitest';

import { getAIAvailability } from '@/services/ai/availability';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';

const readySettings: AISettings = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openrouter',
  providerApiKeys: { openrouter: 'openrouter-key' },
  providerModels: { openrouter: 'google/gemini-2.5-flash-lite' },
};

describe('getAIAvailability', () => {
  test('treats hidden reader entry points separately from assistant availability', () => {
    expect(getAIAvailability({ ...readySettings, showReaderAIEntrypoints: false })).toEqual({
      status: 'entrypoints-hidden',
      settingsItemId: 'settings.ai.showReaderAIEntrypoints',
      message: '阅读器 AI 入口已隐藏，可在设置中重新显示。',
    });
  });

  test('requires the assistant to be enabled before use', () => {
    expect(getAIAvailability({ ...readySettings, enabled: false })).toEqual({
      status: 'disabled',
      settingsItemId: 'settings.ai.enableAssistant',
      message: 'AI 助手尚未开启。开启后，你可以基于当前阅读内容提问。',
    });
  });

  test('requires a provider-scoped API key', () => {
    expect(getAIAvailability({ ...readySettings, providerApiKeys: { openrouter: '' } })).toEqual({
      status: 'missing-api-key',
      settingsItemId: 'settings.ai.apiKey',
      message: '需要填写 OpenRouter API Key。Readio 不提供内置模型服务。',
    });
  });

  test('requires custom OpenAI-compatible providers to have a base URL', () => {
    expect(
      getAIAvailability({
        ...readySettings,
        provider: 'custom-openai-compatible',
        providerApiKeys: { 'custom-openai-compatible': 'custom-key' },
        customProviderBaseUrl: '',
      }),
    ).toEqual({
      status: 'missing-custom-base-url',
      settingsItemId: 'settings.ai.customBaseUrl',
      message: '需要填写自定义基础 URL。',
    });
  });

  test('requires custom OpenAI-compatible providers to use a safe HTTPS base URL', () => {
    expect(
      getAIAvailability({
        ...readySettings,
        provider: 'custom-openai-compatible',
        providerApiKeys: { 'custom-openai-compatible': 'custom-key' },
        providerModels: { 'custom-openai-compatible': 'custom-model' },
        customProviderBaseUrl: 'http://127.0.0.1:11434/v1',
      }),
    ).toEqual({
      status: 'invalid-custom-base-url',
      settingsItemId: 'settings.ai.customBaseUrl',
      message: '自定义基础 URL 必须是有效的 HTTPS 公网地址。',
    });
  });

  test('requires custom OpenAI-compatible providers to have a real model name', () => {
    expect(
      getAIAvailability({
        ...readySettings,
        provider: 'custom-openai-compatible',
        providerApiKeys: { 'custom-openai-compatible': 'custom-key' },
        providerModels: { 'custom-openai-compatible': '' },
        customProviderBaseUrl: 'https://llm.example.test/v1',
      }),
    ).toEqual({
      status: 'missing-model',
      settingsItemId: 'settings.ai.model',
      message: '需要填写模型名称。',
    });
  });

  test('returns ready when cloud AI is enabled and configured', () => {
    expect(getAIAvailability(readySettings)).toEqual({ status: 'ready' });
  });
});

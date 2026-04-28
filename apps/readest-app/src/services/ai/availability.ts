import { AI_PROVIDER_CATALOG } from './constants';
import type { AIProviderName, AISettings } from './types';

export type AIAvailabilityStatus =
  | 'ready'
  | 'entrypoints-hidden'
  | 'disabled'
  | 'invalid-provider'
  | 'missing-api-key'
  | 'missing-model'
  | 'missing-custom-base-url'
  | 'invalid-custom-base-url';

export type AIAvailability =
  | { status: 'ready' }
  | {
      status: Exclude<AIAvailabilityStatus, 'ready'>;
      settingsItemId: string;
      message: string;
    };

export const isSupportedAIProvider = (provider: string): provider is AIProviderName =>
  provider in AI_PROVIDER_CATALOG;

const privateIpPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
];

const isSafeCustomBaseUrl = (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !privateIpPatterns.some((pattern) => pattern.test(url.hostname))
    );
  } catch {
    return false;
  }
};

export const getAIAvailability = (settings: AISettings): AIAvailability => {
  if (!settings.showReaderAIEntrypoints) {
    return {
      status: 'entrypoints-hidden',
      settingsItemId: 'settings.ai.showReaderAIEntrypoints',
      message: '阅读器 AI 入口已隐藏，可在设置中重新显示。',
    };
  }

  if (!settings.enabled) {
    return {
      status: 'disabled',
      settingsItemId: 'settings.ai.enableAssistant',
      message: 'AI 助手尚未开启。开启后，你可以基于当前阅读内容提问。',
    };
  }

  if (!isSupportedAIProvider(settings.provider)) {
    return {
      status: 'invalid-provider',
      settingsItemId: 'settings.ai.provider',
      message: '请先在设置中选择支持的云端 AI 服务。',
    };
  }

  if (!settings.providerApiKeys?.[settings.provider]?.trim()) {
    return {
      status: 'missing-api-key',
      settingsItemId: 'settings.ai.apiKey',
      message: `需要填写 ${AI_PROVIDER_CATALOG[settings.provider].label} API Key。Readio 不提供内置模型服务。`,
    };
  }

  if (settings.provider === 'custom-openai-compatible') {
    const customBaseUrl = settings.customProviderBaseUrl?.trim();
    if (!customBaseUrl) {
      return {
        status: 'missing-custom-base-url',
        settingsItemId: 'settings.ai.customBaseUrl',
        message: '需要填写自定义基础 URL。',
      };
    }
    if (!isSafeCustomBaseUrl(customBaseUrl)) {
      return {
        status: 'invalid-custom-base-url',
        settingsItemId: 'settings.ai.customBaseUrl',
        message: '自定义基础 URL 必须是有效的 HTTPS 公网地址。',
      };
    }
  }

  if (!settings.providerModels?.[settings.provider]?.trim()) {
    return {
      status: 'missing-model',
      settingsItemId: 'settings.ai.model',
      message: '需要填写模型名称。',
    };
  }

  return { status: 'ready' };
};

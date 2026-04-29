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

const isPrivateHost = (hostname: string) =>
  privateIpPatterns.some((pattern) => pattern.test(hostname));

export const getCustomBaseUrlSafety = (baseUrl: string, allowUnsafeLocalProxy?: boolean) => {
  try {
    const url = new URL(baseUrl);
    if (url.username || url.password) return 'invalid';
    if (url.protocol === 'https:' && !isPrivateHost(url.hostname)) return 'safe';
    if (allowUnsafeLocalProxy && url.protocol === 'http:' && isPrivateHost(url.hostname)) {
      return 'unsafe-local-proxy';
    }
    if (allowUnsafeLocalProxy && url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
      return 'invalid-non-local-http';
    }
    return 'invalid';
  } catch {
    return 'invalid';
  }
};

const isCustomLocalTestingProxy = (settings: AISettings) =>
  settings.provider === 'custom-openai-compatible' &&
  settings.allowUnsafeCustomProviderBaseUrl === true &&
  getCustomBaseUrlSafety(settings.customProviderBaseUrl?.trim() ?? '', true) ===
    'unsafe-local-proxy';

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

  if (settings.provider === 'custom-openai-compatible') {
    const customBaseUrl = settings.customProviderBaseUrl?.trim();
    if (!customBaseUrl) {
      return {
        status: 'missing-custom-base-url',
        settingsItemId: 'settings.ai.customBaseUrl',
        message: '需要填写自定义基础 URL。',
      };
    }
    const safety = getCustomBaseUrlSafety(customBaseUrl, settings.allowUnsafeCustomProviderBaseUrl);
    if (safety === 'invalid-non-local-http') {
      return {
        status: 'invalid-custom-base-url',
        settingsItemId: 'settings.ai.customBaseUrl',
        message: '测试用本地/局域网代理只允许 localhost、127.0.0.1 或私有局域网地址。',
      };
    }
    if (safety === 'invalid') {
      return {
        status: 'invalid-custom-base-url',
        settingsItemId: 'settings.ai.customBaseUrl',
        message: '自定义基础 URL 必须是有效的 HTTPS 公网地址，或开启测试用本地/局域网代理。',
      };
    }
  }

  if (
    !settings.providerApiKeys?.[settings.provider]?.trim() &&
    !isCustomLocalTestingProxy(settings)
  ) {
    return {
      status: 'missing-api-key',
      settingsItemId: 'settings.ai.apiKey',
      message: `需要填写 ${AI_PROVIDER_CATALOG[settings.provider].label} API Key。Readio 不提供内置模型服务。`,
    };
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

import { AI_PROVIDER_CATALOG } from '../constants';
import {
  createOpenAICompatibleEmbeddingModel,
  createOpenAICompatibleModel,
} from '../openAICompatibleModel';
import type { AIProvider, AIProviderName, AISettings } from '../types';

const isSupportedProvider = (provider: string): provider is AIProviderName =>
  provider in AI_PROVIDER_CATALOG;

const getProviderBaseUrl = (settings: AISettings, provider: AIProviderName) => {
  if (provider === 'custom-openai-compatible') {
    return settings.customProviderBaseUrl?.trim() || AI_PROVIDER_CATALOG[provider].baseUrl;
  }
  return AI_PROVIDER_CATALOG[provider].baseUrl;
};

class BYOKProvider implements AIProvider {
  id: AIProviderName;
  name: string;
  requiresAuth = true;

  constructor(private settings: AISettings) {
    this.id = settings.provider;
    this.name = AI_PROVIDER_CATALOG[this.id].label;
  }

  private get apiKey() {
    return this.settings.providerApiKeys[this.id]?.trim() ?? '';
  }

  private get model() {
    return this.settings.providerModels[this.id] || AI_PROVIDER_CATALOG[this.id].defaultModel;
  }

  private get baseUrl() {
    return getProviderBaseUrl(this.settings, this.id);
  }

  getModel() {
    return createOpenAICompatibleModel({
      provider: this.id,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model,
    });
  }

  getEmbeddingModel() {
    const model = this.settings.providerEmbeddingModels?.[this.id];
    if (!model) throw new Error(`Embedding model not configured for ${this.name}`);
    return createOpenAICompatibleEmbeddingModel({
      provider: this.id,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model,
    });
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: this.id,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model,
        readerContext: { bookTitle: 'Connection Test', currentPage: 1, chunks: [] },
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    return response.ok;
  }
}

export function getAIProvider(settings: AISettings): AIProvider {
  if (!isSupportedProvider(settings.provider)) throw new Error('Unsupported provider');

  const apiKey = settings.providerApiKeys[settings.provider]?.trim();
  if (!apiKey)
    throw new Error(`API key required for ${AI_PROVIDER_CATALOG[settings.provider].label}`);

  return new BYOKProvider(settings);
}

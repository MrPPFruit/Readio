import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { SystemSettings } from '@/types/settings';

const mocks = vi.hoisted(() => ({
  setSettings: vi.fn(),
  saveSettings: vi.fn(),
  settings: {} as SystemSettings,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {} }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: mocks.settings,
    setSettings: mocks.setSettings,
    saveSettings: mocks.saveSettings,
  }),
}));

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: vi.fn(),
}));

import AIPanel from '@/components/settings/AIPanel';
import { AI_PROVIDER_ORDER, AI_PROVIDER_CATALOG } from '@/services/ai/constants';

describe('AIPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.settings = { aiSettings: DEFAULT_AI_SETTINGS } as SystemSettings;
  });

  it('shows BYOK cloud provider settings without Vercel Gateway or Ollama options', () => {
    render(<AIPanel />);

    expect(screen.getByText('Cloud AI Provider')).toBeTruthy();
    expect(screen.getByText('Show Reader AI Entrypoints')).toBeTruthy();
    expect(
      screen.getByText(
        'Controls whether the floating AI button and selected-text Ask AI action appear in the reader.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(screen.getByText('API Key')).toBeTruthy();
    expect(screen.getByText('Model')).toBeTruthy();
    expect(
      screen.getByText(
        'Your API key is stored only in this app settings and sent directly to the selected provider for AI answers.',
      ),
    ).toBeTruthy();

    for (const providerId of AI_PROVIDER_ORDER) {
      expect(screen.getByText(AI_PROVIDER_CATALOG[providerId].label)).toBeTruthy();
    }

    expect(
      document.querySelector('[data-setting-id="settings.ai.showReaderAIEntrypoints"]'),
    ).toBeTruthy();
    expect(document.querySelector('[data-setting-id="settings.ai.enableAssistant"]')).toBeTruthy();
    expect(document.querySelector('[data-setting-id="settings.ai.provider"]')).toBeTruthy();
    expect(document.querySelector('[data-setting-id="settings.ai.apiKey"]')).toBeTruthy();
    expect(document.querySelector('[data-setting-id="settings.ai.model"]')).toBeTruthy();

    expect(screen.queryByText(/Vercel/i)).toBeNull();
    expect(screen.queryByText(/AI Gateway/i)).toBeNull();
    expect(screen.queryByText(/Ollama/i)).toBeNull();
    expect(screen.queryByText(/Local/i)).toBeNull();
    expect(screen.queryByPlaceholderText('vck_...')).toBeNull();
    expect(screen.queryByPlaceholderText('http://127.0.0.1:11434')).toBeNull();
  });

  it('reveals custom base URL and custom model fields for custom OpenAI-compatible providers', () => {
    mocks.settings = {
      aiSettings: {
        ...DEFAULT_AI_SETTINGS,
        enabled: true,
        provider: 'custom-openai-compatible',
        providerApiKeys: { 'custom-openai-compatible': 'custom-key' },
      },
    } as SystemSettings;

    render(<AIPanel />);

    expect(screen.getByText('Base URL')).toBeTruthy();
    expect(screen.getByPlaceholderText('https://api.example.com/v1')).toBeTruthy();
    expect(screen.getByText('Custom Model ID')).toBeTruthy();
    expect(screen.getByText('Enable local/LAN testing proxy')).toBeTruthy();
    expect(
      screen.getByText(
        'Only for development. Allows HTTP localhost or private LAN endpoints such as CLIProxyAPI; reading context may be sent over your local network without HTTPS.',
      ),
    ).toBeTruthy();
  });

  it('saves local/LAN testing proxy mode only for custom OpenAI-compatible providers', () => {
    mocks.settings = {
      aiSettings: {
        ...DEFAULT_AI_SETTINGS,
        enabled: true,
        provider: 'custom-openai-compatible',
        providerApiKeys: {},
      },
    } as SystemSettings;

    render(<AIPanel />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Enable local\/LAN testing proxy/ }));

    expect(mocks.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiSettings: expect.objectContaining({
          provider: 'custom-openai-compatible',
          allowUnsafeCustomProviderBaseUrl: true,
        }),
      }),
    );
  });

  it('does not show local/LAN testing proxy controls for normal cloud providers', () => {
    mocks.settings = {
      aiSettings: {
        ...DEFAULT_AI_SETTINGS,
        enabled: true,
        provider: 'openrouter',
      },
    } as SystemSettings;

    render(<AIPanel />);

    expect(screen.queryByText('Enable local/LAN testing proxy')).toBeNull();
  });

  it('saves reader AI entry visibility separately from assistant availability', () => {
    mocks.settings = {
      aiSettings: {
        ...DEFAULT_AI_SETTINGS,
        enabled: false,
        showReaderAIEntrypoints: true,
      },
    } as SystemSettings;

    render(<AIPanel />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Show Reader AI Entrypoints/ }));

    expect(mocks.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiSettings: expect.objectContaining({
          enabled: false,
          showReaderAIEntrypoints: false,
        }),
      }),
    );
  });

  it('saves provider-scoped API keys without overwriting other providers', () => {
    mocks.settings = {
      aiSettings: {
        ...DEFAULT_AI_SETTINGS,
        enabled: true,
        provider: 'openrouter',
        providerApiKeys: { openai: 'existing-openai-key', openrouter: '' },
        providerModels: { openrouter: AI_PROVIDER_CATALOG.openrouter.defaultModel },
      },
    } as SystemSettings;

    render(<AIPanel />);

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'openrouter-key' } });

    expect(mocks.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiSettings: expect.objectContaining({
          providerApiKeys: {
            openai: 'existing-openai-key',
            openrouter: 'openrouter-key',
          },
        }),
      }),
    );
  });
});

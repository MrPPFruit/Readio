import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PiCheckCircle, PiWarningCircle } from 'react-icons/pi';

import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  AI_PROVIDER_CATALOG,
  AI_PROVIDER_ORDER,
  DEFAULT_AI_SETTINGS,
} from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import type { AIProviderName, AISettings } from '@/services/ai/types';
import { useSettingsStore } from '@/store/settingsStore';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

const isProviderName = (value: string): value is AIProviderName => value in AI_PROVIDER_CATALOG;

const getProviderSettings = (aiSettings: AISettings) => {
  const provider = isProviderName(aiSettings.provider)
    ? aiSettings.provider
    : DEFAULT_AI_SETTINGS.provider;
  const catalogEntry = AI_PROVIDER_CATALOG[provider];
  return {
    provider,
    apiKey: aiSettings.providerApiKeys?.[provider] ?? '',
    model: aiSettings.providerModels?.[provider] || catalogEntry.defaultModel,
    baseUrl: aiSettings.customProviderBaseUrl || catalogEntry.baseUrl,
  };
};

const AIPanel: React.FC = () => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();

  const aiSettings: AISettings = settings?.aiSettings ?? DEFAULT_AI_SETTINGS;
  const initialProviderSettings = getProviderSettings(aiSettings);

  const [showReaderAIEntrypoints, setShowReaderAIEntrypoints] = useState(
    aiSettings.showReaderAIEntrypoints,
  );
  const [enabled, setEnabled] = useState(aiSettings.enabled);
  const [provider, setProvider] = useState<AIProviderName>(initialProviderSettings.provider);
  const [apiKey, setApiKey] = useState(initialProviderSettings.apiKey);
  const [model, setModel] = useState(initialProviderSettings.model);
  const [baseUrl, setBaseUrl] = useState(initialProviderSettings.baseUrl);
  const [allowUnsafeCustomProviderBaseUrl, setAllowUnsafeCustomProviderBaseUrl] = useState(
    aiSettings.allowUnsafeCustomProviderBaseUrl ?? false,
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const providerSettings = getProviderSettings(aiSettings);
    setShowReaderAIEntrypoints(aiSettings.showReaderAIEntrypoints);
    setEnabled(aiSettings.enabled);
    setProvider(providerSettings.provider);
    setApiKey(providerSettings.apiKey);
    setModel(providerSettings.model);
    setBaseUrl(providerSettings.baseUrl);
    setAllowUnsafeCustomProviderBaseUrl(aiSettings.allowUnsafeCustomProviderBaseUrl ?? false);
  }, [aiSettings]);

  const saveAiSettings = useCallback(
    async (newAiSettings: AISettings) => {
      const currentSettings = settingsRef.current;
      if (!currentSettings) return;
      const newSettings = { ...currentSettings, aiSettings: newAiSettings };
      settingsRef.current = newSettings;
      setSettings(newSettings);
      await saveSettings(envConfig, newSettings);
    },
    [envConfig, saveSettings, setSettings],
  );

  const updateAiSettings = (updater: (current: AISettings) => AISettings) => {
    const currentAiSettings = settingsRef.current?.aiSettings ?? DEFAULT_AI_SETTINGS;
    void saveAiSettings(updater(currentAiSettings));
  };

  const handleShowEntrypointsChange = (checked: boolean) => {
    setShowReaderAIEntrypoints(checked);
    updateAiSettings((current) => ({ ...current, showReaderAIEntrypoints: checked }));
  };

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    updateAiSettings((current) => ({ ...current, enabled: checked }));
  };

  const handleProviderChange = (value: string) => {
    if (!isProviderName(value)) return;
    const nextModel =
      (settingsRef.current?.aiSettings ?? DEFAULT_AI_SETTINGS).providerModels?.[value] ||
      AI_PROVIDER_CATALOG[value].defaultModel;
    const nextApiKey =
      (settingsRef.current?.aiSettings ?? DEFAULT_AI_SETTINGS).providerApiKeys?.[value] ?? '';
    const nextBaseUrl =
      value === 'custom-openai-compatible'
        ? (settingsRef.current?.aiSettings ?? DEFAULT_AI_SETTINGS).customProviderBaseUrl ||
          AI_PROVIDER_CATALOG[value].baseUrl
        : AI_PROVIDER_CATALOG[value].baseUrl;
    setProvider(value);
    setApiKey(nextApiKey);
    setModel(nextModel);
    setBaseUrl(nextBaseUrl);
    setConnectionStatus('idle');
    updateAiSettings((current) => ({
      ...current,
      provider: value,
      providerModels: { ...current.providerModels, [value]: nextModel },
    }));
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setConnectionStatus('idle');
    updateAiSettings((current) => ({
      ...current,
      providerApiKeys: { ...current.providerApiKeys, [provider]: value },
    }));
  };

  const handleModelChange = (value: string) => {
    setModel(value);
    setConnectionStatus('idle');
    updateAiSettings((current) => ({
      ...current,
      providerModels: { ...current.providerModels, [provider]: value },
    }));
  };

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    setConnectionStatus('idle');
    updateAiSettings((current) => ({ ...current, customProviderBaseUrl: value }));
  };

  const handleUnsafeBaseUrlChange = (checked: boolean) => {
    setAllowUnsafeCustomProviderBaseUrl(checked);
    setConnectionStatus('idle');
    updateAiSettings((current) => ({ ...current, allowUnsafeCustomProviderBaseUrl: checked }));
  };

  const handleTestConnection = async () => {
    if (!enabled) return;
    setConnectionStatus('testing');
    setErrorMessage('');

    try {
      const aiProvider = getAIProvider({
        ...aiSettings,
        provider,
        providerApiKeys: { ...aiSettings.providerApiKeys, [provider]: apiKey },
        providerModels: { ...aiSettings.providerModels, [provider]: model },
        customProviderBaseUrl:
          provider === 'custom-openai-compatible' ? baseUrl : aiSettings.customProviderBaseUrl,
        allowUnsafeCustomProviderBaseUrl,
      });
      const isHealthy = await aiProvider.healthCheck();
      setConnectionStatus(isHealthy ? 'success' : 'error');
      if (!isHealthy) setErrorMessage(_('Invalid API key or connection failed'));
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage((error as Error).message || _('Connection failed'));
    }
  };

  const providerEntry = AI_PROVIDER_CATALOG[provider];
  const disabledSection = !enabled ? 'opacity-50 pointer-events-none select-none' : '';
  const isCustomProvider = provider === 'custom-openai-compatible';
  const modelPresets = providerEntry.modelPresets;

  return (
    <div className='my-4 w-full space-y-6'>
      <div className='w-full'>
        <h2 className='mb-2 font-medium'>{_('AI Assistant')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <label
              className='config-item !h-auto cursor-pointer items-start gap-3 py-3'
              data-setting-id='settings.ai.showReaderAIEntrypoints'
            >
              <span className='flex min-w-0 flex-col gap-1'>
                <span>{_('Show Reader AI Entrypoints')}</span>
                <span
                  id='settings-ai-entrypoints-help'
                  className='text-base-content/60 text-xs leading-5'
                >
                  {_(
                    'Controls whether the floating AI button and selected-text Ask AI action appear in the reader.',
                  )}
                </span>
              </span>
              <input
                type='checkbox'
                className='toggle'
                checked={showReaderAIEntrypoints}
                onChange={(event) => handleShowEntrypointsChange(event.target.checked)}
                aria-describedby='settings-ai-entrypoints-help'
              />
            </label>
            <label
              className='config-item cursor-pointer'
              data-setting-id='settings.ai.enableAssistant'
            >
              <span>{_('Enable AI Assistant')}</span>
              <input
                type='checkbox'
                className='toggle'
                checked={enabled}
                onChange={(event) => handleEnabledChange(event.target.checked)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className={clsx('w-full', disabledSection)}>
        <h2 className='mb-2 font-medium'>{_('Cloud AI Provider')}</h2>
        <p className='text-base-content/70 mb-3 text-sm'>
          {_(
            'Your API key is stored only in this app settings and sent directly to the selected provider for AI answers.',
          )}
        </p>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <label
              className='config-item !h-auto flex-col !items-start gap-2 py-3'
              data-setting-id='settings.ai.provider'
            >
              <span>{_('Provider')}</span>
              <select
                className='select select-bordered select-sm bg-base-100 text-base-content min-h-11 w-full'
                value={provider}
                onChange={(event) => handleProviderChange(event.target.value)}
                disabled={!enabled}
              >
                {AI_PROVIDER_ORDER.map((providerId) => (
                  <option key={providerId} value={providerId}>
                    {AI_PROVIDER_CATALOG[providerId].label}
                  </option>
                ))}
              </select>
            </label>

            <div
              className='config-item !h-auto flex-col !items-start gap-2 py-3'
              data-setting-id='settings.ai.apiKey'
            >
              <div className='flex w-full items-center justify-between gap-3'>
                <label htmlFor='settings-ai-api-key'>{_('API Key')}</label>
                <a
                  href={providerEntry.apiKeyUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-disabled={!enabled}
                  tabIndex={enabled ? undefined : -1}
                  className={clsx(
                    'link rounded-btn inline-flex min-h-11 items-center px-2 text-xs',
                    !enabled && 'pointer-events-none',
                  )}
                >
                  {_('Get Key')}
                </a>
              </div>
              <input
                id='settings-ai-api-key'
                type='password'
                className='input input-bordered input-sm min-h-11 w-full'
                value={apiKey}
                onChange={(event) => handleApiKeyChange(event.target.value)}
                placeholder={providerEntry.apiKeyPlaceholder}
                disabled={!enabled}
                autoComplete='off'
              />
            </div>

            {isCustomProvider && (
              <>
                <label
                  className='config-item !h-auto flex-col !items-start gap-2 py-3'
                  data-setting-id='settings.ai.customBaseUrl'
                >
                  <span>{_('Base URL')}</span>
                  <input
                    aria-label='Base URL'
                    type='url'
                    className='input input-bordered input-sm min-h-11 w-full'
                    value={baseUrl}
                    onChange={(event) => handleBaseUrlChange(event.target.value)}
                    placeholder='https://api.example.com/v1'
                    disabled={!enabled}
                  />
                </label>
                <label
                  className='config-item !h-auto cursor-pointer items-start gap-3 py-3'
                  data-setting-id='settings.ai.allowUnsafeCustomProviderBaseUrl'
                >
                  <span className='flex min-w-0 flex-col gap-1'>
                    <span>{_('Enable local/LAN testing proxy')}</span>
                    <span
                      id='settings-ai-local-proxy-help'
                      className='text-warning text-xs leading-5'
                    >
                      {_(
                        'Only for development. Allows HTTP localhost or private LAN endpoints such as CLIProxyAPI; reading context may be sent over your local network without HTTPS.',
                      )}
                    </span>
                  </span>
                  <input
                    type='checkbox'
                    className='toggle toggle-warning'
                    checked={allowUnsafeCustomProviderBaseUrl}
                    onChange={(event) => handleUnsafeBaseUrlChange(event.target.checked)}
                    disabled={!enabled}
                    aria-describedby='settings-ai-local-proxy-help'
                  />
                </label>
              </>
            )}

            <label
              className='config-item !h-auto flex-col !items-start gap-2 py-3'
              data-setting-id='settings.ai.model'
            >
              <span>{isCustomProvider ? _('Custom Model ID') : _('Model')}</span>
              {isCustomProvider ? (
                <input
                  aria-label='Model'
                  type='text'
                  className='input input-bordered input-sm min-h-11 w-full'
                  value={model}
                  onChange={(event) => handleModelChange(event.target.value)}
                  placeholder={providerEntry.defaultModel}
                  disabled={!enabled}
                />
              ) : (
                <select
                  aria-label='Model'
                  className='select select-bordered select-sm bg-base-100 text-base-content min-h-11 w-full'
                  value={model}
                  onChange={(event) => handleModelChange(event.target.value)}
                  disabled={!enabled}
                >
                  {modelPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className={clsx('w-full', disabledSection)}>
        <h2 className='mb-2 font-medium'>{_('Connection')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <button
                type='button'
                className='btn btn-outline btn-sm min-h-11'
                onClick={handleTestConnection}
                disabled={!enabled || connectionStatus === 'testing'}
              >
                {connectionStatus === 'testing' ? _('Testing') : _('Test Connection')}
              </button>
              <div aria-live='polite'>
                {connectionStatus === 'success' && (
                  <span className='text-success flex items-center gap-1 text-sm'>
                    <PiCheckCircle className='size-4 shrink-0' />
                    {_('Connected')}
                  </span>
                )}
                {connectionStatus === 'error' && (
                  <span className='text-error flex items-center gap-1 text-sm'>
                    <PiWarningCircle className='size-4 shrink-0' />
                    {errorMessage || _('Failed')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIPanel;

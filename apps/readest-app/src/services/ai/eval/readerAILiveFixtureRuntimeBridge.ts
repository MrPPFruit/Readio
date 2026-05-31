import { getCustomBaseUrlSafety } from '@/services/ai/availability';
import type { ReaderAILiveFixture } from '@/services/ai/eval/readerAILiveFixtureEvalRunner';
import type { AIProviderName, AISettings, TextChunk } from '@/services/ai/types';

export type ReaderAILiveFixtureRuntimeProviderInput = {
  apiKey?: string;
  customProviderBaseUrl?: string;
  allowUnsafeCustomProviderBaseUrl?: boolean;
};

export type ReaderAILiveFixtureRuntimeRetrievalSeedChunk = {
  id: string;
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  pageNumber: number;
  sortIndex?: number;
  endPageNumber?: number;
  chunkIndex?: number;
};

export type ReaderAILiveFixtureRuntimeRetrievalSeed = {
  bookHash: string;
  chunks: ReaderAILiveFixtureRuntimeRetrievalSeedChunk[];
};

export type ReaderAILiveFixtureRuntimeInput = {
  provider?: ReaderAILiveFixtureRuntimeProviderInput;
  retrievalSeed?: ReaderAILiveFixtureRuntimeRetrievalSeed;
  retrievalSeedPath?: string;
};

export type ReaderAILiveFixtureRuntimeBridgeResult =
  | {
      ok: true;
      settings: AISettings;
      retrievalSeed?: ReaderAILiveFixtureRuntimeRetrievalSeed;
    }
  | { ok: false; issues: string[] };

export type ReaderAILiveFixtureRuntimeSettingsParseResult =
  | { ok: true; runtime: ReaderAILiveFixtureRuntimeInput }
  | { ok: false; issues: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getOptionalTrimmedString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : undefined;
};

const getOptionalBoolean = (value: Record<string, unknown>, key: string): boolean | undefined => {
  const field = value[key];
  return typeof field === 'boolean' ? field : undefined;
};

const collectOptionalStringTypeIssue = (
  value: Record<string, unknown>,
  key: string,
  fieldName: string,
  issues: string[],
): void => {
  if (value[key] !== undefined && typeof value[key] !== 'string') {
    issues.push(`${fieldName} must be a string`);
  }
};

const collectOptionalBooleanTypeIssue = (
  value: Record<string, unknown>,
  key: string,
  fieldName: string,
  issues: string[],
): void => {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') {
    issues.push(`${fieldName} must be a boolean`);
  }
};

const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  return value.trim().toLocaleLowerCase() === 'true';
};

const mergeProviderInputs = (
  envProvider: ReaderAILiveFixtureRuntimeProviderInput | undefined,
  fileProvider: ReaderAILiveFixtureRuntimeProviderInput | undefined,
): ReaderAILiveFixtureRuntimeProviderInput | undefined => {
  const merged = { ...(envProvider ?? {}), ...(fileProvider ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

export const mergeReaderAILiveFixtureRuntimeInputs = (
  envRuntime: ReaderAILiveFixtureRuntimeInput,
  fileRuntime: ReaderAILiveFixtureRuntimeInput,
): ReaderAILiveFixtureRuntimeInput => {
  const provider = mergeProviderInputs(envRuntime.provider, fileRuntime.provider);
  const merged: ReaderAILiveFixtureRuntimeInput = {};
  if (provider) merged.provider = provider;
  merged.retrievalSeed = fileRuntime.retrievalSeed ?? envRuntime.retrievalSeed;
  merged.retrievalSeedPath = fileRuntime.retrievalSeedPath ?? envRuntime.retrievalSeedPath;
  return merged;
};

export const runtimeBridgeInputFromEnv = (
  env: Record<string, string | undefined>,
): ReaderAILiveFixtureRuntimeInput => {
  const provider: ReaderAILiveFixtureRuntimeProviderInput = {};
  const apiKey = env['READER_AI_LIVE_FIXTURE_API_KEY']?.trim();
  if (apiKey) provider.apiKey = apiKey;
  const customProviderBaseUrl = env['READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL']?.trim();
  if (customProviderBaseUrl) provider.customProviderBaseUrl = customProviderBaseUrl;
  const allowUnsafeCustomProviderBaseUrl = parseBooleanEnv(
    env['READER_AI_LIVE_FIXTURE_ALLOW_UNSAFE_LOCAL_PROXY'],
  );
  if (allowUnsafeCustomProviderBaseUrl !== undefined) {
    provider.allowUnsafeCustomProviderBaseUrl = allowUnsafeCustomProviderBaseUrl;
  }

  const runtime: ReaderAILiveFixtureRuntimeInput = {};
  if (Object.keys(provider).length > 0) runtime.provider = provider;
  const retrievalSeedPath = env['READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED']?.trim();
  if (retrievalSeedPath) runtime.retrievalSeedPath = retrievalSeedPath;
  return runtime;
};

const parseSeedChunk = (value: unknown): ReaderAILiveFixtureRuntimeRetrievalSeedChunk | null => {
  if (!isRecord(value)) return null;
  const id = getOptionalTrimmedString(value, 'id');
  const chapterTitle = getOptionalTrimmedString(value, 'chapterTitle');
  const text = getOptionalTrimmedString(value, 'text');
  const sectionIndex = value['sectionIndex'];
  const pageNumber = value['pageNumber'];
  if (!id || !chapterTitle || !text) return null;
  if (typeof sectionIndex !== 'number' || !Number.isFinite(sectionIndex)) return null;
  if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber)) return null;

  const chunk: ReaderAILiveFixtureRuntimeRetrievalSeedChunk = {
    id,
    chapterTitle,
    text,
    sectionIndex,
    pageNumber,
  };
  const sortIndex = value['sortIndex'];
  if (typeof sortIndex === 'number' && Number.isFinite(sortIndex)) chunk.sortIndex = sortIndex;
  const endPageNumber = value['endPageNumber'];
  if (typeof endPageNumber === 'number' && Number.isFinite(endPageNumber)) {
    chunk.endPageNumber = endPageNumber;
  }
  const chunkIndex = value['chunkIndex'];
  if (typeof chunkIndex === 'number' && Number.isFinite(chunkIndex)) chunk.chunkIndex = chunkIndex;
  return chunk;
};

const parseRetrievalSeed = (
  value: unknown,
): ReaderAILiveFixtureRuntimeRetrievalSeed | undefined => {
  if (!isRecord(value)) return undefined;
  const bookHash = getOptionalTrimmedString(value, 'bookHash');
  const chunksInput = value['chunks'];
  if (!bookHash || !Array.isArray(chunksInput)) return undefined;
  const chunks = chunksInput.map(parseSeedChunk).filter((chunk) => chunk !== null);
  return { bookHash, chunks };
};

export function parseReaderAILiveFixtureRuntimeSettings(
  source: string,
): ReaderAILiveFixtureRuntimeSettingsParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, issues: ['runtime settings must be valid JSON'] };
  }
  if (!isRecord(parsed)) return { ok: false, issues: ['runtime settings must be an object'] };

  const runtime: ReaderAILiveFixtureRuntimeInput = {};
  const issues: string[] = [];
  const providerInput = parsed['provider'];
  if (isRecord(providerInput)) {
    collectOptionalStringTypeIssue(providerInput, 'apiKey', 'provider.apiKey', issues);
    collectOptionalStringTypeIssue(
      providerInput,
      'customProviderBaseUrl',
      'provider.customProviderBaseUrl',
      issues,
    );
    collectOptionalBooleanTypeIssue(
      providerInput,
      'allowUnsafeCustomProviderBaseUrl',
      'provider.allowUnsafeCustomProviderBaseUrl',
      issues,
    );

    const provider: ReaderAILiveFixtureRuntimeProviderInput = {};
    const apiKey = getOptionalTrimmedString(providerInput, 'apiKey');
    if (apiKey) provider.apiKey = apiKey;
    const customProviderBaseUrl = getOptionalTrimmedString(providerInput, 'customProviderBaseUrl');
    if (customProviderBaseUrl) provider.customProviderBaseUrl = customProviderBaseUrl;
    const allowUnsafeCustomProviderBaseUrl = getOptionalBoolean(
      providerInput,
      'allowUnsafeCustomProviderBaseUrl',
    );
    if (allowUnsafeCustomProviderBaseUrl !== undefined) {
      provider.allowUnsafeCustomProviderBaseUrl = allowUnsafeCustomProviderBaseUrl;
    }
    if (Object.keys(provider).length > 0) runtime.provider = provider;
  }

  const retrievalSeed = parseRetrievalSeed(parsed['retrievalSeed']);
  if (retrievalSeed) runtime.retrievalSeed = retrievalSeed;
  collectOptionalStringTypeIssue(parsed, 'retrievalSeedPath', 'retrievalSeedPath', issues);
  const retrievalSeedPath = getOptionalTrimmedString(parsed, 'retrievalSeedPath');
  if (retrievalSeedPath) runtime.retrievalSeedPath = retrievalSeedPath;

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, runtime };
}

const buildProviderApiKeys = (
  provider: AIProviderName,
  apiKey: string | undefined,
): Partial<Record<AIProviderName, string>> => (apiKey ? { [provider]: apiKey } : {});

const buildAISettings = (
  fixture: ReaderAILiveFixture,
  providerInput: ReaderAILiveFixtureRuntimeProviderInput,
): AISettings => ({
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: fixture.settings.provider,
  providerApiKeys: buildProviderApiKeys(fixture.settings.provider, providerInput.apiKey?.trim()),
  providerModels: { [fixture.settings.provider]: fixture.settings.model },
  providerEmbeddingModels: {},
  customProviderBaseUrl: providerInput.customProviderBaseUrl?.trim() ?? '',
  allowUnsafeCustomProviderBaseUrl: providerInput.allowUnsafeCustomProviderBaseUrl,
  spoilerProtection: fixture.settings.spoilerProtection ?? true,
  maxContextChunks: fixture.settings.maxContextChunks ?? 6,
  indexingMode: 'on-demand',
});

export function buildReaderAILiveFixtureRuntimeBridge(
  fixture: ReaderAILiveFixture,
  runtime: ReaderAILiveFixtureRuntimeInput,
): ReaderAILiveFixtureRuntimeBridgeResult {
  const providerInput = runtime.provider ?? {};
  const issues: string[] = [];
  const apiKey = providerInput.apiKey?.trim();

  if (fixture.settings.provider === 'custom-openai-compatible') {
    const customBaseUrl = providerInput.customProviderBaseUrl?.trim();
    if (!customBaseUrl) issues.push('runtime custom provider base URL is required');
    const safety = customBaseUrl
      ? getCustomBaseUrlSafety(customBaseUrl, providerInput.allowUnsafeCustomProviderBaseUrl)
      : 'invalid';
    if (customBaseUrl && safety !== 'safe' && safety !== 'unsafe-local-proxy') {
      issues.push('runtime custom provider base URL is invalid');
    }
    if (!apiKey && safety === 'safe') {
      issues.push('runtime provider API key is required');
    }
  } else if (!apiKey) {
    issues.push('runtime provider API key is required');
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    settings: buildAISettings(fixture, providerInput),
    retrievalSeed: runtime.retrievalSeed,
  };
}

export const toTextChunks = (
  bookHash: string,
  seed: ReaderAILiveFixtureRuntimeRetrievalSeed,
): TextChunk[] =>
  seed.chunks.map((chunk, index) => ({
    id: chunk.id,
    bookHash,
    sectionIndex: chunk.sectionIndex,
    chapterTitle: chunk.chapterTitle,
    text: chunk.text,
    pageNumber: chunk.pageNumber,
    sortIndex: chunk.sortIndex ?? index,
    endPageNumber: chunk.endPageNumber,
    chunkIndex: chunk.chunkIndex ?? index,
  }));

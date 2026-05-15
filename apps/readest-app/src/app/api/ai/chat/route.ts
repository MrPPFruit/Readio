import dns from 'node:dns/promises';
import { isIP } from 'node:net';

import { readioFeatures } from '@/config/features';
import { AI_PROVIDER_CATALOG } from '@/services/ai/constants';
import { createOpenAICompatibleModel } from '@/services/ai/openAICompatibleModel';
import { buildSystemPrompt } from '@/services/ai/prompts';
import type { ReaderQuestionClassification } from '@/services/ai/questionRouting';
import type { AIProviderName, ScoredChunk } from '@/services/ai/types';
import { validateUserAndToken } from '@/utils/access';
import { streamText } from 'ai';
import type { ModelMessage } from 'ai';

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CONTENT_CHARS = 8000;
const MAX_TOTAL_CONTENT_CHARS = 32000;
const MAX_MODEL_CHARS = 120;
const MAX_SYSTEM_CHARS = 16000;
const MAX_READER_TITLE_CHARS = 200;
const MAX_READER_AUTHOR_CHARS = 200;
const MAX_READER_CHUNKS = 8;
const MAX_READER_CHUNK_TEXT_CHARS = 3000;
const MAX_READER_CHAPTER_CHARS = 200;
const MAX_BASE_URL_CHARS = 300;
const READER_INTENTS = [
  'selection_explanation',
  'current_recap',
  'entity_lookup',
  'chapter_summary',
  'analysis',
  'general',
] as const;
const READER_SCOPES = ['read_so_far', 'whole_book_allowed'] as const;
const DEFAULT_PROVIDER: AIProviderName = 'openrouter';

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isValidMessage = (
  message: unknown,
  allowSystemRole: boolean,
  allowArrayContent: boolean,
): message is ModelMessage => {
  if (!isPlainObject(message)) return false;
  const { role, content } = message;
  return (
    (role === 'user' || role === 'assistant' || (allowSystemRole && role === 'system')) &&
    (typeof content === 'string' || (allowArrayContent && Array.isArray(content)))
  );
};

const getMessageContentLength = (message: ModelMessage): number => {
  if (typeof message.content === 'string') return message.content.length;
  return MAX_MESSAGE_CONTENT_CHARS + 1;
};

const validateMessages = (
  messages: unknown,
  allowSystemRole: boolean,
  allowArrayContent: boolean,
): ModelMessage[] | null => {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return null;
  if (!messages.every((message) => isValidMessage(message, allowSystemRole, allowArrayContent)))
    return null;

  const validatedMessages = messages as ModelMessage[];
  let totalLength = 0;
  for (const message of validatedMessages) {
    const contentLength = getMessageContentLength(message);
    if (contentLength > MAX_MESSAGE_CONTENT_CHARS) return null;
    totalLength += contentLength;
    if (totalLength > MAX_TOTAL_CONTENT_CHARS) return null;
  }
  return validatedMessages;
};

const boundedString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  return value;
};

const isReaderQuestionClassification = (value: unknown): value is ReaderQuestionClassification =>
  isPlainObject(value) &&
  READER_INTENTS.includes(value['intent'] as (typeof READER_INTENTS)[number]) &&
  READER_SCOPES.includes(value['scope'] as (typeof READER_SCOPES)[number]);

const boundedOptionalString = (value: unknown, maxLength: number): string | null => {
  if (value === undefined) return '';
  return boundedString(value, maxLength);
};

const isSupportedProvider = (provider: string): provider is AIProviderName =>
  provider in AI_PROVIDER_CATALOG;

const isPrivateIPv4 = (address: string) => {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  const [first, second] = octets as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

const isPrivateIPv6 = (address: string) => {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('::ffff:0:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
};

const isPrivateAddress = (address: string) => {
  const type = isIP(address);
  if (type === 4) return isPrivateIPv4(address);
  if (type === 6) return isPrivateIPv6(address);
  return true;
};

const isValidCustomBaseUrl = async (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    if (isIP(host)) return !isPrivateAddress(host);
    const addresses = await dns.lookup(host, { all: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
};

const validateReaderContext = (readerContext: unknown) => {
  if (!isPlainObject(readerContext)) return null;

  const bookTitle = boundedString(readerContext['bookTitle'], MAX_READER_TITLE_CHARS);
  const authorName = boundedOptionalString(readerContext['authorName'], MAX_READER_AUTHOR_CHARS);
  const currentPage = readerContext['currentPage'];
  const spoilerProtection = readerContext['spoilerProtection'];
  const classification = readerContext['classification'];
  const chunks = readerContext['chunks'];

  if (
    !bookTitle ||
    authorName === null ||
    typeof currentPage !== 'number' ||
    !Number.isFinite(currentPage)
  ) {
    return null;
  }
  if (spoilerProtection !== undefined && typeof spoilerProtection !== 'boolean') return null;
  const effectiveSpoilerProtection = spoilerProtection !== false;
  const expectedScope = effectiveSpoilerProtection ? 'read_so_far' : 'whole_book_allowed';
  if (
    classification !== undefined &&
    (!isReaderQuestionClassification(classification) || classification.scope !== expectedScope)
  ) {
    return null;
  }
  if (!Array.isArray(chunks) || chunks.length > MAX_READER_CHUNKS) return null;

  const validatedChunks: ScoredChunk[] = [];
  for (const chunk of chunks) {
    if (!isPlainObject(chunk)) return null;
    const text = boundedString(chunk['text'], MAX_READER_CHUNK_TEXT_CHARS);
    const chapterTitle = boundedOptionalString(chunk['chapterTitle'], MAX_READER_CHAPTER_CHARS);
    const sectionIndex = chunk['sectionIndex'];
    const pageNumber = chunk['pageNumber'];
    if (
      text === null ||
      chapterTitle === null ||
      typeof sectionIndex !== 'number' ||
      !Number.isFinite(sectionIndex) ||
      typeof pageNumber !== 'number' ||
      !Number.isFinite(pageNumber)
    ) {
      return null;
    }
    validatedChunks.push({
      id: '',
      bookHash: '',
      sectionIndex,
      chapterTitle,
      text,
      pageNumber,
      score: 0,
      searchMethod: 'hybrid',
    });
  }

  return {
    bookTitle,
    authorName,
    currentPage: Math.max(1, Math.floor(currentPage)),
    spoilerProtection: effectiveSpoilerProtection,
    classification,
    chunks: validatedChunks,
  };
};

export async function POST(req: Request): Promise<Response> {
  if (!readioFeatures.ai && !readioFeatures.readerAI) {
    return Response.json({ error: 'Feature disabled' }, { status: 404 });
  }

  try {
    const unauthenticatedReaderAI = readioFeatures.readerAI && !readioFeatures.auth;
    const authRequired = !unauthenticatedReaderAI;
    if (authRequired) {
      const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
      if (!user || !token) {
        return Response.json({ error: 'Not authenticated' }, { status: 403 });
      }
    }

    const body = await req.json();
    if (!isPlainObject(body)) return jsonError('Invalid request body', 400);

    const { apiKey, readerContext } = body;
    const providerValue =
      boundedOptionalString(body['provider'], MAX_MODEL_CHARS) || DEFAULT_PROVIDER;
    if (!isSupportedProvider(providerValue)) return jsonError('Unsupported provider', 400);
    const model = boundedOptionalString(body['model'], MAX_MODEL_CHARS);
    if (model === null) return jsonError('Invalid model', 400);
    const baseUrl = boundedOptionalString(body['baseUrl'], MAX_BASE_URL_CHARS);
    if (baseUrl === null) return jsonError('Invalid base URL', 400);
    const effectiveBaseUrl =
      providerValue === 'custom-openai-compatible'
        ? baseUrl
        : AI_PROVIDER_CATALOG[providerValue].baseUrl;
    if (providerValue === 'custom-openai-compatible' && !effectiveBaseUrl) {
      return jsonError('Invalid base URL', 400);
    }
    if (
      providerValue === 'custom-openai-compatible' &&
      !(await isValidCustomBaseUrl(effectiveBaseUrl))
    ) {
      return jsonError('Invalid base URL', 400);
    }

    const messages = validateMessages(
      body['messages'],
      !unauthenticatedReaderAI,
      !unauthenticatedReaderAI,
    );
    if (!messages) return jsonError('Invalid messages', 400);

    if (apiKey !== undefined && typeof apiKey !== 'string') {
      return jsonError('Invalid API key', 400);
    }

    const providerApiKey = unauthenticatedReaderAI ? apiKey : apiKey;
    if (!providerApiKey) return jsonError('API key required', 401);

    let system: string;
    if (unauthenticatedReaderAI) {
      if (body['system'] !== undefined) return jsonError('Invalid system prompt', 400);
      const validatedReaderContext = validateReaderContext(readerContext);
      if (!validatedReaderContext) return jsonError('Invalid reader context', 400);
      system = buildSystemPrompt(
        validatedReaderContext.bookTitle,
        validatedReaderContext.authorName,
        validatedReaderContext.chunks,
        validatedReaderContext.currentPage,
        validatedReaderContext.spoilerProtection,
        validatedReaderContext.classification,
      );
    } else {
      const providedSystem = body['system'];
      if (providedSystem !== undefined && typeof providedSystem !== 'string') {
        return jsonError('Invalid system prompt', 400);
      }
      if (typeof providedSystem === 'string' && providedSystem.length > MAX_SYSTEM_CHARS) {
        return jsonError('Invalid system prompt', 400);
      }
      system = providedSystem || 'You are a helpful assistant.';
    }

    const languageModel = createOpenAICompatibleModel({
      provider: providerValue,
      apiKey: providerApiKey,
      baseUrl: effectiveBaseUrl,
      model: model || AI_PROVIDER_CATALOG[providerValue].defaultModel,
    });

    const result = streamText({
      model: languageModel,
      system,
      messages,
    });

    return result.toTextStreamResponse();
  } catch {
    return jsonError('Provider request failed', 502);
  }
}

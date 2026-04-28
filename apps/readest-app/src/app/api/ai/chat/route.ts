import { readioFeatures } from '@/config/features';
import { buildSystemPrompt } from '@/services/ai/prompts';
import type { ScoredChunk } from '@/services/ai/types';
import { validateUserAndToken } from '@/utils/access';
import { streamText, createGateway } from 'ai';
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
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

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

const boundedOptionalString = (value: unknown, maxLength: number): string | null => {
  if (value === undefined) return '';
  return boundedString(value, maxLength);
};

const validateReaderContext = (readerContext: unknown) => {
  if (!isPlainObject(readerContext)) return null;

  const bookTitle = boundedString(readerContext['bookTitle'], MAX_READER_TITLE_CHARS);
  const authorName = boundedOptionalString(readerContext['authorName'], MAX_READER_AUTHOR_CHARS);
  const currentPage = readerContext['currentPage'];
  const spoilerProtection = readerContext['spoilerProtection'];
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
    spoilerProtection: spoilerProtection !== false,
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
    const model = boundedOptionalString(body['model'], MAX_MODEL_CHARS);
    if (model === null) return jsonError('Invalid model', 400);

    const messages = validateMessages(
      body['messages'],
      !unauthenticatedReaderAI,
      !unauthenticatedReaderAI,
    );
    if (!messages) return jsonError('Invalid messages', 400);

    if (apiKey !== undefined && typeof apiKey !== 'string') {
      return jsonError('Invalid API key', 400);
    }

    const gatewayApiKey = unauthenticatedReaderAI
      ? apiKey
      : apiKey || process.env['AI_GATEWAY_API_KEY'];
    if (!gatewayApiKey) {
      return jsonError('API key required', 401);
    }

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

    const gateway = createGateway({ apiKey: gatewayApiKey });
    const languageModel = gateway(model || DEFAULT_MODEL);

    const result = streamText({
      model: languageModel,
      system,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: `Chat failed: ${errorMessage}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

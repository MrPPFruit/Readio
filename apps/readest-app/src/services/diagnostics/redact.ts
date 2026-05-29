import type { DiagnosticErrorInfo, DiagnosticMetadata, DiagnosticMetadataValue } from './types';

const REDACTED = '[REDACTED]';
const LOCAL_PATH = '[LOCAL_PATH]';
const URL = '[URL]';
const FILENAME = '[FILENAME]';
const TRUNCATED = '…[truncated]';
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 5;
const MAX_OBJECT_KEYS = 40;

const CONTENT_KEYS = new Set([
  'answer',
  'answers',
  'bookcontent',
  'booktext',
  'chaptercontent',
  'chunktext',
  'content',
  'contexttext',
  'entityname',
  'fact',
  'facts',
  'facttext',
  'highlightquote',
  'messages',
  'previewtext',
  'prompt',
  'prompts',
  'question',
  'quote',
  'quotes',
  'rawmessages',
  'rawprompt',
  'response',
  'selectedtext',
  'selectiontext',
  'snippet',
  'sourcetext',
  'text',
  'userprompt',
]);

const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'clientsecret',
  'password',
  'passwd',
  'pwd',
  'refreshtoken',
  'secret',
  'token',
]);

const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[-_\s]*key|apikey|token|password|passwd|pwd|secret|access[-_\s]*token|refresh[-_\s]*token)\b\s*[:=]\s*(["']?)[^\s,;&"']+\2/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b/g;
const LONG_SECRET_PATTERN =
  /\b(?=[A-Za-z0-9+/=_-]*[A-Za-z])(?=[A-Za-z0-9+/=_-]*\d)[A-Za-z0-9+/=_-]{28,}\b/g;
const URL_PATTERN = /https?:\/\/[^\s)'"`>,;]+/gi;
const LOCAL_PATH_PATTERN = /\/(Users|private|var|data|storage)(?:\/[^\s)'"`>,;:]*)+/g;
const WINDOWS_LOCAL_PATH_PATTERN =
  /\b[A-Za-z]:\\(?:Users|Documents and Settings|ProgramData|data|storage)(?:\\[^\s)'"`>,;:]*)+/g;
const BOOK_FILENAME_PATTERN = /\b[^\s\\/:'"`>,;]+\.(epub|mobi|azw3?|fb2|zip|cbz|pdf|txt)\b/gi;

export const redactDiagnosticString = (value: string, maxLength = 180): string => {
  try {
    const safeMaxLength = Math.max(0, Math.floor(maxLength));
    let redacted = value
      .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
      .replace(SK_KEY_PATTERN, REDACTED)
      .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=${REDACTED}`)
      .replace(LONG_SECRET_PATTERN, REDACTED)
      .replace(URL_PATTERN, URL)
      .replace(LOCAL_PATH_PATTERN, LOCAL_PATH)
      .replace(WINDOWS_LOCAL_PATH_PATTERN, LOCAL_PATH)
      .replace(BOOK_FILENAME_PATTERN, FILENAME);

    if (redacted.length > safeMaxLength) {
      redacted = `${redacted.slice(0, safeMaxLength)}${TRUNCATED}`;
    }

    return redacted;
  } catch {
    return '[UNREDACTABLE_STRING]';
  }
};

export const redactDiagnosticMetadata = (metadata: Record<string, unknown>): DiagnosticMetadata => {
  try {
    const seen = new WeakSet<object>();
    const redacted = redactObject(metadata, 0, seen);
    return redacted && !Array.isArray(redacted) && typeof redacted === 'object' ? redacted : {};
  } catch {
    return {};
  }
};

export const redactDiagnosticError = (error: unknown): DiagnosticErrorInfo => {
  try {
    if (error instanceof Error) {
      return {
        name: redactDiagnosticString(error.name || 'Error'),
        message: redactDiagnosticString(error.message || ''),
        ...(typeof error.stack === 'string'
          ? { stack: redactDiagnosticString(error.stack, 1200) }
          : {}),
      };
    }

    if (isRecord(error)) {
      return {
        name: redactDiagnosticString(stringFromUnknown(error['name'], 'Error')),
        message: redactDiagnosticString(stringFromUnknown(error['message'], 'Unknown error')),
        ...(typeof error['stack'] === 'string'
          ? { stack: redactDiagnosticString(error['stack'], 1200) }
          : {}),
      };
    }

    return {
      name: 'Error',
      message: redactDiagnosticString(stringFromUnknown(error, 'Unknown error')),
    };
  } catch {
    return {
      name: 'Error',
      message: 'Unknown error',
    };
  }
};

const redactObject = (
  value: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): DiagnosticMetadata => {
  if (depth >= MAX_DEPTH || seen.has(value)) {
    return {};
  }

  seen.add(value);
  const result: DiagnosticMetadata = {};

  for (const [key, child] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    const normalizedKey = normalizeMetadataKey(key);

    if (CONTENT_KEYS.has(normalizedKey)) {
      continue;
    }

    if (SENSITIVE_KEYS.has(normalizedKey)) {
      result[key] = REDACTED;
      continue;
    }

    const redacted = redactValue(child, depth + 1, seen);
    if (redacted !== undefined) {
      result[key] = redacted;
    }
  }

  seen.delete(value);
  return result;
};

const redactValue = (
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): DiagnosticMetadataValue | undefined => {
  try {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      return redactDiagnosticString(value);
    }

    if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
      return redactDiagnosticString(String(value));
    }

    if (Array.isArray(value)) {
      if (depth >= MAX_DEPTH || seen.has(value)) {
        return [];
      }

      seen.add(value);
      const result = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => redactValue(item, depth + 1, seen))
        .filter((item): item is DiagnosticMetadataValue => item !== undefined);
      seen.delete(value);
      return result;
    }

    if (isRecord(value)) {
      return redactObject(value, depth, seen);
    }

    if (value === undefined) {
      return undefined;
    }

    return redactDiagnosticString(String(value));
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeMetadataKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const stringFromUnknown = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return String(value);
  } catch {
    return fallback;
  }
};

# Readio Privacy-Safe Diagnostics Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local, bounded, privacy-safe diagnostics logs so Readio crashes, AI failures, import/download bugs, and search/citation issues can be diagnosed without exposing book text, full prompts, AI responses, or API keys.

**Architecture:** Implement a small diagnostics service under `src/services/diagnostics/` with explicit redaction, bounded JSONL log storage in `BaseDir.Log`, global browser error capture initialized from `Providers`, and manual export/clear actions exposed from the existing Advanced Settings menu. Instrument only high-value failure and lifecycle points with structured metadata, not user content.

**Tech Stack:** TypeScript strict mode, React, Tauri `BaseDirectory.AppLog` through the existing `AppService`/`FileSystem` abstraction, Vitest/jsdom tests, existing `MenuItem`/settings patterns.

---

## Privacy and product rules

1. Logs are local-only. No network upload, no telemetry coupling.
2. Never log:
   - book original text, snippets, selected text, citation preview text, highlight quote text
   - full user questions/prompts
   - full AI answers/responses
   - API keys, bearer tokens, passwords, URLs with tokens, local full paths when avoidable
3. Allowed metadata:
   - event name, severity, timestamp, route/module/stage
   - provider/model names after redaction
   - counts, durations, booleans, status strings
   - stable hashes or short previews produced by the redactor, not raw content
   - error name/message/stack after redaction and truncation
4. Storage is bounded:
   - append JSONL to `diagnostics/current.jsonl`
   - rotate to `diagnostics/previous.jsonl` when current exceeds `250_000` bytes
   - keep only current + previous
5. Capture should never crash the app. All logger failures are swallowed after a guarded `console.warn` in development-style code paths only if already present.
6. Default setting: diagnostics enabled by default for local crash/error metadata because it never leaves device; user can disable it and clear logs.

---

## File structure

- Create: `apps/readest-app/src/services/diagnostics/types.ts`
  - Defines log levels, event shape, settings shape, export summary types.
- Create: `apps/readest-app/src/services/diagnostics/redact.ts`
  - Pure redaction helpers for strings, errors, objects, paths, and metadata.
- Create: `apps/readest-app/src/services/diagnostics/logger.ts`
  - Singleton-style diagnostics logger with `configureDiagnosticsLogger`, `logDiagnosticEvent`, `logDiagnosticError`, `exportDiagnosticsBundle`, `clearDiagnosticsLogs`, `installGlobalDiagnosticsHandlers`.
- Modify: `apps/readest-app/src/types/settings.ts:81-132`
  - Add `DiagnosticsSettings` and `diagnostics: DiagnosticsSettings` to `SystemSettings`.
- Modify: `apps/readest-app/src/services/constants.ts`
  - Add `diagnostics` default under `DEFAULT_SYSTEM_SETTINGS`.
- Modify: `apps/readest-app/src/services/settingsService.ts:116-160`
  - Merge diagnostics defaults when loading existing settings.
- Modify: `apps/readest-app/src/components/Providers.tsx:51-64`
  - Configure logger after settings load; install global unhandled error/rejection handlers once.
- Modify: `apps/readest-app/src/app/library/components/SettingsMenu.tsx:47-478`
  - Add Advanced Settings entries: diagnostics toggle, export logs, clear logs.
- Modify: `apps/readest-app/src/app/reader/components/ai/ReaderAIAssistant.tsx`
  - Log sanitized Reader AI lifecycle/failure events.
- Modify: `apps/readest-app/src/services/ai/readerChatService.ts`
  - Log sanitized retrieval/index/generation failure metadata only.
- Modify: `apps/readest-app/src/services/ai/citationVerifier.ts`
  - Log sanitized citation refinement failure/timeout metadata only.
- Modify: `apps/readest-app/src/app/library/components/AIBookSearchDialog.tsx`
  - Log AI book search and download/import failures with sanitized metadata.
- Modify: `apps/readest-app/src/app/library/page.tsx`
  - Log import/download failures with sanitized metadata.
- Create tests:
  - `apps/readest-app/src/__tests__/services/diagnostics/redact.test.ts`
  - `apps/readest-app/src/__tests__/services/diagnostics/logger.test.ts`
  - `apps/readest-app/src/__tests__/services/settings-diagnostics.test.ts`
  - `apps/readest-app/src/__tests__/app/library/settings-menu-diagnostics.test.tsx`

---

### Task 1: Redaction primitives

**Files:**

- Create: `apps/readest-app/src/services/diagnostics/types.ts`
- Create: `apps/readest-app/src/services/diagnostics/redact.ts`
- Test: `apps/readest-app/src/__tests__/services/diagnostics/redact.test.ts`

- [ ] **Step 1: Write the failing redaction tests**

Create `apps/readest-app/src/__tests__/services/diagnostics/redact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  redactDiagnosticError,
  redactDiagnosticMetadata,
  redactDiagnosticString,
} from '@/services/diagnostics/redact';

describe('diagnostics redaction', () => {
  it('redacts API keys, bearer tokens, and long secret-looking values', () => {
    const input =
      'Authorization: Bearer sk-1234567890abcdefghijklmnopqrstuvwxyz apiKey=abcd1234abcd1234abcd1234abcd1234';

    const redacted = redactDiagnosticString(input);

    expect(redacted).not.toContain('sk-1234567890abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('abcd1234abcd1234abcd1234abcd1234');
    expect(redacted).toContain('[REDACTED]');
  });

  it('truncates long user content instead of preserving raw text', () => {
    const input = '这是一段很长的用户问题或原文内容'.repeat(30);

    const redacted = redactDiagnosticString(input, 80);

    expect(redacted.length).toBeLessThanOrEqual(95);
    expect(redacted).toContain('…');
  });

  it('drops known content-bearing metadata keys', () => {
    const metadata = redactDiagnosticMetadata({
      question: '用户完整问题不能写入日志',
      answer: 'AI 完整回答不能写入日志',
      previewText: '原文预览不能写入日志',
      selectionText: '选中的原文不能写入日志',
      provider: 'openai',
      durationMs: 1200,
      sourceCount: 3,
      nested: {
        prompt: '完整 prompt 不能写入日志',
        stage: 'retrieval',
      },
    });

    expect(metadata).toEqual({
      provider: 'openai',
      durationMs: 1200,
      sourceCount: 3,
      nested: {
        stage: 'retrieval',
      },
    });
  });

  it('redacts errors with safe name, message, and stack', () => {
    const error = new Error('failed with key sk-abcdefghijklmnopqrstuvwxyz123456');
    error.stack = 'Error: failed\n    at askAI (/Users/alice/private/book.txt:10:2)';

    const redacted = redactDiagnosticError(error);

    expect(redacted.name).toBe('Error');
    expect(redacted.message).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(redacted.message).toContain('[REDACTED]');
    expect(redacted.stack).not.toContain('/Users/alice/private/book.txt');
  });
});
```

- [ ] **Step 2: Run the redaction test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/diagnostics/redact.test.ts
```

Expected: FAIL because `@/services/diagnostics/redact` does not exist.

- [ ] **Step 3: Add diagnostics types**

Create `apps/readest-app/src/services/diagnostics/types.ts`:

```ts
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticsSettings {
  enabled: boolean;
  includeDebugEvents: boolean;
}

export interface DiagnosticErrorInfo {
  name: string;
  message: string;
  stack?: string;
}

export type DiagnosticMetadataValue =
  | string
  | number
  | boolean
  | null
  | DiagnosticMetadataValue[]
  | { [key: string]: DiagnosticMetadataValue };

export type DiagnosticMetadata = Record<string, DiagnosticMetadataValue>;

export interface DiagnosticLogEvent {
  timestamp: string;
  level: DiagnosticLevel;
  event: string;
  metadata?: DiagnosticMetadata;
  error?: DiagnosticErrorInfo;
}

export interface DiagnosticsExportSummary {
  currentBytes: number;
  previousBytes: number;
  exportedAt: string;
}
```

- [ ] **Step 4: Add redaction implementation**

Create `apps/readest-app/src/services/diagnostics/redact.ts`:

```ts
import type { DiagnosticErrorInfo, DiagnosticMetadata, DiagnosticMetadataValue } from './types';

const DEFAULT_MAX_STRING_LENGTH = 180;
const MAX_STACK_LENGTH = 1_500;

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\b[A-Za-z0-9_-]{32,}\b/g,
];

const contentBearingKeys = new Set([
  'answer',
  'answers',
  'bookText',
  'chunkText',
  'content',
  'contextText',
  'highlightQuote',
  'messages',
  'previewText',
  'prompt',
  'prompts',
  'question',
  'quote',
  'quotes',
  'response',
  'selectionText',
  'snippet',
  'sourceText',
  'text',
]);

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…[truncated:${value.length}]`;
}

function redactSecrets(value: string): string {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, '[REDACTED]'), value);
}

function redactLocalPaths(value: string): string {
  return value.replace(
    /(?:file:\/\/)?\/(Users|private|var|data|storage)\/[^\s)]+/gi,
    '[LOCAL_PATH]',
  );
}

export function redactDiagnosticString(
  value: string,
  maxLength = DEFAULT_MAX_STRING_LENGTH,
): string {
  return truncate(redactLocalPaths(redactSecrets(value)), maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function redactValue(value: unknown, depth: number): DiagnosticMetadataValue | undefined {
  if (depth > 4) return '[MAX_DEPTH]';
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactDiagnosticString(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => redactValue(item, depth + 1))
      .filter((item): item is DiagnosticMetadataValue => item !== undefined);
  }
  if (!isRecord(value)) return String(value);

  const result: DiagnosticMetadata = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (contentBearingKeys.has(key)) continue;
    const redacted = redactValue(childValue, depth + 1);
    if (redacted !== undefined) result[key] = redacted;
  }
  return result;
}

export function redactDiagnosticMetadata(metadata: Record<string, unknown>): DiagnosticMetadata {
  const redacted = redactValue(metadata, 0);
  return isRecord(redacted) ? (redacted as DiagnosticMetadata) : {};
}

export function redactDiagnosticError(error: unknown): DiagnosticErrorInfo {
  if (error instanceof Error) {
    return {
      name: redactDiagnosticString(error.name || 'Error', 80),
      message: redactDiagnosticString(error.message || 'Unknown error'),
      ...(error.stack ? { stack: redactDiagnosticString(error.stack, MAX_STACK_LENGTH) } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: redactDiagnosticString(String(error)),
  };
}
```

- [ ] **Step 5: Run the redaction test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/diagnostics/redact.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/readest-app/src/services/diagnostics/types.ts apps/readest-app/src/services/diagnostics/redact.ts apps/readest-app/src/__tests__/services/diagnostics/redact.test.ts
git commit -m "feat(diagnostics): add privacy redaction primitives"
```

---

### Task 2: Local bounded diagnostics logger

**Files:**

- Create: `apps/readest-app/src/services/diagnostics/logger.ts`
- Test: `apps/readest-app/src/__tests__/services/diagnostics/logger.test.ts`

- [ ] **Step 1: Write the failing logger tests**

Create `apps/readest-app/src/__tests__/services/diagnostics/logger.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppService, BaseDir, FileInfo, FileItem } from '@/types/system';
import {
  clearDiagnosticsLogs,
  configureDiagnosticsLogger,
  exportDiagnosticsBundle,
  installGlobalDiagnosticsHandlers,
  logDiagnosticError,
  logDiagnosticEvent,
  resetDiagnosticsLoggerForTests,
} from '@/services/diagnostics/logger';

class MemoryAppService {
  files = new Map<string, string>();
  saved: { filename: string; content: string } | null = null;
  isMobileApp = true;
  isAndroidApp = true;
  appPlatform = 'tauri';
  osPlatform = 'android';

  key(path: string, base: BaseDir) {
    return `${base}:${path}`;
  }

  async readFile(path: string, base: BaseDir): Promise<string> {
    const value = this.files.get(this.key(path, base));
    if (value === undefined) throw new Error('missing file');
    return value;
  }

  async writeFile(
    path: string,
    base: BaseDir,
    content: string | ArrayBuffer | File,
  ): Promise<void> {
    this.files.set(this.key(path, base), String(content));
  }

  async deleteFile(path: string, base: BaseDir): Promise<void> {
    this.files.delete(this.key(path, base));
  }

  async exists(path: string, base: BaseDir): Promise<boolean> {
    return this.files.has(this.key(path, base));
  }

  async createDir(): Promise<void> {}

  async saveFile(filename: string, content: string | ArrayBuffer): Promise<boolean> {
    this.saved = { filename, content: String(content) };
    return true;
  }

  async readDirectory(): Promise<FileItem[]> {
    return [];
  }

  async resolveFilePath(path: string): Promise<string> {
    return path;
  }

  async getPrefix(): Promise<string> {
    return '';
  }

  async stats(path: string, base: BaseDir): Promise<FileInfo> {
    const size = this.files.get(this.key(path, base))?.length ?? 0;
    return { isFile: true, isDirectory: false, size, mtime: null, atime: null, birthtime: null };
  }
}

function appService(): AppService {
  return new MemoryAppService() as unknown as AppService;
}

describe('diagnostics logger', () => {
  beforeEach(() => {
    resetDiagnosticsLoggerForTests();
  });

  it('writes sanitized JSONL events when enabled', async () => {
    const service = appService();
    configureDiagnosticsLogger(service, { enabled: true, includeDebugEvents: false });

    await logDiagnosticEvent('reader_ai.ask_failed', 'error', {
      provider: 'openai',
      question: 'raw question must not be logged',
      sourceCount: 2,
    });

    const content = await service.readFile('diagnostics/current.jsonl', 'Log', 'text');
    const [event] = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(event?.event).toBe('reader_ai.ask_failed');
    expect(JSON.stringify(event)).not.toContain('raw question must not be logged');
    expect(JSON.stringify(event)).toContain('sourceCount');
  });

  it('does not write debug events unless debug logging is enabled', async () => {
    const service = appService();
    configureDiagnosticsLogger(service, { enabled: true, includeDebugEvents: false });

    await logDiagnosticEvent('debug.event', 'debug', { stage: 'test' });

    expect(await service.exists('diagnostics/current.jsonl', 'Log')).toBe(false);
  });

  it('does not write anything when disabled', async () => {
    const service = appService();
    configureDiagnosticsLogger(service, { enabled: false, includeDebugEvents: false });

    await logDiagnosticError('reader_ai.failed', new Error('boom'), { stage: 'ask' });

    expect(await service.exists('diagnostics/current.jsonl', 'Log')).toBe(false);
  });

  it('exports current and previous logs through appService.saveFile', async () => {
    const service = appService();
    configureDiagnosticsLogger(service, { enabled: true, includeDebugEvents: false });
    await service.writeFile('diagnostics/previous.jsonl', 'Log', '{"event":"old"}\n');
    await logDiagnosticEvent('new.event', 'info', { ok: true });

    const exported = await exportDiagnosticsBundle();

    expect(exported).toBe(true);
    const memory = service as unknown as MemoryAppService;
    expect(memory.saved?.filename).toMatch(/^readio-diagnostics-/);
    expect(memory.saved?.content).toContain('"event":"old"');
    expect(memory.saved?.content).toContain('new.event');
  });

  it('clears current and previous logs', async () => {
    const service = appService();
    configureDiagnosticsLogger(service, { enabled: true, includeDebugEvents: false });
    await service.writeFile('diagnostics/current.jsonl', 'Log', 'current');
    await service.writeFile('diagnostics/previous.jsonl', 'Log', 'previous');

    await clearDiagnosticsLogs();

    expect(await service.exists('diagnostics/current.jsonl', 'Log')).toBe(false);
    expect(await service.exists('diagnostics/previous.jsonl', 'Log')).toBe(false);
  });

  it('installs global error handlers only once', async () => {
    const service = appService();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    configureDiagnosticsLogger(service, { enabled: true, includeDebugEvents: false });

    installGlobalDiagnosticsHandlers();
    installGlobalDiagnosticsHandlers();

    expect(addEventListenerSpy.mock.calls.filter(([event]) => event === 'error')).toHaveLength(1);
    expect(
      addEventListenerSpy.mock.calls.filter(([event]) => event === 'unhandledrejection'),
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the logger test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/diagnostics/logger.test.ts
```

Expected: FAIL because logger module does not exist.

- [ ] **Step 3: Add logger implementation**

Create `apps/readest-app/src/services/diagnostics/logger.ts`:

```ts
import type { AppService } from '@/types/system';
import { redactDiagnosticError, redactDiagnosticMetadata } from './redact';
import type { DiagnosticLevel, DiagnosticLogEvent, DiagnosticsSettings } from './types';

const DIAGNOSTICS_DIR = 'diagnostics';
const CURRENT_LOG_FILE = `${DIAGNOSTICS_DIR}/current.jsonl`;
const PREVIOUS_LOG_FILE = `${DIAGNOSTICS_DIR}/previous.jsonl`;
const MAX_CURRENT_LOG_BYTES = 250_000;

let appService: AppService | null = null;
let settings: DiagnosticsSettings = { enabled: false, includeDebugEvents: false };
let handlersInstalled = false;
let writeChain = Promise.resolve();

function shouldWrite(level: DiagnosticLevel): boolean {
  return settings.enabled && (level !== 'debug' || settings.includeDebugEvents);
}

async function readTextFile(path: string): Promise<string> {
  if (!appService || !(await appService.exists(path, 'Log'))) return '';
  return String(await appService.readFile(path, 'Log', 'text'));
}

async function rotateIfNeeded(nextLineLength: number): Promise<void> {
  if (!appService) return;
  const current = await readTextFile(CURRENT_LOG_FILE);
  if (current.length + nextLineLength <= MAX_CURRENT_LOG_BYTES) return;

  if (current) {
    await appService.writeFile(PREVIOUS_LOG_FILE, 'Log', current);
  }
  if (await appService.exists(CURRENT_LOG_FILE, 'Log')) {
    await appService.deleteFile(CURRENT_LOG_FILE, 'Log');
  }
}

async function appendLine(line: string): Promise<void> {
  if (!appService) return;
  await appService.createDir(DIAGNOSTICS_DIR, 'Log', true);
  await rotateIfNeeded(line.length);
  const current = await readTextFile(CURRENT_LOG_FILE);
  await appService.writeFile(CURRENT_LOG_FILE, 'Log', `${current}${line}`);
}

function enqueueWrite(event: DiagnosticLogEvent): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;
  writeChain = writeChain.then(() => appendLine(line)).catch(() => undefined);
  return writeChain;
}

export function configureDiagnosticsLogger(
  nextAppService: AppService,
  nextSettings: DiagnosticsSettings,
): void {
  appService = nextAppService;
  settings = nextSettings;
}

export async function logDiagnosticEvent(
  event: string,
  level: DiagnosticLevel,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!shouldWrite(level)) return;
  await enqueueWrite({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(metadata ? { metadata: redactDiagnosticMetadata(metadata) } : {}),
  });
}

export async function logDiagnosticError(
  event: string,
  error: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!shouldWrite('error')) return;
  await enqueueWrite({
    timestamp: new Date().toISOString(),
    level: 'error',
    event,
    ...(metadata ? { metadata: redactDiagnosticMetadata(metadata) } : {}),
    error: redactDiagnosticError(error),
  });
}

export async function clearDiagnosticsLogs(): Promise<void> {
  if (!appService) return;
  if (await appService.exists(CURRENT_LOG_FILE, 'Log'))
    await appService.deleteFile(CURRENT_LOG_FILE, 'Log');
  if (await appService.exists(PREVIOUS_LOG_FILE, 'Log'))
    await appService.deleteFile(PREVIOUS_LOG_FILE, 'Log');
}

export async function exportDiagnosticsBundle(): Promise<boolean> {
  if (!appService) return false;
  const previous = await readTextFile(PREVIOUS_LOG_FILE);
  const current = await readTextFile(CURRENT_LOG_FILE);
  const exportedAt = new Date().toISOString();
  const bundle = JSON.stringify(
    {
      exportedAt,
      app: 'Readio',
      privacy:
        'Local diagnostics export. Book text, full prompts, AI responses, and secrets are redacted before writing.',
      previousLog: previous,
      currentLog: current,
    },
    null,
    2,
  );
  const safeTimestamp = exportedAt.replace(/[:.]/g, '-');
  return appService.saveFile(`readio-diagnostics-${safeTimestamp}.json`, bundle, {
    mimeType: 'application/json',
  });
}

export function installGlobalDiagnosticsHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    void logDiagnosticError('app.unhandled_error', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    void logDiagnosticError('app.unhandled_rejection', event.reason);
  });
}

export function resetDiagnosticsLoggerForTests(): void {
  appService = null;
  settings = { enabled: false, includeDebugEvents: false };
  handlersInstalled = false;
  writeChain = Promise.resolve();
}
```

- [ ] **Step 4: Run the logger test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/diagnostics/logger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/diagnostics/logger.ts apps/readest-app/src/__tests__/services/diagnostics/logger.test.ts
git commit -m "feat(diagnostics): add local bounded logger"
```

---

### Task 3: Settings defaults and migration

**Files:**

- Modify: `apps/readest-app/src/types/settings.ts`
- Modify: `apps/readest-app/src/services/constants.ts`
- Modify: `apps/readest-app/src/services/settingsService.ts`
- Test: `apps/readest-app/src/__tests__/services/settings-diagnostics.test.ts`

- [ ] **Step 1: Write the failing settings test**

Create `apps/readest-app/src/__tests__/services/settings-diagnostics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { loadSettings } from '@/services/settingsService';
import type { BaseDir, FileInfo, FileItem, FileSystem, ResolvedPath } from '@/types/system';

class MemoryFileSystem implements FileSystem {
  files = new Map<string, string>();

  key(path: string, base: BaseDir) {
    return `${base}:${path}`;
  }

  resolvePath(path: string, base: BaseDir): ResolvedPath {
    return { baseDir: 0, basePrefix: async () => '', fp: path, base };
  }

  getURL(path: string): string {
    return path;
  }

  async getBlobURL(path: string): Promise<string> {
    return path;
  }

  async getImageURL(path: string): Promise<string> {
    return path;
  }

  async openFile(): Promise<File> {
    return new File([], 'empty');
  }

  async copyFile(): Promise<void> {}

  async readFile(path: string, base: BaseDir): Promise<string> {
    const value = this.files.get(this.key(path, base));
    if (value === undefined) throw new Error('missing file');
    return value;
  }

  async writeFile(
    path: string,
    base: BaseDir,
    content: string | ArrayBuffer | File,
  ): Promise<void> {
    this.files.set(this.key(path, base), String(content));
  }

  async removeFile(path: string, base: BaseDir): Promise<void> {
    this.files.delete(this.key(path, base));
  }

  async readDir(): Promise<FileItem[]> {
    return [];
  }

  async createDir(): Promise<void> {}

  async removeDir(): Promise<void> {}

  async exists(path: string, base: BaseDir): Promise<boolean> {
    return this.files.has(this.key(path, base));
  }

  async stats(): Promise<FileInfo> {
    return { isFile: true, isDirectory: false, size: 0, mtime: null, atime: null, birthtime: null };
  }

  async getPrefix(base: BaseDir): Promise<string> {
    return base;
  }
}

describe('diagnostics settings', () => {
  it('adds default diagnostics settings for fresh installs', async () => {
    const fs = new MemoryFileSystem();

    const settings = await loadSettings({
      fs,
      isMobile: true,
      isEink: false,
      isAppDataSandbox: false,
    });

    expect(settings.diagnostics).toEqual({ enabled: true, includeDebugEvents: false });
  });

  it('merges diagnostics defaults into existing settings', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(
      'settings.json',
      'Settings',
      JSON.stringify({ version: 0, telemetryEnabled: false, aiSettings: {} }),
    );

    const settings = await loadSettings({
      fs,
      isMobile: true,
      isEink: false,
      isAppDataSandbox: false,
    });

    expect(settings.diagnostics).toEqual({ enabled: true, includeDebugEvents: false });
  });
});
```

- [ ] **Step 2: Run the settings test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/settings-diagnostics.test.ts
```

Expected: FAIL because `settings.diagnostics` does not exist.

- [ ] **Step 3: Add diagnostics settings type**

Modify `apps/readest-app/src/types/settings.ts`:

```ts
import type { DiagnosticsSettings } from '@/services/diagnostics/types';
```

Add to `SystemSettings` after `telemetryEnabled`:

```ts
diagnostics: DiagnosticsSettings;
```

- [ ] **Step 4: Add default settings**

Modify `apps/readest-app/src/services/constants.ts` inside `DEFAULT_SYSTEM_SETTINGS`:

```ts
  diagnostics: {
    enabled: true,
    includeDebugEvents: false,
  },
```

- [ ] **Step 5: Merge defaults on load**

Modify `apps/readest-app/src/services/settingsService.ts` after AI settings merge:

```ts
settings.diagnostics = {
  ...defaultSettings.diagnostics,
  ...settings.diagnostics,
};
```

- [ ] **Step 6: Run the settings test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/settings-diagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/readest-app/src/types/settings.ts apps/readest-app/src/services/constants.ts apps/readest-app/src/services/settingsService.ts apps/readest-app/src/__tests__/services/settings-diagnostics.test.ts
git commit -m "feat(diagnostics): persist local logging settings"
```

---

### Task 4: Initialize diagnostics and expose Advanced Settings controls

**Files:**

- Modify: `apps/readest-app/src/components/Providers.tsx`
- Modify: `apps/readest-app/src/app/library/components/SettingsMenu.tsx`
- Test: `apps/readest-app/src/__tests__/app/library/settings-menu-diagnostics.test.tsx`

- [ ] **Step 1: Write the failing settings menu test**

Create `apps/readest-app/src/__tests__/app/library/settings-menu-diagnostics.test.tsx` following existing SettingsMenu test mocking patterns:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsMenu from '@/app/library/components/SettingsMenu';
import { useSettingsStore } from '@/store/settingsStore';
import { clearDiagnosticsLogs, exportDiagnosticsBundle } from '@/services/diagnostics/logger';

vi.mock('@/services/diagnostics/logger', () => ({
  clearDiagnosticsLogs: vi.fn().mockResolvedValue(undefined),
  exportDiagnosticsBundle: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { getAppService: vi.fn() },
    appService: {
      isMobileApp: true,
      isAndroidApp: true,
      hasWindow: false,
      hasUpdater: false,
      canCustomizeRootDir: false,
      distChannel: 'readest',
    },
  }),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: () => 16 }));
vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => ({ userProfilePlan: 'free', quotas: null }),
}));
vi.mock('@/hooks/useTransferQueue', () => ({
  useTransferQueue: () => ({
    stats: { active: 0, pending: 0, failed: 0 },
    hasActiveTransfers: false,
    setIsTransferQueueOpen: vi.fn(),
  }),
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeMode: 'light', setThemeMode: vi.fn() }),
}));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ isSyncing: false, setLibrary: vi.fn() }),
}));
vi.mock('@/config/features', () => ({
  readioFeatures: {
    advancedSettings: true,
    auth: false,
    cloudSync: false,
    commerce: false,
    telemetry: false,
    updater: false,
    tts: false,
  },
}));

describe('SettingsMenu diagnostics controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: {
        diagnostics: { enabled: true, includeDebugEvents: false },
        screenWakeLock: false,
        openLastBooks: false,
        alwaysShowStatusBar: false,
        telemetryEnabled: false,
        autoUpload: false,
        autoCheckUpdates: false,
        alwaysOnTop: false,
        openBookInNewWindow: false,
        autoImportBooksOnOpen: false,
        alwaysInForeground: false,
        savedBookCoverForLockScreen: '',
        savedBookCoverForLockScreenPath: '',
      },
      setSettingsDialogOpen: vi.fn(),
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it('exports and clears local diagnostic logs from advanced settings', async () => {
    render(<SettingsMenu onPullLibrary={vi.fn()} />);

    fireEvent.click(screen.getByText('Export Diagnostic Logs'));
    await waitFor(() => expect(exportDiagnosticsBundle).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Clear Diagnostic Logs'));
    await waitFor(() => expect(clearDiagnosticsLogs).toHaveBeenCalled());
  });
});
```

If existing test utilities already provide `renderWithProviders`, use those instead of direct mocks, but keep the same assertions.

- [ ] **Step 2: Run the menu test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/app/library/settings-menu-diagnostics.test.tsx
```

Expected: FAIL because menu items do not exist.

- [ ] **Step 3: Initialize diagnostics from Providers**

Modify `apps/readest-app/src/components/Providers.tsx` imports:

```ts
import {
  configureDiagnosticsLogger,
  installGlobalDiagnosticsHandlers,
  logDiagnosticError,
} from '@/services/diagnostics/logger';
```

Modify settings load effect:

```ts
appService
  .loadSettings()
  .then((settings) => {
    configureDiagnosticsLogger(appService, settings.diagnostics);
    installGlobalDiagnosticsHandlers();
    const globalViewSettings = settings.globalViewSettings;
    applyUILanguage(globalViewSettings.uiLanguage);
    applyBackgroundTexture(envConfig, globalViewSettings);
    if (globalViewSettings.isEink) {
      applyEinkMode(true);
    }
  })
  .catch((error) => {
    configureDiagnosticsLogger(appService, { enabled: true, includeDebugEvents: false });
    installGlobalDiagnosticsHandlers();
    void logDiagnosticError('settings.load_failed', error);
  });
```

Keep this as a minimal modification to the existing effect.

- [ ] **Step 4: Add SettingsMenu diagnostics state and handlers**

Modify `apps/readest-app/src/app/library/components/SettingsMenu.tsx` imports:

```ts
import {
  clearDiagnosticsLogs,
  configureDiagnosticsLogger,
  exportDiagnosticsBundle,
  logDiagnosticError,
  logDiagnosticEvent,
} from '@/services/diagnostics/logger';
```

Add state near telemetry state:

```ts
const [isDiagnosticsEnabled, setIsDiagnosticsEnabled] = useState(
  settings.diagnostics?.enabled ?? true,
);
```

Add handlers before `handleUpgrade`:

```ts
const toggleDiagnostics = () => {
  const nextDiagnostics = {
    ...(settings.diagnostics ?? { enabled: true, includeDebugEvents: false }),
    enabled: !isDiagnosticsEnabled,
  };
  saveSysSettings(envConfig, 'diagnostics', nextDiagnostics);
  setIsDiagnosticsEnabled(nextDiagnostics.enabled);
  if (appService) configureDiagnosticsLogger(appService, nextDiagnostics);
  void logDiagnosticEvent('diagnostics.toggled', 'info', { enabled: nextDiagnostics.enabled });
};

const handleExportDiagnostics = async () => {
  try {
    await exportDiagnosticsBundle();
  } catch (error) {
    void logDiagnosticError('diagnostics.export_failed', error);
  }
  setIsDropdownOpen?.(false);
};

const handleClearDiagnostics = async () => {
  try {
    await clearDiagnosticsLogs();
  } catch (error) {
    void logDiagnosticError('diagnostics.clear_failed', error);
  }
  setIsDropdownOpen?.(false);
};
```

Add menu items inside Advanced Settings `<ul>` after Refresh Metadata:

```tsx
              <MenuItem
                label={_('Local Diagnostic Logs')}
                description={isDiagnosticsEnabled ? _('Enabled') : _('Disabled')}
                toggled={isDiagnosticsEnabled}
                onClick={toggleDiagnostics}
              />
              <MenuItem label={_('Export Diagnostic Logs')} onClick={handleExportDiagnostics} />
              <MenuItem label={_('Clear Diagnostic Logs')} onClick={handleClearDiagnostics} />
```

- [ ] **Step 5: Run the menu test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/app/library/settings-menu-diagnostics.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/readest-app/src/components/Providers.tsx apps/readest-app/src/app/library/components/SettingsMenu.tsx apps/readest-app/src/__tests__/app/library/settings-menu-diagnostics.test.tsx
git commit -m "feat(diagnostics): expose local log controls"
```

---

### Task 5: Instrument Reader AI diagnostics

**Files:**

- Modify: `apps/readest-app/src/app/reader/components/ai/ReaderAIAssistant.tsx`
- Modify: `apps/readest-app/src/services/ai/readerChatService.ts`
- Modify: `apps/readest-app/src/services/ai/citationVerifier.ts`
- Test: update existing AI tests only if current assertions need logging mocks.

- [ ] **Step 1: Add test guard that logging does not leak prompts or answers**

In an existing focused Reader AI service test file, preferably `apps/readest-app/src/__tests__/ai/reader-chat-service.test.ts`, add a mock for diagnostics logger and assert metadata does not contain content-bearing keys when a forced error occurs:

```ts
vi.mock('@/services/diagnostics/logger', async () => {
  const actual = await vi.importActual<typeof import('@/services/diagnostics/logger')>(
    '@/services/diagnostics/logger',
  );
  return {
    ...actual,
    logDiagnosticError: vi.fn().mockResolvedValue(undefined),
    logDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
  };
});
```

Add a test that invokes an existing failure path and checks:

```ts
const { logDiagnosticError } = await import('@/services/diagnostics/logger');
expect(JSON.stringify(vi.mocked(logDiagnosticError).mock.calls)).not.toContain(
  'full question text',
);
expect(JSON.stringify(vi.mocked(logDiagnosticError).mock.calls)).not.toContain('full answer text');
expect(JSON.stringify(vi.mocked(logDiagnosticError).mock.calls)).not.toContain('previewText');
```

Use the existing test factories in the file instead of adding new app wiring.

- [ ] **Step 2: Run the focused Reader AI test to verify it fails**

Run the exact test file containing the new assertion, for example:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-chat-service.test.ts
```

Expected: FAIL because no diagnostics logging is emitted on the selected failure path.

- [ ] **Step 3: Instrument `ReaderAIAssistant.tsx`**

Import:

```ts
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
```

Add minimal events in `askAI`:

```ts
void logDiagnosticEvent('reader_ai.ask_started', 'info', {
  bookHashPresent: Boolean(bookHash),
  hasSelection: Boolean(selection?.text),
  priorMessageCount: priorMessages.length,
  spoilerProtection,
});
```

On availability failure:

```ts
void logDiagnosticEvent('reader_ai.unavailable', 'warn', {
  status: availability.status,
  provider: requestSettings.provider,
  model: requestSettings.model,
});
```

On stream/generation catch:

```ts
void logDiagnosticError('reader_ai.ask_failed', error, {
  provider: requestSettings.provider,
  model: requestSettings.model,
  priorMessageCount: priorMessages.length,
  sourceCount: answerSources.length,
});
```

After final answer is stored:

```ts
void logDiagnosticEvent('reader_ai.ask_completed', 'info', {
  provider: requestSettings.provider,
  model: requestSettings.model,
  answerLength: answer.length,
  sourceCount: finalSources.length,
});
```

Do not pass `question`, `answer`, `selection.text`, source previews, snippets, or quotes.

- [ ] **Step 4: Instrument `readerChatService.ts`**

Import logger helpers:

```ts
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
```

Add metadata-only logs around high-value stages:

```ts
void logDiagnosticEvent('reader_ai.retrieval_started', 'debug', {
  bookHashPresent: Boolean(bookHash),
  currentPage,
  hasSelection: Boolean(selectionText),
  spoilerProtection: settings.spoilerProtection,
});
```

After retrieval packing:

```ts
void logDiagnosticEvent('reader_ai.retrieval_completed', 'info', {
  chunkCount: chunks.length,
  sourceCount: sources.length,
  usedCurrentPage: sourceBoundaryPage !== undefined,
});
```

In catch blocks for query rewrite/original section load/generation failures:

```ts
void logDiagnosticError('reader_ai.query_rewrite_failed', error, {
  provider: settings.provider,
  model: settings.model,
});
```

Use existing error variable names. Never pass raw query, text, chunks, source objects, or messages.

- [ ] **Step 5: Instrument `citationVerifier.ts`**

Import:

```ts
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
```

On refinement start/completion/fallback:

```ts
void logDiagnosticEvent('reader_ai.citation_refinement_started', 'debug', {
  citedSourceCount: citedSourceIndexes.length,
  sourceCount: sources.length,
});
```

In reviewer success path:

```ts
void logDiagnosticEvent('reader_ai.citation_refinement_completed', 'info', {
  sourceIndex,
  reviewerQuoteCount: parsedQuotes.quotes.length,
  reviewerSpanCount: reviewerSpans.length,
  fallbackSpanCount: fallbackSpans.length,
});
```

In catch path:

```ts
void logDiagnosticError('reader_ai.citation_refinement_failed', error, {
  sourceIndex,
  sourceCount: sources.length,
});
```

Do not log `answerClause`, `previewText`, `quotes`, or spans.

- [ ] **Step 6: Run focused AI tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-chat-service.test.ts src/__tests__/ai/citation-verifier.test.ts src/__tests__/ai/reader-ai-assistant.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/readest-app/src/app/reader/components/ai/ReaderAIAssistant.tsx apps/readest-app/src/services/ai/readerChatService.ts apps/readest-app/src/services/ai/citationVerifier.ts apps/readest-app/src/__tests__/ai/reader-chat-service.test.ts
git commit -m "feat(diagnostics): record reader AI failure breadcrumbs"
```

---

### Task 6: Instrument library, import, download, and AI book search diagnostics

**Files:**

- Modify: `apps/readest-app/src/app/library/components/AIBookSearchDialog.tsx`
- Modify: `apps/readest-app/src/app/library/page.tsx`
- Test: update existing AI book search/import tests where appropriate.

- [ ] **Step 1: Add failing logging assertions to existing tests**

In `apps/readest-app/src/__tests__/app/library/ai-book-search-dialog.test.tsx`, mock `logDiagnosticError`/`logDiagnosticEvent` and add a failure-path assertion for search or download failure:

```ts
vi.mock('@/services/diagnostics/logger', () => ({
  logDiagnosticError: vi.fn().mockResolvedValue(undefined),
  logDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
}));
```

After triggering an existing failed search/download path:

```ts
const { logDiagnosticError } = await import('@/services/diagnostics/logger');
expect(logDiagnosticError).toHaveBeenCalledWith(
  'ai_book_search.search_failed',
  expect.anything(),
  expect.objectContaining({ provider: expect.any(String) }),
);
expect(JSON.stringify(vi.mocked(logDiagnosticError).mock.calls)).not.toContain('raw query');
```

For `apps/readest-app/src/__tests__/app/library/epub-scan-import-flow.test.tsx` or another existing import failure test, add a metadata-only import failure assertion.

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/app/library/ai-book-search-dialog.test.tsx src/__tests__/app/library/epub-scan-import-flow.test.tsx
```

Expected: FAIL because diagnostics logging is not emitted.

- [ ] **Step 3: Instrument `AIBookSearchDialog.tsx`**

Import:

```ts
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
```

Add metadata-only logs:

```ts
void logDiagnosticEvent('ai_book_search.search_started', 'info', {
  provider: effectiveAISettings.provider,
  model: effectiveAISettings.model,
  queryLength: trimmedQuery.length,
});
```

On search success:

```ts
void logDiagnosticEvent('ai_book_search.search_completed', 'info', {
  provider: effectiveAISettings.provider,
  model: effectiveAISettings.model,
  resultCount: response.results.length,
});
```

On search catch:

```ts
void logDiagnosticError('ai_book_search.search_failed', error, {
  provider: effectiveAISettings.provider,
  model: effectiveAISettings.model,
  queryLength: trimmedQuery.length,
});
```

On download/import failure:

```ts
void logDiagnosticError('ai_book_search.import_failed', error, {
  resultKey: key,
  linkIndex: result.downloadLinks.indexOf(link),
});
```

Do not log raw query, title/author if avoidable, description, download URL, or file path.

- [ ] **Step 4: Instrument `library/page.tsx`**

Import:

```ts
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
```

In import flow catch:

```ts
void logDiagnosticError('library.import_failed', error, {
  filenameLength: baseFilename.length,
  extension: baseFilename.split('.').pop()?.toLowerCase() ?? '',
});
```

After import summary:

```ts
void logDiagnosticEvent('library.import_completed', 'info', {
  importedCount: importedBooks.length,
  failedCount: failedImports.length,
});
```

In download catch:

```ts
void logDiagnosticError('library.download_failed', error, {
  bookHashPresent: Boolean(book.hash),
  redownload,
  queued,
});
```

Do not log full filenames, title, author, local path, or cloud path.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/app/library/ai-book-search-dialog.test.tsx src/__tests__/app/library/epub-scan-import-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/readest-app/src/app/library/components/AIBookSearchDialog.tsx apps/readest-app/src/app/library/page.tsx apps/readest-app/src/__tests__/app/library/ai-book-search-dialog.test.tsx apps/readest-app/src/__tests__/app/library/epub-scan-import-flow.test.tsx
git commit -m "feat(diagnostics): record library failure breadcrumbs"
```

---

### Task 7: Verification, privacy audit, and handoff update

**Files:**

- Modify: `HANDOFF.md`

- [ ] **Step 1: Run diagnostics-focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/diagnostics/redact.test.ts src/__tests__/services/diagnostics/logger.test.ts src/__tests__/services/settings-diagnostics.test.ts src/__tests__/app/library/settings-menu-diagnostics.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run affected feature tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-chat-service.test.ts src/__tests__/ai/citation-verifier.test.ts src/__tests__/ai/reader-ai-assistant.test.tsx src/__tests__/app/library/ai-book-search-dialog.test.tsx src/__tests__/app/library/epub-scan-import-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full unit test suite**

Run:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS.

- [ ] **Step 5: Manual privacy audit**

Search all diagnostics instrumentation and confirm no raw content keys are passed:

```bash
pnpm --dir apps/readest-app test src/__tests__/services/diagnostics/redact.test.ts
```

Then inspect changed code and verify calls to `logDiagnosticEvent` / `logDiagnosticError` do not pass:

```ts
question
answer
selection.text
previewText
contextText
snippet
quote
quotes
prompt
messages
file path
API key
```

Expected: No raw content is passed. If a needed count exists, use `questionLength`, `answerLength`, `sourceCount`, `filenameLength`, or booleans instead.

- [ ] **Step 6: Optional Android smoke only if preparing release**

If this diagnostics feature is going into a release build, run the proven Android flow:

```bash
pnpm --dir apps/readest-app build-readio-apk
```

Then install on emulator and verify:

1. App launches.
2. Settings → Advanced Settings shows Local Diagnostic Logs, Export Diagnostic Logs, Clear Diagnostic Logs.
3. Export opens native save/share flow or completes without crash.
4. Clear logs completes without crash.
5. Reader AI ask flow still opens and reaches answer panel.

Expected: no regression and no crash logs after smoke.

- [ ] **Step 7: Update handoff**

Modify `HANDOFF.md` with:

```md
## Privacy-safe diagnostics logging

- Added local-only diagnostics JSONL under `BaseDir.Log` (`diagnostics/current.jsonl`, `diagnostics/previous.jsonl`).
- Logger redacts secrets, local paths, raw prompts, raw answers, book text, snippets, selection text, and citation quotes before writing.
- Advanced Settings includes Local Diagnostic Logs toggle, Export Diagnostic Logs, and Clear Diagnostic Logs.
- Instrumented Reader AI, citation refinement, AI book search, import, and download failure paths with metadata-only breadcrumbs.
- Validation: <commands run and results>.
- Release note: if user reports a bug, ask them to export diagnostic logs and send the JSON file; do not ask for screenshots containing private book text unless necessary.
```

- [ ] **Step 8: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: record diagnostics logging handoff"
```

---

## Self-review

**Spec coverage:**

- Local bug/crash logs: Tasks 2 and 4.
- AI chat/retrieval/citation failures: Task 5.
- AI book search/import/download failures: Task 6.
- Export/clear logs: Tasks 2 and 4.
- Privacy-safe logging: Tasks 1 and 7.
- Bounded retention: Task 2.
- Tests and full verification: Tasks 1-7.

**Placeholder scan:**

- No `TBD`, `TODO`, or vague “add tests” steps remain. Each implementation step names files, code, and commands.

**Type consistency:**

- `DiagnosticsSettings` is defined once in `services/diagnostics/types.ts`, imported by settings.
- Logger functions used by instrumentation are defined in Task 2 before later tasks import them.
- Metadata type uses `unknown` at API boundary and redacts into typed `DiagnosticMetadata`; no `any` is used.

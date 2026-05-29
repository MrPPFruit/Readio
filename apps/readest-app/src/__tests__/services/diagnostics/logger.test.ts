import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppService, BaseDir } from '@/types/system';
import type { DiagnosticLogEvent, DiagnosticsSettings } from '@/services/diagnostics/types';
import {
  clearDiagnosticsLogs,
  configureDiagnosticsLogger,
  exportDiagnosticsBundle,
  installGlobalDiagnosticsHandlers,
  logDiagnosticError,
  logDiagnosticEvent,
  resetDiagnosticsLoggerForTests,
} from '@/services/diagnostics/logger';

class MemoryAppService implements Pick<
  AppService,
  'createDir' | 'deleteFile' | 'exists' | 'readFile' | 'saveFile' | 'writeFile'
> {
  readonly files = new Map<string, string>();
  readonly savedFiles: {
    filename: string;
    content: string | ArrayBuffer;
    options?: { filePath?: string; mimeType?: string };
  }[] = [];
  failWrites = false;
  failNextWrite = false;
  writeDelayMs = 0;

  key(path: string, base: BaseDir): string {
    return `${base}:${path}`;
  }

  async createDir(_path: string, _base: BaseDir, _recursive?: boolean): Promise<void> {}

  async deleteFile(path: string, base: BaseDir): Promise<void> {
    this.files.delete(this.key(path, base));
  }

  async exists(path: string, base: BaseDir): Promise<boolean> {
    return this.files.has(this.key(path, base));
  }

  async readFile(
    path: string,
    base: BaseDir,
    mode: 'text' | 'binary',
  ): Promise<string | ArrayBuffer> {
    if (mode === 'binary') {
      return new ArrayBuffer(0);
    }

    const content = this.files.get(this.key(path, base));
    if (content === undefined) {
      throw new Error(`Missing file: ${base}:${path}`);
    }
    return content;
  }

  async writeFile(
    path: string,
    base: BaseDir,
    content: string | ArrayBuffer | File,
  ): Promise<void> {
    if (this.writeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs));
    }

    if (this.failWrites || this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('write failed');
    }

    this.files.set(this.key(path, base), typeof content === 'string' ? content : String(content));
  }

  async saveFile(
    filename: string,
    content: string | ArrayBuffer,
    options?: { filePath?: string; mimeType?: string },
  ): Promise<boolean> {
    this.savedFiles.push({ filename, content, options });
    return true;
  }
}

const defaultSettings = (): DiagnosticsSettings => ({ enabled: true, includeDebugEvents: false });

const asAppService = (service: MemoryAppService): AppService => service as unknown as AppService;

const readLogLines = async (
  appService: MemoryAppService,
  file: 'current.jsonl' | 'previous.jsonl',
): Promise<DiagnosticLogEvent[]> => {
  const path = `diagnostics/${file}`;
  if (!(await appService.exists(path, 'Log'))) {
    return [];
  }

  const content = (await appService.readFile(path, 'Log', 'text')) as string;
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DiagnosticLogEvent);
};

const readFirstLogEntry = async (
  appService: MemoryAppService,
  file: 'current.jsonl' | 'previous.jsonl' = 'current.jsonl',
): Promise<DiagnosticLogEvent> => {
  const [entry] = await readLogLines(appService, file);
  if (!entry) {
    throw new Error(`Missing diagnostics log entry in ${file}`);
  }
  return entry;
};

interface DiagnosticsExportBundle {
  privacyNote: string;
  currentLog: string;
  previousLog: string;
  summary: {
    previousBytes: number;
  };
}

const readExportBundle = (appService: MemoryAppService): DiagnosticsExportBundle => {
  const savedFile = appService.savedFiles[0];
  if (!savedFile || typeof savedFile.content !== 'string') {
    throw new Error('Missing diagnostics export bundle');
  }
  return JSON.parse(savedFile.content) as DiagnosticsExportBundle;
};

describe('diagnostics logger', () => {
  let appService: MemoryAppService;

  beforeEach(() => {
    appService = new MemoryAppService();
    resetDiagnosticsLoggerForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T10:00:00.000Z'));
  });

  afterEach(() => {
    resetDiagnosticsLoggerForTests();
    vi.useRealTimers();
  });

  test('writes redacted JSONL events to the current Log file', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());

    await logDiagnosticEvent('ai.request', 'info', {
      provider: 'openai',
      apiKey: 'sk-this-secret-should-not-leak',
      selectedText: 'private selected book text',
      localPath: '/Users/ppg/Books/private.epub',
    });

    const entry = await readFirstLogEntry(appService);
    expect(entry).toMatchObject({
      timestamp: '2026-05-26T10:00:00.000Z',
      level: 'info',
      event: 'ai.request',
    });
    expect(entry.metadata).toMatchObject({
      provider: 'openai',
      apiKey: '[REDACTED]',
      localPath: '[LOCAL_PATH]',
    });
    expect(entry.metadata?.['selectedText']).toBeUndefined();
  });

  test('respects disabled and debug settings', async () => {
    configureDiagnosticsLogger(asAppService(appService), {
      enabled: false,
      includeDebugEvents: true,
    });
    await logDiagnosticEvent('disabled.event', 'info');
    expect(await appService.exists('diagnostics/current.jsonl', 'Log')).toBe(false);

    configureDiagnosticsLogger(asAppService(appService), {
      enabled: true,
      includeDebugEvents: false,
    });
    await logDiagnosticEvent('debug.skipped', 'debug');
    expect(await appService.exists('diagnostics/current.jsonl', 'Log')).toBe(false);

    configureDiagnosticsLogger(asAppService(appService), {
      enabled: true,
      includeDebugEvents: true,
    });
    await logDiagnosticEvent('debug.written', 'debug');
    const lines = await readLogLines(appService, 'current.jsonl');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.event).toBe('debug.written');
  });

  test('writes reader AI entity sidecar diagnostics without content-bearing metadata', async () => {
    configureDiagnosticsLogger(asAppService(appService), {
      enabled: true,
      includeDebugEvents: true,
    });

    await logDiagnosticEvent('reader_ai.entity_sidecar_hit', 'debug', {
      hitCount: 2,
      aliasHitCount: 1,
      factHitCount: 1,
      scope: 'read_so_far',
      durationMs: 12,
      question: '灰塔导师是谁？',
      entityName: '林澈',
      factText: '林澈先生是主角的灰塔导师。',
      sourceText: '林澈先生是主角的灰塔导师，教他辨认古老符号。',
      prompt: 'private prompt',
      answer: 'private answer',
      url: 'https://example.test/private/book.epub',
    });

    const entry = await readFirstLogEntry(appService);
    expect(entry.event).toBe('reader_ai.entity_sidecar_hit');
    expect(entry.metadata).toEqual({
      hitCount: 2,
      aliasHitCount: 1,
      factHitCount: 1,
      scope: 'read_so_far',
      durationMs: 12,
      url: '[URL]',
    });
  });

  test('rotates current to previous when next JSONL line exceeds byte limit', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    const almostFullLine = `${'x'.repeat(249_990)}\n`;
    appService.files.set(appService.key('diagnostics/current.jsonl', 'Log'), almostFullLine);
    appService.files.set(appService.key('diagnostics/previous.jsonl', 'Log'), 'old previous\n');

    await logDiagnosticEvent('rotation.event', 'info');

    expect(await appService.readFile('diagnostics/previous.jsonl', 'Log', 'text')).toBe(
      almostFullLine,
    );
    const current = (await appService.readFile(
      'diagnostics/current.jsonl',
      'Log',
      'text',
    )) as string;
    expect(current).toContain('rotation.event');
    expect(current).not.toContain('old previous');
  });

  test('logs redacted errors and swallows logger storage failures', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    const error = new Error('token=supersecret /Users/ppg/private/book.epub');

    await logDiagnosticError('reader.crash', error, {
      question: 'private question text',
      safe: true,
    });

    const entry = await readFirstLogEntry(appService);
    expect(entry.event).toBe('reader.crash');
    expect(entry.level).toBe('error');
    expect(entry.error).toMatchObject({
      name: 'Error',
      message: 'token=[REDACTED] [LOCAL_PATH]',
    });
    expect(entry.metadata).toEqual({ safe: true });

    appService.failWrites = true;
    await expect(logDiagnosticEvent('write.failure', 'info')).resolves.toBeUndefined();
  });

  test('exports a privacy-noted bundle through saveFile', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    appService.files.set(
      appService.key('diagnostics/previous.jsonl', 'Log'),
      '{"event":"previous"}\n',
    );
    await logDiagnosticEvent('current', 'warn');

    await exportDiagnosticsBundle();

    const savedFile = appService.savedFiles[0];
    expect(savedFile).toBeDefined();
    expect(savedFile?.filename).toMatch(/^readio-diagnostics-.*\.json$/);
    expect(savedFile?.options?.mimeType).toBe('application/json');
    const bundle = readExportBundle(appService);
    expect(bundle.privacyNote).toContain('redacted');
    expect(bundle.currentLog).toContain('current');
    expect(bundle.previousLog).toContain('previous');
    expect(bundle.summary).toMatchObject({ previousBytes: 21 });
  });

  test('clears current and previous logs', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    appService.files.set(appService.key('diagnostics/current.jsonl', 'Log'), 'current\n');
    appService.files.set(appService.key('diagnostics/previous.jsonl', 'Log'), 'previous\n');

    await clearDiagnosticsLogs();

    expect(await appService.exists('diagnostics/current.jsonl', 'Log')).toBe(false);
    expect(await appService.exists('diagnostics/previous.jsonl', 'Log')).toBe(false);
  });

  test('parallel log calls preserve all entries', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());

    await Promise.all(
      Array.from({ length: 25 }, (_, index) => logDiagnosticEvent(`parallel.${index}`, 'info')),
    );

    const lines = await readLogLines(appService, 'current.jsonl');
    expect(lines).toHaveLength(25);
    expect(new Set(lines.map((line) => line.event))).toEqual(
      new Set(Array.from({ length: 25 }, (_, index) => `parallel.${index}`)),
    );
  });

  test('clear ordered after append removes logs and does not resurrect', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    appService.writeDelayMs = 10;

    const appendPromise = logDiagnosticEvent('before.clear', 'info');
    const clearPromise = clearDiagnosticsLogs();

    await vi.runAllTimersAsync();
    await Promise.all([appendPromise, clearPromise]);

    expect(await appService.exists('diagnostics/current.jsonl', 'Log')).toBe(false);
    expect(await appService.exists('diagnostics/previous.jsonl', 'Log')).toBe(false);
  });

  test('export redacts pre-existing unredacted sensitive content', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    appService.files.set(
      appService.key('diagnostics/current.jsonl', 'Log'),
      '{"event":"raw","metadata":{"apiKey":"sk-preexisting-secret-value","localPath":"/Users/ppg/private/book.epub"}}\n' +
        'malformed token=supersecret /Users/ppg/private/notes.txt\n',
    );
    appService.files.set(
      appService.key('diagnostics/previous.jsonl', 'Log'),
      'Bearer abcdefghijklmnopqrstuvwxyz123456\n',
    );

    await exportDiagnosticsBundle();

    const bundle = readExportBundle(appService);
    expect(bundle.currentLog).toContain('[REDACTED]');
    expect(bundle.currentLog).toContain('[LOCAL_PATH]');
    expect(bundle.currentLog).not.toContain('sk-preexisting-secret-value');
    expect(bundle.currentLog).not.toContain('/Users/ppg/private');
    expect(bundle.currentLog).not.toContain('supersecret');
    expect(bundle.previousLog).toContain('Bearer [REDACTED]');
    expect(bundle.previousLog).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  test('a failed queued write does not prevent later log writes', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    appService.failNextWrite = true;

    await expect(logDiagnosticEvent('first.fails', 'info')).resolves.toBeUndefined();
    await logDiagnosticEvent('second.writes', 'info');

    const lines = await readLogLines(appService, 'current.jsonl');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.event).toBe('second.writes');
  });

  test('installs global diagnostics handlers only once', async () => {
    configureDiagnosticsLogger(asAppService(appService), defaultSettings());
    installGlobalDiagnosticsHandlers();
    installGlobalDiagnosticsHandlers();

    const errorEvent = new Event('error') as ErrorEvent;
    Object.defineProperties(errorEvent, {
      message: { value: 'boom' },
      error: { value: new Error('boom') },
      filename: { value: '/Users/ppg/private/app.js' },
      lineno: { value: 7 },
      colno: { value: 11 },
    });
    const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
      reason: new Error('nope'),
      promise: Promise.resolve(),
    });

    window.dispatchEvent(errorEvent);
    await vi.runAllTimersAsync();
    window.dispatchEvent(rejectionEvent);
    await vi.runAllTimersAsync();

    const lines = await readLogLines(appService, 'current.jsonl');
    expect(lines.map((line) => line.event)).toEqual([
      'global.unhandled_error',
      'global.unhandled_rejection',
    ]);
  });
});

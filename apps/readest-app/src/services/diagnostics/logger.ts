import type { AppService } from '@/types/system';
import type { DiagnosticLevel, DiagnosticLogEvent, DiagnosticsSettings } from './types';
import { redactDiagnosticError, redactDiagnosticMetadata, redactDiagnosticString } from './redact';

const DIAGNOSTICS_DIR = 'diagnostics';
const CURRENT_LOG_PATH = `${DIAGNOSTICS_DIR}/current.jsonl`;
const PREVIOUS_LOG_PATH = `${DIAGNOSTICS_DIR}/previous.jsonl`;
const MAX_CURRENT_LOG_BYTES = 250_000;
const EXPORT_MIME_TYPE = 'application/json';
const PRIVACY_NOTE =
  'Diagnostics logs are stored locally and redacted before writing. Review the exported bundle before sharing.';

let appService: AppService | null = null;
let settings: DiagnosticsSettings = { enabled: false, includeDebugEvents: false };
let handlersInstalled = false;
let mutationQueue: Promise<void> = Promise.resolve();

export const configureDiagnosticsLogger = (
  nextAppService: AppService,
  nextSettings: DiagnosticsSettings,
): void => {
  appService = nextAppService;
  settings = nextSettings;
};

export const logDiagnosticEvent = async (
  event: string,
  level: DiagnosticLevel,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  try {
    if (!shouldWrite(level)) {
      return;
    }

    const entry: DiagnosticLogEvent = {
      timestamp: new Date().toISOString(),
      level,
      event: redactDiagnosticString(event),
      ...(metadata ? { metadata: redactDiagnosticMetadata(metadata) } : {}),
    };

    await appendEntry(entry);
  } catch {
    // Diagnostics must never crash app code.
  }
};

export const logDiagnosticError = async (
  event: string,
  error: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  try {
    if (!shouldWrite('error')) {
      return;
    }

    const entry: DiagnosticLogEvent = {
      timestamp: new Date().toISOString(),
      level: 'error',
      event: redactDiagnosticString(event),
      error: redactDiagnosticError(error),
      ...(metadata ? { metadata: redactDiagnosticMetadata(metadata) } : {}),
    };

    await appendEntry(entry);
  } catch {
    // Diagnostics must never crash app code.
  }
};

export const exportDiagnosticsBundle = async (): Promise<void> => {
  try {
    const service = appService;
    if (!service) {
      return;
    }

    const [currentLog, previousLog] = await Promise.all([
      readTextFileIfExists(CURRENT_LOG_PATH),
      readTextFileIfExists(PREVIOUS_LOG_PATH),
    ]);
    const safeCurrentLog = redactExportedLogText(currentLog);
    const safePreviousLog = redactExportedLogText(previousLog);
    const exportedAt = new Date().toISOString();
    const bundle = {
      exportedAt,
      privacyNote: PRIVACY_NOTE,
      currentLog: safeCurrentLog,
      previousLog: safePreviousLog,
      summary: {
        currentBytes: byteLength(safeCurrentLog),
        previousBytes: byteLength(safePreviousLog),
        exportedAt,
      },
    };

    await service.saveFile(
      `readio-diagnostics-${filenameTimestamp(exportedAt)}.json`,
      JSON.stringify(bundle, null, 2),
      {
        mimeType: EXPORT_MIME_TYPE,
      },
    );
  } catch {
    // Diagnostics export must not crash app code.
  }
};

export const clearDiagnosticsLogs = async (): Promise<void> => {
  try {
    const service = appService;
    if (!service) {
      return;
    }

    await enqueueMutation(async () => {
      await Promise.all([deleteIfExists(CURRENT_LOG_PATH), deleteIfExists(PREVIOUS_LOG_PATH)]);
    });
  } catch {
    // Diagnostics cleanup must not crash app code.
  }
};

export const installGlobalDiagnosticsHandlers = (): void => {
  try {
    if (handlersInstalled || typeof window === 'undefined') {
      return;
    }

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    handlersInstalled = true;
  } catch {
    // Handler installation must not crash app code.
  }
};

export const resetDiagnosticsLoggerForTests = (): void => {
  try {
    if (handlersInstalled && typeof window !== 'undefined') {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    }
  } catch {
    // Test reset should be best-effort.
  }

  appService = null;
  settings = { enabled: false, includeDebugEvents: false };
  handlersInstalled = false;
  mutationQueue = Promise.resolve();
};

const shouldWrite = (level: DiagnosticLevel): boolean => {
  if (!appService || !settings.enabled) {
    return false;
  }

  return level !== 'debug' || settings.includeDebugEvents;
};

const appendEntry = async (entry: DiagnosticLogEvent): Promise<void> => {
  await enqueueMutation(async () => {
    const service = appService;
    if (!service) {
      return;
    }

    await service.createDir(DIAGNOSTICS_DIR, 'Log', true);

    const existing = await readTextFileIfExists(CURRENT_LOG_PATH);
    const line = `${JSON.stringify(entry)}\n`;
    if (byteLength(existing) + byteLength(line) > MAX_CURRENT_LOG_BYTES) {
      if (existing.length > 0) {
        await service.writeFile(PREVIOUS_LOG_PATH, 'Log', existing);
      } else {
        await deleteIfExists(PREVIOUS_LOG_PATH);
      }
      await service.writeFile(CURRENT_LOG_PATH, 'Log', line);
      return;
    }

    await service.writeFile(CURRENT_LOG_PATH, 'Log', `${existing}${line}`);
  });
};

const enqueueMutation = async (mutation: () => Promise<void>): Promise<void> => {
  const nextMutation = mutationQueue.catch(() => undefined).then(mutation);
  mutationQueue = nextMutation.catch(() => undefined);
  await nextMutation;
};

const readTextFileIfExists = async (path: string): Promise<string> => {
  try {
    const service = appService;
    if (!service || !(await service.exists(path, 'Log'))) {
      return '';
    }

    const content = await service.readFile(path, 'Log', 'text');
    return typeof content === 'string' ? content : '';
  } catch {
    return '';
  }
};

const redactExportedLogText = (content: string): string => {
  try {
    return content
      .split('\n')
      .map((line) => redactDiagnosticString(line, Math.max(line.length, 180)))
      .join('\n');
  } catch {
    return '';
  }
};

const deleteIfExists = async (path: string): Promise<void> => {
  try {
    const service = appService;
    if (service && (await service.exists(path, 'Log'))) {
      await service.deleteFile(path, 'Log');
    }
  } catch {
    // Best-effort delete only.
  }
};

const handleGlobalError = (event: ErrorEvent): void => {
  void logDiagnosticError('global.unhandled_error', event.error ?? event.message, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
};

const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
  void logDiagnosticError('global.unhandled_rejection', event.reason);
};

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const filenameTimestamp = (timestamp: string): string => timestamp.replace(/[:.]/g, '-');

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

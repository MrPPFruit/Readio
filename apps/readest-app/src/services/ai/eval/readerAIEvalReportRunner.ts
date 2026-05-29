import {
  type ReaderAIEvalCase,
  type ReaderAIEvalReport,
  type ReaderAIEvalResult,
  type ReaderAITraceLike,
  buildReaderAIEvalReport,
  buildReaderAITraceRunSummaries,
  validateReaderAIEvalCase,
  validateReaderAIEvalResult,
} from '@/services/ai/eval/readerAIEval';

export type ReaderAIEvalReportRunnerInput = {
  cases: unknown[];
  results: unknown[];
  traces?: unknown[];
};

export type ReaderAIEvalReportRunnerOutput =
  | {
      ok: true;
      report: ReaderAIEvalReport;
      markdown: string;
      issues: [];
    }
  | {
      ok: false;
      report: null;
      markdown: '';
      issues: string[];
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const prefixIssue = (prefix: string, issue: string): string => `${prefix}.${issue}`;

const parseInputEnvelope = (
  input: unknown,
): { ok: true; input: ReaderAIEvalReportRunnerInput } | { ok: false; issues: string[] } => {
  if (!isRecord(input)) {
    return { ok: false, issues: ['input must be an object'] };
  }

  const issues: string[] = [];
  const cases = input['cases'];
  const results = input['results'];
  const traces = input['traces'];

  if (!Array.isArray(cases)) issues.push('cases must be an array');
  if (!Array.isArray(results)) issues.push('results must be an array');
  if (traces !== undefined && !Array.isArray(traces)) {
    issues.push('traces must be an array when provided');
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    input: {
      cases: cases as unknown[],
      results: results as unknown[],
      traces: traces as unknown[] | undefined,
    },
  };
};

const validateCases = (cases: unknown[]): { validCases: ReaderAIEvalCase[]; issues: string[] } => {
  const validCases: ReaderAIEvalCase[] = [];
  const issues: string[] = [];

  cases.forEach((evalCase, index) => {
    const result = validateReaderAIEvalCase(evalCase);
    if (result.valid) {
      validCases.push(evalCase as ReaderAIEvalCase);
    } else {
      issues.push(...result.issues.map((issue) => prefixIssue(`cases[${index}]`, issue)));
    }
  });

  return { validCases, issues };
};

const validateResults = (
  results: unknown[],
): { validResults: ReaderAIEvalResult[]; issues: string[] } => {
  const validResults: ReaderAIEvalResult[] = [];
  const issues: string[] = [];

  results.forEach((evalResult, index) => {
    const result = validateReaderAIEvalResult(evalResult);
    if (result.valid) {
      validResults.push(evalResult as ReaderAIEvalResult);
    } else {
      issues.push(...result.issues.map((issue) => prefixIssue(`results[${index}]`, issue)));
    }
  });

  return { validResults, issues };
};

export function renderReaderAIEvalReportMarkdown(report: ReaderAIEvalReport): string {
  return `# Reader AI Eval Report\n\nTotal cases: ${report.totalCases}\nTotal results: ${report.totalResults}\nPassed: ${report.passed}\nFailed: ${report.failed}\n`;
}

export function buildReaderAIEvalReportRun(input: unknown): ReaderAIEvalReportRunnerOutput {
  const envelope = parseInputEnvelope(input);
  if (!envelope.ok) {
    return { ok: false, report: null, markdown: '', issues: envelope.issues };
  }

  const { validCases, issues: caseIssues } = validateCases(envelope.input.cases);
  const { validResults, issues: resultIssues } = validateResults(envelope.input.results);
  const issues = [...caseIssues, ...resultIssues];

  if (issues.length > 0) {
    return { ok: false, report: null, markdown: '', issues };
  }

  const runSummaries = buildReaderAITraceRunSummaries(
    (envelope.input.traces ?? []) as ReaderAITraceLike[],
  );
  const report = buildReaderAIEvalReport({
    cases: validCases,
    results: validResults,
    runSummaries,
  });

  return { ok: true, report, markdown: renderReaderAIEvalReportMarkdown(report), issues: [] };
}

---
comet_change: reader-ai-eval-report-cli
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-30-reader-ai-eval-report-cli
status: final
---

# Reader AI Eval Report CLI Design

## Context

`reader-ai-eval-report-runner` provides a pure, metadata-only function that accepts parsed unknown input and returns deterministic `ReaderAIEvalReport` JSON plus Markdown. The remaining gap is operational: local quality work still needs repeatable file input/output instead of ad hoc script glue.

This change adds a thin local CLI wrapper around the existing pure runner. It is a file wrapper only, not an eval executor.

## Recommended Approach

Use a Node/tsx script in `apps/readest-app/scripts/` and expose it through a package script.

```text
pnpm --dir apps/readest-app reader-ai:report -- \
  --input eval-input.json \
  --json-out report.json \
  --markdown-out report.md
```

The wrapper should do exactly this:

```text
argv
  │
  ▼
parse required flags
  │
  ▼
read input file + JSON.parse
  │
  ▼
buildReaderAIEvalReportRun(parsedUnknown)
  │
  ├─ !ok → stderr issues, exit 1, write nothing
  │
  └─ ok
      ├─ write JSON: output.report only
      └─ write Markdown: output.markdown
```

Rejected alternatives:

- **CLI framework such as commander/yargs**: unnecessary for three required flags and adds dependency/surface area.
- **stdout-first command**: convenient, but makes it easier to mix errors and report content.
- **Service/runtime endpoint**: creates app/runtime surface and privacy concerns for a local-only workflow.

## Public Contract

Required flags:

- `--input <path>`: local JSON envelope containing `cases`, `results`, and optional `traces`.
- `--json-out <path>`: output path for sanitized `ReaderAIEvalReport` JSON.
- `--markdown-out <path>`: output path for deterministic Markdown.

Failure behavior:

- Missing required flags: exit non-zero and print deterministic usage issues.
- Unknown flags: exit non-zero and print deterministic usage issues.
- Unreadable input file: exit non-zero and print a deterministic read issue.
- Invalid JSON: exit non-zero and print a deterministic parse issue.
- Runner validation failure: exit non-zero and print runner issues.
- No partial output files should be written on failure.

Success behavior:

- Write `ReaderAIEvalReport` JSON only, not the full runner union and not raw input records.
- Write Markdown only from `output.markdown`.
- Exit zero.

## Implementation Shape

Create one focused script module:

```text
apps/readest-app/scripts/reader-ai-eval-report.ts
```

Suggested internal shape:

```ts
type CliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
};

export async function runReaderAIEvalReportCli(argv: string[], io: CliIO): Promise<number>;
```

The actual script entry should call `runReaderAIEvalReportCli(process.argv.slice(2), nodeIo)` and set `process.exitCode`. Tests can call the exported function directly with temp files or injected IO so they do not need to spawn a child process for every case.

Keep the script dependent only on:

- Node built-ins (`node:fs/promises`, optionally `node:path`);
- `buildReaderAIEvalReportRun` from the existing eval runner.

## Privacy and Security Boundaries

The CLI must not weaken the existing privacy boundary.

- Treat parsed JSON as `unknown`.
- Do not inspect or render raw input fields beyond handing them to `buildReaderAIEvalReportRun`.
- Do not write output files until the runner returns `ok: true`.
- Write only sanitized report JSON and sanitized Markdown.
- Do not call providers, open network connections, load real books, run indexing, automate NotebookLM, or upload telemetry.

## Testing Strategy

Add focused tests for CLI behavior, separate from the existing pure runner tests.

Minimum cases:

1. Missing required flags returns non-zero and writes no outputs.
2. Unknown flags return non-zero and write no outputs.
3. Invalid JSON returns non-zero and writes no outputs.
4. Unsafe case/result input returns non-zero and writes no outputs.
5. Valid input writes stable JSON and Markdown artifacts.

Also keep existing runner tests as the source of truth for report math, trace aggregation, and Markdown sections. CLI tests should verify wiring and file behavior, not duplicate all scoring assertions.

## Documentation

Extend `apps/readest-app/src/services/ai/eval/README.md` with:

- command example;
- required envelope shape;
- output artifact descriptions;
- failure/no-partial-output behavior;
- explicit out-of-scope boundaries.

## Verification

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts
pnpm --dir apps/readest-app lint
pnpm --dir apps/readest-app test
openspec validate --all --strict
```

## Future Follow-ups

Out of scope for this slice:

1. Optional stdout mode.
2. Multiple input files or directory batch mode.
3. CI snapshot comparison workflow.
4. Service-level eval execution around `streamReaderAIAnswer`.
5. NotebookLM automation.
6. LLM-as-judge.

## Self-Review

- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: focused on one CLI/file wrapper and package script; no model/runtime/UI work.
- Consistency check: design preserves OpenSpec requirements and delegates scoring/reporting to the existing pure runner.
- Ambiguity check: all required flags, success outputs, and failure behavior are explicit.

# Reader AI eval foundation

This directory contains the local schema foundation for Reader AI ordinary-reader QA evals.

Case categories:

- `person_recall`
- `object_recall`
- `event_recap`
- `relationship_recall`
- `current_recap`
- `citation_grounding`
- `spoiler_safety`

Committed eval cases must avoid raw copyrighted book text, raw prompts, answer text, API keys, local paths, book hashes, and stable private book identifiers. Store only metadata, the user-style question, expected behavior, spoiler mode, optional tags, and label-style notes.

NotebookLM benchmark usage is manual only: compare Readio answers against NotebookLM full-book mode for the same ordinary-reader question set, then record objective metadata in `ReaderAIEvalResult.manualBenchmark`. Do not treat NotebookLM output as a CI oracle and do not copy NotebookLM or Readio answer text into eval records. Manual observations must be short labels such as `more_complete`, `missed_citation`, or `spoiler_boundary_diff`.

For spoiler-protected Readio runs, evaluate only read-so-far evidence. For whole-book manual checks, record `manualBenchmark.mode: 'whole_book'` separately so results are not mixed with deterministic pass/fail.

## Local report runner

The report runner accepts a parsed local JSON-style envelope:

```ts
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces?: ReaderAITraceLike[];
}
```

It validates cases and results, aggregates trace-like metadata by opaque `runId`, and returns a deterministic metadata-only JSON report plus Markdown. Invalid case/result input fails closed and does not produce a partial report.

The runner is intentionally pure: it does not read files, write files, call model providers, load books, run indexing, automate NotebookLM, or change Reader AI UI/runtime behavior.

Manual benchmark observations remain non-authoritative metadata. They can help compare Readio against NotebookLM during manual analysis, but they do not affect deterministic pass/fail scoring and are not rendered into the Markdown report.

## Local report CLI

Run the local file wrapper from the app package:

```bash
pnpm --dir apps/readest-app reader-ai:report -- \
  --input eval-input.json \
  --json-out report.json \
  --markdown-out report.md
```

The input file must contain the same parsed envelope accepted by the pure report runner:

```ts
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces?: ReaderAITraceLike[];
}
```

On success, `--json-out` contains only the sanitized `ReaderAIEvalReport` object, and `--markdown-out` contains deterministic Markdown generated from that report. On usage errors, invalid JSON, invalid envelopes, or unsafe case/result metadata, the command exits non-zero and does not write partial report files.

The CLI is intentionally a local file wrapper only. It does not call model providers, load books, run indexing or retrieval, automate NotebookLM, upload telemetry, or change Reader AI UI/runtime behavior.

## Service eval runner

The service eval runner converts controlled Reader AI service runs into the same metadata-only envelope accepted by `buildReaderAIEvalReportRun` and the `reader-ai:report` CLI.

It is intentionally dependency-injected:

- callers provide the answer stream function;
- tests should use fake streamers;
- a real `streamReaderAIAnswer` call must be wired explicitly by a future caller;
- the runner itself does not choose providers, call APIs, load real books, scan the library, parse EPUB files, write files, upload telemetry, or change Reader AI UI/runtime behavior.

The runner may inspect streamed chunks in memory to derive objective labels such as `no_output`, `unexpected_insufficient_answer`, `stream_error`, or `aborted`, but it must not return raw answer text, source text, prompts, book titles, author names, book hashes, local paths, URLs, API keys, or stable private identifiers.

Real-book fixtures, live-provider cost guardrails, file-based service eval CLI support, NotebookLM automation, and LLM-as-judge are deferred follow-ups.

## Local live fixture runner

The live fixture runner is a local-only wrapper for deliberately running a small, metadata-only Reader AI fixture through the existing service eval runner. Runtime provider credentials and retrieval seed text stay outside committed fixture metadata.

```bash
pnpm --dir apps/readest-app reader-ai:live-fixture -- \
  --fixture tmp/reader-ai/live-fixture/fixture.json \
  --runtime tmp/reader-ai/live-fixture/runtime.local.json \
  --live
```

Live execution is explicitly opt-in at two layers:

- the CLI refuses to run unless `--live` is present;
- the fixture JSON must also set `"live": true`.

Tests must continue to inject fake streamers and preparers and must not call real providers or networks. The CLI loads the real `streamReaderAIAnswer` only after the explicit live gate, fixture `live: true`, runtime provider preflight, and retrieval seed preflight all succeed. Local fixture runs can incur provider cost; keep fixtures intentionally small, use `caseLimit` and `timeoutMs`, and run them only on a developer machine with the intended local settings.

Environment fallbacks are eval-specific:

```text
READER_AI_LIVE_FIXTURE_API_KEY
READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL
READER_AI_LIVE_FIXTURE_ALLOW_UNSAFE_LOCAL_PROXY
READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED
```

A local runtime settings file may provide provider settings, inline retrieval seed data, or a separate local seed file path. File values override environment values for bridge-owned runtime fields.

```json
{
  "provider": {
    "apiKey": "sk-placeholder-do-not-commit",
    "customProviderBaseUrl": "https://placeholder.example.test/v1",
    "allowUnsafeCustomProviderBaseUrl": false
  },
  "retrievalSeedPath": "tmp/reader-ai/live-fixture/seed.local.json"
}
```

Inline seed data uses the same shape as the seed file. Use placeholder text in examples and keep real book text local only:

```json
{
  "bookHash": "placeholder-runtime-book-hash",
  "chunks": [
    {
      "id": "placeholder-chunk-1",
      "sectionIndex": 0,
      "chapterTitle": "Placeholder Chapter",
      "text": "Placeholder retrieval text for local testing only.",
      "pageNumber": 1,
      "sortIndex": 0
    }
  ]
}
```

A fixture contains only controlled eval metadata plus the runtime book handle needed by the existing Reader AI service contract:

```ts
{
  fixtureId: string;
  live: true;
  caseLimit?: number;
  timeoutMs?: number;
  settings: {
    provider: AIProviderName;
    model: string;
    maxContextChunks?: number;
    spoilerProtection?: boolean;
  };
  runtimeBook: {
    label: string;
    bookHash: string;
    bookTitle: string;
    authorName?: string;
    currentPage: number;
    currentAIPage?: number;
  };
  outputs: {
    envelope: string;
    reportJson?: string;
    reportMarkdown?: string;
  };
  cases: ReaderAIEvalCase[];
}
```

Privacy boundaries:

- never commit runtime settings files, retrieval seed files, real book text, API keys, custom base URLs, local file paths, or generated artifacts that have not been reviewed;
- committed fixtures and generated artifacts must remain metadata-only;
- eval cases may include user-style questions and expected-behavior labels, but not raw source text, raw answer text, prompt text, API keys, URLs, local paths, book hashes, stable private identifiers, or raw exception messages;
- output paths must be relative local paths, with no URL schemes, absolute paths, or `..` traversal;
- generated envelope/report artifacts are metadata-only and exclude runtime secret inputs, runtime file paths, retrieval seed text, source previews/context, raw answer text, URLs, book hashes, and stable private identifiers;
- reports are generated through `buildReaderAIEvalReportRun`, so service output remains compatible with the existing sanitized report envelope and Markdown path;
- generated local artifacts are developer evidence, not telemetry, and should not be committed unless they have been reviewed for the metadata-only contract.

Deferred scope remains separate from this runner: real-book batch management, fixture discovery over a library, NotebookLM automation/comparison runs, and LLM-as-judge scoring are intentionally not part of the local live fixture runner. NotebookLM and LLM judging may be used later only as separate, non-authoritative manual/quality layers after deterministic privacy and grounding checks are stable.

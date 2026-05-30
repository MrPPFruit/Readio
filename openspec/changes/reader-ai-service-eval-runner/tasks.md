## 1. Service Eval Runner Contract

- [x] 1.1 Add focused tests for a service eval runner that invokes an injected answer stream with controlled Reader AI context.
- [x] 1.2 Define the service eval input, per-case run context, injected streamer, and metadata-only output envelope types.
- [x] 1.3 Ensure deterministic run ids are assigned per case when explicit run ids are not provided.

## 2. Metadata Result Collection

- [x] 2.1 Collect emitted sources, first-output latency, provider/model labels, spoiler mode, and safe trace-like metadata during each run.
- [x] 2.2 Produce `ReaderAIEvalResult` records with objective pass/fail reasons for successful, insufficient, failed, and aborted runs.
- [x] 2.3 Reject or omit raw answer text, source text, prompts, book titles, author names, book hashes, URLs, local paths, API keys, and stable private identifiers from returned output.

## 3. Report Compatibility and Documentation

- [x] 3.1 Add tests proving the service eval output can be passed to `buildReaderAIEvalReportRun`.
- [x] 3.2 Add tests proving unsafe service-runner envelope fields are rejected or omitted by existing report privacy rules.
- [x] 3.3 Document the service eval runner scope, fake-streamer testing path, and out-of-scope real-book/live-provider automation in the eval README.

## 4. Verification and Handoff

- [x] 4.1 Run focused service eval/report tests.
- [x] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [x] 4.3 Run `pnpm --dir apps/readest-app test`.
- [x] 4.4 Update `HANDOFF.md` with service eval runner scope, validation evidence, and deferred follow-ups.

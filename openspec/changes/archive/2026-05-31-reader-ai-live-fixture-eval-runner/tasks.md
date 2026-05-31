## 1. Fixture Contract and Validation

- [x] 1.1 Add focused tests for a live fixture parser that accepts metadata-only eval cases, safe run labels, Reader AI settings labels, read boundary metadata, and output paths.
- [x] 1.2 Implement the fixture input types and validation helpers without allowing raw answer text, source text, prompt text, API keys, URLs, local paths, book hashes, or stable private identifiers in persisted metadata fields.
- [x] 1.3 Add tests proving unsafe fixture content fails closed before live execution or output file writes.

## 2. Guarded Live Runner Orchestration

- [x] 2.1 Add focused tests proving the runner refuses real provider execution unless an explicit live flag is present.
- [x] 2.2 Implement a local runner wrapper that converts a valid fixture into `ReaderAIServiceEvalInput` and delegates execution to `runReaderAIServiceEval`.
- [x] 2.3 Add case-count limit and timeout/abort handling that records safe failure labels instead of raw exception messages.
- [x] 2.4 Add tests proving the real streamer is injected only through the existing `StreamReaderAIAnswerOptions` contract and that fake streamers remain the default test path.

## 3. Metadata Output and Report Compatibility

- [x] 3.1 Add tests proving successful fixture runs write a metadata-only envelope and optional sanitized JSON/Markdown report artifacts.
- [x] 3.2 Reuse `buildReaderAIEvalReportRun` or the existing report CLI path for report generation without duplicating report validation/scoring rules.
- [x] 3.3 Add tests proving output artifacts exclude raw answers, source previews, prompts, book identity, API keys, URLs, local paths, and raw exception messages.

## 4. Documentation and Verification

- [x] 4.1 Document local live fixture usage, explicit live opt-in, privacy boundaries, and deferred real-book batch/NotebookLM/LLM-as-judge scope in the eval README.
- [x] 4.2 Run focused live fixture runner and existing service/report tests.
- [x] 4.3 Run `pnpm --dir apps/readest-app lint`.
- [x] 4.4 Run `pnpm --dir apps/readest-app test`.
- [x] 4.5 Run `openspec validate --all --strict`.
- [x] 4.6 Update `HANDOFF.md` with live fixture runner scope, validation evidence, and deferred follow-ups.

## 1. Runner Input Validation

- [x] 1.1 Add a metadata-only report runner input type for local JSON envelopes containing `cases`, `results`, and optional `traces` arrays.
- [x] 1.2 Add validation that rejects non-object inputs and non-array envelope fields with deterministic validation issues.
- [x] 1.3 Reuse existing eval case/result validators so unsafe content-bearing case/result fields fail closed before report generation.

## 2. Report Generation

- [x] 2.1 Add pure report runner helpers that compose case/result validation, trace aggregation, and eval report summary generation.
- [x] 2.2 Add deterministic JSON report output that preserves the existing metadata-only `ReaderAIEvalReport` shape.
- [x] 2.3 Add deterministic Markdown report rendering from sanitized report data with stable overview, category, latency, and run-summary sections.

## 3. Privacy and Documentation

- [x] 3.1 Add tests proving unsafe trace-like fields are omitted from JSON and Markdown reports.
- [x] 3.2 Document the local report runner input shape and scope in the eval README.
- [x] 3.3 Keep NotebookLM/manual benchmark observations non-authoritative and separate from deterministic scoring.

## 4. Verification and Handoff

- [ ] 4.1 Run focused Reader AI eval/report tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with report runner scope, validation evidence, and deferred automation follow-ups.

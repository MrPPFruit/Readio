## 1. Eval Schema Hardening

- [x] 1.1 Extend Reader AI eval case/result types with safe optional metadata for run grouping, manual benchmark notes, and category reporting.
- [x] 1.2 Harden eval validators to reject content-bearing fields in cases, results, manual notes, and trace-like inputs.
- [x] 1.3 Add synthetic fixture tests proving valid ordinary-reader cases/results pass and unsafe private-content fields fail.

## 2. Trace Aggregation

- [x] 2.1 Add pure trace aggregation helpers that group `reader_ai.trace`-style metadata by `runId`.
- [x] 2.2 Summarize safe fields: stage durations, source/candidate counts, issue counts, first-output latency, over-budget stage, and final outcome.
- [x] 2.3 Add tests showing unknown/content-bearing trace fields are ignored and never copied into summaries.

## 3. Eval Reporting

- [ ] 3.1 Add metadata-only eval summary helpers for total cases, category breakdown, pass/fail counts, insufficient-answer counts, citation-valid counts, latency summary, and over-budget stage breakdown.
- [ ] 3.2 Add report tests using synthetic cases/results and trace summaries.
- [ ] 3.3 Document manual NotebookLM full-book benchmark notes as non-authoritative metadata separate from deterministic pass/fail.

## 4. Verification and Handoff

- [ ] 4.1 Run focused eval and diagnostics tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with Phase 2 eval harness scope, validation evidence, and deferred quality-analysis follow-ups.

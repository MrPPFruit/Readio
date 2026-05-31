## 1. Baseline Metadata Contract

- [x] 1.1 Add failing tests for building a quality baseline summary from valid metadata-only eval envelopes.
- [x] 1.2 Add failing tests for rejecting unsafe baseline input fields and preventing partial artifact writes.
- [x] 1.3 Implement baseline metadata validation and deterministic aggregation by category, language, provider/model label, pass/fail, reason, citation, source-count bucket, latency bucket, and over-budget stage.

## 2. Baseline Runner and CLI Workflow

- [x] 2.1 Add failing tests for a local baseline runner or CLI wrapper that reads sanitized eval artifacts and writes JSON/Markdown outputs.
- [x] 2.2 Implement the minimal local baseline runner or CLI wrapper without calling providers, reading runtime settings, preparing retrieval, automating NotebookLM, or changing UI/runtime app behavior.
- [x] 2.3 Ensure invalid input, unsafe metadata, and output write failures fail closed without partial baseline artifacts.

## 3. Manual Observation and Documentation

- [x] 3.1 Add tests proving manual NotebookLM/human observation labels are reported separately and do not affect deterministic pass/fail totals.
- [ ] 3.2 Update eval README with the quality baseline workflow, privacy boundaries, and guidance that generated artifacts require review before commit.
- [ ] 3.3 Run focused eval tests, lint, full app test suite, and `openspec validate --all --strict`.

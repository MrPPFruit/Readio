## 1. Runtime Provider Bridge

- [x] 1.1 Add failing tests for runtime-only provider configuration inputs and missing credential preflight failures.
- [x] 1.2 Implement runtime provider bridge parsing without allowing API keys, base URLs, or secrets in fixture JSON or generated artifacts.
- [ ] 1.3 Wire the live fixture CLI to construct AI settings from runtime bridge inputs only after `--live` and fixture `live: true` pass.

## 2. Runtime Retrieval Seed Bridge

- [ ] 2.1 Add failing tests for valid retrieval seed preparation and missing retrieval context preflight failures.
- [ ] 2.2 Implement minimal retrieval seed preparation for bounded local fixture runs without depending on normal app UI state.
- [ ] 2.3 Ensure provider execution is skipped when retrieval context cannot be prepared.

## 3. Privacy and Reporting Validation

- [ ] 3.1 Add tests proving generated envelope/report artifacts exclude runtime API keys, base URLs, seed text, source previews, local paths, URLs, book hashes, and stable private identifiers.
- [ ] 3.2 Update eval README with the local runtime bridge workflow and explicit non-commit guidance for runtime seed files.
- [ ] 3.3 Run focused eval tests, lint, full test suite, and `openspec validate --all --strict`.

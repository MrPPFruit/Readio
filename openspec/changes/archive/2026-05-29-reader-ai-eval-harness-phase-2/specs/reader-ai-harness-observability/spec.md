## ADDED Requirements

### Requirement: Reader AI trace consumers remain privacy-safe

The system SHALL allow local tools to consume Reader AI trace diagnostics for evaluation and reporting while preserving the same metadata-only privacy boundary as trace emission.

#### Scenario: Eval tooling consumes trace metadata

- **WHEN** local eval tooling reads Reader AI trace-like metadata for a run identifier
- **THEN** it uses only run id, stage/action/status enums, counts, durations, issue type counts, latency budgets, and normalized outcome metadata

#### Scenario: Eval tooling rejects content-bearing trace data

- **WHEN** trace-like input includes raw question text, answer text, source text, snippets, prompts, book identity, local paths, URLs, or credentials
- **THEN** local eval tooling does not copy those fields into summaries or reports

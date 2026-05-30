## ADDED Requirements

### Requirement: Report CLI can render live fixture envelopes

The system SHALL allow metadata-only envelopes produced by the live fixture eval runner to be rendered through the existing local report runner and report CLI contract.

#### Scenario: Live fixture envelope is reportable

- **WHEN** the live fixture runner writes a valid metadata-only envelope containing cases, results, and trace-like metadata
- **THEN** the existing report runner or CLI path can produce sanitized deterministic JSON and Markdown reports from that envelope

#### Scenario: Report rendering preserves privacy for live fixture outputs

- **WHEN** live fixture output metadata is rendered into reports
- **THEN** the report artifacts contain only sanitized eval summaries and do not include raw answers, source text, prompts, local paths, URLs, credentials, book hashes, or stable private book identifiers

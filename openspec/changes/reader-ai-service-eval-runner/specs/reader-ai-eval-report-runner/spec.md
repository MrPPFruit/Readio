## ADDED Requirements

### Requirement: Report runner accepts service eval envelopes

The system SHALL allow service-level Reader AI eval runner envelopes to be passed into the existing metadata-only report runner without changing the report privacy contract.

#### Scenario: Service eval envelope is reportable

- **WHEN** the service eval runner returns an envelope with eval cases, eval results, and trace-like metadata
- **THEN** `buildReaderAIEvalReportRun` accepts the envelope and produces deterministic JSON and Markdown reports using the existing report shape

#### Scenario: Unsafe service eval fields are rejected

- **WHEN** a service eval envelope includes raw answer text, source text, prompt text, local paths, URLs, credentials, book hashes, or stable private book identifiers
- **THEN** the report runner rejects the envelope or omits unsafe trace fields according to the existing eval privacy rules

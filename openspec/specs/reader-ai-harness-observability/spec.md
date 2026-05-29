## Purpose

Define privacy-safe Reader AI harness diagnostics and local trace-consumer behavior so evaluation tooling can use run metadata without exposing raw user, book, prompt, path, URL, or credential content.

## Requirements

### Requirement: Per-turn Reader AI run trace

The system SHALL assign a stable opaque run identifier to each Reader AI user turn and include that identifier in all diagnostics emitted for that turn.

#### Scenario: Successful Reader AI turn emits correlated events

- **WHEN** a Reader AI user turn starts and completes successfully
- **THEN** diagnostics for ask start, retrieval, generation, citation processing, persistence, and ask completion include the same run identifier

#### Scenario: Failed Reader AI turn emits correlated failure events

- **WHEN** a Reader AI user turn fails before producing a final answer
- **THEN** the failure diagnostic includes the same run identifier and a normalized outcome or error category

### Requirement: Privacy-safe diagnostic payloads

The system MUST keep Reader AI harness diagnostics metadata-only and MUST NOT include raw question text, raw answer text, source text, book title, author name, book hash, local path, prompts, or API keys.

#### Scenario: Diagnostic export contains Reader AI trace events

- **WHEN** diagnostics are exported after Reader AI usage
- **THEN** Reader AI trace events contain stage metadata, counts, durations, enums, and run identifiers without raw user or book content

#### Scenario: Redaction protects sensitive fields

- **WHEN** a diagnostic event attempts to include sensitive keys or values
- **THEN** the diagnostics redaction layer removes or masks those fields before persistence/export

### Requirement: Retrieval action observability

The system SHALL emit metadata-only diagnostics for Reader AI retrieval planning and retrieval action outcomes.

#### Scenario: Retrieval plan is recorded

- **WHEN** Reader AI prepares evidence retrieval for a user turn
- **THEN** diagnostics record the run identifier, classification intent, scope, enabled retrieval actions, and configured limits without storing content

#### Scenario: Retrieval action outcome is recorded

- **WHEN** a retrieval action such as hybrid search, entity sidecar lookup, cross-language rewrite, current context injection, or context packing completes
- **THEN** diagnostics record the action kind, candidate count, selected count when applicable, duration, and fallback reason when applicable

### Requirement: Latency-aware Reader AI harness

The system SHALL record metadata-only timing diagnostics for Reader AI stages that affect when the user first sees answer output.

#### Scenario: First-output path timing is recorded

- **WHEN** a Reader AI user turn runs on an indexed book
- **THEN** diagnostics record the run identifier, retrieval timing, generation start timing, first-output timing when available, full-generation timing, and post-generation citation timing without storing user or book content

#### Scenario: Over-budget first output is diagnosable

- **WHEN** visible answer output cannot begin within the product target budget of roughly 10-15 seconds
- **THEN** diagnostics identify the blocking stage as retrieval, provider/model first token, generation, citation validation/repair, indexing, cancellation, timeout, or unknown using normalized metadata

### Requirement: Citation pipeline observability

The system SHALL emit metadata-only diagnostics for citation validation, repair, and insufficient-answer fallback decisions.

#### Scenario: Citation validation outcome is recorded

- **WHEN** Reader AI validates answer citations against sources
- **THEN** diagnostics record the run identifier, citation count, source count, validity result, issue count, and issue type counts

#### Scenario: Citation repair outcome is recorded

- **WHEN** Reader AI attempts citation repair after validation failure
- **THEN** diagnostics record whether repair was attempted, whether it succeeded, and the normalized reason if it failed

#### Scenario: Insufficient-answer fallback is recorded

- **WHEN** Reader AI returns a grounded insufficient-answer response
- **THEN** diagnostics record the run identifier and normalized reason without storing the answer text or source text

### Requirement: Reader AI evaluation harness foundation

The system SHALL provide a minimal local evaluation harness foundation for ordinary-reader Reader AI QA cases.

#### Scenario: Evaluation case schema captures ordinary reader tasks

- **WHEN** a Reader AI evaluation case is defined
- **THEN** it can classify the case as person recall, object recall, event recap, relationship recall, current recap, citation grounding, or spoiler safety

#### Scenario: Evaluation result records objective metadata

- **WHEN** a Reader AI evaluation case is executed or manually recorded
- **THEN** the result can record intent classification, source count, citation validity, insufficient-answer status, latency, and pass/fail reasons without requiring raw copyrighted book text in committed files

### Requirement: Non-invasive first implementation slice

The first implementation slice SHALL preserve existing Reader AI UI design, citation visual design, answer generation behavior, and user-facing source preview behavior.

#### Scenario: Harness diagnostics are added

- **WHEN** the first implementation slice is completed
- **THEN** existing Reader AI user-facing behavior remains unchanged except for additional local diagnostics and test/eval artifacts

### Requirement: Reader AI trace consumers remain privacy-safe

The system SHALL allow local tools to consume Reader AI trace diagnostics for evaluation and reporting while preserving the same metadata-only privacy boundary as trace emission.

#### Scenario: Eval tooling consumes trace metadata

- **WHEN** local eval tooling reads Reader AI trace-like metadata for a run identifier
- **THEN** it uses only run id, stage/action/status enums, counts, durations, issue type counts, latency budgets, and normalized outcome metadata

#### Scenario: Eval tooling rejects content-bearing trace data

- **WHEN** trace-like input includes raw question text, answer text, source text, snippets, prompts, book identity, local paths, URLs, or credentials
- **THEN** local eval tooling does not copy those fields into summaries or reports

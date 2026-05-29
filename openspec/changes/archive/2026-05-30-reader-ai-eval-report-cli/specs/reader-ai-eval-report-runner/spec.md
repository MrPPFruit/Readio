## ADDED Requirements

### Requirement: Report runner supports file-based local command wrapping

The system SHALL allow the existing pure Reader AI eval report runner to be used by a local file-based command without changing the runner privacy contract or report shape.

#### Scenario: CLI wrapper delegates report generation

- **WHEN** the local CLI wrapper reads a parsed metadata envelope from disk
- **THEN** it delegates validation and report generation to the existing pure report runner rather than duplicating case validation, result validation, trace aggregation, or report summary rules

#### Scenario: CLI wrapper preserves sanitized output boundary

- **WHEN** the local CLI wrapper writes report artifacts
- **THEN** it writes only the sanitized `ReaderAIEvalReport` JSON and deterministic Markdown returned by the report runner, without copying raw input records into outputs

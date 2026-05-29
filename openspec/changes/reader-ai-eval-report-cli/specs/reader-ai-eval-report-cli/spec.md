## ADDED Requirements

### Requirement: Local report CLI accepts explicit file paths

The system SHALL provide a local command wrapper that accepts explicit input, JSON output, and Markdown output file paths for Reader AI eval reports.

#### Scenario: Required file arguments are provided

- **WHEN** the local report CLI is invoked with `--input`, `--json-out`, and `--markdown-out` paths
- **THEN** the command reads the input path and prepares to write both output paths after validation succeeds

#### Scenario: Required file arguments are missing

- **WHEN** the local report CLI is invoked without one or more required file path arguments
- **THEN** the command exits non-zero with deterministic usage issues and does not write report outputs

### Requirement: Local report CLI writes deterministic artifacts

The system SHALL write deterministic metadata-only JSON and Markdown report files from a valid local Reader AI eval report envelope.

#### Scenario: Valid input produces both report files

- **WHEN** the local report CLI receives a valid JSON envelope containing eval cases, eval results, and optional trace-like metadata
- **THEN** it writes the sanitized `ReaderAIEvalReport` JSON to the JSON output path and deterministic Markdown to the Markdown output path

#### Scenario: Invalid input produces no partial report files

- **WHEN** the input file is invalid JSON, has invalid envelope fields, or contains unsafe case/result metadata
- **THEN** the command exits non-zero, reports deterministic issues, and does not write partial JSON or Markdown report files

### Requirement: Local report CLI remains non-invasive

The system SHALL keep the CLI wrapper local-only and MUST NOT execute Reader AI answers, load books, call model providers, alter app runtime behavior, or upload telemetry.

#### Scenario: CLI uses existing metadata only

- **WHEN** the local report CLI generates a report
- **THEN** it uses only the provided local metadata envelope and the existing pure report runner without invoking answer generation, indexing, retrieval, UI rendering, NotebookLM automation, or remote telemetry

## Purpose

Provide a local metadata-only Reader AI eval report runner that converts validated eval cases, manually recorded results, optional Reader AI trace-like diagnostics, and service-level eval envelopes into deterministic JSON and Markdown evidence without invoking model providers, loading books, changing runtime behavior, or exposing private content.

## Requirements

### Requirement: Local eval report input loading

The system SHALL load local metadata-only Reader AI eval report inputs from JSON data containing eval cases, eval results, and optional Reader AI trace-like events.

#### Scenario: Valid report input is accepted

- **WHEN** a report input contains arrays of eval cases, eval results, and trace-like metadata events
- **THEN** the runner accepts the input and prepares the data for validation and report generation

#### Scenario: Invalid report input is rejected

- **WHEN** a report input is not an object or contains non-array cases, results, or traces fields
- **THEN** the runner rejects the input with validation issues instead of generating a report

### Requirement: Report runner validates metadata privacy

The system MUST validate report runner inputs with the Reader AI eval validators and MUST fail closed when cases or results contain unsafe content-bearing fields.

#### Scenario: Unsafe case or result blocks report generation

- **WHEN** a report input contains raw answer text, source text, prompts, local paths, book hashes, URLs, API keys, or stable private book identifiers
- **THEN** the runner returns validation issues and does not include those raw values in JSON or Markdown output

#### Scenario: Unsafe trace fields are omitted from summaries

- **WHEN** trace-like input includes raw question text, answer text, source text, snippets, prompts, book identity, local paths, URLs, or credentials
- **THEN** trace aggregation ignores those fields and the generated report output does not copy them

### Requirement: Deterministic JSON and Markdown reports

The system SHALL generate deterministic metadata-only JSON and Markdown reports from validated eval inputs.

#### Scenario: JSON report is produced

- **WHEN** the runner receives valid eval cases, eval results, and optional traces
- **THEN** it returns a JSON report with totals, pass/fail counts, category summaries, latency summaries, over-budget stage breakdowns, and trace run summaries

#### Scenario: Markdown report is produced

- **WHEN** the runner receives valid eval cases, eval results, and optional traces
- **THEN** it returns Markdown with stable overview, category, latency, and run-summary sections derived only from sanitized report data

### Requirement: Report runner remains local and non-invasive

The system SHALL keep Reader AI eval report runner execution local and MUST NOT call model providers, load real books, alter Reader AI runtime behavior, or upload telemetry.

#### Scenario: Report generation uses existing metadata only

- **WHEN** a report is generated
- **THEN** the runner uses only provided local metadata inputs and does not invoke answer generation, indexing, retrieval, UI rendering, NotebookLM automation, or remote telemetry

### Requirement: Report runner supports file-based local command wrapping

The system SHALL allow the existing pure Reader AI eval report runner to be used by a local file-based command without changing the runner privacy contract or report shape.

#### Scenario: CLI wrapper delegates report generation

- **WHEN** the local CLI wrapper reads a parsed metadata envelope from disk
- **THEN** it delegates validation and report generation to the existing pure report runner rather than duplicating case validation, result validation, trace aggregation, or report summary rules

#### Scenario: CLI wrapper preserves sanitized output boundary

- **WHEN** the local CLI wrapper writes report artifacts
- **THEN** it writes only the sanitized `ReaderAIEvalReport` JSON and deterministic Markdown returned by the report runner, without copying raw input records into outputs

### Requirement: Report runner accepts service eval envelopes

The system SHALL allow service-level Reader AI eval runner envelopes to be passed into the existing metadata-only report runner without changing the report privacy contract.

#### Scenario: Service eval envelope is reportable

- **WHEN** the service eval runner returns an envelope with eval cases, eval results, and trace-like metadata
- **THEN** `buildReaderAIEvalReportRun` accepts the envelope and produces deterministic JSON and Markdown reports using the existing report shape

#### Scenario: Unsafe service eval fields are rejected

- **WHEN** a service eval envelope includes raw answer text, source text, prompt text, local paths, URLs, credentials, book hashes, or stable private book identifiers
- **THEN** the report runner rejects the envelope or omits unsafe trace fields according to the existing eval privacy rules

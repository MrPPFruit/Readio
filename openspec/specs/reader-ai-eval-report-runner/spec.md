## Purpose

Provide a local metadata-only Reader AI eval report runner that converts validated eval cases, manually recorded results, and optional Reader AI trace-like diagnostics into deterministic JSON and Markdown evidence without invoking model providers, loading books, changing runtime behavior, or exposing private content.

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

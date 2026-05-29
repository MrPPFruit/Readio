## Purpose

Provide local metadata-only Reader AI evaluation validation, trace aggregation, and report summaries for ordinary-reader QA workflows without storing private reading content.

## Requirements

### Requirement: Eval case fixture validation

The system SHALL validate Reader AI eval case fixtures before execution or reporting, and MUST reject committed case data that contains raw source text, answer text, prompts, local paths, book hashes, API keys, or stable private book identifiers.

#### Scenario: Valid ordinary-reader case is accepted

- **WHEN** an eval case includes an id, ordinary-reader category, language, user-style question, expected behavior, and spoiler mode
- **THEN** the validator accepts the case without requiring private book text

#### Scenario: Content-bearing case fields are rejected

- **WHEN** an eval case includes source text, answer text, raw prompts, local paths, book hashes, API keys, or stable private book identifiers
- **THEN** the validator rejects the case and reports the unsafe fields

### Requirement: Eval result validation

The system SHALL validate Reader AI eval result records with objective metadata and MUST keep result records free of raw answers, raw source text, prompts, local paths, API keys, and private book identifiers.

#### Scenario: Valid metadata-only result is accepted

- **WHEN** an eval result records case id, run id, intent, source count, citation validity, insufficient-answer status, first-output latency, pass/fail status, and structured reasons
- **THEN** the validator accepts the result as metadata-only evidence

#### Scenario: Unsafe result content is rejected

- **WHEN** an eval result includes raw answer text, source text, prompts, local paths, API keys, or stable private book identifiers
- **THEN** the validator rejects the result and reports the unsafe fields

### Requirement: Trace aggregation by run identifier

The system SHALL aggregate Reader AI trace metadata by opaque run identifier and summarize only safe metadata fields.

#### Scenario: Run trace summary is produced

- **WHEN** trace events for a Reader AI run include retrieval, generation, citation, persistence, and completion metadata with the same run identifier
- **THEN** the aggregation result reports stage durations, source/candidate counts, citation issue counts, first-output latency, over-budget stage, and final outcome without raw content

#### Scenario: Unknown or unsafe trace fields are ignored

- **WHEN** trace input includes unknown fields or content-bearing fields
- **THEN** aggregation ignores those fields and does not copy them into the summary

### Requirement: Eval report summary

The system SHALL produce a compact metadata-only Reader AI eval report from validated cases, results, and optional trace summaries.

#### Scenario: Category-level report is produced

- **WHEN** eval results are grouped across ordinary-reader categories
- **THEN** the report includes total cases, pass/fail counts, citation-valid counts, insufficient-answer counts, first-output latency summary, and over-budget stage breakdown by category

#### Scenario: Report omits private content

- **WHEN** the report is generated from cases, results, and trace summaries
- **THEN** the report omits raw source text, raw answers, prompts, book titles, book hashes, local paths, URLs, and API keys

### Requirement: Manual benchmark notes remain non-authoritative

The system SHALL allow manual benchmark metadata to be recorded separately from deterministic eval pass/fail status.

#### Scenario: NotebookLM comparison is recorded as manual metadata

- **WHEN** a user compares a Readio answer with NotebookLM full-book mode
- **THEN** the eval record can note benchmark source, spoiler mode, and non-content observations without treating NotebookLM output as an automated oracle

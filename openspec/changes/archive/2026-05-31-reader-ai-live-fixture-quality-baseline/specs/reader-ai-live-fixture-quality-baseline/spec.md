## ADDED Requirements

### Requirement: Quality baseline summarizes live fixture metadata

The system SHALL provide a local-only Reader AI quality baseline workflow that summarizes one or more metadata-only live fixture eval envelopes without calling model providers or reading raw book content.

#### Scenario: Baseline summarizes ordinary-reader QA coverage

- **WHEN** the baseline workflow receives valid live fixture eval metadata containing cases and results
- **THEN** it reports coverage counts by ordinary-reader QA category, language, provider label, model label, pass/fail label, failure reason label, citation-valid label, source-count bucket, and first-output latency bucket

#### Scenario: Baseline rejects invalid eval metadata

- **WHEN** the baseline workflow receives missing, malformed, or internally inconsistent case/result metadata
- **THEN** it fails closed with deterministic validation issues and writes no partial baseline artifact

### Requirement: Quality baseline preserves metadata-only artifacts

The system MUST keep quality baseline inputs and generated artifacts free of raw private or provider data.

#### Scenario: Unsafe baseline content is rejected

- **WHEN** baseline input metadata contains raw answer text, raw source text, prompt text, API keys, custom base URLs, local paths, URLs, book hashes, stable private identifiers, or raw exception details
- **THEN** the baseline workflow rejects the input with deterministic validation issues and writes no partial baseline artifact

#### Scenario: Baseline output contains only safe labels and counts

- **WHEN** the baseline workflow writes JSON or Markdown output
- **THEN** the output contains only safe labels, counts, buckets, aggregate timings, and non-authoritative manual observation labels, without raw answers, prompts, source previews, runtime paths, API keys, URLs, book hashes, or stable private identifiers

### Requirement: Quality baseline treats manual comparisons as non-authoritative observations

The system SHALL support manual NotebookLM or human comparison observations only as short non-authoritative metadata labels.

#### Scenario: Manual observations do not affect deterministic scoring

- **WHEN** baseline input includes manual NotebookLM or human observation labels
- **THEN** the baseline workflow reports observation-label counts separately and does not use them to alter deterministic pass/fail totals

#### Scenario: Manual comparison text is not accepted

- **WHEN** baseline input attempts to include copied NotebookLM output, copied Readio answer text, or other raw comparison text
- **THEN** the baseline workflow rejects the input as unsafe metadata

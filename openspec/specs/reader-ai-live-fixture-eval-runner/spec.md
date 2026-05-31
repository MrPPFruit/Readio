## Purpose

Provide a local, guarded live fixture eval runner for Reader AI that can execute a small explicitly configured real-service fixture set and write metadata-only eval/report artifacts without changing app runtime behavior, leaking private book content, or allowing accidental provider calls.

## Requirements

### Requirement: Live fixture runner accepts explicit metadata-only fixtures

The system SHALL provide a local live fixture eval runner that accepts an explicit metadata-only fixture file for one controlled Reader AI real-book run set.

#### Scenario: Valid fixture is accepted

- **WHEN** the live fixture runner receives a fixture containing eval cases, safe run labels, Reader AI settings labels, read boundary metadata, and output paths
- **THEN** it validates the fixture and prepares a service eval input without requiring raw book text, raw answer text, prompts, source text, API keys, local paths, URLs, book hashes, or stable private identifiers in committed fixture data

#### Scenario: Unsafe fixture content is rejected

- **WHEN** a fixture contains raw answer text, raw source text, prompt text, API keys, URLs, local paths, book hashes, or stable private identifiers in persisted metadata fields
- **THEN** the runner rejects the fixture with deterministic validation issues and does not execute a live run or write partial output artifacts

### Requirement: Live fixture runner requires explicit provider execution opt-in

The system SHALL prevent accidental live model/provider execution by default.

#### Scenario: Missing live opt-in blocks provider execution

- **WHEN** the runner is invoked without the explicit live execution flag
- **THEN** it refuses to call the real Reader AI answer streamer and exits with a deterministic safety message

#### Scenario: Live opt-in executes bounded cases

- **WHEN** the runner is invoked with explicit live execution enabled and a valid fixture
- **THEN** it executes no more than the configured case limit through the real Reader AI service path and records provider/model labels, source counts, first-output latency, pass/fail labels, and safe trace metadata

### Requirement: Live fixture runner writes metadata-only eval artifacts

The system SHALL write only metadata-only eval artifacts from live fixture runs.

#### Scenario: Successful live fixture run writes envelope and report artifacts

- **WHEN** a live fixture run completes and report validation succeeds
- **THEN** the runner writes a reportable eval envelope and optional sanitized JSON/Markdown report outputs using the existing eval report shape

#### Scenario: Live fixture run failure remains metadata-only

- **WHEN** the real Reader AI stream throws, times out, or is aborted
- **THEN** the runner records safe failure labels and trace metadata without writing raw exception messages, answer text, prompt text, source previews, book identity, API keys, or local paths

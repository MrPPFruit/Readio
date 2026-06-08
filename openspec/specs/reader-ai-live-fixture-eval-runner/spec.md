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

The system SHALL prevent accidental live model/provider execution by default and SHALL require runtime bridge preflight checks before calling a real provider.

#### Scenario: Missing live opt-in blocks provider execution

- **WHEN** the runner is invoked without the explicit live execution flag
- **THEN** it refuses to call the real Reader AI answer streamer and exits with a deterministic safety message

#### Scenario: Live opt-in executes bounded cases

- **WHEN** the runner is invoked with explicit live execution enabled, a valid fixture, and valid runtime bridge inputs
- **THEN** it executes no more than the configured case limit through the real Reader AI service path and records provider/model labels, source counts, first-output latency, pass/fail labels, and safe trace metadata

#### Scenario: Runtime bridge preflight blocks unsafe live execution

- **WHEN** the runner is invoked with live execution enabled but required runtime provider or retrieval inputs are unavailable
- **THEN** it fails before calling the real Reader AI answer streamer and writes no partial output artifacts

### Requirement: Live fixture runner writes metadata-only eval artifacts

The system SHALL write only metadata-only eval artifacts from live fixture runs.

#### Scenario: Successful live fixture run writes envelope and report artifacts

- **WHEN** a live fixture run completes and report validation succeeds
- **THEN** the runner writes a reportable eval envelope and optional sanitized JSON/Markdown report outputs using the existing eval report shape

#### Scenario: Live fixture run failure remains metadata-only

- **WHEN** the real Reader AI stream throws, times out, or is aborted
- **THEN** the runner records safe failure labels and trace metadata without writing raw exception messages, answer text, prompt text, source previews, book identity, API keys, or local paths

### Requirement: Live fixture artifacts can feed quality baseline workflows

The system SHALL keep live fixture eval outputs compatible with local quality baseline workflows while preserving guarded execution and metadata-only artifacts.

#### Scenario: Successful live fixture output is baseline-compatible

- **WHEN** a guarded live fixture run completes and writes a sanitized eval envelope or report
- **THEN** the output contains the case/result/trace metadata needed by the local quality baseline workflow without requiring raw answer text, source text, prompts, provider secrets, runtime file paths, book hashes, or stable private identifiers

#### Scenario: Failed live fixture output remains safe for baseline validation

- **WHEN** a guarded live fixture run fails before or during provider execution
- **THEN** any reported failure metadata uses safe deterministic labels that the quality baseline workflow can validate or reject without exposing raw exception messages, raw answers, source previews, runtime paths, API keys, URLs, book hashes, or stable private identifiers

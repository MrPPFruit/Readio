## Purpose

Provide a local service-level Reader AI eval harness that executes controlled eval cases through an explicitly injected answer stream function and converts the runs into metadata-only eval envelopes without loading real books, calling providers by default, changing UI/runtime behavior, or exposing private content.

## Requirements

### Requirement: Service eval runner executes controlled Reader AI cases

The system SHALL provide a local service-level eval runner that executes Reader AI eval cases through an explicitly provided answer stream function and controlled run context.

#### Scenario: Case run invokes injected answer stream

- **WHEN** the service eval runner receives a valid eval case, Reader AI settings, book/session metadata, and an injected answer stream function
- **THEN** it invokes the injected stream function with the case question and controlled Reader AI context without loading books, scanning the library, or calling providers on its own

#### Scenario: Multiple cases produce stable run identifiers

- **WHEN** the service eval runner executes multiple eval cases
- **THEN** each case result receives a deterministic run identifier derived from the case id and run order unless an explicit run id is provided

### Requirement: Service eval runner produces metadata-only result envelopes

The system SHALL convert service-level Reader AI runs into metadata-only eval result envelopes compatible with the existing report runner.

#### Scenario: Successful run records objective metadata

- **WHEN** an injected answer stream yields output and emits sources
- **THEN** the runner records safe result metadata including case id, run id, classification intent label, source count, citation validity label, insufficient-answer flag, first-output latency, pass/fail, reasons, provider/model labels, spoiler mode, and over-budget stage

#### Scenario: Failed run records safe failure metadata

- **WHEN** an injected answer stream throws or is aborted
- **THEN** the runner records a failed metadata result with a safe reason label and does not include raw exception messages that may contain private content

### Requirement: Service eval runner preserves privacy boundaries

The system MUST NOT include raw answer text, source text, prompt text, book title, author name, book hash, local paths, URLs, API keys, or stable private identifiers in service eval output.

#### Scenario: Output envelope excludes raw service content

- **WHEN** the service eval runner returns cases, results, and trace-like metadata
- **THEN** the returned envelope contains only metadata fields accepted by the Reader AI eval validators and no raw service content

#### Scenario: Trace collection remains metadata-only

- **WHEN** trace-like events are included in the service eval output
- **THEN** they include only privacy-safe trace metadata such as run id, stage, action, status, durations, counts, over-budget stage, and recovery hints

### Requirement: Service eval runner supports explicit live streamer callers

The system SHALL allow an external local runner to explicitly pass the real Reader AI answer streamer into the service eval runner without weakening the service eval runner privacy boundary.

#### Scenario: Explicit real streamer injection uses existing service contract

- **WHEN** a local live fixture runner passes the real Reader AI answer streamer as the injected `streamAnswer` dependency
- **THEN** the service eval runner invokes it through the same controlled `StreamReaderAIAnswerOptions` contract used by fake streamers

#### Scenario: Service eval output remains metadata-only for live callers

- **WHEN** the service eval runner is used by a live fixture caller
- **THEN** it still returns only eval cases, eval results, and sanitized trace-like metadata without raw answer text, source text, prompts, book titles, author names, book hashes, local paths, URLs, API keys, or stable private identifiers

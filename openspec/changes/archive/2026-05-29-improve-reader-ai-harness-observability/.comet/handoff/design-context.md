# Comet Design Handoff

- Change: improve-reader-ai-harness-observability
- Phase: design
- Mode: compact
- Context hash: 52061919ed18c3105b09125ae87c083cd084caf4b242acd5eba599f764a434cf

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/improve-reader-ai-harness-observability/proposal.md

- Source: openspec/changes/improve-reader-ai-harness-observability/proposal.md
- Lines: 1-38
- SHA256: fb3896a33bd06f89bfe1f70780a2a9be9e05f9f0e48f368f645b8f29ca16abc0

```md
## Why

Reader AI has grown from a simple reader helper into a multi-stage RAG/agent loop: question classification, retrieval, entity sidecar lookup, context packing, answer generation, citation validation/repair, source preview, and Android/WebView rendering. The current product works, but quality issues are still hard to diagnose because one user-facing failure can come from many hidden stages.

This change adds a privacy-safe harness layer so Readio can understand, reproduce, and improve Reader AI quality without guessing from screenshots or one-off manual tests.

## What Changes

- Add per-turn Reader AI run tracing with a stable `runId` that links UI lifecycle, retrieval, generation, citation validation/repair, persistence, and diagnostics events.
- Add metadata-only retrieval and citation diagnostics that explain which internal actions ran, how many candidates/sources they produced, how long each stage took, and why a turn ended in success, insufficient evidence, timeout, cancellation, or error.
- Add latency observability for the user-facing first-output path so Readio can preserve the product target of starting visible answers around 10-15 seconds for indexed books.
- Add a minimal Reader AI evaluation harness for ordinary-reader questions such as remembering people, objects, events, relationships, and recaps.
- Keep all diagnostics privacy-safe: no raw book text, raw question text, full answer text, API keys, local paths, or book titles in diagnostic events.
- Document a staged optimization path for later React/UX state-machine hardening, including request freshness, cancellation, suggestions, Android Back ordering, and citation preview stability.
- Do not change the current Reader AI UI design, citation chip visuals, source preview visual design, or public answer style as part of the first implementation slice.

## Capabilities

### New Capabilities

- `reader-ai-harness-observability`: Privacy-safe Reader AI run tracing, retrieval/citation diagnostics, evaluation harness behavior, and reliability requirements for the Reader AI agent loop.

### Modified Capabilities

- None. There are no existing OpenSpec capabilities in this repository yet.

## Impact

- Affected code areas:
  - `apps/readest-app/src/services/diagnostics/`
  - `apps/readest-app/src/services/ai/readerChatService.ts`
  - `apps/readest-app/src/services/ai/ragService.ts`
  - `apps/readest-app/src/services/ai/citationGrounding.ts`
  - `apps/readest-app/src/services/ai/citationVerifier.ts`
  - `apps/readest-app/src/app/reader/components/ai/ReaderAIAssistant.tsx`
  - Reader AI tests under `apps/readest-app/src/__tests__/ai/`
  - Diagnostics tests under `apps/readest-app/src/__tests__/services/diagnostics/`
- No new external runtime dependency is planned for the first slice.
- No server-side logging is introduced; diagnostics remain local/exportable and redacted.
- Android APK validation is only required when UI lifecycle or Android/WebView-specific behavior changes; harness-only logic can be validated with focused tests, full tests, and lint first.
```

## openspec/changes/improve-reader-ai-harness-observability/design.md

- Source: openspec/changes/improve-reader-ai-harness-observability/design.md
- Lines: 1-154
- SHA256: 0a00a0d4fce693c3a802abfc21ca5c2a8c988990cf7fb690140948e580c80891

[TRUNCATED]

````md
## Context

Reader AI now behaves like a small agent harness inside the reader. One user turn can involve UI state transitions, indexing checks, question routing, BM25/hybrid retrieval, entity sidecar lookup, context packing, model generation, citation validation, citation repair, source preview construction, local persistence, suggestions refresh, and Android/WebView rendering.

Recent work improved answer quality and citation behavior, but exposed a recurring problem: when a response is weak, delayed, insufficient, or visually odd, the system does not yet provide a single trace that explains which stage failed. Existing diagnostics are privacy-safe and useful, but they are mostly event breadcrumbs rather than a per-turn run trace.

This design treats Reader AI as a hybrid ReAct/function-calling harness:

```text
User question
  ↓
UI turn lifecycle ──────────────┐
  ↓                             │
Question routing                │
  ↓                             │
Retrieval plan/action results   │  runId links all stages
  ↓                             │
Context packing                 │
  ↓                             │
Generation                      │
  ↓                             │
Citation validation/repair      │
  ↓                             │
Persistence + UI rendering ─────┘
```
````

The first implementation slice should add observability without changing user-facing UI or answer behavior. A critical product constraint is first-answer latency: for indexed books, Readio should aim to start visible answer output around 10-15 seconds. Harness optimization must not become over-optimization that keeps users waiting for perfect retrieval or citation repair before seeing any answer.

## Goals / Non-Goals

**Goals:**

- Introduce a privacy-safe `runId` for each Reader AI user turn.
- Emit diagnostics that can reconstruct a turn's pipeline stages without storing user content or book content.
- Record retrieval action metadata: enabled paths, candidate counts, selected counts, fallback reasons, and stage durations.
- Record citation pipeline metadata: validation issue counts/types, repair attempts, repair outcomes, and insufficient-answer reasons.
- Define a minimal eval harness direction for ordinary-reader QA questions.
- Record stage timing so slow answers can be attributed to retrieval, provider/model first token, full generation, citation validation/repair, indexing, cancellation, timeout, or unknown.
- Keep diagnostics local/exportable and compatible with existing redaction rules.
- Preserve current UI, citation visuals, answer style, and existing Reader AI behavior in the first slice.

**Non-Goals:**

- No prompt rewrite for answer quality in the first slice.
- No new external observability service or telemetry upload.
- No raw question, raw answer, book title, book hash, local path, source text, or prompt logging.
- No React state-machine refactor in the first slice; that remains a later phase after trace observability.
- No NotebookLM automation dependency in tests; NotebookLM remains a manual/benchmark reference.
- No Android APK build for diagnostics-only changes unless UI lifecycle or Android WebView behavior changes.
- No retrieval, citation, or eval change may intentionally push indexed-book first visible answer output beyond the 10-15 second product target without explicit approval.

## Decisions

### Decision 1: Use a per-turn `runId` rather than relying on timestamps

Each Reader AI ask creates a stable opaque ID, passed from `ReaderAIAssistant` into `streamReaderAIAnswer` and downstream helpers. Every related diagnostic event includes this `runId`.

Alternatives considered:

- **Timestamp-only correlation**: simpler but fragile when suggestions, indexing, retries, or overlapping turns happen.
- **Conversation message ID as run ID**: tempting, but message IDs are UI/persistence concepts and should not become pipeline trace identity.

Rationale: `runId` gives the harness a single spine while keeping UI and storage IDs independent.

### Decision 2: Log metadata-only action results, not content

Diagnostics should record structured counts, enums, booleans, durations, and redacted identifiers. They must not log raw questions, answers, source snippets, prompts, book titles, author names, book hashes, file paths, or API keys.

Example safe fields:

```ts
{
  runId,
  stage: 'retrieval',
  intent: 'entity_lookup',
  scope: 'whole_book',
  action: 'entity_sidecar',
  candidateCount: 14,
  selectedCount: 6,
  durationMs: 18,
```

Full source: openspec/changes/improve-reader-ai-harness-observability/design.md

## openspec/changes/improve-reader-ai-harness-observability/tasks.md

- Source: openspec/changes/improve-reader-ai-harness-observability/tasks.md
- Lines: 1-39
- SHA256: 95185daa01986ca21610b00fc570325609ba3756114cc3cccf67e603e490400e

```md
## 1. Trace Schema, Privacy Guardrails, and Latency Budget

- [ ] 1.1 Add Reader AI run trace types, action taxonomy, status enums, outcome/error enums, and recovery hint enums.
- [ ] 1.2 Add diagnostics redaction/allowlist tests covering run trace payloads and sensitive field rejection.
- [ ] 1.3 Add helper functions for metadata-only Reader AI trace events.
- [ ] 1.4 Add first-output latency fields and normalized over-budget stage classification.

## 2. Per-Turn Run Trace

- [ ] 2.1 Generate a stable `runId` for each Reader AI ask turn in the UI/controller boundary.
- [ ] 2.2 Pass optional `runId` through `streamReaderAIAnswer` and downstream Reader AI service helpers.
- [ ] 2.3 Emit ask lifecycle diagnostics for started, completed, failed, timeout, and cancelled outcomes.

## 3. Retrieval and Context Diagnostics

- [ ] 3.1 Emit retrieval plan diagnostics with classification intent, scope, enabled actions, configured limits, and latency budget metadata.
- [ ] 3.2 Emit retrieval action diagnostics for hybrid search, entity sidecar, source-language fallback, current context injection, and context packing.
- [ ] 3.3 Emit stage timing diagnostics that can separate retrieval delay, provider first-token delay, generation delay, citation validation/repair delay, and indexing delay.
- [ ] 3.4 Add focused tests proving retrieval diagnostics are correlated by `runId` and contain no raw content.

## 4. Citation Pipeline Diagnostics

- [ ] 4.1 Emit citation validation diagnostics with issue counts and issue type counts.
- [ ] 4.2 Emit citation repair attempt/result diagnostics.
- [ ] 4.3 Emit insufficient-answer fallback diagnostics with normalized reasons.
- [ ] 4.4 Add focused tests covering successful citation validation, repair failure, and insufficient fallback traces.

## 5. Minimal Eval Harness Foundation

- [ ] 5.1 Add local Reader AI eval case/result schema documentation or fixtures for ordinary-reader QA categories.
- [ ] 5.2 Add a lightweight script or test utility that can validate eval case shape without requiring private book text.
- [ ] 5.3 Document how NotebookLM full-book mode should be used as a manual benchmark and how spoiler-mode validation differs.

## 6. Verification and Handoff

- [ ] 6.1 Run focused diagnostics and Reader AI tests.
- [ ] 6.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 6.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 6.4 Update `HANDOFF.md` with implementation summary, validation evidence, and remaining React state-machine follow-ups.
```

## openspec/changes/improve-reader-ai-harness-observability/specs/reader-ai-harness-observability/spec.md

- Source: openspec/changes/improve-reader-ai-harness-observability/specs/reader-ai-harness-observability/spec.md
- Lines: 1-78
- SHA256: 183102b9809c039e3f2ff8d8485e7fa98b117a589b5ea802327c688067261181

```md
## ADDED Requirements

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
```

# Comet Design Handoff

- Change: reader-ai-live-fixture-runtime-bridge
- Phase: design
- Mode: compact
- Context hash: 4a7d027165d0056f90d17f5137fba9d411ce5da4d7dba181acf3ea1f7af8ea50

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-live-fixture-runtime-bridge/proposal.md

- Source: openspec/changes/reader-ai-live-fixture-runtime-bridge/proposal.md
- Lines: 1-34
- SHA256: 7b608f507859098ca6d204b3ab0b69aedbd0e49609f9cb4187637892c18c3402

```md
## Why

The current live fixture runner is a privacy-safe execution skeleton, but it cannot yet produce a meaningful real Reader AI quality report from a local Node CLI because provider credentials and indexed retrieval context are not supplied through a safe runtime-only bridge. This blocks the next step: running a small real-book fixture to collect objective metadata before tuning retrieval, citation, or answer synthesis.

## What Changes

- Add a runtime-only bridge for local live fixture execution that supplies provider credentials and retrieval context without committing secrets or raw book text.
- Keep the existing double opt-in live gates (`--live` and fixture `live: true`).
- Allow local fixtures to reference runtime-only environment/provider configuration and seeded eval chunks needed for a bounded smoke run.
- Preserve metadata-only output: no raw answer text, source text, prompt text, local paths, URLs, API keys, book hashes, or stable private identifiers in generated eval artifacts.
- Do not change Reader AI UI/runtime behavior for normal app usage.

## Capabilities

### New Capabilities

- `reader-ai-live-fixture-runtime-bridge`: Runtime-only local bridge for live fixture execution inputs, provider credentials, and seeded retrieval context.

### Modified Capabilities

- `reader-ai-live-fixture-eval-runner`: Live fixture runner can use the runtime bridge while preserving live execution gates and metadata-only artifacts.

## Impact

- Affected code:
  - `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
  - `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
  - `apps/readest-app/src/services/ai/eval/README.md`
  - focused Reader AI eval tests
- Systems:
  - local-only eval CLI path
  - Reader AI service eval harness
  - OpenSpec Reader AI eval specs
- No production UI changes, no NotebookLM automation, no LLM-as-judge, and no committed real-book fixture artifacts.
```

## openspec/changes/reader-ai-live-fixture-runtime-bridge/design.md

- Source: openspec/changes/reader-ai-live-fixture-runtime-bridge/design.md
- Lines: 1-95
- SHA256: 603a0e4ea43809865c7037cefca9c6cb4926738bd9d1fe7691e4bea165ab48b6

[TRUNCATED]

````md
## Context

The previous change added a guarded live fixture runner, but investigation showed it is not yet enough to produce a real local quality report. The runner builds `AISettings` with `providerApiKeys: {}` and calls the real `streamReaderAIAnswer` from a Node CLI path. That service also relies on indexed retrieval context via `aiStore`, which expects browser IndexedDB state unless retrieval context has been seeded.

The next step is not to tune Reader AI answers. It is to make the local eval path actually runnable in a controlled developer environment so the first true metadata-only quality report can be generated.

Current flow:

```text
fixture.json + --live
  -> reader-ai:live-fixture CLI
  -> runReaderAILiveFixtureEval
  -> runReaderAIServiceEval
  -> injected streamReaderAIAnswer
  -> retrieval + provider generation
  -> metadata-only envelope/report
```
````

Missing bridge:

```text
runtime-only secrets/config       runtime-only retrieval seed
          |                                  |
          v                                  v
      AISettings with key          aiStore/search-compatible chunks
          \__________________________________/
                            |
                            v
                   real streamReaderAIAnswer
```

## Goals / Non-Goals

**Goals:**

- Add a local runtime bridge that can supply provider API key/base URL/model settings without persisting secrets in fixture JSON or report output.
- Add a local retrieval seed path sufficient for a small bounded fixture run without requiring browser UI interaction.
- Keep fixture and output artifacts metadata-only by default.
- Preserve explicit live execution gates and small-run guardrails.
- Keep behavior deterministic and testable with fake provider/retrieval dependencies.

**Non-Goals:**

- No Reader AI product behavior changes.
- No UI/UX changes.
- No committed real-book text, answer text, prompt text, API keys, local paths, URLs, book hashes, or stable private identifiers.
- No NotebookLM automation.
- No LLM-as-judge.
- No large batch runner or library-wide fixture discovery.

## Decisions

### Decision 1: Use runtime-only provider inputs instead of fixture secrets

The CLI SHALL accept provider secret material only from runtime-only sources, such as environment variables or an explicitly provided local runtime settings file that is not intended for commit. Fixture JSON remains metadata-only and contains only provider/model labels.

Alternatives considered:

- Store API key in fixture: rejected because fixtures may be shared or accidentally committed.
- Load full app settings automatically: rejected for this slice because app settings require filesystem/platform context and can leak unrelated user preferences.
- Require custom local proxy only: rejected because it is useful later but should not be the only supported path.

### Decision 2: Seed retrieval context explicitly for local eval smoke runs

The bridge SHALL support a runtime-only retrieval seed that prepares the minimal indexed chunk context required by `streamReaderAIAnswer`. Seed inputs are local developer evidence and are not committed. The output remains metadata-only.

Alternatives considered:

- Load real EPUB from a path: rejected for this slice because it expands scope into parsing/import and risks path/text leakage.
- Depend on browser IndexedDB state: rejected because the Node CLI cannot reliably access the app's browser DB.
- Mock retrieval while calling a real provider: useful for tests but not a true live fixture path through Reader AI retrieval.

### Decision 3: Keep the bridge under the existing live runner rather than adding a second runner

The existing `reader-ai:live-fixture` command remains the entry point, with additional runtime bridge inputs. This avoids parallel eval commands and keeps safety gates centralized.

Alternatives considered:

- New command: rejected because it would duplicate live safety logic.
- Fold into generic report CLI: rejected because report CLI must remain pure and non-invasive.

````

Full source: openspec/changes/reader-ai-live-fixture-runtime-bridge/design.md

## openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md

- Source: openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md
- Lines: 1-17
- SHA256: 310e7b76e33045350057ad1919bea6d1f3c48ed3384dc663a6cc13839a416bb5

```md
## 1. Runtime Provider Bridge

- [ ] 1.1 Add failing tests for runtime-only provider configuration inputs and missing credential preflight failures.
- [ ] 1.2 Implement runtime provider bridge parsing without allowing API keys, base URLs, or secrets in fixture JSON or generated artifacts.
- [ ] 1.3 Wire the live fixture CLI to construct AI settings from runtime bridge inputs only after `--live` and fixture `live: true` pass.

## 2. Runtime Retrieval Seed Bridge

- [ ] 2.1 Add failing tests for valid retrieval seed preparation and missing retrieval context preflight failures.
- [ ] 2.2 Implement minimal retrieval seed preparation for bounded local fixture runs without depending on normal app UI state.
- [ ] 2.3 Ensure provider execution is skipped when retrieval context cannot be prepared.

## 3. Privacy and Reporting Validation

- [ ] 3.1 Add tests proving generated envelope/report artifacts exclude runtime API keys, base URLs, seed text, source previews, local paths, URLs, book hashes, and stable private identifiers.
- [ ] 3.2 Update eval README with the local runtime bridge workflow and explicit non-commit guidance for runtime seed files.
- [ ] 3.3 Run focused eval tests, lint, full test suite, and `openspec validate --all --strict`.
````

## openspec/changes/reader-ai-live-fixture-runtime-bridge/specs/reader-ai-live-fixture-eval-runner/spec.md

- Source: openspec/changes/reader-ai-live-fixture-runtime-bridge/specs/reader-ai-live-fixture-eval-runner/spec.md
- Lines: 1-20
- SHA256: 3a6aed8702ce027b8b70093e020f59b433030fab935046a734e955e290c01ec8

```md
## MODIFIED Requirements

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
```

## openspec/changes/reader-ai-live-fixture-runtime-bridge/specs/reader-ai-live-fixture-runtime-bridge/spec.md

- Source: openspec/changes/reader-ai-live-fixture-runtime-bridge/specs/reader-ai-live-fixture-runtime-bridge/spec.md
- Lines: 1-38
- SHA256: eaf8db73bb7b4a04e47dbf4b456f455dadab0f7a11092f329a592f41011b068e

```md
## ADDED Requirements

### Requirement: Runtime bridge supplies provider configuration without fixture secrets

The system SHALL provide a runtime-only local bridge that can supply provider credentials and optional custom base URL data to live fixture execution without requiring secrets in fixture JSON.

#### Scenario: Runtime provider configuration is supplied from local inputs

- **WHEN** the live fixture CLI is invoked with explicit live execution and valid runtime provider inputs
- **THEN** the bridge constructs the AI settings needed for the real Reader AI streamer without persisting API keys, base URLs, or secret values into the fixture or generated eval artifacts

#### Scenario: Missing runtime provider configuration fails closed

- **WHEN** the live fixture CLI is invoked for a provider that requires credentials but no runtime credential is available
- **THEN** the bridge refuses to execute the real streamer, reports deterministic safe issues, and writes no partial output artifacts

### Requirement: Runtime bridge prepares retrieval context for bounded local fixture runs

The system SHALL allow a local live fixture run to prepare the minimal retrieval context needed by the Reader AI service path from runtime-only seed data.

#### Scenario: Runtime retrieval seed enables a bounded run

- **WHEN** the live fixture run provides valid runtime-only retrieval seed data for the selected fixture book handle
- **THEN** the bridge prepares retrieval context for the service eval run without requiring the normal app UI or browser IndexedDB state

#### Scenario: Missing retrieval context fails before provider execution

- **WHEN** neither existing retrieval context nor valid runtime retrieval seed data is available for the fixture
- **THEN** the bridge fails before provider execution with deterministic safe issues and writes no partial output artifacts

### Requirement: Runtime bridge keeps generated artifacts metadata-only

The system MUST keep all generated live fixture outputs metadata-only even when runtime provider credentials and retrieval seed data are used locally.

#### Scenario: Runtime secrets and seed text are excluded from artifacts

- **WHEN** a live fixture run completes, fails, or is aborted after using runtime provider inputs or retrieval seed data
- **THEN** generated envelope and report artifacts do not include API keys, raw seed text, prompt text, raw answer text, source previews, local paths, URLs, book hashes, or stable private identifiers
```

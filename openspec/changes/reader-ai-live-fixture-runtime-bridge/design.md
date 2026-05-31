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

### Decision 4: Fail closed before provider execution

If runtime provider credentials, base URL safety, retrieval seed, or fixture shape is invalid, the bridge SHALL return deterministic safe issues and write no partial outputs.

Alternatives considered:

- Attempt provider call and classify failures afterward: rejected because it wastes cost and makes reports noisy.

## Risks / Trade-offs

- Runtime seed may contain private book text → Mitigation: keep seed file local-only, document non-commit rule, and ensure generated artifacts remain metadata-only.
- Environment variables can be misconfigured → Mitigation: deterministic preflight checks before streamer invocation.
- Node IndexedDB compatibility can be brittle → Mitigation: prefer an injectable retrieval preparation layer with focused tests before relying on external IndexedDB packages.
- This still does not automatically select books/questions → Mitigation: keep first fixture manual and small; batch management remains a later change.

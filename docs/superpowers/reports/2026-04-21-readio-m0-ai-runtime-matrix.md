# Readio M0 AI Runtime Matrix

## Scope

This matrix compares only the M2 AI runtime directions already implied by the locked product/spec constraints and the current M0 spike evidence. It does not assume any backend that has not been built yet.

## Constraints used

- Spoiler-boundary enforcement must be hard-filtered by reading position, not prompt-only.
- Evidence generation should prefer `Locator` / `Selection` / `EvidenceAnchor` style outputs.
- Android runtime should stay lightweight in the reading flow.
- In-reading latency must stay low enough to avoid breaking immersion.
- M2 implementation weight should not block M1.

## Evidence basis

- Product/spec constraint: `docs/superpowers/specs/2026-04-21-readio-mvp-design.md`
- Route lock: `docs/superpowers/specs/2026-04-21-readio-route-lock-v1.md`
- Shared model shape: `app/src/main/java/io/readio/core/model/Locator.kt`, `Selection.kt`, `EvidenceAnchor.kt`
- EPUB runtime proof: `app/src/androidTest/java/io/readio/feature/epub/ReadiumEpubEngineTest.kt`, `EpubNavigatorHostActivityTest.kt`, `EpubSpikeScreenTest.kt`
- TXT fallback proof: `app/src/test/java/io/readio/feature/txt/TxtChapterParserTest.kt`
- PDF boundary proof: `app/src/androidTest/java/io/readio/feature/pdf/PdfDocumentGatewayTest.kt`

## Decision matrix

| Option | Spoiler-boundary enforcement | Evidence generation path | Android device/runtime limits | Latency tolerance inside reading flow | Implementation weight for M2 | Evidence-backed take |
| --- | --- | --- | --- | --- | --- | --- |
| Cloud-only | Strong only if the client sends strictly boundary-filtered passages derived from current `Locator`; otherwise risky | Good fit because the client can send structured `Selection` / `EvidenceAnchor` payloads and receive cited answers | Best on-device footprint because heavy inference stays off device | Network latency is the main risk inside reading flow | Medium | Best evidence-backed default if M2 starts soon, because current M0 proofs are strongest on structured client-side evidence and weak on local inference |
| Hybrid / edge-assisted | Potentially strongest long-term if device-side boundary filtering and lightweight local preprocessing are combined with cloud answering | Good fit in theory, because local runtime could pre-rank or summarize evidence before cloud calls | Higher engineering/runtime complexity on Android; current M0 has no device inference proof | Could be better than cloud-only later, but not yet evidenced in M0 | High | Keep as a future option, not current default; M0 has no proof for on-device model packaging, performance, or local ranking |
| Placeholder-only before cloud integration | Strongest safety during M1 because no live model can exceed the boundary | Weakest product value because there is no actual answer generation yet | Lowest runtime risk | Best latency because no real model work happens | Low | Safe if M2 is intentionally deferred, but insufficient if the goal is to validate real assistant value in M2 |

## Recommendation

Use **cloud-only** as the default M2 runtime assumption, with strict client-side spoiler-boundary filtering and structured evidence payloads derived from `Locator` / `Selection` / `EvidenceAnchor`. Keep **hybrid / edge-assisted** open for a later spike, and use **placeholder-only** only if M2 must be delayed behind M1 stabilization.

## Why this is the current best fit

1. The current spike proves position-aware structured evidence better than it proves any local AI runtime.
2. The locked specs explicitly say AI must not block M1 and must enforce spoiler boundaries before retrieval.
3. The current model layer is already shaped for sending compact, structured evidence instead of whole-book raw text.
4. There is no M0 evidence yet for on-device inference size, battery, memory, or latency on Android.

## Remaining uncertainty

- No token budget or retrieval chunk policy has been implemented yet.
- No cloud API integration exists yet.
- No on-device inference benchmark exists yet.
- No live AI answer/evidence round-trip has been proven yet.

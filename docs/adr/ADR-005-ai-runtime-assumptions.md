# ADR-005: AI runtime assumptions

## Status
Accepted

## Context
M0 needed to record a non-fantasy starting assumption for M2 AI work: should the first real assistant runtime be cloud-only, hybrid/edge-assisted, or placeholder-only before cloud integration?

## Decision
Use **cloud-only** as the default M2 runtime assumption, with strict client-side spoiler-boundary filtering and structured evidence payloads derived from `Locator` / `Selection` / `EvidenceAnchor`. Keep hybrid/edge-assisted as a later option, and use placeholder-only only if M2 is deliberately postponed behind M1 stabilization.

## Evidence
| Claim | Evidence type | Exact source | Result | Remaining uncertainty |
| --- | --- | --- | --- | --- |
| The locked product/spec constraints require hard spoiler-boundary enforcement before retrieval and position-aware evidence outputs | doc | `docs/superpowers/specs/2026-04-21-readio-mvp-design.md` sections 9.4-9.6, `docs/superpowers/specs/2026-04-21-readio-route-lock-v1.md` sections 2.2, 8.2, 10 | PASS | Constraint evidence only |
| The current app-level model is already shaped for compact, structured evidence payloads instead of whole-book raw context | code | `app/src/main/java/io/readio/core/model/Locator.kt`, `Selection.kt`, `EvidenceAnchor.kt` | PASS | No live AI consumer yet |
| EPUB currently has the strongest structured runtime proof, including locator mapping and evidence-style navigator landing | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.ReadiumEpubEngineTest,io.readio.feature.epub.EpubNavigatorHostActivityTest,io.readio.feature.epub.EpubSpikeScreenTest` | PASS | Still fixture-based |
| TXT has a safe fallback path but no live AI runtime proof | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` | PASS | No retrieval/chunking proof yet |
| PDF currently exposes only bounded page-level metadata and is therefore a weak AI evidence source | test + code | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.pdf.PdfDocumentGatewayTest`, `app/src/main/java/io/readio/feature/pdf/PdfProbeResult.kt` | PASS | No PDF evidence-anchor runtime exists |
| The explicit option comparison was recorded before this ADR | doc | `docs/superpowers/reports/2026-04-21-readio-m0-ai-runtime-matrix.md` | PASS | Still no live API/runtime benchmark |

## Consequences
This gives M2 a realistic starting point without pretending on-device inference has already been solved. The client should own boundary filtering and evidence packaging; the first real answer generation can happen in the cloud. Hybrid/edge-assisted remains open for a later spike, especially if latency or privacy becomes a stronger constraint, but M0 does not justify choosing it yet.

# Readio M0 Exit Checklist

| Item | Proof type | Exact source | Result | Notes |
| --- | --- | --- | --- | --- |
| EPUB opens, TOC enumerates, first locator mapped | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.ReadiumEpubEngineTest` | PASS | Includes open/probe, metadata-backed conversion, and first-locator round-trip |
| EPUB evidence-style navigator jump lands on expected href | test/manual | `io.readio.feature.epub.EpubNavigatorHostActivityTest.host_proves_real_jump_and_return_sequence`; evidence log EPUB rows | PASS | Proven on fixture EPUB with synthetic evidence anchor |
| EPUB return jump restores pre-jump href, or ADR-001 stays partial | test/manual | `io.readio.feature.epub.EpubNavigatorHostActivityTest.host_proves_real_jump_and_return_sequence`; `host_recreates_and_still_returns_to_pre_jump_href`; evidence log EPUB rows | PASS | Recreate semantics are safe restart, not exact restore |
| TXT headings parse, no-heading fallback works | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` | PASS | Parser-level fallback proven |
| PDF opens and reports page count | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.pdf.PdfDocumentGatewayTest` | PASS | Compatibility-path proof only |
| Shared Locator / Selection / EvidenceAnchor model is validated to current M0 depth | test/doc | `docs/adr/ADR-004-shared-locator-model.md` | PARTIAL | EPUB locator mapping, TXT fallback basis, and evidence-anchor minimum viability are proven; Selection mapping is definition-only |
| Current implementation planning remains M1-only | doc | `docs/superpowers/specs/2026-04-21-readio-route-lock-v1.md` | PASS | AI and search remain non-blocking for M1 |
| PDF entry decision recorded with bounded M1 scope or defer-to-M1.1 outcome | doc | `docs/adr/ADR-003-pdf-boundary.md` | PASS | Decision is bounded M1 compatibility path |
| M2 runtime decision recorded from explicit cloud / hybrid / placeholder comparison | doc | `docs/superpowers/reports/2026-04-21-readio-m0-ai-runtime-matrix.md`; `docs/adr/ADR-005-ai-runtime-assumptions.md` | PASS | Cloud-only chosen as default assumption, hybrid kept open |

## Recommendation
Proceed to M1 now. M0 has answered the key route-lock questions well enough to move forward: EPUB is viable on Readium, TXT has a safe fallback path, PDF is bounded, and the shared locator/evidence contract is usable for planning. The only item that should stay explicitly partial is shared-model depth around `Selection` runtime proof and lifecycle precision on EPUB recreate; those should be tracked as scoped follow-up work instead of blocking M1.

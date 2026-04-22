# ADR-003: PDF boundary

## Status
Accepted

## Context
M0 needed to answer whether PDF should be treated as a first-class reading format or a bounded compatibility path for M1.

## Decision
Keep PDF as a bounded compatibility path for M1. The current commitment is limited to opening a PDF, reading page-level metadata, and preserving page-based position semantics. Readio does not treat PDF as equivalent to EPUB/TXT for deep reading or AI evidence features.

## Evidence
| Claim | Evidence type | Exact source | Result | Remaining uncertainty |
| --- | --- | --- | --- | --- |
| PDF fixture opens and exposes page count through the gateway | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.pdf.PdfDocumentGatewayTest` (`opens_fixture_pdf_and_reads_page_count`) | PASS | Only proven on the fixture PDF |
| Missing PDF assets fail with a controlled error containing the asset path | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.pdf.PdfDocumentGatewayTest` (`throws_controlled_error_for_missing_asset_path`) | PASS | Corrupt/encrypted/zero-page PDFs remain unproven |
| Shared PDF locator keeps page-index and page-offset semantics | test | `:app:testDebugUnitTest --tests io.readio.core.model.LocatorModelTest` (`pdf_locator_keeps_page_based_position`) | PASS | Does not prove reader restore UX yet |
| Manual emulator run shows PDF spike screen rendering page count and first-page size from the fixture | manual | `docs/superpowers/reports/2026-04-21-readio-m0-evidence-log.md` rows for PDF spike on `readio-api35(AVD)` | PASS | Manual proof is limited to the fixture path |
| Route lock explicitly freezes PDF as a compatibility path and not a first-class deep-reading experience | doc | `docs/superpowers/specs/2026-04-21-readio-route-lock-v1.md` section 4.3 | PASS | Product/spec evidence, not runtime proof by itself |

## Consequences
PDF can enter M1 only as a compatibility layer: open, basic page navigation/position semantics, and no promise of EPUB/TXT-level richness. This keeps M1 focused on the primary novel-reading experience. Remaining risks include broader PDF edge cases and whether basic page-position restore feels good enough in real reading sessions.

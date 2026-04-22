# ADR-004: Shared locator model

## Status
Partial

## Context
M0 needed to decide whether Readio's cross-format runtime can share a stable app-level contract for `Locator`, `Selection`, and `EvidenceAnchor`, instead of letting each renderer define incompatible position semantics.

## Decision
Keep a shared app-level contract centered on:
- `Locator.Textual(bookId, format, spineId, progression, contextSnippet?)`
- `Locator.Pdf(bookId, format, pageIndex, pageOffset)`
- `Selection(selectedText, locator, startAnchor, endAnchor, contextBefore, contextAfter)`
- `EvidenceAnchor(quote, locator, chapterTitle, createdAt, fallbackAnchor, checksum?)`

Treat this contract as **good enough for M1 planning and M2 integration design**, but only partially proven at runtime in M0.

## Evidence
| Claim | Evidence type | Exact source | Result | Remaining uncertainty |
| --- | --- | --- | --- | --- |
| EPUB shared locator can map from Readium locator and still drive navigator landing on the expected href | test | `:app:testDebugUnitTest --tests io.readio.feature.epub.ReadiumLocatorMapperTest` (`maps_readium_locator_into_shared_textual_locator`), plus `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.EpubNavigatorHostActivityTest`, `io.readio.feature.epub.EpubSpikeScreenTest` | PASS | Proven on EPUB fixture/runtime only |
| TXT no-heading fallback still yields a valid shared textual reading basis | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` (`falls_back_to_single_linear_chapter_when_no_heading_exists`) | PASS | Proven at parser level; no dedicated runtime locator test for TXT screen state |
| EvidenceAnchor minimum viability exists for evidence-style navigation | test + code | `:app:testDebugUnitTest --tests io.readio.core.model.LocatorModelTest` (`evidence_anchor_always_carries_a_locator_and_fallback_anchor`), `app/src/main/java/io/readio/feature/epub/EpubSpikeScreen.kt`, `EpubNavigatorHostFragment.kt` | PASS | Current anchors are synthetic/debug-oriented, not user-selection-derived |
| PDF locator preserves page-based position semantics | test | `:app:testDebugUnitTest --tests io.readio.core.model.LocatorModelTest` (`pdf_locator_keeps_page_based_position`) | PASS | Reader restore UX remains unproven |
| Selection mapping exists in code for EPUB | code | `app/src/main/java/io/readio/feature/epub/ReadiumSelectionMapper.kt` | Definition only | No runtime proof or dedicated tests yet |

## Consequences
The shared model is strong enough to continue planning around a single app-level reading/evidence contract across EPUB/TXT/PDF. It already proves real value for EPUB locator mapping and gives TXT/PDF a compatible position vocabulary. However, ADR-004 remains partial because `Selection` mapping is not runtime-proven in M0, and evidence anchors are still synthetic rather than originating from real user selections.

# ADR-001: Readium EPUB spike

## Status
Accepted

## Context
M0 needed to answer whether Readio can use Readium Kotlin Toolkit as the EPUB runtime base for opening a book, enumerating TOC/spine data, mapping a shared locator into a Readium locator, and proving an evidence-style navigator jump with a return-to-previous-location path.

## Decision
Adopt Readium Kotlin Toolkit 3.1.2 as the EPUB runtime base for M1, with Readio keeping its own shared locator/evidence model on top. Treat the current recreate proof as **safe restart of the navigator sequence**, not exact in-flight restore.

## Evidence
| Claim | Evidence type | Exact source | Result | Remaining uncertainty |
| --- | --- | --- | --- | --- |
| Readio opens the EPUB fixture and extracts TOC/spine/first locator data | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.ReadiumEpubEngineTest` (`opens_fixture_epub_and_extracts_minimal_probe_data`) | PASS | Proven on the fixture EPUB only |
| Shared first locator can be converted back into a Readium locator using publication metadata | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.ReadiumEpubEngineTest` (`converts_first_locator_using_opened_publication_metadata`) | PASS | Uses fixture EPUBs; broader EPUB compatibility remains open |
| First shared locator round-trips back into a Readium locator without losing href/progression basis | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.ReadiumEpubEngineTest` (`round_trips_first_locator_back_into_readium_locator`) | PASS | Proves first-locator round-trip, not arbitrary locator fidelity |
| A real navigator host mounts, jumps to the evidence target href, then returns to the pre-jump href | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.EpubNavigatorHostActivityTest` (`host_proves_real_jump_and_return_sequence`) | PASS | Based on synthetic evidence anchor data on the fixture EPUB |
| Activity/fragment recreate still completes the sequence and returns to the pre-jump href | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.EpubNavigatorHostActivityTest` (`host_recreates_and_still_returns_to_pre_jump_href`) | PASS | This proves safe restart after recreate, not exact restore of the pre-recreate stage |
| Debug UI shows the same second-href evidence chain across mapped locator, Readium locator, evidence anchor, landed locator, and returned locator state | test | `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.epub.EpubSpikeScreenTest` (`epub_spike_screen_shows_real_navigator_probe_data`) | PASS | Debug-only probe UI, not production reader UI |
| Manual emulator run shows EPUB debug panel with TOC count, mapped locator, landed locator, pre-jump locator, returned locator, and stable href booleans | manual | `docs/superpowers/reports/2026-04-21-readio-m0-evidence-log.md` rows for EPUB spike screen on `readio-api35(AVD)` | PASS | Manual proof is still fixture-specific |
| Readium is pinned in the app module as the EPUB runtime dependency | code | `app/build.gradle.kts` | PASS | Version drift should be re-checked if dependencies change |

## Consequences
This unlocks M1 planning on top of Readium for EPUB. Readio can keep its own shared locator/evidence contracts while relying on Readium for EPUB opening and navigation. The main remaining risk is lifecycle nuance: recreate currently restarts the proof sequence rather than restoring the exact in-progress navigator stage. Synthetic evidence anchors are sufficient for M0 proof, but real user-selection-derived evidence remains a future step.

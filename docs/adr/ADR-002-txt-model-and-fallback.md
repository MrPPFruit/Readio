# ADR-002: TXT model and fallback

## Status
Accepted

## Context
M0 needed to answer whether TXT can enter a shared textual reading basis instead of remaining an unstructured document path, and whether parsing failures can degrade safely instead of blocking import or reading.

## Decision
Use a lightweight chapter parser for TXT that recognizes `第X章` style headings when available and falls back to a single linear chapter titled `全文` when no heading is present. Treat TXT as part of the shared textual model path, with graceful degradation as the baseline behavior.

## Evidence
| Claim | Evidence type | Exact source | Result | Remaining uncertainty |
| --- | --- | --- | --- | --- |
| TXT parser detects Chinese-style chapter headings and splits the fixture into chapters | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` (`detects_chinese_style_chapter_headings`) | PASS | Heading coverage is intentionally narrow and not yet generalized to every TXT style |
| TXT parser preserves meaningful internal blank lines inside a chapter body | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` (`preserves_meaningful_internal_blank_lines_in_chapter_body`) | PASS | Only proven for the current parser rules |
| TXT parser trims only boundary blank lines and keeps indented content intact | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` (`trims_only_boundary_blank_lines_without_trimming_indented_content`) | PASS | More TXT formatting edge cases remain untested |
| TXT parser falls back to a single linear chapter when no heading exists | test | `:app:testDebugUnitTest --tests io.readio.feature.txt.TxtChapterParserTest` (`falls_back_to_single_linear_chapter_when_no_heading_exists`) | PASS | This proves parser-level fallback, not every future ingestion edge case |
| Manual emulator run shows the TXT spike screen rendering `TXT chapters: 2` from the fixture and exposing both chapter titles/bodies | manual | `docs/superpowers/reports/2026-04-21-readio-m0-evidence-log.md` rows for TXT spike on `readio-api35(AVD)` | PASS | Manual proof covers the fixture path only |
| Route lock requires TXT to enter a shared model and degrade to full-text linear reading on parser failure | doc | `docs/superpowers/specs/2026-04-21-readio-route-lock-v1.md` section 4.2 | PASS | Product/spec evidence, not runtime proof by itself |

## Consequences
TXT can be planned as a first-class M1 reading format rather than a throwaway document mode. Readio can keep a structured chapter path when parsing succeeds and still avoid blocking the user when structure is missing. Remaining risk is parser breadth: more heading formats, encodings, and malformed files will still need later hardening.

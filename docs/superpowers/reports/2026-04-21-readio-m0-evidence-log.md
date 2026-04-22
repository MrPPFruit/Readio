# Readio M0 Evidence Log

| Claim | Emulator/device | Fixture | Manual steps | Observed locator / href | Timestamp | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Home screen opens and exposes all three spike entries | `readio-api35(AVD)` | n/a | Launch `io.readio/.MainActivity`; dump UI hierarchy | `Readio M0 Spikes`, `EPUB Spike`, `TXT Spike`, `PDF Spike` visible | 2026-04-23 00:14:24 +0800 | PASS |
| TXT spike renders the fixture as two chapters | `readio-api35(AVD)` | `fixtures/readio_spike.txt` | Open app -> tap `TXT Spike`; dump UI hierarchy | `TXT chapters: 2`, `第1章 风起`, `第2章 夜路` visible | 2026-04-23 00:14:24 +0800 | PASS |
| PDF spike opens fixture and reports page count/first page size | `readio-api35(AVD)` | `fixtures/readio_spike.pdf` | Open app -> tap `PDF Spike`; dump UI hierarchy | `PDF pages: 1`, `First page size: 612 x 792` | 2026-04-23 00:14:24 +0800 | PASS |
| EPUB spike opens fixture and reports TOC count | `readio-api35(AVD)` | `fixtures/readio_spike.epub` | Open app -> tap `EPUB Spike`; wait for probe; dump top of UI hierarchy | `TOC count: 2`, `Spine items: 2`, `First href: OEBPS/chapter1.xhtml` | 2026-04-23 00:14:24 +0800 | PASS |
| EPUB debug panel shows mapped locator and evidence-style navigation chain | `readio-api35(AVD)` | `fixtures/readio_spike.epub` | Open app -> tap `EPUB Spike`; wait for probe; scroll and dump UI hierarchy | Mapped locator href `OEBPS/chapter2.xhtml`; evidence anchor `synthetic:OEBPS/chapter2.xhtml`; landed href `OEBPS/chapter2.xhtml` | 2026-04-23 00:14:24 +0800 | PASS |
| EPUB navigator probe returns to the pre-jump href and reports stable booleans | `readio-api35(AVD)` | `fixtures/readio_spike.epub` | On EPUB spike screen, scroll debug panel and inspect final probe lines | Pre-jump href `OEBPS/chapter1.xhtml`; returned href `OEBPS/chapter1.xhtml`; `Navigator href stable: true`; `Back-jump href stable: true` | 2026-04-23 00:14:24 +0800 | PASS |

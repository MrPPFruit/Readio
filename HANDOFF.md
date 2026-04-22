# HANDOFF

## 当前目标与进度
- Task 7 已完成：已生成 `docs/adr/ADR-001` ~ `ADR-005`、AI runtime matrix、M0 evidence log、M0 exit checklist。
- 最终验证已完成：` :app:testDebugUnitTest :app:connectedDebugAndroidTest ` 全部通过。
- 已补一轮 emulator 人工观察，并写入 `docs/superpowers/reports/2026-04-21-readio-m0-evidence-log.md`。
- 当前结论：M0 已具备进入 M1 规划的证据基础，但需如实保留两个边界：
  - EPUB recreate 语义是 **safe restart by restarting the navigator sequence**，不是精确阶段恢复。
  - ADR-004（shared locator model）仍是 **Partial**，因为 `Selection` mapping 只有定义，没有 runtime proof。

## 已尝试路径
### 有效
- `EpubSpikeScreen.kt` 基于第二个 reading-order item 构造 `requestedLocator`，并用同一 locator 驱动 mapped locator / Readium locator / synthetic EvidenceAnchor / probe intent。
- `EpubNavigatorHostFragment.kt` 按 `requestedSpineId` 解析 target，并在 `onCreate()` 前安装 Readium fragment factory，修复 recreate restore 崩溃。
- `EpubNavigatorHostActivityTest.kt` 证明真实 jump -> return sequence，并覆盖 recreate 后 safe restart。
- `EpubSpikeScreenTest.kt` 直接断言整条 EPUB debug evidence chain。
- Task 7 文档严格按现有证据写入，不把未证实项伪装成 Accepted。

### 无效 / 已放弃
- recreate 走“恢复 child fragment 后继续原阶段”会因为 Readium `EpubNavigatorFragment` 依赖 custom fragment factory 而崩溃。
- 仅把 `installNavigatorFactory()` 放到 `onViewCreated()` 太晚，无法覆盖 restore 路径。
- 试图从当前根分支直接继续 Task 7 是错的；真正最新的 M0 实现位于 `.worktrees/m0-task-2-clean` 的未提交改动中。

## 当前阻塞与风险
- 当前没有技术阻塞，但有两个必须保留在后续计划里的风险：
  1. EPUB recreate 不是 exact restore。
  2. Shared model 的 `Selection` mapping 仍未被 runtime 证明。
- 这些风险已经反映在：
  - `docs/adr/ADR-001-readium-epub-spike.md`
  - `docs/adr/ADR-004-shared-locator-model.md`
  - `docs/superpowers/reports/2026-04-21-readio-m0-exit-checklist.md`

## 下一步可执行动作
1. 审阅 Task 7 文档内容与状态分级，确认是否需要微调 Accepted / Partial 措辞。
2. 若确认无误，整理并提交 `.worktrees/m0-task-2-clean` 中的所有 M0 改动。
3. 基于以下产物开始写 M1 implementation plan：
   - `docs/adr/ADR-001-readium-epub-spike.md`
   - `docs/adr/ADR-002-txt-model-and-fallback.md`
   - `docs/adr/ADR-003-pdf-boundary.md`
   - `docs/adr/ADR-004-shared-locator-model.md`
   - `docs/adr/ADR-005-ai-runtime-assumptions.md`
   - `docs/superpowers/reports/2026-04-21-readio-m0-exit-checklist.md`

## 关键文件路径
- `app/src/main/java/io/readio/feature/txt/TxtChapterParser.kt`
- `app/src/main/java/io/readio/feature/pdf/PdfDocumentGateway.kt`
- `app/src/main/java/io/readio/feature/epub/ReadiumEpubEngine.kt`
- `app/src/main/java/io/readio/feature/epub/EpubNavigatorHostActivity.kt`
- `app/src/main/java/io/readio/feature/epub/EpubNavigatorHostFragment.kt`
- `app/src/main/java/io/readio/feature/epub/EpubSpikeScreen.kt`
- `app/src/test/java/io/readio/core/model/LocatorModelTest.kt`
- `app/src/test/java/io/readio/feature/txt/TxtChapterParserTest.kt`
- `app/src/test/java/io/readio/feature/epub/ReadiumLocatorMapperTest.kt`
- `app/src/androidTest/java/io/readio/feature/pdf/PdfDocumentGatewayTest.kt`
- `app/src/androidTest/java/io/readio/feature/epub/ReadiumEpubEngineTest.kt`
- `app/src/androidTest/java/io/readio/feature/epub/EpubNavigatorHostActivityTest.kt`
- `app/src/androidTest/java/io/readio/feature/epub/EpubSpikeScreenTest.kt`
- `docs/adr/ADR-001-readium-epub-spike.md`
- `docs/adr/ADR-002-txt-model-and-fallback.md`
- `docs/adr/ADR-003-pdf-boundary.md`
- `docs/adr/ADR-004-shared-locator-model.md`
- `docs/adr/ADR-005-ai-runtime-assumptions.md`
- `docs/superpowers/reports/2026-04-21-readio-m0-ai-runtime-matrix.md`
- `docs/superpowers/reports/2026-04-21-readio-m0-evidence-log.md`
- `docs/superpowers/reports/2026-04-21-readio-m0-exit-checklist.md`

## 验证证据
- PASS: `:app:testDebugUnitTest --tests io.readio.core.model.LocatorModelTest --tests io.readio.feature.txt.TxtChapterParserTest --tests io.readio.feature.epub.ReadiumLocatorMapperTest`
- PASS: `:app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.readio.feature.pdf.PdfDocumentGatewayTest,io.readio.feature.epub.ReadiumEpubEngineTest,io.readio.feature.epub.EpubNavigatorHostActivityTest,io.readio.feature.epub.EpubSpikeScreenTest`
- PASS: `:app:testDebugUnitTest :app:connectedDebugAndroidTest`
- PASS manual evidence on `readio-api35(AVD)` recorded in `docs/superpowers/reports/2026-04-21-readio-m0-evidence-log.md`:
  - Home screen opens
  - TXT spike shows `TXT chapters: 2`
  - PDF spike shows page count and page size
  - EPUB spike shows TOC count
  - EPUB debug panel shows mapped locator / landed locator / pre-jump locator / returned locator
  - EPUB debug panel shows `Navigator href stable: true` and `Back-jump href stable: true`

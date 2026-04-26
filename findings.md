# Findings

## 当前任务

- Readio Readest M1.1 精简收口与翻页唯一化。

## 本地发现（2026-04-26）

- `HANDOFF.md` 记录当前主线已迁移到 `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest`，旧 Kotlin/Compose 仓库仅作为 archive/spike evidence。
- 当前工作区已有大量阅读器精简改动，不能当作干净基线处理。
- 已发现多个文件开始把 `scrolled` 强制为 `false`：`readerStore.ts`、`bookDataStore.ts`、`settingsStore.ts`、`settingsService.ts`、`FoliateViewer.tsx`、`helpers/settings.ts`。
- 翻页唯一化已补齐主要漏口：`serializer.ts` 读取/写入配置时清洗滚动字段；`bookDataStore.setConfig` 不再允许 in-memory config 暂时保留 `scrolled: true`；`commandRegistry.ts` 不再暴露 scroll section 以及 Readio UI 已删除的 dead settings entries。
- 模拟器实测显示阅读页可从 Continue Reading 打开，点击右侧区域会翻到下一页；行为设置页只显示分页/点击翻页相关选项，没有 `Scrolled Mode` / `Single Section Scroll` / `Overlap Pixels` / scrollbar 入口。
- 代码评审后复核 `flow='scrolled'`：生产代码唯一剩余 occurrence 是 `FootnotePopup.tsx` 的脚注弹窗内部 renderer。它不是主阅读模式、没有用户设置/命令入口，也不写入 view settings；当前作为内部弹窗滚动例外保留，后续若要求“任何 renderer 都不得滚动”再单独改脚注行为。
- 评审指出 working tree 还包含阅读 UI simplification 延续改动（进度预览、annotation popup、隐藏更多高级设置等），不应把本批描述成纯 pagination-only；交付说明需表述为“M1.1 阅读器精简收口 + pagination-only hardening”。

## 外部/上游背景（2026-04-26）

- Readest 上游仓库仍活跃，AGPL-3.0，最近 issue 涉及 PDF search、iCloud Sync、TTS、移动端选择菜单等全功能阅读器方向。
- 对 Readio 的规划启示：现阶段不追上游全功能路线，应优先保证本地 EPUB/TXT 阅读闭环、翻页模式稳定、文件恢复和 APK 可体验质量。

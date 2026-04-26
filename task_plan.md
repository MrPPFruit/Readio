# Readio Readest M1.1 收口计划

## 目标

收口当前 Readest-based 阅读器精简批次，优先修复“隐藏滚动模式后仍可能进入滚动”的问题，并产出经模拟器验证的 release APK。

## 当前阶段

- 状态：complete
- 阶段 1：恢复上下文与梳理未提交改动（complete）
- 阶段 2：补齐翻页唯一化回归测试（complete）
- 阶段 3：实现默认且只能分页翻页（complete）
- 阶段 4：运行目标测试、type check、lint/build（complete）
- 阶段 5：构建 release APK 并安装模拟器验证（complete）
- 阶段 6：更新 HANDOFF 与交付结论（complete）

## 已知约束

- 当前主线工作区是 `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest`，不是旧 Kotlin spike 仓库。
- 不继续大规模精简 UI；当前批次目标是收口稳定性。
- 默认且只能使用分页/翻页模式；不得保留用户可进入滚动模式的入口或持久状态。
- 出包前必须安装到模拟器做基础功能验证。
- APK 尽量使用既有 release 小包脚本输出到 `apks/`。
- 不提交、不推送，除非用户明确要求。

## 决策记录

- 继续沿用 Readest 底座，Readio 做本地优先、中文阅读优先、功能减法后的轻量阅读体验。
- 当前批次先修阅读模式状态一致性，再跑验证和出包。
- 本批交付边界按评审调整为“M1.1 阅读器精简收口 + pagination-only hardening”，包含前序阅读 UI 精简延续改动；提交时不要描述成纯滚动模式修复。
- `FootnotePopup.tsx` 的 `flow='scrolled'` 是脚注弹窗内部 renderer 例外，不是主阅读模式；当前保留并记录，避免为字面零 occurrence 破坏脚注阅读体验。

## 风险与注意事项

- 工作区已有大量未提交改动，修改前必须读相关文件，避免覆盖上一轮成果。
- Readest 上游仍在活跃迭代，当前不追 TTS、sync、PDF 搜索等全功能方向。
- 构建时需要清理宿主 Next 私有环境变量；Android 构建需要显式 cargo PATH 或使用既有脚本。

## 遇到的错误

| 错误                                    | 尝试次数 | 解决方案                                                                                  |
| --------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| apksigner build-tools 36.0.0 路径不存在 | 1        | 改用实际安装的 `/Users/ppg/Library/Android/sdk/build-tools/35.0.0/apksigner` 完成签名验证 |

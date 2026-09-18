# mobile-longpress-freeze + composer-caret-jump 实施总结

## 变更总览

一次改动解决两个问题（关联文档：[troubleshoot](260918-mobile-longpress-freeze.troubleshoot.md) / [caret-jump troubleshoot](../260918-composer-caret-jump/260918-composer-caret-jump.troubleshoot.md) / [review](260918-mobile-longpress-freeze.review.md) / [validation](260918-mobile-longpress-freeze.validation.md)）：

1. **no-touch-drag（修复）**：Android 长按侧栏会话行触发原生拖拽、Chromium 触摸拖拽会话不结束导致整页触摸失灵 → 触摸期间在 window capture 阶段取消 dragstart（preventDefault + stopPropagation），鼠标拖拽（touches=0）完全放行。
2. **caret-debug（临时插桩）**：Lexical composer 光标跳末尾问题的事件流插桩，自动捕获跳变现场到 localStorage（最近 3 次 × 140 条），设置页可导出。**默认关闭**，记录事件元数据（composition 文本只记长度，不含输入内容）。

## 核心实现（lib/client.js）

- `installNoTouchDrag()`：passive touchstart/touchend/touchcancel 维护 touches 计数；dragstart capture 时 feature attr 在且 touches>0 → 取消。规范依据：Blink `TryStartDrag()` 先派发 dragstart，事件被取消则不建立拖拽会话，且触摸流抑制只在拖拽成功启动后发生（reviewer 已核查 Blink 源码确认）。
- `installCaretDebug()`：环形缓冲 800 条；composition/beforeinput/focus/selectionchange/pointerdown 监听；selection 从 anchorNode 反解 `[data-composer-seat] [contenteditable]` root；跳变检测 = 无 400ms 内 pointerdown + 单次 selectionchange 焦点偏移跳到边界且移动 ≥4 字符；MutationObserver 检测 wholesale tree-mutate（added≥2 ∧ removed≥2，setDraft 重建签名）；快照持久化 `localStorage["dsh.qol.caretdebug"]`。
- QolPanel：caret-debug 开启时渲染「复制调试日志」（clipboard API + textarea fallback）与「清空」（同时重置 prev-selection 基线）。

## e2e 覆盖（全部通过）

| 套件 | 结果 | 覆盖 |
| --- | --- | --- |
| e2e/no-touch-drag.mjs（新） | 11/11 | 触摸时 dragstart 取消且行处理器不触发 / 无触摸放行 / 属性移除放行 / dispose 后监听移除 |
| e2e/caret-debug.mjs（新） | 13/13 | 开关预设走真实 loadConfig→apply / composition 记元数据（data.len，无原文）/ 跳变快照含 JUMP-DETECTED / 快照上限 3 / 默认关时零记录 |
| e2e/mobile.mjs mobile | 20/20 | 手势段迁移至干净页（见下）/ attrs / CSS / 设置对话框 |
| e2e/mobile.mjs desktop | 9/9 | 桌面零影响 |
| e2e/test-settings-features.mjs | 17/17 | 新增：QoL 开关行点击 / 导出按钮渲染 / clipboard 复制或 fallback / 清空收起 |

### mobile.mjs 手势段迁移说明（存量测试环境问题，非本次引入）

插件 link 进 live profile 后，app 页面同时运行真实实例与 mock harness 实例；真实实例的 touchmove preventDefault 使 mock 实例手势处理被跳过，toggle 计数断言失效（git stash 旧代码复现确认）。手势用例改在 about:blank 干净页执行并合成 fake_frame 锚点。

## Review 结论与处理

[review](260918-mobile-longpress-freeze.review.md)：**条件准入**（无阻塞）。

- M1 真机验收 → [validation](260918-mobile-longpress-freeze.validation.md)（含 D0 开开关步骤，A 不通过按待跟进回溯）
- M2 隐私冲突 → composition data 脱敏为 `data.len=N`；README 中英「权限与兼容」补诊断例外说明
- M3 默认开启 → default: false；移除清单见下
- M4 计数同步 → package.json、awesome 草稿 13→14（历史 release 文档如实记录不改）
- M5 e2e 拆分 + 集合断言 → caret-debug.mjs 独立；attrs 断言改集合式
- M6 caret 用例环境 → 独立 browser context + 真实实例默认关，无 key 冲突
- M7 导出按钮自动化 → test-settings-features.mjs 补齐（17/17）
- M8 手势段健壮性 → gres.error 时跳过用例
- 非阻塞采纳：清空重置 `_caretPrevSel`、`caretExportText` 防御脏数据、README 补触屏笔记本说明
- 非阻塞不采纳：touches watchdog（touchcancel 已兜底）、JUMP 误报面（诊断工具日志可辨析）、拆分 commit（mobile.mjs/README 断言同时依赖两 feature，拆分产生中间态红测试）

## caret-debug 移除清单（定位完成后执行）

1. `lib/client.js` FEATURES 注册表 `caret-debug` 行
2. `lib/client.js` caret-debug 段（`CARET_DEBUG_KEY` 至 `caretExportText()` 整块，约 170 行）
3. `lib/client.js` QolPanel 的 `debugBlock`（含 onExport/onClear）
4. `lib/client.js` apply() 的 `disposers.push(installCaretDebug())`
5. `e2e/caret-debug.mjs` 整文件
6. `e2e/test-settings-features.mjs` 步骤 4.5（caret-debug export block 段）
7. README.md / README.en.md：功能表 caret-debug 行、intro「另含 1 项临时诊断开关」、使用段「+ 1 行临时诊断开关」、权限段「临时诊断开关例外」
8. mobile.mjs 头注释 "the temporary caret-debug diagnostics default OFF" 措辞

## 待跟进

- 真机验证 A–E（见 validation）
- 若日志确认上游 Lexical 缺陷：报 facebook/lexical issue 或向宿主提 workaround，随后按移除清单拆除插桩
- 若 A 不通过：带回现象细节（长按后立刻卡 vs 松手后卡）继续排查其他触摸吞噬路径

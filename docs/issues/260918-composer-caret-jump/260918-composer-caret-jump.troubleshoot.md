# 260918-composer-caret-jump — 输入框编辑中光标从中间跳到末尾

## 现象

移动端在输入框编辑时，光标偶尔从中间位置跳到文本末尾。不频繁、无明显操作前兆。

## 根因（阶段性结论）

**上游 Lexical-on-Android 输入法合成（composition）缺陷族，非本部署引入。**

分析过程与排除项：

1. **输入框是 Lexical contenteditable**（`dsh-client-ui-conversation` bundle，lexical@0.49.0，`ComposerContentEditable` + `DecoratorPortals`）。
2. **会移动光标的宿主代码路径只有三条**，全部不在「纯编辑中」触发：
   - `SessionInputShell.setDraft(text)`：`root.clear()` 重建段落 + `root.selectEnd()`（光标落末尾）。调用方仅有：会话切换草稿迁移（`connectWorkspace`）、挂载时持久化草稿恢复（`ConversationSession` effect，且 `inputActions` 每会话稳定单例，effect 依赖不变不会中途重跑）、提交后清空。均有 `clean === clipboardText` 幂等守卫。
   - `restoreFailedDrafts()`：仅在发送失败（sink error）后重建。
   - 会话切换的 from→next 草稿搬运。
3. **dsh-qol 检查**：不写编辑器内容/selection；`switch-nofocus` 的 blur 只在会话切换后 2.5s 窗口内且首次点按输入框即解除（pointerdown 先于 focusin，顺序安全）；`ime-viewport` 只改 viewport meta 与 CSS 变量（reflow 不移动光标）；`sidebar-gesture` 对 `contenteditable` 目标显式跳过。
4. **上游已知问题族**（facebook/lexical，多条开放中，均 Android + IME）：
   - #6354：IME 合成发生在节点边界时内容向边界合并（光标跳向边界——含末尾方向）；
   - #5268 / #1716：合成期间 ZWSP（零宽空格）后缀使 selection 失效 → 光标跳（非 Gboard 键盘更频繁）；
   - #4207 / #3538：点击行尾光标跳行首（同族不同方向）。
   中文拼音输入全程处于 composition 事件流中，属于高触发场景。

## 是否 dsh-qol 引入？

**未发现任何 qol 代码路径可在编辑中改写光标/内容**（见上第 3 点）。判定为上游缺陷。

## 待确认信息（需要用户实机）

- 触发时所用输入法（Gboard / 搜狗 / 讯飞 / 系统…）；
- 是否只在中文拼音合成中出现，英文直接键入是否也会；
- 跳光标时是否伴随键盘候选栏变化/视觉抖动（区分 composition 边界族 vs 焦点类问题）。

## 后续路径选项

1. **接受现状**：上游 Lexical 缺陷，等官方修复（0.49.0 已含 #7725 offset 崩溃修复，残余 composition 问题仍在跟踪）。
2. **插桩定位**：dsh-qol 临时加调试日志（compositionstart/end、selectionchange、editor update tag 监听），用户复现一次即可确认具体缺陷路径，再评估能否在插件层缓解。

## 置信度

~80%（上游缺陷方向明确；具体到哪一条 Lexical issue 的映射需实机日志）。

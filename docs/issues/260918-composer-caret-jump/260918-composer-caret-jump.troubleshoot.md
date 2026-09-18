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

## 第一次实机捕获（2026-09-18，v1 插桩，Chrome 149 Android 10）

用户回传 3 个快照，性质分为两类：

### Capture 1/2 —— 宿主清空噪音（非本 bug，v1 检测器盲区）

两个快照模式完全一致：持续打字到 N（38/249）→ `focusout` → `focusin`（80–207ms）→ `focusout`（13–77ms）→ `sel f=0/0 **len=0**`。

- `len=0` 说明不是光标跳，而是 **root 内容被清空**（selection 随之落 0）。签名与「发送后清空 / 会话切换草稿迁移」吻合（此前静态分析的三条宿主路径之二）。
- v1 误捕获原因：`pointerdown` 计时只跟踪 composer 内点按，点**发送按钮**（seat 之外）不重置 400ms 窗口 → 合法清空被当作无操作跳变。
- 快速 focusin↔focusout 交替（13–86ms）说明清空伴随组件焦点重排，具体属宿主正常行为还是另一个问题，待用户确认操作场景（是否点了发送/切会话）。

### Capture 3 —— 真·复现（本 bug 本体）

时间线（len=83 恒定，无 focus 事件、无 tree-mutate、无 pointerdown）：

```
beforeinput insertText → sel f=32/83   ← 用户在中间位置（29）插入 3 字符
[712ms 无任何事件]
sel f=67/83                            ← 光标跳到 67
[584ms 无任何事件]
sel f=82/83  JUMP-DETECTED end         ← 再跳到 82（文末附近）
```

排除与确认：

- **排除宿主 setDraft/重挂载**：len 恒定 83，无 tree-mutate（root.clear+重建必触发）。
- **排除用户操作**：无 pointerdown、无 input、无 focus。
- **确认纯程序性 selection 变更**，且**分两次异步跳位**（32→67→82），不是一步到位——符合 Lexical update/reconciliation 循环的多次 selection 设置。
- **关键新线索：全程 0 个 composition 事件**。用户 IME 走 `beforeinput insertText` 直插路径（候选词上屏为一次多字符 insertText，如 25→34 一次 +9）。Lexical 的 Android IME 处理大量假定 composition 流程；**非 composition 直插是已知高危路径**。
- 快照尾部 len 83→82→81→78 递减但无任何 beforeinput/composition —— **程序性文本改写**（Lexical reconciliation 或 ZWSP 清理），v1 的 childList observer 看不到（文本节点内部变化）。
- 中途 81→30 的大跳（无事件）后用户在 30 处正常输入：用户主动移动光标（长按拖 selection handle），handle 拖动的 pointerdown target 在浏览器私有 UI 上、不在 seat 内 → v1 未计入窗口。此细节还原了用户原始场景：**把光标放到中间编辑，随后光标自行跳到末尾**。

### 结论修正

维持「上游 Lexical-on-Android 缺陷」判定，方向从「composition 边界族」修正为 **「非 composition 的 insertText 直插路径 + Lexical selection reconciliation」**。置信度 ~85%。

## 插桩 v2（已实施）

针对 v1 三个盲区：

1. **RESET-TO-EMPTY 识别**：`len===0` 的跳到开头标注为宿主清空，只记日志不占快照配额（避免噪音挤掉真复现）。
2. **characterData 监听**：MutationObserver 加 `characterData: true`，捕获文本节点内部的程序性改写（记长度变化，不记内容）——下次复现可直接看到跳位瞬间是否伴随文本改写。
3. **pointerdown 全局记录**：seat 外的 pointerdown（发送按钮等）也重置跳变窗口并记日志（`pointerdown-outside <tag>`）。

e2e：e2e/caret-debug.mjs 增至 16 断言（v2 三场景全覆盖）。

## 待用户第二次复现（v2）

- 正常使用，等光标再跳末尾一次 → 导出日志（重点看跳变前是否出现 `charData-mutate`）。
- 顺带确认 capture 1/2 场景：当时是否点了发送/切了会话。

## 第二次实机捕获（2026-09-18 13:38，v2 已生效）

### captures 1-3（v1 残留快照）——全部确认为发送清空噪音

三个快照（05:32:14 f74→0、05:33:07 f23→0、05:33:49 f98→0）模式一致：打字到 N → `focusout → focusin → focusout`（40-80ms 间隔）→ `sel 0/0 len=0`。**结合 live tail 的 `pointerdown-outside span`（发送按钮内层元素）→ focusin → focusout → sel 0/0 → 发送清空链条，场景确认：用户点发送按钮 → 宿主清空草稿**。v1 的三条 JUMP-to-start 全部是此噪音。v2 的 `RESET-TO-EMPTY` 已正确过滤（live tail 实证：`1789709898199 RESET-TO-EMPTY f 23→0 (host clear; not captured)`，未占快照）。

### live tail（v2）——两个决定性新证据

**1. 删除操作完全绕过 input 事件（IME deleteSurroundingText 路径）**：

```
focusin → charData-mutate len 23→22 → charData-mutate len 22→21 → sel 21/21
```

用户退格删除 2 个字符，**零 beforeinput/composition**，只有文本节点直改。Android IME 的删除走 `InputConnection.deleteSurroundingText`（JNI 层直改 DOM，不经事件流）。Lexical 依赖 beforeinput 同步内部状态——这条路径正是其 Android 缺陷族的根源。

**2. 程序性内容回滚 + selection 重设的完整案例（v1 残留 capture 2 尾部）**：

```
beforeinput insertText → sel f=3/24   ← 用户在中间位置插入 3 字符
sel f=0/21                             ← 一次 selectionchange：内容 -3 回滚 + 光标归 0
beforeinput insertText → sel f=2/23   ← 用户在开头重新插入 2 字符
```

f 3→0、len 24→21 在**同一次** selectionchange 中完成（无中间 sel 报告）——不是用户逐字退格（那会有 3 次独立 sel 报告），是 **Lexical 一次性回滚刚插入的 3 字符并把 selection 归零**。用户感知即「打字被吞 + 光标乱跳」。

另一段（capture 3 前部）：`sel 74/75 → sel 39/75 → sel 75/75`（440ms 内三连跳，无 pointer/input）——selection 被连续重设两次（中间位置→末尾），即用户描述的「跳末尾」本体；紧随 len 75→74→73 无事件递减（程序性删除）。

### 最终图景（证据链闭合）

1. 用户 IME 全程不走 composition：插入走 `beforeinput insertText`，删除走 `deleteSurroundingText`（零事件）。
2. Lexical 0.49.0 在此路径下的 DOM reconciliation 会**程序性回滚内容 + 重设 selection**，四种表现均有实证：
   - 中间插入 → 回滚 + 光标归零（f3/24→0/21）
   - 光标三连跳到末尾（74→39→75）
   - 插入后两次异步跳位（32→67→82）
   - 无事件内容删减（len 83→78、75→73）
3. 发送清空（RESET-TO-EMPTY）为正常宿主行为，与 bug 无关。

**结论：Lexical 0.49.0 Android 非 composition IME 路径的 reconciliation/selection 管理系统性缺陷。置信度 ~90%。** 对应上游 facebook/lexical #6354（边界合并）/ #5268（ZWSP selection）族；触发面比原判定的「composition 边界」更宽——任何 IME 直插/直删都命中。

### 缓解评估

- **插件层恢复 selection（否决）**：跳变是 Lexical 多次异步 update 的结果（32→67→82 两连跳、39→75 三连跳均为多次重设），外部 setSelection 与 Lexical update 循环存在时序竞争，可能引入更严重的抖动/内容错乱。
- **正确路径**：向 dsh 宿主报 issue（附本证据链），建议升级 lexical（0.49 之后的版本含多项 Android IME 修复）或宿主侧 workaround；等上游修复。
- **插桩保留**：等下一次自然复现，v2 快照将包含跳变瞬间的 charData-mutate 记录（对上游 issue 报告有实证价值）；用户日常无感知（默认关，开了也不影响输入）。

## 后续路径选项

1. **接受现状**：上游 Lexical 缺陷，等官方修复（0.49.0 已含 #7725 offset 崩溃修复，残余 composition 问题仍在跟踪）。
2. **插桩定位**：dsh-qol 临时加调试日志（compositionstart/end、selectionchange、editor update tag 监听），用户复现一次即可确认具体缺陷路径，再评估能否在插件层缓解。

## 置信度

~80%（上游缺陷方向明确；具体到哪一条 Lexical issue 的映射需实机日志）。

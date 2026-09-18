# 检视报告

> 检视对象：`git diff HEAD` + 未跟踪文件（`lib/client.js`、`e2e/mobile.mjs`、`e2e/no-touch-drag.mjs`、`README.md`、`README.en.md`、两份 troubleshoot 文档、一份 validation 文档）。
> 检视同时覆盖 `260918-mobile-longpress-freeze`（修复）与 `260918-composer-caret-jump`（临时插桩）两个议题——两者在同一批改动内，故报告落在本路径。

## 概要

改动整体质量良好：两个新 feature 完全沿用既有「FEATURES 注册表 + 独立 install 块 + attribute 总闸 + apply 注册」范式，注释写清了根因与取舍，e2e 覆盖了合成事件层的逻辑，文档（troubleshoot / validation）同步到位。**修复机制我另行做了源码级核查：Blink（`third_party/blink/renderer/core/input/mouse_event_manager.cc`）在 `TryStartDrag()` 中先派发 `dragstart`，事件被取消即不建立拖拽会话；而触摸流的抑制（pointer/UA-action cancel）只在拖拽**成功**启动后才执行——因此「dragstart 触发时触摸仍活跃」与「preventDefault 可终止拖拽」两条假设都成立，机制方向可靠**。余下问题集中在：真机验收尚未完成、临时插桩默认开启带来的隐私/成本声明漂移，以及若干测试与文档一致性问题。无历史遗留的坏味道扩散。

## 需求对齐

- **Bug 1（长按卡死）**：`no-touch-drag` 的实现与 Context/文档描述逐条对应——window capture 维护 `touches` 计数（passive）、`dragstart` 在「feature attr 存在且 touches>0」时 `preventDefault()+stopPropagation()`、鼠标路径（touches=0）放行。与 `installGesture` 的既有 touchmove preventDefault 不冲突（前者只在水平意图后介入）。未见过度设计。
- **Bug 2（光标跳变）**：插桩内容与描述一致（环形缓冲 800、composition/beforeinput/selection/focus/pointerdown/MutationObserver、无 pointer 400ms + 中部→端部 ≥4 字符判定、localStorage 保留最近 3 次各 140 条、设置页导出）。定位阶段不做代码修复是正确取舍。
- **偏差（可接受，已记录）**：① `e2e/mobile.mjs` 手势段搬到 about:blank 干净页——理由（真实实例 preventDefault 使 mock 实例在 `onTouchMove` 的 `event.defaultPrevented` 检查处 return）经代码核对成立（`lib/client.js:782`），属存量测试环境问题，非本次引入；代价是手势断言不再跑在真实 app DOM 上（见 N8）。② 两个议题共用同一份 validation 文档，caret-jump 目录没有独立 `.validation.md`/`.summary.md`（见 N10）。
- **未对齐项**：`package.json:4` 与 `docs/freeform/260917-awesome-entry-draft.yml` 仍写「13 features」，README 已改 14+1（M3）；README「权限与兼容」的隐私声明与新插桩行为不符（M1）。

## 阻塞问题

无。

> 注：本结论只针对代码本身。**真机验收（validation「验证项 A–E」）未完成，是交付前置条件**，见 M1 与准入结论。

## 建议修改

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| M1 | `docs/issues/260918-mobile-longpress-freeze/260918-mobile-longpress-freeze.validation.md`（A–E 全待验证）；`lib/client.js:815-836` | 修复有效性目前只有「合成事件可被阻止」的证据；机制虽经 Blink 源码核查成立（dragstart 取消即不启动、触摸流抑制发生在启动之后），但真机原生长按路径（含宿主行重渲染放大因素）仍未被任何自动化手段覆盖，A/B 项决定修复是否成立 | 合并/发版前必须完成 A、B、C 项真机验收；若 A 不通过，按文档「待跟进」回溯（卡死路径不止触摸拖拽一条），不要以 e2e 通过视为修复成立 |
| M2 | `lib/client.js:1164` + `README.md:66`（「零权限……不读取会话内容」）/ `README.en.md` | `composition*` 的 `data` 被原样记录（≤16 字符），即**用户实时输入的串**（拼音/罗马字等）会进内存环形缓冲、进 localStorage（`dsh.qol.caretdebug`）、并被「复制调试日志」原样导出到剪贴板；与 README 的隐私/权限声明冲突（导出后用户很可能贴进公开 issue） | 二选一：① 在 README（中英）「权限与兼容」明示诊断开关会记录按键/合成串、日志可能含已输入文字片段、对外分享前请自行检查，并在导出按钮附近加一句提示；② 对 `data` 脱敏，只记类型/长度（如 `len=5 kind=alpha`），需要内容时再临时放宽 |
| M3 | `lib/client.js:70`（`caret-debug` default: true）；`README.md` 功能表新增行 | 一个明确的临时诊断功能**默认开启**并对所有装了本插件的用户生效：每个用户每次 selectionchange 都会做 selection 解析 + 两次 Range/toString 扫描，还可能在 localStorage 落 3×140 条现场；插桩本身也可能轻微扰动被观测的行为 | 建议 `default: false`（本人只需在手机上打开一次），或至少把移除清单写死在代码注释与 README 里：FEATURES 行 70、`caret-*` 块 1080-1240、QolPanel 的 debugBlock、`e2e/no-touch-drag.mjs` 的 E/F 段、README 两处功能表与计数 |
| M4 | `package.json:4`；`docs/freeform/260917-awesome-entry-draft.yml:14-15` | 功能数仍写 13，与 README 的「14 项功能（另含 1 项临时诊断）」不一致（npm 描述与 awesome 收录文案是外部可见元数据） | 同步改为 14 + 1 临时诊断的表述；若本次作为修复版本发布，记得按 `npm-publish` 流程升 patch 版本 |
| M5 | `e2e/no-touch-drag.mjs:106`、`e2e/mobile.mjs:118` | 断言硬编码属性数量（15），每增删一个 feature 都要改两处；且临时插桩的 E/F 用例与永久修复的 A–D 挤在同一文件，将来移除插桩要拆文件 | 断言改为「包含全部 FEATURES id」的集合断言（或从源码解析 FEATURES 列表）；把 caret-debug 用例拆到独立 `e2e/caret-debug.mjs`，移除插桩时只需删文件 |
| M6 | `e2e/no-touch-drag.mjs:207-260` | caret 段跑在 **app 页**（4188 e2e 实例里 dsh-qol 已 link），真实实例与 mock 实例**共用同一个 localStorage key** `dsh.qol.caretdebug`，双写同一 key、断言取「最后一条」依赖两实例监听注册顺序，存在偶发不稳；D 段已改用干净页，E/F 段没有 | E/F 段也搬到 about:blank 干净页（同 D 段的做法），消除跨实例干扰 |
| M7 | `e2e/test-settings-features.mjs`（未改动）；`lib/client.js:1379-1416` | 导出 UI 无自动化覆盖：该测试只打开设置渲染面板，不点「复制调试日志」，而这是用户把现场日志交回的唯一通路（`caretExportText` 或剪贴板回退一旦坏掉只能靠人工发现） | 补一条用例：打开 QoL → 注入 fake clipboard 或让 `navigator.clipboard` 缺失走 textarea 回退 → 断言导出文本含 `== dsh-qol caret-debug ==` 头部与 live tail |
| M8 | `e2e/mobile.mjs:126-215` | 手势段用 IIFE 形参遮蔽 `page`（`await (async (page) => {...})(gpage)`），块内缩进未随之调整，可读性差；且 `gres.error` 为真时仅打一条失败，块内 `window.__qol.*` 的 evaluate 会直接抛异常让脚本硬崩，而非产出可读失败 | 改写为具名 `async function runGestureChecks(page)` 正常调用；进入前 `if (gres.error) { check(false, ...); } else { ... }`，避免崩溃式失败 |

## 非阻塞问题

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| N1 | `lib/client.js:816-826` | `touches` 是全局裸计数、无兜底：若拖拽真的起来（或 touchend/touchcancel 因故未被 window capture 收到），计数可能残留 >0；好在下一个触摸序列的 touchend 会自愈 | 改成 identifier 的 Set（touchstart 加、changedTouches 删），并在 `pointercancel`/`visibilitychange`/`blur` 兜底清零 |
| N2 | `lib/client.js:815-836` | 只认 Touch Events：触控笔（S-Pen 类，Blink 有 `kStylusViaGesture` 拖拽分支）长按拖拽不一定产生 touch 事件，则不被拦 | 如要覆盖，可加 pointerdown(capture) 记录 `pointerType`（touch/pen 视为「手指在屏」）作为补充信号 |
| N3 | `lib/client.js:1194-1201` | JUMP-DETECTED 存在误报面：键盘 Home/End、选择手柄拖动、以及 anchorNode 为元素节点时 offset 语义从「字符偏移」变成「子节点索引」，都可能凑出「中部→端部 ≥4」 | 在 `sel` 行补 `anchorNode.nodeType`/是否文本节点，便于事后过滤；文档里说明「最多保留 3 次」可能被误报挤占 |
| N4 | `lib/client.js:1390-1393`；`lib/client.js:1402` | 「清空」只清 `_caretLog` 与 storage，未重置 `_caretPrevSel`，清空后第一次 selectionchange 仍与旧值比较，可能立即产生一条误报；「已复制 ✓」一旦显示不再回退 | 清空时一并重置 `_caretPrevSel = null`；复制成功提示 2s 后回退为原文案 |
| N5 | `lib/client.js:1235` | `caretExportText()` 假定 `snaps[i].log` 一定存在，脏数据会让 onClick 抛异常、按钮表现为「点了没反应」 | 用 `(snaps[i].log || []).join("\n")` 兜底 |
| N6 | `lib/client.js:1400-1407` | 两个按钮的内联样式对象完全重复，且与面板其余部分「用 host token」的风格略有出入 | 抽一个共享常量/`.dsh-qol-btn` 类；补齐 `aria-label` 与禁用态样式 |
| N7 | `docs/issues/260918-mobile-longpress-freeze/*.troubleshoot.md` | 根因在宿主（`dsh-client-ui-workspace` 无条件 `draggable`），插件只是兜底；插件拦的是全站触摸 dragstart，其它 draggable 区域与宿主未来改版仍可能复发 | 建议按现有证据向宿主/上游报 issue 并长期跟踪；插件侧保留开关即可 |
| N8 | `e2e/mobile.mjs:137-147` | 手势段改用 `fake_frame`/`fake_sidebarCol`（靠 `class*="_frame"`、`class*="_sidebarCol"` 子串命中）构造锚点，不再断言真实布局状态，回归覆盖度下降 | 至少保留/补一条在真实 app DOM 上、以侧栏 `data-sidebar-collapsed` 变化为准的断言（不依赖 mock 计数） |
| N9 | `README.md:17`、`README.en.md` 同 | 功能表写「桌面鼠标拖拽排序不受影响」正确，但触摸屏笔记本/平板用**手指**拖拽排序同样会被禁用，未说明 | 功能表或 hint 补一句「触屏设备上的手指拖拽排序一并禁用」，避免桌面用户困惑 |
| N10 | 提交粒度；`docs/issues/260918-composer-caret-jump/` | 未提交改动把「永久修复」与「临时插桩」混在一批；且 caret-jump 目录没有 summary/validation 独立文档（借用了 freeze 目录的合并文档） | 分两个 commit（`fix: no-touch-drag` / `chore: caret-debug 临时插桩`）便于将来干净 revert；插桩移除时补一份 caret-jump 议题的结论记录 |

## 准入结论

**结论**：`条件准入`

**说明**：代码层面未发现阻塞问题，`no-touch-drag` 的机制经 Blink 源码核查成立、实现与既有范式一致，插桩按需求落地；但本改动同时把一项临时诊断以「默认开启」形态面向所有用户发布，且 README 的隐私声明随之失真（M2/M3），修复本身仍待真机验收（M1）。建议在合并前处理 M1–M3（真机 A/B/C 验收、README 隐私表述、诊断开关默认值），M4–M8 可随后续迭代跟进。

# 检视报告 — 上一条用户消息按钮

评审对象：commit `0a0bf34` 中「上一条用户消息按钮」（`jump-user-msg`）相关改动
评审范围：`lib/client.js`（FEATURES 第 80 行、CSS 681–711、JS 1326–1446、apply() disposer）、`e2e/jump-user-msg.mjs`、`README.md`/`README.en.md` 对应行、已存在的 `summary.md`/`validation.md`。
已排除：同 commit 的 settings-groups / workspace-pin / tab-bar portal 修复 / probe-scrollbtn e2e。

## 概要

实现思路清晰：用 MutationObserver 监听宿主「回到底部」按钮所在的 `_toBottomSlot`，按需注入 34×34 圆钮（复用宿主 design token）；CSS 通过把插槽从 row 改成 column-reverse 排版让注入按钮自然叠在宿主按钮上方 8px；点击通过回算 `[data-chat-flow-kind="user"]` 顶部相对滚动容器坐标做平滑滚动。E2E 18/18 已绿、README 中英文同步更新。整体质量符合 dsh-qol 一贯的"DOM-适配 + 宿主 design token"风格，零侵入。但有若干边界场景与长期维护隐患需要修复或加固。

## 需求对齐

- ✅ 用户原话"右下角 scrolltobottom 上面加一个跳转到上一条用户消息按钮"完整覆盖：按钮位置、上方布局、点击行为、平滑滚动、再点继续上跳、第一条兜底。
- ✅ 默认开启、通过 `set_qol`（设置 → QoL 开关）独立控制、属性闸门 `html[data-qol-jump-user-msg]` 即时生效、`localStorage` 持久化（沿用既有 `loadConfig/persist/syncAllAttrs` 框架）。
- ✅ README 中英文表行已加；summary/validation 文档齐备。
- ⚠️ 用户原话只要求"上一条"按钮；当前实现隐含承诺"再点继续上跳到第一条"（summary 第 18 行）。这与用户预期一致（e2e 也覆盖到第 1 条），无偏离。

## 阻塞问题

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| B-01 | lib/client.js:1373（`chatScroller`） | 滚动容器查找使用 `p.scrollHeight > p.clientHeight`；但宿主 `_toBottomSlot` 自身是 `height: 0` 的 sticky 插槽（summary 第 24 行明确"zero-height sticky flex slot"）。即使滚出底部，按钮出现在视口内时，该 slot 的 `scrollHeight` 通常 = `clientHeight = 0`（不含自身 sticky 浮动子元素），且其 `overflowY` 也不是 `auto/scroll`。算法会跳过 slot 节点向上走，但在 composer-overlay 布局下，slot 的祖先"内部滚动元素"是否稳定命中并不确定——只靠 e2e 一次命中不能保证 composer-overlay 真实场景。 | 改进查找优先级：`[data-conversation-scroll]` 作为首选已知 DOM；只有当该元素不存在或 `scrollHeight <= clientHeight` 时才退回到向上走祖先。也可以直接保留 `document.querySelector('[data-conversation-scroll]')` 为主、`chatScroller()` 仅作为覆盖式 fallback，并在注释里写清楚这是 composer-overlay 的兜底。当前实现把 fallback 当主路径、首选当 fallback，语义反转。 |

## 建议修改

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| S-01 | lib/client.js:1426（`MutationObserver`） | `observe(document.body, { childList: true, subtree: true })` 范围过大。每次会话切回、流式增量更新、React 重渲染都会触发回调；虽然有 rAF 节流，但 `pending` 标志位是模块级闭包变量，重入安全但开销仍不可忽视。在长对话打字时会持续 `syncJumpButton()`，但实际上每次都是"找一个可能不存在的按钮"，代价虽小但属"明知无意义还跑"。 | 至少把 root 缩到 `[data-conversation-scroll]` 或最近的稳定聊天容器祖先；进一步可用 attributes 过滤（仅在 chat 区域子树变化时处理）。 |
| S-02 | lib/client.js:1418–1424（`MutationObserver` 回调） | `pending` 标志位 + rAF 节流防抖只防"同一帧内多次触发"，没有跨帧 coalesce：滚动 + 多次流式输出期间每 ~16ms 都会跑一次 `syncJumpButton`。 | 用 `setTimeout`+`clearTimeout` 或加一个 100–200ms 的最小间隔；或干脆不在每次 mutation 都跑，只在检测到节点增减且目标元素尚未被注入时才跑。当前代码注释里也写着"first match → break"，但没体现节流策略。 |
| S-03 | lib/client.js:1404（`onJumpClick`） | 使用 capture-phase 全局 click 监听（`useCapture: true`），且即便 `isOn("jump-user-msg") === false` 也只 `return` 而不移除监听；disposer 由 `installJumpUserMsg()`/`onToggle` off 分支处理但 `removeEventListener` 与 `addEventListener` 引用必须严格匹配，否则 off 后 listener 仍挂载——当前实现是匹配的（同名 `onJumpClick`），但容易在后续重构中被破坏。 | 考虑加一行注释明确 listener reference 是单例、不允许被 wrap。或者把 listener 抽象为具名对象 `{ handleEvent }` 便于维护。 |
| S-04 | lib/client.js:1442–1448（`onToggle` off 分支） | off 分支未调用 `installJumpUserMsg()` 返回的 disposer（disposer 由 `apply()` 持有），而是直接重复 dispose 逻辑（disconnect + removeEventListener + removeButtons）。这两处 dispose 逻辑若有差异会埋坑（例如未来要给 dispose 加"清理 config"之类）。 | 让 `onToggle` 复用同一个 disposer：on 时调用 `installJumpUserMsg()` 拿 disposer 存到模块级 `_jumpDisposer`，off 时调用 `_jumpDisposer()` 并置空；或在 `onToggle` 里直接调用 `apply()` 时同步注册的 disposer 链（需要先重构 dispose 注册机制）。 |
| S-05 | lib/client.js:1403–1406（`onJumpClick`）+ 1409–1412（`removeJumpButtons`） | 点击事件回调里只 preventDefault + scroll，但没考虑用户按 Enter / Space 触发按钮的键盘交互场景。当前按钮是 `<button type="button">`，键盘按下 Enter 默认会触发 click 事件——OK；Space 也会触发 click——OK。但 `e.preventDefault()` 仅在 click 路径触发，键盘不会受影响，不会误屏蔽默认表单提交等。无严重问题，但建议在按钮上加 `tabindex` 默认值（button 已自带）即可。 | 无需修改，提请实现者确认键盘 a11y 行为符合预期。 |
| S-06 | lib/client.js:1359（SVG inline） | SVG 注入使用 `innerHTML`，文本固定且不来自外部输入，无 XSS 风险。但每次重注入都会重新解析 SVG 字符串（MutationObserver 抖动时）。 | 可用 `cloneNode` 复用同一份模板，或直接用模板字符串 + `document.createElementNS`。非阻塞。 |
| S-07 | lib/client.js:1336–1346（`findToBottomBtn`） | 选择器 `button[class$="_toBottom"]` + aria 校验会引入开销（每次 mutation 跑一次 querySelectorAll）。在大型 DOM 里成本不显著，但若宿主 DOM 有 N 个 `_toBottom` 命名变体（如未来新增 `goToBottom` 之类）会被误命中。当前 aria 二次校验已能挡住大部分误命中，但仅校验"含『底部』或 /bottom/i"。 | 建议加 class 前缀黑名单（`/(_toBottomSlot|_toBottomPanel)$/`）以未来兼容性；或在注释里写明"此选择器依赖 CSS Modules 后缀约定，宿主重构时同步更新"。当前 `_toBottomSlot$` 已经有。 |
| S-08 | e2e/jump-user-msg.mjs:115 | e2e 断言 `(toBottom.top - jump.bottom) === 8` 严格相等——CSS `margin-bottom: 8px` 与宿主按钮 `margin-top: 0` 在标准布局下成立，但若宿主改用 sub-pixel 渲染或 dpr 不是 1，差 1px 就会 fail。当前 `deviceScaleFactor: 1` 下稳定，但跨设备不鲁棒。 | 改成 `<= 8 + 1`（容差 1px）或直接 `<= 8 && >= 7`，更贴近真实像素渲染。 |
| S-09 | lib/client.js:1379–1401（`jumpToPrevUserMsg`） | `target = users[0]` 兜底逻辑意味着：用户已经看到第一条用户消息时再点按钮，**会下滚回到第一条**（targetTop - 16 = 0 - 16 → max(0) = 0；scrollTop 设为 0）。e2e D 段第二个 click 命中此分支即"second click reaches the FIRST user message"，符合用户预期，但若用户已经停在第一条再点会"原地不动"，符合"无更早用户消息时停在第一条"语义。建议 summary 加一句"无更早时已停则无操作"说明，避免歧义。 | 在 summary.md 加一行说明；或在 `jumpToPrevUserMsg` 中加 `if (targetTop === viewTop) return;` 提前 return 避免无意义滚动。 |
| S-10 | lib/client.js:1385 | `viewTop = scroller.scrollTop` 在平滑滚动进行中会变化（被反复读取），最终 scrollTo 用的 `top` 是基于当前瞬间的 scrollTop 计算的——若用户连点两次，第一次正在平滑滚动中，第二次的 `viewTop` 是中间态而非最终态，可能算错目标。 | 把当前 `targetTop - 16` 与现有 `viewTop` 比较，若 `top < viewTop` 才滚动；否则（已经在目标之上）直接 return。这是常见的"连续点击竞态"问题，但 e2e 用 1600ms 间隔避开，未真正测试。 |
| S-11 | lib/client.js:1357–1358 | aria-label 与 title 都是中文硬编码字符串。其它 feature 中同类硬编码存在（例如 workspace-pin），且本插件确实以中文用户为优先；README.en.md 英文未反映按钮 tooltip 文案。非阻塞，但国际化一致性可提。 | 若后续要 i18n，与其他按钮的 i18n 一起统一处理；本 PR 不阻塞。 |

## 非阻塞问题

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| N-01 | lib/client.js:1384–1392 | 注释"rows are in document order"是对的（`querySelectorAll` 按 DOM 顺序），但若宿主渲染使用虚拟列表 / 窗口化，用户消息可能被 unmount，`querySelectorAll` 拿不到全部 `user` 节点。当前没遇到，但若是未来 dsh 上线虚拟列表会导致跳不到。 | 留 TODO 注释，提醒未来若 `users.length` 显著小于预期时切到"按滚动位置二分查找"。 |
| N-02 | lib/client.js:696–711 | CSS `corner-shape: round`（line 698）是 2024 新属性，Safari 17.4+ / Chromium 129+ 才支持。当前不支持也无副作用（回退到 `border-radius: 100px`），但混用 `corner-shape` 与 `border-radius` 在某些浏览器可能让按钮显得略扁。 | 保留即可，作为渐进增强；或在 `border-radius: 100px` 后跟一行 `@supports (corner-shape: round) { corner-shape: round; }` 隔离。 |
| N-03 | lib/client.js:1356 | 注入按钮 className 直接用裸字符串 `dsh-qol-jump-user`，未走 camelCase 命名空间（其他 feature 类名如 `dsh-qol-appframe`、`dsh-qol-overlay-tagged` 风格一致），OK。 | 无 |
| N-04 | docs/features/260925-jump-user-msg/260925-jump-user-msg.summary.md:23–26 | 宿主事实段描述 `.EvIC1a_toBottomSlot` 但 CSS Modules hash 在不同部署版本可能变化；不影响代码（已用 `[class$="_toBottomSlot"]` 后缀匹配），但文档若留作下次参考可能误导。 | 改写为"宿主 CSS Modules hash 随版本变化，本插件用 className 后缀匹配；aria-label 是稳定锚"。 |
| N-05 | e2e/jump-user-msg.mjs:43–60 | `sendMessage` 用 `[data-composer-input]` + aria-label 含 Send 的 button click——和 0a0bf34 同 commit 的 `probe-scrollbtn.mjs` 大概率用了类似机制。可考虑提取共用 helper，避免重复。 | 后续 e2e 重构时统一即可。 |
| N-06 | lib/client.js:1394 | `matchMedia("(prefers-reduced-motion: reduce)").matches` 每次点击都查，可缓存到模块级变量监听变化；非阻塞。 | 可选优化。 |

## 准入结论

**结论**：`条件准入`

**说明**：核心功能完整、E2E 18/18 已绿、需求 100% 对齐、零侵入、与 dsh-qol 既有风格高度一致，无功能性阻塞问题。建议在合并前对 **B-01**（`chatScroller` 语义反转 + composer-overlay 场景可靠性）与 **S-10**（连续点击竞态）至少留明确注释或加守卫；其他建议项可在后续迭代处理，不影响准入。

- 准入：无
- 条件准入：**是**。B-01 是非功能性可靠性风险（e2e 没真正测到 composer-overlay）；S-10 是用户连续点击时的体验问题（e2e 用长间隔规避）。两者均建议在合并前至少加注释或 1-2 行兜底。
- 不准入：无阻塞问题。
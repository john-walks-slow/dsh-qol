# 检视报告 — 工作区菜单置顶（workspace-pin）

## 概要

检视范围：`lib/client.js` 中 `installWorkspacePin` / FEATURES 注册 / apply 挂载（约 +90 行）与 `e2e/workspace-pin.mjs`（24 项断言）。整体实现与需求对齐，关键修复（`workspaces` 加入 `inject`）到位，机制（document 捕获 + MutationObserver + 原生 menuitem 注入 + 宿主导航注入 `insertBefore`）完整闭环，e2e 24/24 绿。仅在少量边界、文档一致性、未来回归风险处有可优化点，无阻塞问题。

## 需求对齐

- ✅ 侧边栏工作区行 ⋯ 菜单新增「置顶」/「Pin to top」项，行为等价拖到顶部
- ✅ 已置顶时显示禁用「已置顶/Pinned」
- ✅ 顺序经 `workspaces.insertBefore` 走 host RPC 持久化，刷新不丢（验证项 H）
- ✅ 仅命中工作区行菜单（含「重命名/Rename」+「删除工作区/Delete workspace」），会话行菜单（含重命名/分叉/归档）不被注入
- ✅ 顶部工作区切换器菜单不被注入
- ✅ 设置面板开关热重载（关→菜单无 Pin，开→恢复）
- 与 plan/spec 差异：无；总结文档（`260925-workspace-pin.summary.md`）准确描述了实现细节。

## 阻塞问题

无。

## 建议修改

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| S1 | `lib/client.js:1137-1278` `installWorkspacePin` | 仅靠行标题文本（`lastRow.title`）匹配工作区 ID；同名的两个工作区会错误路由到列表第一项。`WorkspaceView` 实际带稳定 `workspaceId`，但 DOM 行未暴露，宿主组件又没注入 `data-*` 标识，无法用更稳的键匹配 | 当前接受「重复标题回落到第一项」的设计是合理的妥协，但函数顶部注释（行 1146「duplicate titles resolve to the first match」）应在用户文档或 hint 文本中明示；或考虑在 `resolveTarget` 中加一层「最后位置校验」（比对当前快照中同名工作区数量，确保是同一引用）。优先级低。 |
| S2 | `lib/client.js:1148` `installWorkspacePin` + `lib/client.js:1263` `scanMenus` | `onToggle` 派发表（行 1078-1085）未包含 `workspace-pin`；运行时关闭是依赖 `scanMenus` 早返回 + `isOn` 拦截。**功能正确**，但 `onToggle` 注释明确列出「no re-arm needed」的同类 JS 特性（sidebar-gesture / settings-remember-tab 等），未列 `workspace-pin`，易让未来维护者误以为此处遗漏了 | 在 `onToggle` 注释（行 1081-1084）追加「workspace-pin uses the same event-time gate (isOn in scanMenus / lastRow capture is guarded)」，与同类 JS 特性并列记录；保持文档一致即可。 |
| S3 | `lib/client.js:1217-1218` `buildPinItem` | 注入项的内联 SVG 走原始 DOM 字符串拼接，未引用宿主 primitives（`IconArrowLineUp16` 等风格化图标库）。其他宿主菜单项用 `@deepseek-ai/dsh-client-ui-primitives` 的 `IconEditOutline16`/`IconTrashOutline16`。视觉一致性 OK 但图标选择（一个通用图钉）偏离了宿主的「箭头向上/竖线置顶」语义族 | 选取更贴合「列表项向上移动」语义的图标（如 `IconArrowLineUp16` 或 `IconArrowFatLineUp16`，如该 primitives 包未在 cordis 注入可改用纯 CSS / 内联 path），保证 hover / focus / dark mode 颜色随 token 变化。当前后景 `currentColor` 已正确继承文本色，仅是图标语义可改进。 |
| S4 | `lib/client.js:1144` | 注释提到「pure DOM augmentation: the Menu portal is React-rendered」，但没说为什么不能修改宿主 Menu 组件。若宿主后续把 Menu 改为 items prop 类型严格化或 React Fiber tree validation，外挂 DOM 节点可能在新版本失效 | 在函数头注释追加「**耦合脆弱性**」段落：明确依赖宿主 `Menu` 当前为 portal+`role=menu`+手写 `<button role=menuitem>` 的实现，若宿主切换到受控 `items[]` 渲染或加 React Portal 校验，本特性需重写为 `ctx.locale` 翻译 + `slots.inject('sidebar.workspaces.actions', …)` 的正式扩展点。这对未来维护价值高。 |
| S5 | `e2e/workspace-pin.mjs:50-74` `openRowMenu` | 实现是手工 `getBoundingClientRect` → `mouse.move` → `evaluate(btns[0].click())`。如果 Row 在 e2e 视口外或被别的元素遮挡，鼠标 move 会失败而 evaluate click 仍能成功，导致行为与真实用户不一致。已在测试内做 `hover()` 不稳定后的手动兼容，但 mobile viewport 与 desktop 渲染路径不同 | 在 e2e 开头加一行 `await page.waitForSelector('[class*="projectRow"]')`，并断言 `projectRow` 都在视口内（如 `b.x + b.width <= 1280`）。可在 `openRowMenu` 内部统一断言，降低后期维护成本。 |
| S6 | `e2e/workspace-pin.mjs:115-122` 校验项 B | `menu1.length === 3` 断言「菜单恰好 3 项」。如宿主未来在 Row 菜单追加新项（例：「复制工作区」、「导出」），这条断言会立即失败。需要的是「**至少包含** Pin/Rename/Delete workspace 三项」而非「**仅含**」三项 | 改为：`menu1.length >= 3 && menu1.some(i => i.pin && i.text === 'Pin to top') && menu1.some(i => i.text === 'Rename') && menu1.some(i => i.text === 'Delete workspace')`。其余菜单结构断言同理弱化为 `some`/`every`。 |

## 非阻塞问题

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| N1 | `lib/client.js:47` `var inject = ["slots", "workspaces"]` | `workspaces` 仅在 `installWorkspacePin` 内通过 `ctx.get` 使用；其他 `install*` 函数（`installGesture`、`installSwitchBehavior`、`installSidebarOverlay`、`installActiveSessions`）并未直接读 `workspaces`，但与工作区切换相关（`installActiveSessions` 读 `displaySessions`，可能间接依赖） | 确认其他 install 函数是否也用了 `ctx.workspaces`（grep 未见直接调用，但 `installActiveSessions` 可能订阅 list），如确无直接调用，将 `workspaces` 仅声明给真正使用者更清晰。当前无害。 |
| N2 | `lib/client.js:1203-1204` `buildPinItem` | `wrap.className = protoItem.parentElement.className` 直接复制原型 wrap 的完整 className；若宿主给 wrap 加了动态状态类（如 hover/active），注入项也会带上 | 在类名复制后 append 一个自有标记类（如 `data-qol-pin-wrap`），便于后续 CSS 微调与样式隔离。当前视觉无差异。 |
| N3 | `lib/client.js:1269-1270` `observer.observe(document.body, { childList: true, subtree: true })` | 与 `installSettingsRememberTab`（行 1112）、`installSidebarOverlay`（行 1311-1314）共用 `document.body` 大范围 MutationObserver。三个 observer 各自独立调度，每次 DOM 变更都触发三次回调 | 性能上目前不构成瓶颈，但若功能继续叠加，可考虑合并为 `qol.mutation-observer` 总线由 `apply()` 集中管理（一次性 throttle 调度）。优先级低。 |
| N4 | `lib/client.js:1148` `if (!isOn("workspace-pin")) return function () {}` | 与 `installSidebarOverlay` 的 mobile-only 早返回类似，把「开关关闭」视为「无操作」并返回 no-op dispose。语义合理，但若用户在切换关闭前已打开一个 menu（在 menu 内的 Pin 节点仍存活），关闭瞬间不会被清理；下一次 mutation 才会因 `scanMenus` 早返回而停止新增，但旧的注入节点会留在 DOM 直到 React 自然卸载 | 当前实现下「开关关闭 → 关闭菜单 → React 卸载 → 下次重开干净」，不构成 bug；标注于此供未来 reader 理解为何不需要主动清理 `data-qol-pin` 节点。 |
| N5 | `e2e/workspace-pin.mjs:184-200` 切换器菜单探测 | 选择器 `/^[A-Za-z0-9_-]+$/.test(text) && className.includes('workspace')` 较脆弱，可能误中其他按钮（扩展/搜索按钮等），且不区分 header workspace picker 与 row actions | 当前断言只是「无 Pin 注入」，false-positive 风险低；若切换器按钮选择器稳定可用，建议改成基于 `aria-label="Workspace actions for ..."` 之类更具体的属性。 |
| N6 | `e2e/workspace-pin.mjs:98-113` 与 `261-274` 顺序规范化 | 测试开头/结尾都对 [virtual-connect, ws-two] 做幂等规范化，但 e2e 实例的 storages 是 `/root/.dsh-e2e`（按 dsh-e2e skill 提示是 4188 端口的隔离 home）。注释说明需要「stop 4188, append a second workspace record …, restart」预置；这意味着测试运行依赖 e2e 环境的预置状态 | 在测试 docstring（顶部注释区）把「预置命令」或「依赖脚本」明示出来（如引用 `references/e2e-setup.md`），便于新加入者复制运行步骤。 |

## 准入结论

**结论**：`条件准入`

**说明**：无阻塞问题，需求全部满足，e2e 24/24 全绿。S1-S6 均为不影响功能正确性的改进项，建议在合并后或下一迭代处理；其中 S4（宿主耦合脆弱性文档化）价值最高，建议在合并前追加到函数头注释。

- **准入**：无阻塞问题，可进入下一阶段（合并/交付）。
- **条件准入**：无阻塞问题，但存在建议修改项，建议在合并前或后续迭代处理。
- **不准入**：存在阻塞问题，须修复后重新检视。
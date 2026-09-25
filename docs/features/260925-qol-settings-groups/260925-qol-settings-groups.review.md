# 检视报告：qol-settings-groups（设置面板分组折叠）

## 概要

检视范围：`lib/client.js` 设置分组部分（FEATURES 加 group、GROUPS 数组、折叠状态管理、GroupHeader/QolPanel 分组渲染、分组 CSS）、`e2e/test-settings-features.mjs` 新增 4.1/4.2 断言、README.md / README.en.md 功能表 4 组重排。并行 Agent 的 jump-user-msg / workspace-pin（lib/client.js）与 probe-scrollbtn.mjs 按任务声明不在检视范围。

整体评价：实现与需求 5 条要点全部对齐，结构清晰、防御性处理得当（localStorage try/catch、CSS 用 `!important` 压过 ToggleRow 内联 display:flex、`data-collapsed` 属性驱动样式与 e2e 断言），未发现阻塞问题；存在若干建议级事项（README 数字口径、测试注释过时、未来 FEATURE 缺 group 的无兜底），建议合并前或合并时顺手处理。

## 需求对齐

| 需求要点 | 实现 | 结论 |
| --- | --- | --- |
| FEATURES 每项加 group；GROUPS 有序数组 nav/ime/touch/display；QolPanel 按组渲染 | lib/client.js:62 GROUPS（4 组，顺序 nav→ime→touch→display）；:75-92 FEATURES 15 项均带 group 且按组重排；:1570-1606 QolPanel 双循环按 GROUPS 序渲染「组 div（data-group/data-collapsed）+ GroupHeader + 组内 ToggleRow」 | ✅ |
| ModeRow 紧贴 active-tabbar 开关行下方、同在 nav 组内 | lib/client.js:1587-1590，`f.id === "active-tabbar" && isOn()` 时紧随其 ToggleRow 后 push ModeRow；折叠 CSS 同步覆盖 `.dsh-qol-moderow`（:643） | ✅ |
| 组标题可点击折叠；存 localStorage `dsh.qol.groups`（独立于 `dsh.qol.v1`）；默认展开；老配置零迁移 | :147-162 独立键 + loadCollapsedGroups（try/catch、默认 {}）+ setGroupCollapsed；:1550-1568 GroupHeader（role=button / aria-expanded / Enter+Space）；config 读写路径零改动 | ✅ |
| 开关机制不变（html[data-qol-*] 总闸、即时生效、ToggleRow 不变） | ToggleRow / applyAttr / onToggle 均未改动，仅渲染结构变化 | ✅ |
| e2e 增加分组结构断言，计数不写死总数 | test-settings-features.mjs:144-209：4 个组标题、标签、各组核心功能归属（`>=` 计数）、行数合计一致性、折叠/展开交互 + localStorage 落盘 | ✅ |
| README 功能表按 4 组 ### 重排 + 使用说明/本地开发节补充 | README.md:14-41、68-69、120；README.en.md 对应位置 | ✅ |
| 分组 CSS 位于数组末尾、不在移动端 media query 内 | :639-670，位于 `@media (max-width:768px)` 结束（:404）之后，桌面/移动共用 | ✅ |

## 阻塞问题

无。

| ID | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |

## 建议修改

| ID | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| S1 | README.md:14、:68；README.en.md:14、:68 | 文档写死「13 个功能开关 / 13 toggles」，而当前工作树 FEATURES 已是 15 项（含并行 Agent 的 jump-user-msg / workspace-pin，均带 group 落在 nav 组，实际 nav 组显示「7 项」）；两路改动合并后文档数字即失实，且后续每新增功能都要改两处 README | 改为不写死数量的表述，如「设置 → QoL 中的全部功能开关按 4 组组织（点击组标题可折叠）」；README 功能表如需列出新增功能，由对应 Agent 补充 |
| S2 | e2e/test-settings-features.mjs:144 | 注释「导航与切换 5 / … 4」是本次改动落地时的分组数量，但断言本身已用 `>=` 兼容并行新增（nav 实为 7），注释与实际不符，会误导后续维护者 | 注释去掉具体数字或改为「导航与切换 ≥5 / …」；断言保持 `>=` 不变 |
| S3 | lib/client.js:1570-1606（QolPanel 分组循环） | 未来若新增 FEATURE 忘写 `group`，该功能不会出现在任何组内（渲染循环 `f.group !== grp.id` 全部跳过），但 isOn/syncAllAttrs 照常生效——功能可用却无开关入口，难排查 | 渲染循环中对无 group 的 feature 打 `console.warn('[dsh-qol] FEATURE missing group:', f.id)`，或给默认兜底组（如归入 display） |

## 非阻塞问题

| ID | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| N1 | lib/client.js:1550-1568（GroupHeader） | 组标题 `tabIndex: 0` 可键盘聚焦，但无 `:hover` / `:focus-visible` 样式，键盘操作时无可见焦点指示（鼠标操作有 `cursor:pointer`） | 追加 `.dsh-qol-group-header:focus-visible { outline: ... }` 及可选 `:hover` 背景，提升可访问性 |
| N2 | lib/client.js:149-157（loadCollapsedGroups） | 仅校验 `typeof o === "object"`，数组也会被接受；若 localStorage 被外部写入字符串 `"false"`（真值）会意外折叠。本插件只写布尔值，风险低 | 可加 `!Array.isArray(o)` 校验，或在读取时对非布尔值归一化 |
| N3 | e2e/test-settings-features.mjs:168 | 「行数合计一致性」只统计 `.dsh-qol-row`，不覆盖 `.dsh-qol-moderow`；若 ModeRow 被误渲染到组外，该断言不会暴露。当前实现 ModeRow 仅在 nav 组循环内渲染，属代码路径保证 | 可在合计一致性中补充统计 `.dsh-qol-moderow`（期望 0 或 1 且位于 nav 组内） |
| N4 | lib/client.js:62-92 / :147（设计注记） | 用户折叠某组后，该组内后续新增的功能默认被隐藏，用户可能不知道有新开关（如 nav 组折叠后新增 jump-user-msg / workspace-pin 不可见）。需求明确「默认展开 + 零迁移」，属可接受行为 | 未来若担心新功能触达率，可在功能集变化时对 `dsh.qol.groups` 做版本化重置（如键升级为 `dsh.qol.groups.v2`）；当前无需处理 |
| N5 | lib/client.js:147-162 | GROUPS 中移除某组后，`collapsedGroups` 中残留该组 key，无害但永不清理 | 可接受；如在意可周期性 prune 不存在的组 id |

## 准入结论

**结论**：`条件准入`

**说明**：无阻塞问题，需求 5 条要点全部落实，实现与 e2e 断言互相咬合；建议修改项（S1 README 数字口径、S2 测试注释过时、S3 缺 group 兜底）不影响本次功能准入，建议在合并时或合并后迭代中处理——其中 S1 因与并行 Agent 的功能合并会直接产生文档失实，优先级最高。

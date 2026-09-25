# QoL 设置面板分组折叠 — 总结

日期：2026-09-25 · 状态：条件准入（无阻塞）+ e2e 28/29（1 项既有失败与本改动无关），待用户实机验证

## 需求（用户 2026-09-25 提出）

用户反馈 QoL 设置"越来越乱"，提议如何组织。提案给出 6 组 / 4 组两案，用户经 ask_user_question 选择 **4 组方案**：

| 组 | 功能 |
|---|---|
| 导航与切换 | 活跃会话 Tab Bar（+标签显示模式）、侧栏滑动开合、侧栏覆盖不挤宽、切换会话收起侧栏、切换会话不拉键盘 |
| 输入与键盘 | 输入法/键盘适配、隐藏权限选择下拉 |
| 触摸与反馈 | 按钮触摸反馈、禁用触摸长按拖拽 |
| 显示与设置页 | 设置页全屏重写、设置页记忆页签、代码块/表格内滚、状态指示动画优化 |

## 交付内容

全部改动在 `lib/client.js` + `e2e/test-settings-features.mjs` + README 中英双版：

1. **FEATURES 加 group 字段并按组重排**：13 项核心功能全部带 `group`；新增 `GROUPS` 有序数组（nav → ime → touch → display，顺序即面板渲染顺序）。
2. **QolPanel 分组渲染**：按 GROUPS 双循环渲染「组 div（`data-group` / `data-collapsed`）+ GroupHeader + 组内 ToggleRow」；ModeRow 仍在 active-tabbar 行下方、同属 nav 组。（追加调整 2026-09-25 13:05：组标题右侧的「N 项」计数按用户要求移除。）
3. **组标题可点击折叠**：`GroupHeader`（role=button / aria-expanded / Enter+Space 键盘支持），折叠状态存独立键 `dsh.qol.groups`（默认展开、try/catch 容错、数组值校验拒绝），老配置零迁移。
4. **开关机制零改动**：`html[data-qol-*]` 属性总闸、`ToggleRow`、`onToggle`、`syncAllAttrs` 均未动，仅渲染结构变化。
5. **分组 CSS**：`.dsh-qol-group*` 规则追加在 CSS 数组末尾、移动端 media query 之外（手机桌面共用）；折叠隐藏规则用 `!important` 压过 ToggleRow 内联 `display:flex`。
6. **缺 group 兜底**：加载时扫描 FEATURES，缺 group 或组 id 拼错的项打 `console.warn`（功能照常生效但面板无入口，早暴露）。
7. **e2e 断言**（test-settings-features.mjs 4.1/4.2）：4 个组标题、标签正确、每组核心功能归属、行数合计一致性（组内行数之和 = 总行数）、ModeRow 不越组、折叠/展开交互 + `dsh.qol.groups` 落盘；计数用 `>=` 不写死，兼容并行新增功能。
8. **README 中英**：功能表改为 4 个 ### 小节分组呈现；使用说明补充分组折叠与 `dsh.qol.groups` 键；「13 项」等写死数量改为「全部 QoL 功能」口径（并行 Agent 已在 FEATURES 追加 2 项，写死数字即失实）；本地开发节补充 FEATURES 需带 group。

## 设计决策

- **单分区内分组，不拆宿主设置页签**：拆成多个 settings.section 会污染宿主设置对话框的页签列表（已 11 个页签），组内折叠是更优层次。
- **折叠状态独立键**：与开关配置 `dsh.qol.v1` 分离，配置合并/备份保持功能形态；组折叠不参与 config 布尔循环。
- **默认展开**：首次用户仍能看到全部开关，折叠是主动行为（避免新功能触达率下降——折叠组内新增功能默认隐藏，属可接受行为，见检视 N4）。

## 验证

- `node --check lib/client.js` 通过（无构建步骤）。
- E2E `e2e/test-settings-features.mjs`（4175 实例，camoufox headless，移动 viewport）**28/29**：分组结构、折叠交互、ModeRow 位置、remember-tab 全链路通过。
- 4175 轻量探针：toggle 循环无 React hook pageerror；ModeRow 紧贴 active-tabbar 且位于 nav 组。
- **1 项失败与本改动无关（既有）**：`Header is placed in the top-right corner` —— 设置对话框在 e2e 点击路径下渲染进**已折叠的侧栏列**（侧栏 280px 宽、translateX(-100%) 移到屏外，对话框 left:-281 宽 280），右上角像素断言失败。属 sidebar-overlay（260916）与设置对话框在折叠侧栏内打开的交互问题，与本次分组改动无因果关系（分组仅改 QoL 面板内部渲染，未触及设置对话框/侧栏 CSS），留待单独排查。
- tabbar-mode.mjs 未复跑：4188 e2e 实例被并行 Agent 的在途工作占用（超时），其验证的 ModeRow 行为已由上述 4175 探针覆盖。

## 检视（reviewer 报告：260925-qol-settings-groups.review.md）

**条件准入**，无阻塞。建议 3 项 + 非阻塞 5 项，已全部处理：

| ID | 问题 | 处理 |
|---|---|---|
| S1 | README 写死「13 个」数字口径，FEATURES 已 15 项（含并行新增） | 改为「全部 QoL 功能 / all toggles」不写死 |
| S2 | e2e 注释「导航与切换 5」过时（实为 7） | 注释去数字 |
| S3 | 未来 FEATURE 缺 group 无兜底，功能可用但面板无入口 | 加载时扫描打 `console.warn` |
| N1 | GroupHeader 无 focus-visible / hover 样式 | 追加 `:hover` 背景 + `:focus-visible` outline |
| N2 | loadCollapsedGroups 接受数组真值 | 加 `!Array.isArray(o)` |
| N3 | 合计一致性未覆盖 moderow 越组 | e2e 补 ModeRow 位置断言 |
| N4 | 折叠组内新增功能默认隐藏（设计注记） | 接受，不改 |
| N5 | collapsedGroups 残留 key | 接受，不改 |

## 已知边界

- 检视范围外：并行 Agent 的 jump-user-msg / workspace-pin（lib/client.js）与 e2e/probe-scrollbtn.mjs 不在本次交付内；其 README 数字更新与功能表补充由对应 Agent 负责。
- 既有 e2e 失败（header 右上角）与本改动无关，单独跟进。

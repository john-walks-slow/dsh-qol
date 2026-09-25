# 工作区菜单置顶 — 总结

日期：2026-09-25 · 状态：e2e 24/24 全绿，待用户实机验证

## 需求（用户提出）

侧边栏工作区行的 ⋯ 菜单（现有：重命名 / 删除工作区）新增「置顶」项，点击后把该工作区固定到列表最前；顺序通过 host 排序 RPC 持久化（等价于拖到顶部），刷新不丢。

## 实现机制（全部在 `lib/client.js`）

- **FEATURES 注册**：新增 `workspace-pin`（nav 组，默认开），设置在「导航与切换」分组。
- **`installWorkspacePin(ctx)`**（约 1138 行）：
  - **关键修复**：`var inject = ["slots", "workspaces"]`（原仅 `["slots"]`）——cordis 中 `ctx.get("workspaces")` 未在 inject 声明时返回 NULL，导致注入不生效。
  - **菜单识别**：document click 捕获记录行标题 → MutationObserver 监听 body → 检测 `[role=menu]` 同时含「重命名/Rename」与「删除工作区/Delete workspace」才判定为工作区行菜单（会话菜单有 Rename 但无删除项，不误判）。
  - **注入**：用宿主 menuitem 类（`_itemIcon_`/`_itemLabel_` 结构，iconCls 匹配 className 含 "Icon"）构建「置顶」项，插入 viewport 首位，`data-qol-pin` 标记防重复注入。
  - **动作**：点击时调 `workspaces.insertBefore(target.id, target.firstId)` 移到最前；已在最前时菜单项禁用并显示「已置顶/Pinned」。
  - **文案**：按界面语言（菜单含中文「重命名」→ 中文「置顶/已置顶」，否则英文 Pin to top / Pinned）。
  - **关菜单**：操作后点击行内第一个 iconButton 关闭菜单。

## 交付内容

| 文件 | 改动 |
| --- | --- |
| `lib/client.js` | +`installWorkspacePin` 与 FEATURES 注册（约 +90 行） |
| `e2e/workspace-pin.mjs` | 新增，24 项断言：菜单注入、置顶移动+持久化、已置顶禁用态、会话/切换器菜单不注入、开关热重载、reload 持久化、幂等恢复初始顺序 |

## 验证状态

- 自动化 e2e：**24/24 全绿**（4188 隔离实例，两个工作区 virtual-connect / ws-two）。
- 测试脚本对初始顺序做规范化（保证 [virtual-connect, ws-two] 开头、结束恢复），跨运行幂等。
- 待用户实机验证（见 `260925-workspace-pin.validation.md`）。

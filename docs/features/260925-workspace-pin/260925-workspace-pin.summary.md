# 工作区菜单置顶 — 总结

日期：2026-09-25 · 状态：e2e 33/33 全绿，待用户实机验证（二轮扩展：多置顶 + 行图标）

## 需求（用户提出）

1. 侧边栏工作区行的 ⋯ 菜单（现有：重命名 / 删除工作区）新增「置顶」项，点击后把该工作区固定到列表最前；顺序通过 host 排序 RPC 持久化，刷新不丢。
2. 二轮扩展（用户确认设计）：**支持多个工作区置顶**（置顶区语义，置顶的工作区都固定在列表前部、按置顶先后排序，可「取消置顶」）；**已置顶的工作区行右侧显示小图钉图标**。

## 实现机制（全部在 `lib/client.js`）

- **FEATURES 注册**：新增 `workspace-pin`（nav 组，默认开），设置在「导航与切换」分组。
- **置顶集合**：`localStorage["dsh.qol.pinned-ws"]` 存置顶工作区 id 有序数组；行图标状态与菜单项文案均由它驱动；集合变化即写盘，刷新后恢复。
- **`installWorkspacePin(ctx)`**（约 1166 行）：
  - **关键修复**：inject 声明 `"slots", "workspaces"`——cordis 中 `ctx.get("workspaces")` 未声明时返回 NULL，导致注入不生效。
  - **菜单识别**：document click 捕获记录行标题 → MutationObserver 监听 body → 检测 `[role=menu]` 同时含「重命名/Rename」与「删除工作区/Delete workspace」才判定为工作区行菜单（会话菜单有 Rename 但无删除项，不误判）。
  - **注入**：用宿主 menuitem 类（`_itemIcon_`/`_itemLabel_` 结构）构建「置顶/取消置顶」项，插入 viewport 首位，`data-qol-pin` 标记防重复。
  - **动作**：
    - 置顶：`insertBefore(id, 第一个未置顶工作区)`（置顶区末尾）；已置顶菜单显示「取消置顶 Unpin」。
    - 取消置顶：从集合移除，`insertBefore(id, 最后一个置顶之后)`（未置顶区开头）；无置顶时保持原位。
    - 注意：宿主把 `null` 的 beforeWorkspaceId 当无操作，追加末尾必须省略第二参。
  - **行图标**：独立 MutationObserver（150ms 防抖）同步 `[class*="projectRow"]` 行——在置顶集合中的行注入 `[data-qol-pin-icon]` 图钉 span（absolute 定位行右端），非置顶行移除；CSS 中 hover 时图标隐藏（让位给 ⋯ 操作按钮），且 `html:not([data-qol-workspace-pin="on"])` 时整体隐藏（开关热重载即时生效）。
  - **文案**：按界面语言（菜单含中文「重命名」→ 中文「置顶/取消置顶」，否则英文 Pin to top / Unpin）。
  - **关菜单**：操作后若菜单仍开着才点行内 ⋯ 关闭（幂等，避免重复打开）。

## 交付内容

| 文件 | 改动 |
| --- | --- |
| `lib/client.js` | `installWorkspacePin` 重写（置顶区/取消/图标）+ FEATURES hint + CSS（约 +160 行） |
| `e2e/workspace-pin.mjs` | 33 项断言：菜单注入（Pin/Unpin）、单/多置顶排序、行图标出现/移除、取消置顶移位、会话/切换器菜单不注入、开关热重载（图标即时隐藏/恢复）、reload 持久化、幂等恢复 |

## 验证状态

- 自动化 e2e：**33/33 全绿**（4188 隔离实例，两个工作区 virtual-connect / ws-two）。
- 测试脚本开头/结尾规范化（清空置顶集合 + 恢复 [virtual-connect, ws-two]），跨运行幂等。
- 一轮检视（单置顶版）：条件准入，无阻塞（见 `260925-workspace-pin.review.md`）；多置顶扩展待二轮检视。
- 待用户实机验证（见 `260925-workspace-pin.validation.md`）。

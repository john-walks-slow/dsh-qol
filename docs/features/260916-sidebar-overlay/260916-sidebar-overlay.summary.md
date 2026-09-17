# sidebar-overlay — 修复总结

> 日期：2026-09-16
> 需求：移动端 sidebar 弹出时不挤压主内容区域宽度
> 影响文件：`lib/client.js`（新增 feature + CSS）

## 背景

DSH 使用 CSS Grid 布局 app frame：`grid-template-columns: {sidebar}px minmax(0, 1fr) {details}px`。移动端打开侧栏时，`computeColumns()` 分配 264px 给 sidebar 列，center 列被压缩到 ~111px（375px 视口），导致主内容区域重排。

## 实现

新增 `sidebar-overlay` CSS feature（默认开启，≤768px 生效）：

1. **覆盖 grid-template-columns**：强制 `0 minmax(0, 1fr) 0`，center 列始终全宽
2. **侧栏改为 position:absolute 浮层**：`z-index: 1000`，宽 280px / max 85vw，带 box-shadow 视觉分离
3. **transform 动画**：`data-sidebar-collapsed` 驱动 `translateX(-100%)`（收起）/ `translateX(0)`（展开），0.2s ease
4. **隐藏 drag handle**：浮层侧栏不需要 resize handle

## 改动行数

- FEATURES 数组：+1 行（注册新 feature）
- CSS：+18 行（含注释）
- 无 JS 逻辑变更
- 无新依赖

## 与现有 feature 的交互

| Feature | 交互 | 兼容性 |
|---|---|---|
| `sidebar-gesture` | JS 用 `data-sidebar-collapsed` 属性判断开合状态，不依赖宽度 | ✅ 无冲突 |
| `sidebar-rail` | rail overlay 在 `data-sidebar-collapsed` 时显示，独立于 sidebar 列 | ✅ 无冲突 |
| `active-tabbar` | 移动端 tab bar `left:64px`，侧栏展开时 z-index:1000 覆盖 tab bar z-index:999 | ✅ 正确覆盖 |
| `switch-collapse` | 切换会话时调用 `toggleSidebar()`，侧栏滑出而非缩窄 | ✅ 更好的 UX |

## 经验记录

### DSH Grid 布局与移动端

DSH 的 `computeColumns(viewport, sidebar, details)` 函数在窄屏（<1024px）下将 sidebar 设为 264px，details 设为 0，center 得到剩余宽度。当 viewport < 264+640 时，center 被压缩到 `max(0, viewport - sidebar)`。

移动端的正确做法是让 sidebar 脱离 grid 流（position:absolute），而非作为 grid 列参与布局。这避免了 center 列的 reflow，同时保留了 sidebar 的功能完整性。

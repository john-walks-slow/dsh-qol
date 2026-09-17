# Mobile Dropdown Position — 修复总结

> 日期：2026-09-16
> 问题：移动端两个 dropdown 定位 bug
> 影响文件：`lib/client.js`（`popover-recenter` CSS 块）

## 背景

移动端 DSH Web GUI 存在两个 dropdown 定位问题：

1. **Bug 1**：Portal 菜单（工作区下拉框等）第一项被 Chrome URL bar 遮挡，无法点击。
2. **Bug 2**：已有对话状态下，模型选择 dropdown 弹到屏幕中央而非输入框上方。

## 根因

### Bug 2

`popover-recenter` CSS 无条件将 `[data-slot="conversation.composer.bar"] [role="menu"]` 强制为 `position:fixed; top:50%`（屏幕居中）。在 hero 状态（新会话）composer 居中时正确，但 active 状态（已有对话）composer 在底部时使 dropdown 弹到屏幕中央。

### Bug 1

DSH Menu primitive（`Ou` 函数）在 `portal:true` 时用 `position:fixed` + JS 计算 inline `top`，clamp 余量仅 12px。移动 Chrome 上 `position:fixed; top:12px` 从 layout viewport 顶部算起，被 ~56px URL bar 遮挡。

## 修复

### Bug 2 修复

在 `popover-recenter` 的 composer bar 菜单选择器中加入 `[data-phase="hero"]` 限定，使居中规则仅在 hero 状态生效。active 状态下不施加居中覆盖，让原生 `position:absolute; bottom:calc(100%+8px); right:0` 定位生效。

`session.header.actions` 的居中规则不加 phase 限定（header 始终在顶部，与 phase 无关）。

### Bug 1 修复

新增 CSS 规则：在 `pointer:coarse`（移动端）下，给 `body > [role="menu"]`（portal 菜单）添加 `margin-top: env(safe-area-inset-top, 0px)`。`env(safe-area-inset-top)` 在 `viewport-fit=cover`（由 `ime-viewport` 激活）下解析为 URL bar 高度，将菜单推到 URL bar 下方。

## 改动行数

- `lib/client.js` L227-259：~21 行 CSS 修改（注释更新 + 选择器限定 + 新增 portal safe-area 规则）
- 无 JS 逻辑变更
- 无新依赖

## 经验记录

### DSH `data-phase` 属性

DSH 会话根元素（`.wSkVaW_root`）使用 `data-phase` 属性区分三种状态：
- `hero`：新会话，composer 垂直居中（`justify-content:center`）
- `active`：已有对话，composer 底部 sticky（`position:sticky;bottom:0`）
- `settling`：过渡状态，composer 隐藏（`visibility:hidden`）

对 composer 内元素的 CSS 定位规则需要注意 phase 差异——hero 状态的居中策略在 active 状态下会失效。

### Portal 菜单与 in-flow 菜单

DSH 有两种菜单渲染路径：
1. **In-flow 菜单**：在触发器父容器内渲染，用 `position:absolute` 定位（如模型选择菜单 `_7KE1Ra_menu`）
2. **Portal 菜单**：用 `React.createPortal` 渲染到 `document.body`，用 `position:fixed` + JS inline `top`/`left` 定位（如 WorkspacePicker）

CSS 定位修复需要分别处理两种路径——in-flow 菜单受父容器 CSS 影响，portal 菜单受 layout viewport 影响。

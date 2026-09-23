# 侧栏左滑无法关闭问题修复总结 (260923-sidebar-swipe-close)

> 日期：2026-09-23
> 影响文件：`lib/client.js`

## 背景

移动端实测反馈：手势右滑可以展开侧边栏，但侧边栏展开后无法通过向左滑动手势收起。

## 根本原因

在 `lib/client.js` 的 `sidebarOpen()` 逻辑中，错误地混入了右侧栏折叠属性校验：
`!f.hasAttribute("data-sidebar-collapsed") && !f.hasAttribute("data-rightbar-collapsed")`。

在移动端或普通聊天页面中，右侧详情栏（details/rightbar）处于未开启状态，AppFrame 永久带有 `data-rightbar-collapsed` 属性，导致 `sidebarOpen()` 无论左侧栏当前处于展开还是收起状态，始终返回 `false`。

- 侧栏关闭时：`d.open` 为 false，右滑触发 `!d.open && right`，可以划开；
- 侧栏展开时：`d.open` 仍为 false，左滑由于 `d.open` 为 false，既不满足展开也不满足关闭条件，导致手势被吞。

## 修复内容

将 `sidebarOpen()` 改为仅以左侧栏自身的折叠属性 `data-sidebar-collapsed` 作为判定依据：

```javascript
function sidebarOpen() {
  var f = document.querySelector("[data-qol-appframe]") || findSidebarFrame();
  if (!f) return false;
  return !f.hasAttribute("data-sidebar-collapsed");
}
```

同时优先使用已标记的 `[data-qol-appframe]`，避免多层 DOM 查询。修复后：
1. 展开态下左滑能够正确识别 `d.open === true` 并触发收起；
2. 修复了切换会话自动折叠侧栏（`switch-collapse`）因同样判定受阻的问题。

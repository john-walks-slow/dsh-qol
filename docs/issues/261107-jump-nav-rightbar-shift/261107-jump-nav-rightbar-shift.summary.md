# 右侧栏展开后消息导航按钮被推左 修复总结 (261107-jump-nav-rightbar-shift)

> 日期：2026-11-07
> 影响文件：`lib/client.js`

## 背景

桌面端打开右侧栏后，右下角「上一条/下一条用户消息」按钮组向左偏移，与宿主「回到底部」按钮错位。

## 根本原因

插件的水平对齐依赖一次实测的固定 `padding-right`。右栏开合只改变布局帧的 `grid-template-columns`（带过渡动画），既不触发 `window.resize`，也不产生 `childList` 变化，缓存内缩不会重算；中间列变窄后宿主按钮已按 CSS 公式左移，插件按钮仍停在旧偏移。

详见 [troubleshoot](261107-jump-nav-rightbar-shift.troubleshoot.md)。

## 修复内容

- 删除 `syncJumpX()`、`_jumpInset` 缓存及创建锚点后的同步调用；
- `.dsh-qol-jump-anchor` 的 `padding-right` 改为宿主 slot 的实时公式
  `max(clearance + 16px, (100% - chat-content-width) / 2)`，随列宽动画与窗口缩放自动更新。

改动最小化，仅涉及 `jump-user-msg` 的水平定位，不触碰滚动/跳转逻辑。

## 验证

- `npm run build` 通过。
- 等价性：原实测值即宿主 slot 的 padding 值，公式镜像后不再存在陈旧缓存。
- 实机验收见 [validation](261107-jump-nav-rightbar-shift.validation.md)。
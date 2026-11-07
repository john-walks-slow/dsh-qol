# 右侧栏展开后消息导航按钮被推左 排查 (261107-jump-nav-rightbar-shift)

> 日期：2026-11-07
> 状态：根因已锁定，修复完成

## 1. 现象

桌面端打开右侧栏（文件/计划等详情面板）后，右下角「上一条/下一条用户消息」连体按钮整体向左移动，与宿主「回到底部」按钮不再右对齐。关闭右侧栏后也不会自行恢复。

## 2. 根因

两个因素叠加：

1. **宿主右栏改变的是网格列宽，不会触发 `resize`。** 布局帧的列宽为
   `${sidebar}px minmax(...) 1fr minmax(0px, ${rightbarMax}px)`，右栏开合通过
   `data-animating` 对 `grid-template-columns` 做过渡动画。中间列（对话区）因此在动画中变窄，但 `window` 没有 resize 事件；插件的 `MutationObserver` 只监听 `childList`，也收不到这种纯样式变化。
2. **水平内缩量被缓存成固定 px。** 旧实现 `syncJumpX()` 实测「锚点右缘 → 宿主按钮右缘」的距离，缓存进 `_jumpInset` 并写成内联 `padding-right`。右栏展开后中间列变窄，宿主按钮的 CSS 内缩表达式会即时变小（甚至退化为 clearance 32px），而缓存值仍是展开前的大内缩。两者差值 = 右栏宽度的一半到整个宽度，按钮组就这样被留在左边。

即：宿主按钮跟随列宽实时移动，插件按钮拿的是旧坐标。

## 3. 修复

`lib/client.js`：删除 `syncJumpX()` 与 `_jumpInset` 缓存，把水平内缩改为与宿主 slot 同一条实时 CSS 公式：

```css
padding-right: max(
  calc(var(--dsh-composer-side-clearance, 16px) + 16px),
  calc((100% - var(--dsh-chat-content-width, 680px)) / 2)
);
```

锚点与宿主按钮的包含块同为对话滚动区内容宽度（`.scrollBody` 内容盒；宿主 slot 是同一宽度下拉伸的 flex 子项），因此公式镜像与原先的实测镜像等价，且随列宽动画逐帧生效。这也是宿主自身 `_toBottomSlot` 的 padding 公式。

## 4. 验证

- `npm run build`（`node --check`）通过。
- 公式等价性：宿主 slot 的 `padding-right` 即实测的「slot 右缘 → 按钮右缘」，而 slot 与锚点右缘同参考；旧实测值正是这条公式的结果。
- 实机行为待用户在 4180 刷新后验收，见 [validation](261107-jump-nav-rightbar-shift.validation.md)。
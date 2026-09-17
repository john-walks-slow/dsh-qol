# Mobile Dropdown Position Issues

> 状态：诊断完成，待用户确认后进入修复阶段
> 日期：2026-09-16
> 影响功能：`popover-recenter`、`ime-viewport`

## 问题描述

移动端两个 dropdown 定位 bug：

1. **Bug 1**：Mobile 上 dropdown 第一项被 Chrome 地址栏遮挡点不到（如新会话、工作区下拉框）。
2. **Bug 2**：非新会话时（输入框在最下方），模型选择 dropdown 弹出位置不对——弹到屏幕中央而非输入框上方。

## 根因

### Bug 2：模型选择 dropdown 弹到屏幕中央

**根因**：`popover-recenter` CSS（`lib/client.js` L233-241）**无条件**将 composer bar 内的 `[role="menu"]` 强制为屏幕居中定位。

```css
/* 当前代码 — 无条件居中 */
html[data-qol-popover-recenter="on"]
  [data-slot="conversation.composer.bar"] [role="menu"] {
  position: fixed !important;
  left: 50% !important;
  top: 50% !important;
  right: auto !important;
  bottom: auto !important;
  transform: translate(-50%, -50%) !important;
  /* ... */
}
```

模型选择菜单（`dsh-client-ui-model-selection`）的原生 CSS 是：
```css
/* _7KE1Ra_menu — 原生定位：在触发器上方弹出 */
position: absolute;
bottom: calc(100% + 8px);
right: 0;
```

模型选择菜单是 **in-flow** 元素（非 portal），渲染在 composer bar 内部，因此被 `popover-recenter` 的选择器捕获。

会话根元素上的 `data-phase` 属性区分两种布局状态（`dsh-client-ui-conversation` CSS）：

| `data-phase` | composer 位置 | CSS 依据 | `top:50%` 效果 |
|---|---|---|---|
| `hero`（新会话） | 屏幕垂直居中 | `.wSkVaW_root[data-phase=hero] .wSkVaW_scrollBody{justify-content:center}` | ✅ 正确——composer 在 50% 处 |
| `active`（已有对话） | 底部 sticky | `.wSkVaW_root[data-phase=active] .wSkVaW_composerSeat{position:sticky;bottom:0}` | ❌ dropdown 弹到屏幕中央，远离底部 composer |

**结论**：`popover-recenter` 设计时只考虑了 hero 状态（composer 居中），没有处理 active 状态（composer 在底部）。**此 bug 由本插件引入。**

### Bug 1：dropdown 第一项在 Chrome 地址栏背后

**根因**：Portal 菜单用 `position: fixed` + `getBoundingClientRect()` 坐标定位，12px 安全余量在移动 Chrome 上不足以避开 URL bar。

DSH 的 Menu primitive（`Ou` 函数，`dsh-client-ui-primitives`）在 `portal: true` 时：

1. 用 `React.createPortal` 将菜单渲染到 `document.body`（脱离 composer bar）
2. 用 `position: fixed`（CSS 类 `_portal_1aoad_44{position:fixed;top:auto;left:auto;z-index:1100}`）
3. 通过 `useLayoutEffect` 计算 inline `style={{left, top}}` 定位

定位逻辑（简化）：
```javascript
const margin = 12; // 安全余量
let top = side === "bottom" ? anchorRect.bottom + 4 : anchorRect.top - menuHeight - 4;
// 垂直方向 clamp
if (menuHeight > 0) {
  top = Math.min(Math.max(top, margin), window.innerHeight - menuHeight - margin);
}
// → 最小 top = 12px
```

在移动 Chrome 上，`position: fixed; top: 12px` 的含义是：从 **layout viewport 顶部**（即页面真正顶部，URL bar 后方）算 12px。URL bar 高度约 56px，因此菜单的 12px–56px 区域（约 44px）被 URL bar 遮挡，第一项不可见也不可点。

受影响的组件（均使用 `portal: true`）：
- **WorkspacePicker**（工作区下拉）：`dsh-client-ui-workspace` L711/L988/L1131
- **转录模式选择** 等：`dsh-client-ui-chat` L7162

`popover-recenter` 的 CSS 选择器只捕获 `[data-slot="conversation.composer.bar"]` **内部**的 `[role="menu"]`，不捕获 body 级的 portal 菜单，因此这些 portal 菜单不受 `popover-recenter` 影响，但也得不到 safe-area 偏移。

> 注：`ime-viewport` 功能已添加 `viewport-fit=cover`，使 `env(safe-area-inset-top)` 在移动 Chrome 上能解析到 URL bar 高度。但目前没有任何 CSS 规则利用这个值来偏移 portal 菜单。

## 现象与根因的关联

| 用户现象 | 根因 |
|---|---|
| 新会话时模型选择 dropdown 位置正常 | hero 状态下 composer 居中，`top:50%` 恰好对齐 |
| 已有对话时模型选择 dropdown 弹到屏幕中央 | active 状态下 composer 在底部，`top:50%` 使 dropdown 弹到屏幕中央 |
| 工作区/新会话下拉框第一项点不到 | portal 菜单 `position:fixed; top:12px` 被 URL bar（~56px）遮挡 |
| 桌面端无此问题 | 桌面端无 URL bar，且 composer 通常不在屏幕底部 |

## 修复路径

### Bug 2 修复：`popover-recenter` 仅在 hero 状态居中

将居中规则的选择器限定到 `[data-phase="hero"]`：

```css
/* 修复后 — 仅 hero 状态居中 */
html[data-qol-popover-recenter="on"]
  [data-phase="hero"] [data-slot="conversation.composer.bar"] [role="menu"],
html[data-qol-popover-recenter="on"]
  [data-phase="hero"] [data-slot="conversation.composer.bar"] [role="dialog"],
/* session.header.actions 的居中规则保持不变（不依赖 phase） */
html[data-qol-popover-recenter="on"]
  [data-slot="conversation.session.header.actions"] ul[aria-label] {
  position: fixed !important;
  left: 50% !important;
  top: 50% !important;
  /* ... */
}
```

active 状态下不施加 `popover-recenter` 的 fixed 居中，让原生 `position:absolute; bottom:calc(100% + 8px); right:0` 生效，dropdown 自然弹到 composer 上方。

**理由**：`popover-recenter` 的初衷是解决手机上 composer 菜单溢出屏幕的问题，但 hero 状态下 composer 居中、屏幕空间充足，居中弹出是合理的；active 状态下 composer 在底部，原生 absolute 定位已能正确弹出到上方，不需要居中覆盖。

**注意事项**：`session.header.actions` 的居中规则与 `data-phase` 无关（header 始终在顶部），不应被限定。但需验证 active 状态下 header actions 菜单是否也需要居中——如果 header 在桌面端用 absolute 定位也能正常显示，则可以统一去掉居中。

### Bug 1 修复：给 portal 菜单加 safe-area 偏移

在 CSS 中为 portal 菜单添加 `env(safe-area-inset-top)` 偏移。两种方案：

**方案 A（推荐）：CSS `margin-top` 偏移**

```css
/* 移动端 portal 菜单 safe-area 偏移 */
@media (pointer: coarse) {
  html[data-qol-ime-viewport="on"] .portal_1aoad_44 {
    margin-top: env(safe-area-inset-top, 0px) !important;
  }
}
```

`position: fixed` 元素的 `margin-top` 会将元素向下推 margin 的量。由于 portal 菜单的 inline `top` 是 JS 计算的，`margin-top` 会在 inline `top` 基础上额外偏移，将菜单推到 URL bar 下方。

**优点**：纯 CSS，不侵入 JS 定位逻辑，利用已有 `ime-viewport` 的 `viewport-fit=cover`。

**方案 B：JS 调整 clamp 余量**

在 `ime-viewport` 的 visualViewport 监听中，将 safe-area-inset-top 值注入 CSS 变量，然后用 CSS 变量替代 portal 菜单的 margin。但这需要知道 URL bar 的动态高度（visualViewport.offsetTop 在 Chrome 上反映 URL bar 可见时的偏移），实现更复杂。

**推荐方案 A**，因为 `env(safe-area-inset-top)` 在 `viewport-fit=cover` 下已由 `ime-viewport` 激活，无需额外 JS 逻辑。

## 置信度

| Bug | 置信度 | 依据 |
|---|---|---|
| Bug 2 | **95%** | 源码级确认：`popover-recenter` CSS 选择器匹配模型选择菜单，`data-phase` 布局差异已从 DSH 源码验证 |
| Bug 1 | **90%** | Menu primitive 定位逻辑（`Ou` 函数）已从 bundle 反编译确认，`margin=12` 和 `position:fixed` 均已验证。移动 Chrome URL bar 遮挡行为为已知浏览器特性 |

## 验收标准

### Bug 2 验收
- [ ] 新会话（hero 状态）下，模型选择 dropdown 仍然居中弹出（保持现有行为）
- [ ] 已有对话（active 状态）下，模型选择 dropdown 弹到 composer 上方（原生 `bottom:calc(100%+8px)` 定位），不弹到屏幕中央
- [ ] 模型选择 dropdown 不溢出屏幕左右边界

### Bug 1 验收
- [ ] 移动 Chrome 上，工作区下拉框第一项可见且可点（不被 URL bar 遮挡）
- [ ] 下拉框顶部与 URL bar 底部之间有合理间距（至少 4px）
- [ ] 桌面端不受影响（margin-top 在 `pointer: coarse` 媒体查询外不生效）

### 回归验收
- [ ] `popover-recenter` 的 backdrop-filter 禁用规则仍正常工作
- [ ] `session.header.actions` 菜单定位不受 Bug 2 修复影响
- [ ] `ime-viewport` 的 safe-area 功能正常

## 关键代码位置

| 位置 | 说明 |
|---|---|
| `lib/client.js` L227-244 | `popover-recenter` CSS（Bug 2 根因） |
| `lib/client.js` L175-180 | `ime-viewport` CSS（safe-area 基础设施） |
| `lib/client.js` L787-810 | `ime-viewport` JS（viewport-fit=cover 注入） |
| DSH `dsh-client-ui-conversation` CSS | `data-phase` 布局规则（hero/active） |
| DSH `dsh-client-ui-model-selection` CSS | `_7KE1Ra_menu{position:absolute;bottom:calc(100%+8px);right:0}` |
| DSH `dsh-client-ui-primitives` `Ou` 函数 | Menu primitive 定位逻辑（portal 模式） |
| DSH `_portal_1aoad_44` CSS | `{position:fixed;top:auto;left:auto;z-index:1100}` |
| DSH `dsh-client-ui-workspace` L711/L988/L1131 | WorkspacePicker `portal:true` |

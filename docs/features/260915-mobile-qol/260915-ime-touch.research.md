# 移动端 Web（手机浏览器 / PWA）输入法适配与触摸反馈最佳实践调研

> 调研日期：2026-09-15 ｜ 状态：2024–2025 主流实践 + 截至 2026-09 的重要新动态
> 场景：运行在手机浏览器的聊天式 Web 应用（类 ChatGPT Web）——底部 textarea 输入框 + 发送按钮，顶部 sidebar 抽屉。
> 用户反馈的四个症状：软键盘弹出布局错乱、输入法候选条遮挡、按钮点击无反馈、点击穿透。

---

## 0. TL;DR 核心结论速览

| 问题 | 一句话结论 |
|---|---|
| 键盘弹出布局错乱 | Android Chrome 108+ 默认只缩 visual viewport（与 iOS 一致），`position: fixed` 底部元素会被键盘盖住；解法是 `interactive-widget=resizes-content` + `100dvh` flex 布局（Android/Chrome/Firefox），iOS 用 `visualViewport` API 兜底 |
| 候选条遮挡 | 候选条高度**已包含**在 `visualViewport.height` 的收缩量里；被遮挡几乎都是因为用了 `position:fixed; bottom:0`（钉在 layout viewport）或**缓存了一次性键盘高度**——必须每次 resize/scroll 重算 |
| 按钮无反馈 | 300ms 点击延迟在"移动优化页面"上早已消失；无反馈多因 iOS Safari 的 `:active` 历史怪癖 + 没做 pressed 态样式。用 `touch-action: manipulation` + `:active` 缩放/变暗 + 自绘涟漪（可选） |
| 点击穿透 | 300ms 时代遗留问题；现代做法是**只用 click**（别再 preventDefault touchend 自制 tap），遮罩层在 click 里关闭 |
| Enter 发送误触（IME） | 守卫必须写 `if (e.isComposing \|\| e.keyCode === 229) return`，因为 Safari 曾先发 `compositionend` 再发确认用 keydown（WebKit bug 165004），单查 `isComposing` 会漏 |
| 输入框被 iOS 放大 | 聚焦元素的 `font-size` 必须 ≥ 16px，没有第二个干净解法 |
| 边缘侧滑抽屉 | touch 手势要 `{passive:false}` 才能 preventDefault；iOS 边缘滑动是系统返回手势（可尝试拦截但别依赖）；Android 10+ 手势导航的系统返回手势**网页无法拦截**，必须给抽屉留按钮入口 |
| 消息列表滚穿 | 列表容器 `overscroll-behavior-y: contain`，防滚动链 + 防下拉刷新 |

---

## 1. 软键盘与视口

### 1.1 基础模型：layout viewport vs visual viewport

移动端有两个视口（MDN [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)、Chrome 官方博客 [Prepare for viewport resize behavior changes](https://developer.chrome.com/blog/viewport-resize-behavior)）：

- **layout viewport（布局视口）**：页面布局用的视口。`position: fixed` 元素、viewport 单位（`vh`/`dvh` 等，经由 ICB——初始包含块）都锚定在它上面。
- **visual viewport（视觉视口）**：屏幕上**实际可见**的区域。捏合缩放、软键盘都会让它变小，而 layout viewport 不变。

软键盘弹出时浏览器有三种行为（Chrome 官方分类）：

1. 只缩 visual viewport（iOS Safari、现代 Chrome Android 默认）→ `fixed` 底部元素被键盘盖住、`100dvh` 不变；
2. 两个都缩（Chrome < 108、Firefox Android < 132 的旧行为）→ 页面整体收缩，`fixed`/`dvh` 跟着变；
3. 都不缩，键盘直接覆盖（无浏览器默认如此，Chrome 可经 VirtualKeyboard API 主动选择）。

### 1.2 浏览器支持矩阵（2024–2026 现状）

| 浏览器 | 键盘弹出默认行为 | 可否控制 | 备注 |
|---|---|---|---|
| Chrome Android 108+ | 只缩 visual viewport | ✅ `interactive-widget`（108+）或 VirtualKeyboard API | 2022-11 改为与 iOS 对齐 |
| Firefox Android | 只缩 visual viewport | ✅ `interactive-widget`（约 132+；bram.us 维护的支持表记 133） | 旧版曾"两个都缩" |
| Safari iOS（含 Chrome/Edge iOS） | 只缩 visual viewport | ❌ 暂不可（见下） | 键盘**从不**缩 layout viewport |
| WebKit（源码） | — | ✅ `interactive-widget` 已实现 | 2026-08 进 WebKit 源码，**尚未随 Safari/STP 发布**（[bram.us 2026-09-11](https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/)） |
| Android WebView | 旧行为（layout viewport 缩放） | — | Chrome 108 的变化**不影响 WebView**（官方博客明确说明） |

关键历史节点（来源：[Chrome 官方博客](https://developer.chrome.com/blog/viewport-resize-behavior)、[HTMHell interactive-widget（Bramus， 2024-12）](https://www.htmhell.dev/adventcalendar/2024/4/)）：

- **Chrome 108（2022-11）**：Android 版键盘弹出不再缩放 layout viewport，只缩 visual viewport；同版本引入 viewport meta 的 `interactive-widget` 键。
- **Firefox ~132（2024-10 前后）**：对齐同样的默认行为并支持 `interactive-widget`。
- **WebKit（2026-08）**：在源码中实现 `interactive-widget`（bug [259770](https://bugs.webkit.org/show_bug.cgi?id=259770)），Safari 27.x 可能搭载——写本文时（2026-09）尚未发布，**不要在生产中假设 iOS 支持**。

### 1.3 `interactive-widget` 详解

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
```

三个值（Chrome 108+ / Firefox Android 132+ 生效；iOS Safari 目前**忽略**该键，行为恒等于 `resizes-visual`）：

| 值 | layout viewport | visual viewport | 效果 |
|---|---|---|---|
| `resizes-visual`（默认） | 不变 | 缩小 | `fixed` 底部元素被键盘盖住；`dvh` 不变；页面可以上下滚动把被盖内容滚出来 |
| `resizes-content` | 缩小 | 缩小 | ICB 缩小 → **`dvh`/`vh`/`svh` 全部跟着变小**，flex/grid 布局自动收缩，输入条自然停在键盘上方（聊天应用最想要的行为） |
| `overlays-content` | 不变 | 不变 | 键盘纯覆盖；配合 VirtualKeyboard API 的 `keyboard-inset-*` env() 自己排版 |

来源：[Chrome 官方博客](https://developer.chrome.com/blog/viewport-resize-behavior)、[HTMHell](https://www.htmhell.dev/adventcalendar/2024/4/)（含三值可视化对比图与 demo：<https://viewport-resize-behavior.netlify.app/>）。

**注意**：`interactive-widget` 不影响 Chrome on iOS（那是 WebKit 内核）和 Android WebView。

### 1.4 `dvh` / `svh` / `lvh` 与键盘的关系

结论（[HTMHell](https://www.htmhell.dev/adventcalendar/2024/4/)、[dev.to: Why CSS dvh ignores the mobile keyboard](https://dev.to/rl0425/why-css-dvh-ignores-the-mobile-keyboard-and-how-to-fix-it-31ao)）：

- viewport 单位的基准是 ICB，ICB 又源自 layout viewport（的 small layout viewport）。**规范把软键盘当作 overlay**，因此：
  - iOS Safari / Chrome Android 108+ 默认（`resizes-visual`）：键盘弹出时 `100dvh`/`100svh`/`100vh` **完全不变**；
  - `dvh` 只对**浏览器工具栏（URL 栏）**的出现/消失做动态调整——这正是它设计的场景，不是键盘；
  - 只有 `interactive-widget=resizes-content` 下 ICB 真的缩放，`dvh` 才会随键盘变小。
- 所以"我用 100dvh 为什么键盘还是盖住输入框"是**预期行为**，不是 bug。

### 1.5 iOS Safari 的键盘行为差异

iOS Safari（以及 iOS 上所有浏览器内核都是 WebKit）：

1. 键盘弹出**从不**缩放 layout viewport，`window.innerHeight` 基本保持不变（旧值），`window` 的 `resize` 事件也不触发；
2. 只缩 visual viewport：`visualViewport.height` 变小，并触发 `visualViewport` 的 `resize` + `scroll` 事件；
3. 为让焦点输入可见，Safari 会把**页面/视口向上推**——`visualViewport.offsetTop` 增大（表现为页面被滚动）；
4. `position: fixed` 元素锚定 layout viewport，因此：初始推挤时可能被顶到键盘上方（看似正常），**但用户再滚动后 fixed 元素会重新落到键盘后面**，且各 iOS 版本表现不一致（[bram.us](https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/)、[SO #48320336](https://stackoverflow.com/questions/48320336/how-to-keep-fixed-html-element-visible-on-bottom-of-screen-when-the-soft-keyboar)）。

**2025–2026 已知 iOS bug**（建议真机回归测试覆盖）：

- **iOS 26**：键盘收起后 `visualViewport.offsetTop` 不复位、`visualViewport.height` 持续小于 `window.innerHeight`，`position: fixed`/sticky 的头尾元素持续错位漂移（[Apple Developer Forums #800125](https://developer.apple.com/forums/thread/800125)、[SO #79753701](https://stackoverflow.com/questions/79753701/ios-26-safari-web-layouts-are-breaking-due-to-fixed-sticky-position-elements-g)）。
- **iOS 17/18 standalone PWA**：首次弹键盘后视口永久缩小（`innerHeight`/`visualViewport.height`/`100dvh` 都变小且不恢复），需杀掉 PWA 才复原（[dev.to 分析](https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d)）。PWA 与浏览器标签页的键盘行为**必须分开测**。

### 1.6 `position: fixed` 在键盘弹出时的表现

| 平台/模式 | fixed 元素锚定 | 键盘弹出后 |
|---|---|---|
| iOS Safari / Chrome Android（`resizes-visual` 默认） | layout viewport | 留在原处被键盘盖住（iOS 初始推挤后、再次滚动后也会盖住） |
| Chrome Android + `interactive-widget=resizes-content` | layout viewport（但它缩放了） | 跟着收缩，保持在键盘上方 ✅ |
| 任何浏览器 + VirtualKeyboard API `overlaysContent()` | layout viewport | 被盖住，需用 `keyboard-inset-*` env() 自己腾位 |

结论：**聊天输入条不要依赖裸 `position: fixed; bottom: 0`**。要么让文档流 + 可缩放的容器高度解决问题（方案 A），要么 JS 显式跟随 visual viewport（方案 B）。

### 1.7 visualViewport API 的正确用法

API 概览（MDN [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)）：

- 属性：`height`、`width`（visual viewport 的 CSS 像素尺寸）、`offsetTop`/`offsetLeft`（visual viewport 相对 layout viewport 的偏移）、`pageTop`/`pageLeft`、`scale`（捏合缩放系数）。
- 事件：`resize`（键盘弹出/收起、缩放、工具栏变化）、`scroll`（visual viewport 滚动——iOS 推页面时触发）、`scrollend`。
- 只有顶层 window 的 visualViewport 有意义；iframe 内的 `visualViewport` 数值等于其 layout viewport（MDN 明确说明）。

**键盘高度的正确计算**（缩放系数为 1 时）：

```js
const vv = window.visualViewport;
// window.innerHeight 在 iOS Safari / Chrome 108+ 默认模式下不随键盘变化（= layout viewport 高度）
const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
```

要点：

- `innerHeight - vv.height` 是"键盘 + Safari 上推量"的近似；iOS 上 `offsetTop > 0` 时要再减掉，否则会把输入条顶过头；
- 捏合缩放时 `vv.height` 也会变小——用 `vv.scale !== 1` 时不更新键盘高度做防御；
- **不要缓存**键盘高度：Android 候选条出现/消失、iOS QuickType 条开关、浮动键盘都会改变高度，`resize`/`scroll` 会再次触发，必须每次重算；
- 事件处理里用 `requestAnimationFrame` 合并（见下方 bram.us 模式），直接同步写 style 在 Android 上会抖动。

**经典"钉在可视视口底部"模式**（来自 [bram.us / Chrome DevRel](https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/)，社区标准做法）：

```js
function pinToVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return; // 老浏览器降级
  let raf = 0;

  function update() {
    raf = 0;
    const composer = document.querySelector('.composer');
    // 视觉视口底边相对 layout viewport 底边的上移量
    const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    composer.style.transform = `translateY(${-offset}px)`;
    // 需要同时钉顶部的元素（如顶部导航）：
    // topBar.style.transform = `translateY(${Math.max(0, vv.offsetTop)}px)`;
  }

  function onChange() { if (!raf) raf = requestAnimationFrame(update); }

  vv.addEventListener('resize', onChange);
  vv.addEventListener('scroll', onChange);
  update();
}
```

已知坑（bram.us 原文自述 + 社区反馈）：iOS 老版本要等滚动结束才更新（有滞后）、Android 模拟器上滚动发抖；所以它是**兜底方案**而不是首选方案。现代更稳的变体是把键盘高度写进 CSS 变量，让布局自己收缩（见 1.8 方案 B）。

### 1.8 聊天输入框钉在底部的最佳实践（决策树）

```
需要输入条始终在键盘上方？
├─ Android（Chrome 108+ / Firefox 132+）
│    → 方案 A：interactive-widget=resizes-content + 100dvh flex 布局（纯 CSS，首选）
├─ iOS Safari（interactive-widget 暂不可用）
│    → 文档流布局 + 不锁死 body 滚动，让 Safari 自动把焦点输入推入可视区
│    → 需要精确钉住时叠加方案 B：visualViewport → CSS 变量
└─ 仅 Chromium 且要完全接管
     → 方案 C：VirtualKeyboard API（overlaysContent + env(keyboard-inset-height)）
```

**方案 A：纯 CSS（Android / Chromium / Firefox Android）**

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover,
               interactive-widget=resizes-content">
```

```css
/* 不用 position: fixed！整页 flex 列 */
html, body { height: 100%; margin: 0; }
.app {
  height: 100vh;      /* 老浏览器兜底 */
  height: 100dvh;     /* 动态视口：URL 栏收展自适应 */
  display: flex;
  flex-direction: column;
  overflow: hidden;   /* 只允许消息列表内部滚动 */
}
.messages {
  flex: 1;
  min-height: 0;              /* flex 子项允许收缩到小于内容 */
  overflow-y: auto;
  overscroll-behavior-y: contain;   /* 防滚动链/下拉刷新，见 §4.3 */
}
.composer {
  /* 普通文档流，随 .app 高度收缩停在键盘上方 */
  padding-bottom: env(safe-area-inset-bottom);
}
```

键盘弹出 → layout viewport（ICB）缩放 → `100dvh` 变小 → `.app` 收缩 → 输入条自动位于键盘上方。**这是 2024+ 聊天应用在 Android 上的标准做法**（[HTMHell](https://www.htmhell.dev/adventcalendar/2024/4/)、[dev.to Sparka 案例](https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a)——后者 2025-08 修订版结论：能 `dvh` 就别上 JS observer）。

**方案 B：iOS 兜底（visualViewport → CSS 变量）**

```js
function syncViewportVars() {
  const vv = window.visualViewport;
  if (!vv) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    if (Math.abs(vv.scale - 1) > 0.01) return; // 捏合缩放时不动
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const root = document.documentElement.style;
    root.setProperty('--kb-height', kb + 'px');
    root.setProperty('--app-height', vv.height + 'px');
    root.setProperty('--vv-offset-top', vv.offsetTop + 'px');
  };
  const onChange = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', onChange);
  vv.addEventListener('scroll', onChange);
  update();
}
```

```css
@supports (height: 100dvh) {
  .app { height: 100dvh; }
}
/* iOS：键盘弹出时改用 JS 提供的可视高度 */
.app { height: var(--app-height, 100dvh); }
/* 或不动容器，只把输入条顶上去（输入条此时不要用 fixed） */
.composer { padding-bottom: var(--kb-height, 0px); }
```

配套 iOS 布局纪律：

- **不要** `body { overflow: hidden }` / `position: fixed` 锁死页面——Safari 需要能滚动文档才能把焦点输入推到键盘上方（[SO #38619762](https://stackoverflow.com/questions/38619762/how-to-prevent-ios-keyboard-from-pushing-the-view-off-screen-with-css-or-js)）；
- 键盘弹出期间允许 `.app` 之外的文档滚动，收起时在 `visualViewport.resize` 里 `window.scrollTo(0, 0)` 复位。

**方案 C：VirtualKeyboard API（仅 Chromium 94+，渐进增强）**

```js
if ('virtualKeyboard' in navigator) {
  navigator.virtualKeyboard.overlaysContent = true; // 键盘改为纯覆盖
  navigator.virtualKeyboard.addEventListener('geometrychange', (e) => {
    const { height } = e.target.boundingRect; // 键盘精确矩形
    document.documentElement.style.setProperty('--kb-height', height + 'px');
  });
}
```

```css
body {
  display: grid;
  height: 100dvh;
  grid-template:
    "messages" 1fr
    "input"    auto
    "keyboard" env(keyboard-inset-height, 0px); /* Chromium 专属 env() */
}
```

（代码来自 [MDN VirtualKeyboard API](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API) 官方聊天示例。）Safari/Firefox 均未实现此 API（WebKit issue [#230225](https://bugs.webkit.org/show_bug.cgi?id=230225)、Gecko issue [#1730568](https://bugzilla.mozilla.org/show_bug.cgi?id=1730568)），且需要 HTTPS 安全上下文——只能当增强，不能当依赖。

### 1.9 输入法候选条遮挡：机理与处理

- **机理**：Android 的 IME 候选条是 IME 窗口的一部分，iOS 的 QuickType/候选条贴在键盘上沿——两者的高度**都已计入** `visualViewport.height` 的收缩量和 VirtualKeyboard 的 `boundingRect`。也就是说：只要你的输入条钉在 visual viewport 底边（方案 A/B/C 任一），候选条就**不会**遮挡。
- 被遮挡的真实原因（按出现频率）：
  1. 输入条 `position: fixed; bottom: 0`——钉在 layout viewport 底，连键盘带候选条一起盖住它；
  2. **缓存了键盘高度**（例如 focus 时算一次）——候选条开/关、中英文切换、语音输入按钮都会改变总高度；
  3. iOS 上没处理 `offsetTop`——Safari 把页面上推后，固定的偏移量不再对应键盘上沿；
  4. iOS 26 的 offsetTop 不复位 bug（见 1.5）。
- **处理**：始终用方案 A（resizes-content 让 ICB 自适应，候选条高度天然计入）或 B/C 每帧重算；`enterkeyhint="send"` 把回车键换成"发送"也能减少候选条交互（见 §2.2）。

---

## 2. 输入体验

### 2.1 iOS Safari 输入框 `< 16px` 自动缩放页面

**结论**：iOS Safari 在聚焦 `font-size` 计算值 **小于 16px** 的输入控件时会自动放大视口（认为文字太小），且失焦后不自动还原。唯一干净解法是**给输入控件 16px 及以上字号**：

```css
/* 聊天输入框：必须 ≥16px，否则 iOS 聚焦时整页被放大 */
.composer textarea {
  font-size: 16px; /* 或更大；Tailwind 的 text-sm(14px) 会踩坑 */
}
```

- 佐证：[CSS-Tricks: 16px or Larger Text Prevents iOS Form Zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)、[Rick Strahl 实测](https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing)、[Defensive CSS](https://defensivecss.dev/tip/input-zoom-safari/)。
- 反模式：`maximum-scale=1` / `user-scalable=no` 虽能抑制缩放，但（a）iOS 10+ 对捏合缩放已忽略该指令却仍带来混乱，（b）禁缩放违反 WCAG 1.4.4（缩放）且 Apple 审核指南明确不建议。**不要用**。
- 若设计稿强制小字号：视觉上用小字，但聚焦态放大到 16px，或仅在 iOS 上 `@supports (-webkit-touch-callout: none)` 覆盖。

### 2.2 textarea 输入属性的最佳组合（聊天场景）

聊天输入框推荐组合（属性均为全局属性，`textarea` 可用）：

```html
<textarea
  id="composer-input"
  rows="1"
  enterkeyhint="send"
  autocapitalize="sentences"
  autocomplete="off"
  autocorrect="on"
  spellcheck="true"
  aria-label="输入消息"
></textarea>
```

逐项说明（来源：MDN [enterkeyhint](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint)、[autocapitalize](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/autocapitalize)、[inputmode](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode)）：

| 属性 | 取值 | 说明 |
|---|---|---|
| `enterkeyhint` | **`send`** | 虚拟键盘回车键显示"发送"标签（取值：`enter`/`done`/`go`/`next`/`previous`/`search`/`send`）。Baseline 2021-11 起广泛可用。聊天场景标配 |
| `autocapitalize` | **`sentences`**（或 `none`） | 默认值各浏览器不一（Chrome/Safari 默认 `sentences`，Firefox 默认 `none`）——**显式写**以统一行为。中文输入时无副作用 |
| `inputmode` | 不写（默认 text） | 聊天保持默认全键盘即可。只有纯数字/邮箱等才需要设置；注意 `inputmode` 会改变整块键盘布局，对中文 IME 场景无益 |
| `autocorrect` | `on`（英文场景） | 非标准属性，Safari 实现最完整；对中文 IME 无影响 |
| `spellcheck` | `true`/`false` | 标准属性；对 CJK 基本无效，英文用户有益；拼写下划线可能干扰 UI，可关 |
| `autocomplete` | `off` | 聊天输入不需要浏览器记忆/自动填充 |
| `wrap` | `soft`（默认） | 提交时不含硬换行，配合 JS 取 `.value` 即可 |

**自适应高度**（2024+ 新特性）：Chrome 123+ 支持 `field-sizing: content`，textarea 可原生按内容增高（[MDN field-sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing)）；Safari/Firefox 尚未支持，需 JS 兜底：

```css
.composer textarea { field-sizing: content; max-height: 40dvh; }
```

```js
// 兜底：输入时自动增高（兼容所有浏览器）
const ta = document.querySelector('#composer-input');
ta.addEventListener('input', () => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + 'px';
}, { passive: true });
```

### 2.3 IME 组合输入：Enter 发送的误触防护（重点）

**问题**：中文/日文用户在 IME 组合（输入拼音、选候选）状态下按 Enter 是"**确认候选**"，不是"发送"。如果只监听 `keydown` 的 `event.key === 'Enter'` 就发送，会把没打完的话发出去。

**事件模型**（[UI Events 规范](https://w3c.github.io/uievents/#events-compositionevents)）：

```
compositionstart → compositionupdate… → keydown(Enter, isComposing:true) → compositionend
```

`KeyboardEvent.isComposing` 表示事件发生在 composition 会话中；IME 接管按键时 `keyCode` 为 **229**（历史约定，源自 Windows `VK_PROCESSKEY`）。

**推荐守卫（标准写法）**：

```js
const input = document.querySelector('#composer-input');

input.addEventListener('keydown', (e) => {
  // isComposing：事件仍处于组合会话中（Chrome/Firefox 遵循规范顺序）
  // keyCode === 229：IME 接管的按键（兜底 Safari 的事件顺序 bug）
  if (e.isComposing || e.keyCode === 229) return;

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();          // 阻止插入换行
    sendMessage(input.value);
    input.value = '';
    input.style.height = 'auto'; // 重置自适应高度
  }
});
```

**为什么要 `keyCode === 229`（Safari 特有的坑）**：

- 规范顺序是 keydown 在前（`isComposing: true`）、`compositionend` 在后；
- 但 Safari 曾把顺序反过来：**先发 `compositionend`，再发确认用的 keydown**（[WebKit bug #165004](https://bugs.webkit.org/show_bug.cgi?id=165004)）。此时 `isComposing` 已经是 `false`，只查 `isComposing` 的守卫失效，"确认候选"的 Enter 被当成"发送"——大量聊天应用（含 Tauri/macOS WebKit 内核应用）都中过招；
- 该 keydown 的 `keyCode` 仍是 229，所以 `isComposing || keyCode === 229` 双保险是社区与 Google 官方指南（[modern-web-guidance: IME-safe enter submit](https://github.com/GoogleChrome/modern-web-guidance/blob/v0.0.186/skills/modern-web-guidance/guides/forms/ime-safe-enter-submit.md)）推荐的写法；
- 自行用 `compositionstart/end` 维护布尔标志**无法**规避此 bug——标志同样会在 keydown 之前被 `compositionend` 置回 false（[azukiazusa.dev 详细分析](https://azukiazusa.dev/blog/ime-enter-submit)）；
- WebKit 已在 bug [#311717](https://bugs.webkit.org/show_bug.cgi?id=311717) 修复事件顺序，但存量 Safari 版本仍广泛存在，**双条件守卫应保留多年**。

**替代思路**：普通表单可用隐式提交（`<form>` + `type="submit"` 按钮，监听 `submit` 事件），浏览器自己处理 IME 语义，无需任何守卫。但 textarea 的 Enter 默认是换行、不触发隐式提交，"Enter 发送 / Shift+Enter 换行"的聊天交互**必须**用 keydown + 守卫自实现（[azukiazusa.dev](https://azukiazusa.dev/blog/ime-enter-submit) 的结论）。

### 2.4 键盘弹出时滚动到底部 / 保持输入框可见

分层处理：

1. **让浏览器先做**：聚焦时浏览器会把焦点元素滚进可视区。前提是文档可滚动（别锁死 body，见 §1.8 方案 B）。
2. **聚焦后主动滚**（键盘动画完成前后再校准一次，iOS 键盘弹出约 250–350ms）：

```js
const list = document.querySelector('.messages');
const ta = document.querySelector('#composer-input');

ta.addEventListener('focusin', () => {
  // 立即一次 + 键盘动画结束后一次
  scrollToBottom();
  setTimeout(scrollToBottom, 350);
});

function scrollToBottom(smooth = false) {
  // 消息列表内部滚底
  list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  // iOS：确保输入框本体可见（block:'nearest' 不会过度滚动）
  ta.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}
```

注意：键盘弹出期间用 `behavior: 'smooth'` 会和键盘/视口动画打架，**用 `instant`**（[MDN scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)）。

3. **键盘高度变化时再校准**（新消息到达、候选条增高等）：挂在 §1.7 的 `visualViewport` `resize`/`scroll` 处理器里调 `scrollToBottom()`。
4. **iOS 收起键盘复位**：`visualViewport` resize 回到全高时 `window.scrollTo(0, 0)`，消除 Safari 上推残留（iOS 26 前后都建议做）。

---

## 3. 触摸反馈

### 3.1 四个 CSS 属性的推荐设置

```css
/* —— 按钮/可点元素基线（放在交互组件上，别全局撒） —— */
.btn {
  /* 1. 去掉系统灰色点按高亮（换成自己的 pressed 态后才去掉！）
        非标准属性，iOS Safari / Chrome Android 生效；初始值 black */
  -webkit-tap-highlight-color: transparent;

  /* 2. 只留 pan + pinch，去掉双击缩放 → 消除点按延迟、:active 即时生效 */
  touch-action: manipulation;

  /* 3. 防止快速双击/长按选中按钮文字（谨慎：只用于控件，别用于正文） */
  user-select: none;

  /* 4. iOS 长按不弹出系统 callout（复制/粘贴浮层）——仅对自定义控件用 */
  -webkit-touch-callout: none;
}
```

来源与注意事项（[MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)、[MDN -webkit-tap-highlight-color](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-tap-highlight-color)、[MDN -webkit-touch-callout](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout)、[MDN user-select](https://developer.mozilla.org/en-US/docs/Web/CSS/user-select)、[web.dev: Add touch to your site](https://web.dev/articles/add-touch-to-your-site)）：

- **只有做了自己的 `:hover`/`:active`/`:focus` 替代样式后才去掉默认高亮**（web.dev 明确警告），否则用户彻底失去反馈——这正是"按钮点击无反馈"的常见成因之一；
- `touch-action: manipulation` = `pan-x pan-y pinch-zoom` 的别名，**保留滚动和捏合缩放的无障碍能力**；不要图省事用 `none`（会禁掉缩放，WCAG 1.4.4 问题，MDN 无障碍小节明确提示）；
- `user-select: none` / `-webkit-touch-callout: none` 只用于按钮、图标等控件；消息正文**必须保留**可选中/可复制；
- 触摸开始后改 `touch-action` 对**当前手势**无效（MDN），要在初始态就写好。

### 3.2 `:active` 与 300ms 延迟：现状

**历史与现状**（[Chrome: 300ms tap delay, gone away](https://developer.chrome.com/blog/300ms-tap-delay-gone-away/)、[WebKit: More Responsive Tapping on iOS](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/)）：

- 300–350ms 延迟的存在理由是等待"双击缩放"判定；
- Chrome 32（2014）起：带 `width=device-width` 的页面不再延迟；`touch-action: manipulation` 同效；iOS 9.3（2016-03）跟进；
- **今天**：任何带标准 viewport meta 的移动页面，click 都是即时的。300ms 延迟**不再是**反馈慢的解释；
- WebKit 的 fast-tap 条件（原文）：viewport 不可缩放（`user-scalable=no` 或 `min=max`）、或 `width=device-width` 且处于初始缩放、或元素带 `touch-action: manipulation`——满足任一即"点击立即派发"。

**`:active` 在 iOS Safari 的怪癖**：

- iOS Safari 历史上**不给** `:active` 应用样式，除非元素（或其祖先）挂了 `touchstart` 监听器（[web.dev](https://web.dev/articles/add-touch-to-your-site)、[SO #3885018](https://stackoverflow.com/questions/3885018/active-pseudo-class-doesnt-work-in-mobile-safari)）；
- 现代版本在满足 fast-tap 条件时 `:active` 触摸即生效；但为兼容存量 iOS，社区惯例仍是加一个空监听（成本≈0）：

```js
// 老版 iOS 兜底：让 :active 生效（可在构建期注入，不必 UA 判断）
document.body.addEventListener('touchstart', () => {}, { passive: true });
```

**手动 pressed 态（touchstart 上加 class 的技巧）**——需要"按下瞬间"反馈（比等待 click 更快）或长按场景时：

```js
// 指针按下立即给 pressed 态；pointerup/pointercancel/scroll 时移除
document.querySelectorAll('.btn').forEach((btn) => {
  btn.addEventListener('pointerdown', () => btn.classList.add('pressed'));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    btn.addEventListener(ev, () => btn.classList.remove('pressed'));
});
```

```css
.btn.pressed, .btn:active { /* 两处共用同一组样式 */
  transform: scale(0.97);
  filter: brightness(0.92);
}
```

**sticky hover**：移动端 `:hover` 在点按后会"粘住"。把 hover 样式圈进精确指针媒体查询：

```css
@media (hover: hover) and (pointer: fine) {
  .btn:hover { background: #296cdb; }
}
```

### 3.3 现代按钮触摸反馈：pressed 态 / 缩放 / 涟漪

**规范参照**：

- **Material Design 3**（[States: Applying states](https://m3.material.io/foundations/interaction/states/applying-states)）：每个交互组件用**状态层（state layer）**——半透明覆盖层表达状态；hover 低强调（约 8% 不透明度）、**pressed 高强调（约 10–12%）+ 涟漪（ripple）**、必要时叠加 elevation 变化。涟漪从触点向外扩散。官方 Web 组件：[material-web.dev/components/ripple](https://material-web.dev/components/ripple/)。
- **iOS HIG**：按下时按钮内容**瞬时变暗（dim/highlight）**，不做涟漪、不做夸张缩放；反馈必须**即时**（< 100ms 内可感知）。参考 [Apple HIG – Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)。
- 两者共同点：**反馈在按下（pointerdown/`:active`）时刻出现，而不是 click 时刻**；动画短促（≈100–150ms）；尊重 `prefers-reduced-motion`。

**推荐实现（无依赖，M3 风格 state layer + 轻缩放）**：

```css
.btn {
  position: relative;
  overflow: hidden;                 /* 裁剪涟漪 */
  isolation: isolate;
  background: #4f6ef7;
  color: #fff;
  min-height: 44px;                 /* 触摸目标，见 §3.5 */
  transition: transform 100ms ease, filter 100ms ease;
  /* …§3.1 的四个属性… */
}
/* M3 式状态层：用伪元素叠一层当前色 */
.btn::before {
  content: '';
  position: absolute; inset: 0;
  background: currentColor;
  opacity: 0;
  transition: opacity 120ms ease;
  pointer-events: none;
}
@media (hover: hover) { .btn:hover::before { opacity: .08; } }
.btn:active::before  { opacity: .12; }              /* pressed 状态层 */
.btn:active          { transform: scale(.97); }     /* 轻缩放 */
.btn:focus-visible   { outline: 2px solid #1c3fdf; outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
  .btn:active { transform: none; }
}
```

**涟漪（可选，自绘，无依赖）**——需要 Material 质感时再加，普通发送按钮用上面的 state layer 就够：

```js
function addRipple(btn) {
  btn.addEventListener('pointerdown', (e) => {
    const r = document.createElement('span');
    r.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    r.style.cssText = `width:${size}px;height:${size}px;`
      + `left:${e.clientX - rect.left - size / 2}px;`
      + `top:${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}
```

```css
.ripple {
  position: absolute; border-radius: 50%;
  background: currentColor; opacity: .18;
  transform: scale(0);
  animation: ripple 450ms ease-out forwards;
  pointer-events: none;
}
@keyframes ripple { to { transform: scale(1); opacity: 0; } }
```

（涟漪原理参考 [CSS-Tricks: Recreate the ripple effect of Material Design buttons](https://css-tricks.com/how-to-recreate-the-ripple-effect-of-material-design-buttons/)；M3 参数见 [m3.material.io](https://m3.material.io/foundations/interaction/states/applying-states)。）

### 3.4 点击穿透（ghost click / click-through）

**机理**：触摸结束后浏览器会**合成** mouse 事件并在 `touchend` 后约 300ms（旧机型）派发 `click`，坐标取触点位置。如果在这窗口期内 UI 发生了变化（遮罩关闭、列表项移除、轮播翻页），迟到的 click 就落在**现在**位于手指下方的元素上——典型症状：关掉弹层后底部按钮"自己按下了"。

**现状**：延迟已死（§3.2），迟到窗口大幅缩小，但**合成 click 仍存在**；穿透问题的现代主因变成了"在 `touchend` 里 `preventDefault()` + 同步改 DOM"与"同一元素同时绑 touchend 和 click 双重触发"。

**修复清单**（由上到下）：

1. **别自制 tap**：不要在 `touchend` 里 `preventDefault()` 后手动触发动作又依赖 click——统一只监听 `click`（现在它没有延迟）或统一只用 Pointer Events（`pointerdown`/`pointerup`，检查 `e.pointerType`）（[MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)、[MDN Touch events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)）；
2. **遮罩/弹层在 `click` 里关闭**（不要在 touchend 里关），关闭瞬间新内容出现在触点下方也不会收到 click——因为 click 的 target 在指针按下时就已确定（浏览器按"按下时命中元素"派发 click，DOM 变更后的新元素不会被迟到 click 命中）；
3. 若必须支持远古设备（仍有 300ms 窗口）：关闭遮罩后铺一个**透明 shield** 400ms 再移除，吞掉迟到的合成 click（[SO: Preventing ghost click](https://stackoverflow.com/questions/20225153/preventing-ghost-click-when-binding-touchstart-and-click)）；
4. `touchstart`/`touchmove` 上 `preventDefault()` 会**连带吞掉合成 mouse 事件**（MDN Touch events 明确记载）——手势识别只 `preventDefault` `touchmove`（首个），保持链接等默认 click 可用；
5. 双绑去重：同一元素同时监听 touch 与 click 时，用 `event.handled` 标志或干脆只留一种事件体系。

### 3.5 触摸目标尺寸：规范现状

| 规范 | 要求 | 级别 |
|---|---|---|
| **WCAG 2.2 SC 2.5.8**（2023-10） | **≥ 24×24 CSS px**；不足时可用**间距豁免**：以目标包围盒中心画 24px 直径圆，不与其他目标（及其圆）相交 | **AA（强制合规线）** |
| WCAG 2.1 SC 2.5.5 | ≥ 44×44 CSS px | AAA |
| Apple HIG | ≥ 44×44 pt | 平台指南 |
| Material Design | ≥ 48×48 dp | 平台指南 |

来源：[W3C Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、[Understanding SC 2.5.5](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)。

要点（W3C 原文细节）：

- 24px 判定与**页面缩放无关**（不能拿"用户可以放大"当理由）；
- 5 个豁免：Spacing / Equivalent（页面其他处有达标等价控件）/ Inline（行内文字链）/ User Agent Control / Essential（地图 pin 等）；
- W3C 自己也建议：**别贴着 24px 下限做**，重要控件往 2.5.5 的 44px 做——与 HIG/Material 的 44/48 对齐。

**实践代码**（视觉小图标 + 44px 命中区，W3C 足够技巧 C42 的变体）：

```css
.icon-btn {
  position: relative;
  width: 24px; height: 24px;      /* 视觉尺寸 */
  /* …§3.1 属性… */
}
.icon-btn::after {                /* 命中区扩到 44px，不占布局空间 */
  content: '';
  position: absolute;
  inset: -10px;                   /* 24 + 2×10 = 44 */
}
/* 相邻小按钮之间保证 24px 圆不相交：至少留出间距 */
.toolbar { display: flex; gap: 12px; }
```

发送按钮建议直接做足 **44×44px** 的实心命中区（视觉可以稍小，padding 撑大）。

---

## 4. 侧滑手势（抽屉）

### 4.1 边缘侧滑抽屉的惯用实现

技术选型：Touch Events 在移动浏览器兼容性最好；Pointer Events（iOS 13+ 全支持）代码更统一。以下给出 Touch Events 版（要点：**`touchmove` 必须 `{passive:false}` 才能 `preventDefault`**，见 §4.2）：

```js
(function drawerGesture() {
  const drawer  = document.querySelector('.drawer');
  const scrim   = document.querySelector('.drawer-scrim');
  const W       = () => drawer.offsetWidth;
  const EDGE    = 24;     // 左缘 24px 内起手视为"开抽屉"手势
  const THRESH  = 0.30;   // 拖过 30% 宽度即开
  let startX = 0, startY = 0, base = 0, tracking = false, horizontal = null, lastX = 0, lastT = 0;

  function setX(x, animate) {          // x: 0(全开) ~ -W(全关)
    drawer.style.transition = animate ? 'transform .2s ease-out' : 'none';
    drawer.style.transform  = `translateX(${x}px)`;
    scrim.style.transition = drawer.style.transition;
    scrim.style.opacity    = String((x + W()) / W() * 0.5);
    scrim.style.pointerEvents = x === 0 ? 'auto' : 'none';
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;                    // 单指
    const t = e.touches[0];
    // 两种入口：左缘起手（抽屉关着），或手指落在抽屉/遮罩上（抽屉开着）
    if (t.clientX <= EDGE || drawer.contains(e.target) || scrim.contains(e.target)) {
      tracking = true; horizontal = null;
      startX = lastX = t.clientX; startY = t.clientY; lastT = performance.now();
      const m = new WebKitCSSMatrix(getComputedStyle(drawer).transform); // 或自己记状态
      base = parseFloat(drawer.dataset.x || -W());
    }
  }, { passive: true });   // touchstart 不需要 preventDefault → 保持 passive，滚动不受拖累

  document.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (horizontal === null) {                              // 首次超过 8px 判定方向
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal) drawer.dataset.x = base;              // 锁定为横向手势
    }
    if (!horizontal) { tracking = false; return; }          // 纵向 → 交还浏览器滚动
    e.preventDefault();                                     // ⚠️ 需要 passive:false
    setX(Math.max(-W(), Math.min(0, base + dx)), false);
    lastX = t.clientX; lastT = performance.now();
  }, { passive: false });  // ⚠️ 关键：Chrome 56+ 对 document 级 touchmove 默认 passive

  document.addEventListener('touchend', (e) => {
    if (!tracking) return; tracking = false;
    drawer.style.pointerEvents = ''; 
    const dx  = e.changedTouches[0].clientX - startX;
    const dt  = Math.max(1, performance.now() - lastT);
    const vx  = (e.changedTouches[0].clientX - lastX) / dt; // px/ms，速度判定
    const cur = base + dx;
    const open = vx > 0.3 || (Math.abs(vx) < 0.15 && cur > -W() * (1 - THRESH));
    setX(open ? 0 : -W(), true);
    drawer.dataset.x = open ? 0 : -W();
    drawer.classList.toggle('open', open);
    document.body.classList.toggle('drawer-open', open);    // 锁背景滚动，见 §4.3
  });
})();
```

实现要点（来源：[MDN Touch events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)、[MDN Multi-touch interaction](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Multi-touch_interaction)、[web.dev add touch](https://web.dev/articles/add-touch-to-your-site)）：

- **方向判定**：首 8px 内比较 |dx|/|dy|，一旦判定为横向手势才 `preventDefault`——否则既抢了纵向滚动又可能出现 §3.4 的合成事件问题；
- **rAF 节流**：touchmove 高频触发，样式写入可包进 `requestAnimationFrame`（web.dev 建议）；
- `touchcancel` 必须处理（来电、手势被系统接管时复位状态）；
- 抽屉本体 `will-change: transform`、`transform: translateX(-100%)` 初始隐藏，避免布局抖动；
- 别忘了 `aria-hidden` 与焦点管理（无障碍），汉堡按钮永远可用（见下）。

### 4.2 与浏览器/系统返回手势的冲突处理

**passive listener 与 preventDefault**（[Chrome: Making touch scrolling fast by default](https://developer.chrome.com/blog/scrolling-intervention)、[MDN addEventListener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)）：

- Chrome 56（2017-01）起，挂在 `window`/`document`/`body` 上的 `touchstart`/`touchmove` **默认按 passive 处理**（Safari 随后跟进）——passive 监听器里 `preventDefault()` **静默无效**（控制台会有 warning）；
- 所以凡是需要 `preventDefault` 的 touchmove，必须显式：

```js
el.addEventListener('touchmove', handler, { passive: false });
```

- 反过来，不需要 preventDefault 的监听（如只读坐标）保持默认 passive，避免拖慢滚动（Lighthouse 的 "passive listeners" 审计项）。

**iOS Safari 屏幕边缘滑动 = 前进/后退**：

- 从屏幕物理边缘起手的横滑是 Safari 的历史导航手势，优先级高于页面；
- 页面内可以用非 passive 的 `touchstart` 在贴边（`clientX < 20` 上下）时 `preventDefault()` 拦截（[Joel Malone 的实测](https://medium.com/@joelmalone/prevent-edge-swipe-gestures-in-your-html-game-but-only-in-safari-fba815a529a2)），但**不同 iOS 版本稳定性参差**，只能当优化项；
- 设计层缓解：把抽屉手势热区从边缘内缩（如 8–24px），给系统手势让出物理边缘带。

**Android 10+ 手势导航 = 系统级返回**：

- 开启手势导航后，从屏幕左/右边缘内滑是**操作系统级返回**，发生在事件到达网页之前，`preventDefault()` 无法拦截；原生 App 有 `setSystemGestureExclusionRects` 可申请排除区，**Web 没有对应 API**（[Android 官方：Ensure compatibility with gesture navigation](https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav)、[Gesture conflicts](https://medium.com/androiddevelopers/gesture-navigation-handling-gesture-conflicts-8ee9c2665c69)——原生侧的官方解法是"hold-and-peek + 斜滑"，Web 只能规避）；
- 务实策略：
  1. **永远提供汉堡按钮**作为打开抽屉的第一入口，侧滑是增强；
  2. 热区避开物理边缘（≥24px），或采用"先按住再横拖"判定（150ms 内不动才锁定为抽屉手势）；
  3. 从**左缘**滑开抽屉与返回手势同侧冲突最大——可以考虑抽屉放在与返回手势相反的一侧，或接受偶发误触发返回。

**Chrome 的水平滑动历史导航（fling navigation，2/3 键导航模式下）**：可用 `overscroll-behavior-x` 关闭，见下节。

### 4.3 `overscroll-behavior` 的使用

（来源：[MDN overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior)、[Chrome: Take control of your scroll](https://developer.chrome.com/blog/overscroll-behavior)。）

取值（x/y 可分轴）：

| 值 | 滚动链（scroll chaining） | 浏览器默认过滚行为（下拉刷新 / 边缘光晕 / 水平滑动导航） |
|---|---|---|
| `auto`（默认） | 到边界后链式滚动祖先 | 正常 |
| `contain` | 不链 | **禁用**原生导航手势（下拉刷新 + 水平滑动导航） |
| `none` | 不链 | 禁用 + 连过滚效果（回弹/辉光）也去掉 |

聊天应用推荐：

```css
/* 1) 消息列表：滚到顶/底不把滚动传给 body、不触发下拉刷新 */
.messages {
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

/* 2) html/body：彻底禁下拉刷新与水平历史滑动导航（Chrome/Firefox 生效） */
html {
  overscroll-behavior-y: none;   /* 按需：聊天应用通常不想要下拉刷新 */
  overscroll-behavior-x: none;   /* 防横向 fling 导航抢抽屉手势 */
}

/* 3) 抽屉打开时锁背景：overflow:hidden 的容器仍视为"在边界上"，
      加 contain 后不会把滚动链到 body —— 模态/抽屉防穿透标准手法（MDN 原文场景） */
body.drawer-open { overflow: hidden; }
body.drawer-open .app { overscroll-behavior: contain; }

/* 4) 抽屉自身内容 */
.drawer { overscroll-behavior-y: contain; }
```

注意事项：

- 只对**滚动容器**生效；`iframe` 不是滚动容器，要设在 iframe 内文档的 `html`/`body` 上（MDN 明确说明）；
- `overflow: hidden` 的容器"恒在边界"，设 `contain`/`none` 即可阻断向祖先的滚动链——这正是**模态弹层防背景滚动**的标准做法（MDN 官方示例就是聊天窗 + 联系人列表双层滚动场景）；
- Safari 桌面版曾有不遵循 `overscroll-behavior-x` 禁用历史导航的 bug（[WebKit bug #240183](https://bugs.webkit.org/show_bug.cgi?id=240183)；实践中设在 `html`/`body` 上生效，设在内部容器上不生效——[SO](https://stackoverflow.com/questions/79843778/overscroll-behavior-does-not-prevent-browser-navigation-on-gesture-for-overscrol)）；iOS Safari 的边缘滑动返回属于系统手势，`overscroll-behavior` **管不了**。

---

## 5. 针对本应用（聊天式 Web + sidebar 抽屉）的落地清单

按优先级排序，可直接照抄：

1. **viewport meta**（一次到位）：
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
   ```
2. **应用骨架**：`100dvh` flex 列 + 消息列表 `overflow-y:auto; overscroll-behavior-y:contain; flex:1; min-height:0` + composer **文档流**在底部（`padding-bottom: env(safe-area-inset-bottom)`），**不用 `position:fixed`**。Android 即刻正确。
3. **iOS 兜底**：接入 §1.8 方案 B 的 `syncViewportVars()`；`.app { height: var(--app-height, 100dvh) }`；键盘收起时 `window.scrollTo(0,0)` 复位。**PWA standalone 模式单独真机测试**（iOS 17/18 有视口永久缩小 bug）。
4. **输入框**：`font-size:16px`（硬性）、`enterkeyhint="send"`、`autocapitalize="sentences"`、`autocomplete="off"`；自适应高度用 `field-sizing: content` + JS 兜底。
5. **Enter 发送**：keydown 守卫 `e.isComposing || e.keyCode === 229`（必抄，防中文 IME 误发）；Shift+Enter 换行。
6. **滚动校准**：focusin → 立即 + 350ms 后 `scrollToBottom()`；`visualViewport` resize → 再校准；一律 `behavior:'instant'`。
7. **发送按钮**：44×44px 命中区；`touch-action: manipulation` + `-webkit-tap-highlight-color: transparent` + `user-select:none` + `-webkit-touch-callout:none`；`:active` + `.pressed`（pointerdown）双通道反馈：state layer 12% + `scale(.97)`，`@media (hover:hover)` 圈住 hover；空 `touchstart` 监听兜底老 iOS。
8. **事件纪律**：只用 `click`（或 Pointer Events）触发动作，不在 `touchend` 里 `preventDefault`；遮罩在 click 里关闭。
9. **抽屉**：§4.1 手势代码 + 汉堡按钮双入口；热区离左缘 ≥24px；`overscroll-behavior-x: none` 关掉 Chrome fling 导航；`touchmove` 全部显式 `{passive:false}`。
10. **测试矩阵**：iOS Safari（标签页 + PWA standalone 两种模式）、Android Chrome（手势导航 + 3 键导航）、中文输入法（拼音候选 + 候选条开关）、iOS 26 设备（fixed 漂移 bug 回归）。

---

## 6. 参考资料汇总

### 官方 / 权威文档

- MDN VisualViewport：<https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport>
- MDN VirtualKeyboard API（含聊天布局官方示例）：<https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API>
- Chrome for Developers — Prepare for viewport resize behavior changes (Chrome 108)：<https://developer.chrome.com/blog/viewport-resize-behavior>
- HTMHell Advent 2024 — Control the Viewport Resize Behavior with interactive-widget（Bramus）：<https://www.htmhell.dev/adventcalendar/2024/4/>
- bram.us — WebKit supports interactive-widget（2026-09 支持状态表）：<https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/>
- bram.us — Prevent content hidden underneath the Virtual Keyboard（pin 代码出处）：<https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/>
- web.dev — The large, small, and dynamic viewport units：<https://web.dev/articles/viewport-units>
- dev.to — Why CSS dvh ignores the mobile keyboard：<https://dev.to/rl0425/why-css-dvh-ignores-the-mobile-keyboard-and-how-to-fix-it-31ao>
- MDN enterkeyhint / autocapitalize / inputmode / field-sizing：<https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint> ｜ <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/autocapitalize> ｜ <https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode> ｜ <https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing>
- UI Events 规范 — Composition Events：<https://w3c.github.io/uievents/#events-compositionevents>
- MDN KeyboardEvent.isComposing：<https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing>
- GoogleChrome modern-web-guidance — IME-safe enter submit：<https://github.com/GoogleChrome/modern-web-guidance/blob/v0.0.186/skills/modern-web-guidance/guides/forms/ime-safe-enter-submit.md>
- WebKit bug 165004（Safari composition 事件顺序）：<https://bugs.webkit.org/show_bug.cgi?id=165004> ／ 修复 #311717：<https://bugs.webkit.org/show_bug.cgi?id=311717>
- MDN touch-action / overscroll-behavior / user-select / -webkit-tap-highlight-color / -webkit-touch-callout：<https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action> ｜ <https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior> ｜ <https://developer.mozilla.org/en-US/docs/Web/CSS/user-select> ｜ <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-tap-highlight-color> ｜ <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout>
- Chrome for Developers — 300ms tap delay, gone away：<https://developer.chrome.com/blog/300ms-tap-delay-gone-away/>
- WebKit Blog — More Responsive Tapping on iOS：<https://webkit.org/blog/5610/more-responsive-tapping-on-ios/>
- Chrome for Developers — Making touch scrolling fast by default（passive 默认）：<https://developer.chrome.com/blog/scrolling-intervention>
- Chrome for Developers — Take control of your scroll（overscroll-behavior）：<https://developer.chrome.com/blog/overscroll-behavior>
- W3C WAI — Understanding SC 2.5.8 Target Size (Minimum)：<https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> ／ SC 2.5.5：<https://www.w3.org/WAI/WCAG21/Understanding/target-size.html>
- Material Design 3 — States（Applying states）：<https://m3.material.io/foundations/interaction/states/applying-states> ／ Material Web Ripple：<https://material-web.dev/components/ripple/>
- Apple HIG — Buttons（44pt）：<https://developer.apple.com/design/human-interface-guidelines/buttons>
- Android Developers — Ensure compatibility with gesture navigation：<https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav> ／ Gesture conflicts：<https://medium.com/androiddevelopers/gesture-navigation-handling-gesture-conflicts-8ee9c2665c69>
- web.dev — Add touch to your site（:active/touchstart、user-select、手势）：<https://web.dev/articles/add-touch-to-your-site>
- MDN Touch Events / Pointer Events / Multi-touch：<https://developer.mozilla.org/en-US/docs/Web/API/Touch_events> ｜ <https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events> ｜ <https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Multi-touch_interaction>

### 高质量实践文章 / 案例

- CSS-Tricks — 16px or Larger Text Prevents iOS Form Zoom：<https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/>
- Rick Strahl — Preventing iOS Textbox Auto Zooming：<https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing>
- Defensive CSS — Input zoom on iOS Safari：<https://defensivecss.dev/tip/input-zoom-safari/>
- azukiazusa.dev — IME Enter 送信で isComposing と keyCode === 229 を併用する理由（IME 深度分析）：<https://azukiazusa.dev/blog/ime-enter-submit>
- Square Engineering — Understanding Composition Browser Events：<https://developer.squareup.com/blog/understanding-composition-browser-events>
- dev.to — Fix mobile keyboard overlap（Sparka 案例，2025-08 修订为 dvh 方案）：<https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a>
- Martijn Hols — How to get the document height in iOS Safari when the OSK is open：<https://martijnhols.nl/blog/how-to-get-document-height-ios-safari-osk>
- dev.to — Fixing the iOS standalone-PWA keyboard bug：<https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d>
- Apple Developer Forums — iOS 26 Safari & WebView visualViewport：<https://developer.apple.com/forums/thread/800125>
- Stack Overflow — fixed 元素在 iOS 键盘上的经典问答：<https://stackoverflow.com/questions/48320336/how-to-keep-fixed-html-element-visible-on-bottom-of-screen-when-the-soft-keyboar> ／ <https://stackoverflow.com/questions/3885018/active-pseudo-class-doesnt-work-in-mobile-safari> ／ <https://stackoverflow.com/questions/20225153/preventing-ghost-click-when-binding-touchstart-and-click>
- Joel Malone — Prevent edge-swipe gestures in Safari：<https://medium.com/@joelmalone/prevent-edge-swipe-gestures-in-your-html-game-but-only-in-safari-fba815a529a2>
- CSS-Tricks — Recreate the ripple effect of Material Design buttons：<https://css-tricks.com/how-to-recreate-the-ripple-effect-of-material-design-buttons/>
- use-dynamic-viewport（dvh+keyboard CSS 变量方案的开源实现）：<https://github.com/rl0425/use-dynamic-viewport>

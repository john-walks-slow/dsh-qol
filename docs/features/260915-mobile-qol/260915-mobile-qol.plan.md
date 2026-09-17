# dsh-mobile-qol 实施计划

> 移动端 QoL（quality of life）插件：向 dsh web GUI 注入 CSS/JS 片段，每个功能可独立开关。
> 调研依据：`260915-ime-touch.research.md`（IME/触摸最佳实践，821 行）、`/tmp/mobile-plugins/analysis.md`（7 个竞品插件深度分析）、dsh 客户端插件契约调研。

## 1. 目标与范围

### 1.1 用户需求
1. **手势滑动展开/关闭 sidebar**（不做跟手，阈值触发即可）
2. **借鉴竞品对设置页（settings dialog）的优秀修改**
3. **输入法适配（最佳实践）**
4. **按钮点击效果适配**

每个功能可独立开启/关闭。

### 1.2 设计原则
- **纯客户端插件**（host 侧空 apply，同 `dsh-web-mobile-fix`）——零 host 代码、零重启风险、配置存 localStorage。
- **属性总闸**：每个功能对应一个 `html[data-qol-<id>]` 属性，CSS 选择器与 JS 事件处理都看它。开关 = 打/摘属性 + 存 localStorage，**即时生效、无需重载**。
- **桌面零影响**：所有移动规则锁在 `@media (max-width: 768px)`（断点对齐竞品共识；宿主 `SIDEBAR_AUTO_COLLAPSE=1024`，768 是"真手机"哲学——平板保留桌面布局）。
- **结构锚优先**：CSS 选择器用 `data-slot` / `data-*` 语义属性与 `:has(> nav)` 结构锚，零哈希类依赖（宿主重建不破）。
- **形状防御**：所有服务取值 `ctx.get(name)` + try/catch，任何缺失不阻断插件加载（竞品白屏教训）。

### 1.3 与 dsh-web-mobile-fix 的关系
本插件是 dsh-web-mobile-fix 设置页/弹窗重锚方案的**超集**（"偷过来"+ 可开关 + 加手势/IME/点击效果）。建议启用本插件后**禁用 dsh-web-mobile-fix**（两者对 `[role=dialog]` 用 `!important` 互相覆盖，加载顺序非确定）。计划文档会注明此约束；auto_human 决定是否在交付时一并从 profile 移除 dsh-web-mobile-fix。

## 2. 架构

### 2.1 文件结构
```
/root/projects/dsh-mobile-qol/
├── package.json              # name/type:module/exports/dsh.client/dsh.bundle.patch
├── cordis.patch.yml          # insert 插件行
├── lib/
│   ├── index.js              # host 半：空 apply（同 dsh-web-mobile-fix）
│   └── client.js             # browser 半：window.__ModuleLoader__.load factory
├── e2e/
│   └── mobile.mjs            # playwright-core + camoufox 移动视口 E2E
├── README.md
└── docs/features/260915-mobile-qol/
    ├── 260915-ime-touch.research.md   # 已有
    ├── 260915-mobile-qol.plan.md      # 本文件
    ├── 260915-mobile-qol.validation.md  # 实施后补
    └── 260915-mobile-qol.summary.md     # 收尾补
```

### 2.2 package.json
```json
{
  "name": "dsh-mobile-qol",
  "version": "0.1.0",
  "description": "Mobile quality-of-life tweaks for the DeepSeek Harness Web UI: sidebar swipe gesture, settings dialog rewrite, IME/keyboard adaptation, and touch feedback — each independently toggleable.",
  "license": "MIT",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-theme"],
      "platform": "web"
    }
  },
  "keywords": ["deepseek-harness","dsh","dsh-plugin","mobile","qol","ime","touch"]
}
```
- `dsh.client.inject` 复刻 `dsh-shortcuts`（已验证 `require("react")` 可解析）。
- 无 `dependencies`（纯客户端、不 import `@deepseek-ai/*`，规避 dev-dsh-plugin 核心坑）。

### 2.3 cordis.patch.yml
```yaml
- insert:
    - id: mobile-qol
      name: 'dsh-mobile-qol'
```

### 2.4 lib/index.js（host 半）
```js
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
export { apply };
```

### 2.5 client.js 骨架
```js
window.__ModuleLoader__.load({
  id: "dsh-mobile-qol",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let React = require("react");
    const inject = ['slots'];

    // ===== 配置 =====
    const STORAGE_KEY = 'dsh-mobile-qol.v1';
    const FEATURES = [ /* 见 §3 */ ];

    function defaults() {
      const o = {};
      for (const f of FEATURES) o[f.id] = f.default;
      return o;
    }
    let config = (() => {
      try { const r = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return { ...defaults(), ...r }; }
      catch { return defaults(); }
    })();
    function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {} }
    function applyAttr(id, on) {
      const h = document.documentElement;
      if (on) h.setAttribute('data-qol-' + id, 'on');
      else h.removeAttribute('data-qol-' + id);
    }

    // ===== CSS 注入（所有功能 CSS 一次性注入，由属性门控） =====
    function installCSS() { /* 一大段 CSS，见 §3 各功能 */ }

    // ===== JS 功能 =====
    function installGesture(ctx) { /* Pointer Events，事件时查属性 */ }
    function installViewport(ctx) { /* meta 修改 + visualViewport iOS 兜底，enable/disable */ }

    // ===== 设置 UI（settings.section slot） =====
    function QolSettingsPanel() { /* React.createElement toggle 行 */ }

    function apply(ctx) {
      installCSS();
      installGesture(ctx);
      installViewport(ctx);
      for (const f of FEATURES) applyAttr(f.id, config[f.id]);

      const slots = ctx.get('slots');
      if (slots && slots.inject) {
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'mobile-qol', order: 35, label: '移动 QoL' },
          () => React.createElement(QolSettingsPanel, null)
        ), 'dsh-mobile-qol: settings section');
      }

      ctx.effect(() => () => { /* dispose: removeEventListener / restore meta */ });
    }

    module.exports = { inject, apply };
    return module.exports;
  }
});
```

### 2.6 配置 UI（settings.section）
- 注册进宿主设置页 `settings.section`（list slot，`order: 35`，紧随快捷键之后），渲染一张卡片，每个功能一行 toggle switch。
- toggle 翻转：`config[id] = !config[id]; persist(); applyAttr(id, config[id]);` —— 即时生效（CSS 看属性、JS 事件看属性、viewport meta 走 enable/disable 函数）。
- React 组件用 `React.createElement`（无 JSX/TS，runner 对 dynamic 不支持 JSX）。
- 样式用 `--dsw-alias-*` 主题 token，开关组件参照宿主 settings 页原生开关视觉（通过 DOM 检查对齐）。

## 3. 功能实现

### 3.1 功能 `sidebar-gesture`（手势开合 sidebar）

**实现**：复刻 xc 的 Pointer Events 版（调研报告 §2.2），方向锁 + 64px 阈值 + 左缘 16px 让位系统返回 + 跳过输入控件/横向滚动区 + modalOpen 守卫。**2026-09-15 用户反馈改为全屏范围**：button 不再跳过（滑动不会误触 click），屏幕任意位置（含侧栏内按钮上）均可触发。事件处理时查 `data-qol-sidebar-gesture` 属性，关闭时不响应。

```js
function installGesture(ctx) {
  const EDGE_IGNORE_PX = 16;      // 左缘让位系统返回手势
  const SWIPE_THRESHOLD_PX = 64;  // 触发阈值
  let drag = null;

  const modalOpen = () => document.querySelector('[aria-modal="true"]') !== null;
  const sidebarOpen = () => {
    const f = document.querySelector('[data-details-collapsed], [class*="_frame"]:has(> [class*="_sidebarCol"])');
    return f !== null && !f.hasAttribute('data-sidebar-collapsed');
  };
  const isHScrollable = (el) => { /* 向上找横向可滚动祖先 */ };
  const shouldSkip = (t) => t instanceof Element && (t.closest('textarea,input,select,[contenteditable]') || isHScrollable(t)); // 全屏范围：button 不跳过（滑动不误触 click）

  const toggle = () => {
    const layout = ctx.get('layout');
    if (layout && typeof layout.toggleSidebar === 'function') layout.toggleSidebar();
    else {
      // 兜底：点宿主自己的 toggle 按钮（webui 路线）
      document.querySelector("[class*='_sidebarCol'] [class*='_toggle']")?.click();
    }
  };

  const onDown = (e) => {
    if (!document.documentElement.hasAttribute('data-qol-sidebar-gesture')) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (!e.isPrimary || modalOpen()) return;
    if (e.clientX < EDGE_IGNORE_PX || shouldSkip(e.target)) return;
    drag = { x0: e.clientX, y0: e.clientY, fired: false, p: e.pointerId, open: sidebarOpen() };
  };
  const onMove = (e) => {
    const d = drag; if (!d || d.p !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }  // 垂直意图交还滚动
    if (d.fired || Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    const right = dx > 0;
    if (!d.open && right) toggle();
    else if (d.open && !right) toggle();
    d.fired = true;
  };
  const clear = (e) => { if (drag && drag.p === e.pointerId) drag = null; };

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', clear, true);
  window.addEventListener('pointercancel', clear, true);
  // dispose 时 remove 四个
}
```
- 全 passive、不 preventDefault（不抢滚动/不拦系统手势）。
- `sidebarOpen()` 兼容 `data-sidebar-collapsed` 与 0.1.5 的 `data-rightbar-collapsed`。
- default: `true`。

### 3.2 功能 `settings-mobile`（设置页全屏重写）

**实现**：合成方案（调研 §1.2）。结构选择器用 webui 的 `:has(> nav)` 锚（精确匹配设置对话框，不误伤确认/选择器）；叠加 xc 的 safe-area padding + 100dvh；叠加 webui 的 `aria-current` + `flex:0 1 auto` 标签塌宽修复（必抄 bug 修复）。

```css
@media (max-width: 768px) {
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) {
    flex-direction: column !important;
    width: 100vw !important; max-width: 100vw !important;
    height: 100vh !important; height: 100dvh !important;
    max-height: 100vh !important; max-height: 100dvh !important;
    border-radius: 0 !important;
  }
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav {
    flex: none !important; flex-direction: column !important;
    width: 100% !important; box-sizing: border-box !important;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 6px !important;
    gap: 8px !important;
  }
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav > div:last-child {
    flex-direction: row !important; flex-wrap: nowrap !important;
    gap: 6px !important; overflow-x: auto !important;
    scrollbar-width: none !important;
  }
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav > div:last-child::-webkit-scrollbar { display: none; }
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav button {
    flex: 0 0 auto !important; height: 36px !important;
    padding: 6px 12px !important; gap: 6px !important; justify-content: center !important;
    white-space: nowrap !important;
  }
  /* 必抄：标签 flex:1/basis:0 会塌成 0 宽，让文字驱动按钮宽度 */
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav button > :last-child {
    flex: 0 1 auto !important; min-width: 0 !important;
  }
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav button[aria-current="true"] {
    background: var(--dsw-specific-sidebar-nav-item-active, #e8ebf1) !important;
  }
  html[data-qol-settings-mobile="on"] [role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav) > nav + div {
    flex: 1 1 0 !important; min-height: 0 !important;
  }
}
```
- default: `true`。

### 3.3 功能 `ime-viewport`（输入法/视口适配）

**实现**：xc 四件套 + iOS visualViewport 兜底（调研 §3 + ime-touch §5）。

**a) viewport meta 修改**（enable/disable 函数，非属性门控）：
```js
let originalViewport = null;
function enableViewport() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  originalViewport = meta.getAttribute('content') || '';
  let c = originalViewport;
  if (!/viewport-fit=/.test(c)) c += ', viewport-fit=cover';
  if (!/interactive-widget=/.test(c)) c += ', interactive-widget=resizes-content';
  meta.setAttribute('content', c);
}
function disableViewport() {
  if (originalViewport !== null) {
    document.querySelector('meta[name="viewport"]')?.setAttribute('content', originalViewport);
    originalViewport = null;
  }
}
```

**b) CSS**（属性门控）：
```css
@media (max-width: 768px) {
  html[data-qol-ime-viewport="on"] { /* 100dvh 双声明 */ }
  html[data-qol-ime-viewport="on"], html[data-qol-ime-viewport="on"] body, html[data-qol-ime-viewport="on"] #root {
    height: 100% !important; height: 100dvh !important;
  }
  /* iOS <16px 聚焦自动放大硬阈值；排除原生控件类型 */
  html[data-qol-ime-viewport="on"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),
  html[data-qol-ime-viewport="on"] textarea,
  html[data-qol-ime-viewport="on"] select,
  html[data-qol-ime-viewport="on"] [contenteditable="true"] {
    font-size: 16px !important;
  }
  /* composer 底部安全区 + 文本高度上限 */
  html[data-qol-ime-viewport="on"] [data-composer-seat] {
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
  }
  html[data-qol-ime-viewport="on"] [data-phase] { --dsh-composer-text-max-height: min(336px, 30dvh); }
}
```

**c) iOS visualViewport 兜底**（iOS 忽略 interactive-widget）：
```js
function installVVFallback() {
  if (!window.visualViewport) return null;
  let raf = 0;
  const sync = () => {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const vv = window.visualViewport;
      document.documentElement.style.setProperty('--app-height', vv.height + 'px');
      document.documentElement.style.setProperty('--kb-offset', vv.offsetTop + 'px');
    });
  };
  vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync); sync();
  return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); document.documentElement.style.removeProperty('--app-height'); document.documentElement.style.removeProperty('--kb-offset'); };
}
```
配套 CSS：`html[data-qol-ime-viewport="on"] #root { height: var(--app-height, 100dvh) !important; }`
- enable 时调 enableViewport() + installVVFallback()；disable 时反操作。属性 toggle 触发 enable/disable 函数。
- default: `true`。

### 3.4 功能 `tap-feedback`（按钮点击效果）

**实现**：触摸四件套 + :active 反馈 + 44px 命中区（调研 §4 + ime-touch §3）。

```css
@media (max-width: 768px) {
  /* 全局基线：杀 300ms 延迟与双击缩放（不伤双指捏合） */
  html[data-qol-tap-feedback="on"], html[data-qol-tap-feedback="on"] body { touch-action: manipulation !important; }

  /* 注入面与触碰面：关系统灰闪，先有自己的 :active 替代 */
  html[data-qol-tap-feedback="on"] button,
  html[data-qol-tap-feedback="on"] [role="button"],
  html[data-qol-tap-feedback="on"] a,
  html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class*="_iconButton"],
  html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class*="_toggle"] {
    -webkit-tap-highlight-color: transparent !important;
  }

  /* 通用按钮 :active 反馈（主题 token，参照 hanui/xc） */
  @media (pointer: coarse) {
    html[data-qol-tap-feedback="on"] button:not(:disabled):active,
    html[data-qol-tap-feedback="on"] [role="button"]:active {
      filter: brightness(1.08) !important;
      transform: scale(0.985) !important;
      transition: filter 80ms, transform 80ms !important;
    }
  }

  /* 44px 最小触摸目标（webui R6；icon-only 按钮 + 会话行） */
  @media (pointer: coarse) {
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class$="_iconButton"],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class*="_iconButton "],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class$="_newSession"],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class*="_newSession "],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class$="_search"],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class*="_search "],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class$="_trigger"],
    html[data-qol-tap-feedback="on"] [data-slot="sidebar"] [class*="_trigger "] {
      min-width: 44px !important; min-height: 44px !important;
    }
    html[data-qol-tap-feedback="on"] [class$="_sessionRow"], html[data-qol-tap-feedback="on"] [class*="_sessionRow "] { min-height: 44px !important; }
    /* composer 仅 icon-only 按钮（send/add），文本按钮保原尺寸 */
    html[data-qol-tap-feedback="on"] [data-composer-seat] button:has(> svg:only-child),
    html[data-qol-tap-feedback="on"] [data-composer-seat] button[class$="_iconButton"],
    html[data-qol-tap-feedback="on"] [data-composer-seat] button[class*="_iconButton "] {
      min-width: 44px !important; min-height: 44px !important;
    }
  }
}
```
- iOS :active 怪癖兜底：在 document 上挂一个空 `touchstart` 监听（{passive:true}），让 :active 在 iOS Safari 即时响应（webkit.org/blog/5610）。
- 尊重 `prefers-reduced-motion: reduce` 时跳过 scale/transition。
- default: `true`。

### 3.5 功能注册表
```js
const FEATURES = [
  { id: 'sidebar-gesture',  label: '侧栏滑动开合', default: true,  kind: 'js' },
  { id: 'settings-mobile',  label: '设置页全屏重写', default: true,  kind: 'css' },
  { id: 'ime-viewport',     label: '输入法/键盘适配', default: true,  kind: 'mixed' },
  { id: 'tap-feedback',     label: '按钮触摸反馈', default: true,  kind: 'css' },
];
```
架构可扩展：后续加 `code-scroll`/`popover-recenter` 只需往 FEATURES 加一条 + CSS 段。

## 4. E2E 测试策略

### 4.1 测试基建
- 用 `playwright-core`（在 `/root/projects/camoufox-mcp/node_modules`）+ camoufox 二进制（`/root/.cache/camoufox/camoufox-bin`），firefox.launch + 移动视口（390×844，hasTouch，iPhone UA）。已验证可启动（~800ms）。
- 认证：`http://127.0.0.1:4175/?token=<TOKEN>`（token 从 /var/log/dsh.log 提取，303 设 cookie）。

### 4.2 测试用例
1. **插件加载**：加载后 `document.documentElement` 有 4 个 `data-qol-*` 属性；`window` 无报错；设置页有"移动 QoL"卡。
2. **设置页重写**：开 settings dialog → 断言 `[role=dialog]:has(>nav)` 是 `100vw × 100dvh`、nav 横滚、tab 标签可见（无 0 宽塌陷）。
3. **手势开合**：dispatch pointerdown/move(右滑 80px)/up → sidebar 从 collapsed → expanded；反向左滑 → collapsed。验证不触发于 modalOpen、表单控件、横向滚动区。
4. **IME/视口**：`meta[name=viewport]` 含 `interactive-widget=resizes-content` + `viewport-fit=cover`；`html/body/#root` height 为 dvh；input font-size ≥ 16px；toggle off 后 meta 还原。
5. **触摸反馈**：`html,body` touch-action:manipulation；按钮 -webkit-tap-highlight-color:transparent；:active 有 filter/transform；icon 按钮 ≥ 44px。
6. **toggle 即时**：在 settings 卡翻转某功能 → 对应 `data-qol-*` 属性立即打/摘；CSS 规则立即生效（元素 getComputedStyle 验证）。
7. **桌面零影响**：1280×800 视口下 `data-qol-*` 属性存在但媒体查询不命中（规则不应用）。
8. **持久化**：刷新页面后 config 从 localStorage 恢复。

### 4.3 验证流程（restart-dsh 安全）
1. 先在**独立端口**验证：`dsh web --port 4199 --no-open`（不影响线上 4175），把 `dsh-mobile-qol` link 进 4199 的 profile，浏览器访问验证插件加载 + 功能。
2. 验证通过后，征求 auto_human 同意，再 link 进线上 profile 并重启 4175 实例。
3. 重启用 setsid 延迟 detach（restart-dsh 技能），避免杀掉自己。

## 5. 验收标准
- [ ] 4 个功能均实现并可独立开关，settings 页有 toggle UI。
- [ ] E2E 全部用例通过（移动视口）。
- [ ] 桌面视口零影响。
- [ ] 插件加载零报错、零阻断。
- [ ] 与 dsh-web-mobile-fix 共存建议已文档化（或按 auto_human 决定移除）。
- [ ] README 含安装/使用/功能说明。

## 6. 风险与缓解
- **`require("react")` 失败**：若 seed 不含 react，退化为纯 DOM 设置面板（不注册 settings.section，改用浮层）。E2E 在独立端口先验。
- **`:has()` 兼容**：camoufox（Firefox 152）支持；老引擎降级（webui 的 findFrame 手动回退兜底思路）。
- **与 dsh-web-mobile-fix CSS 冲突**：`!important` 互覆盖。缓解：文档注明启用本插件 `settings-mobile` 时禁用 dsh-web-mobile-fix，或 auto_human 决定从 profile 移除后者。
- **宿主属性改名**（0.1.5 `data-details-collapsed`→`data-rightbar-collapsed`）：`sidebarOpen()` 双识别。
- **HMR 重载双重挂载**：listener 由 `ctx.effect` disposer 持有，卸载即 remove；meta 修改记录原值可还原。

// dsh-qol — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules at /plugins/dsh-qol/client.js and
// executed through the vendored cordis Loader's lazy-CJS module table
// (window.__ModuleLoader__.load). The factory body is plain CJS with
// require() resolved against the shell's module table.
//
// Quality-of-life tweaks for the DeepSeek Harness Web UI (mobile-first, some
// features desktop-wide). Every feature is independently toggleable from
// Settings → QoL; toggles persist in localStorage (key dsh.qol.v1) and take
// effect instantly via an html[data-qol-<feature>] attribute total-gate that
// CSS rules and JS event handlers both read.
//
// Design rules (see docs/features/260915-mobile-qol/260915-mobile-qol.plan.md):
//   - Pure client plugin (empty host apply).
//   - Attribute total-gate: toggle = set/remove html[data-qol-<id>], instant.
//   - Desktop zero-impact: all mobile rules locked in @media (max-width:768px).
//   - Structure anchors first (data-slot / data-* / :has(> nav)); zero hash-class
//     dependency for the structural rules.
//   - No sizing: this plugin deliberately never changes element sizes/fonts
//     (2026-09-15 user feedback — the compact layout of dsh-web-mobile-fix is
//     the reference; sizing rules like 44px min-targets / 16px input font were
//     removed on request).
//   - Shape-defensive: every service lookup is ctx.get(name) + try/catch; any
//     missing service degrades silently (one console.warn) and never blocks load.
//
// Coexists with dsh-web-mobile-fix (restored 2026-09-15 after user feedback):
// that plugin provides the compact mobile layout (32px session-header buttons,
// hidden model-select text, hidden breadcrumbs, 56px floating drawer,
// tap-outside-to-collapse) plus its settings-dialog CSS; this plugin adds the
// toggleable gesture / IME-viewport / touch-feedback / code-scroll layer on
// top. The settings-mobile rules here overlap mobile-fix's equivalents but are
// visually identical (union is safe).

window.__ModuleLoader__.load({
  id: "dsh-qol",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var ReactDOM = require("react-dom");
    // 'slots' is the runtime service gate (declared below in inject). ctx.get
    // is the optional lookup that bypasses the inject declaration; ctx.slots
    // direct access requires the declaration. We declare it for clarity.
    var inject = ["slots", "workspaces"];

    // ============ 配置 ============
    var STORAGE_KEY = "dsh.qol.v1";
    var MOBILE_QUERY = "(max-width: 768px)";

    // Non-boolean settings (kept in the same localStorage blob as FEATURES).
    // Tab bar display mode: "standard" (open-order tabs, closable) or
    // "recent" (all real sessions auto-ranked by status + recency, no close).
    var MODE_KEY = "active-tabbar-mode";
    var MODES = ["standard", "recent"];

    // Settings panel groups — 4 user-facing themes. Every feature declares its
    // group; the panel renders one collapsible section per group (in this
    // order), so the flat 13-row list stays scannable as features grow.
    var GROUPS = [
      { id: "nav",     label: "导航与切换" },
      { id: "ime",     label: "输入与键盘" },
      { id: "touch",   label: "触摸与反馈" },
      { id: "display", label: "显示与设置页" }
    ];

    // feature registry — kind: 'css' (pure style), 'js' (event listeners),
    // 'mixed' (DOM mutation + listeners), group: GROUPS entry id.
    // Adding a feature = push here (in its group's slot) + give it a CSS
    // block and/or an enable/disable hook.
    var FEATURES = [
      // 导航与切换
      { id: "active-tabbar",   label: "活跃会话 Tab Bar", hint: "页面顶部横向展示会话 Tab，一键直达，防误拉键盘；新会话不占 tab。显示模式：标准（打开顺序，可关闭）/ 最近活跃（按状态与活跃时间自动排序）", default: true, kind: "mixed", group: "nav" },
      { id: "sidebar-gesture", label: "侧栏滑动开合",     hint: "全屏范围右滑展开、左滑收起侧边栏（不跟手，过阈值触发；输入框内除外）", default: true, kind: "js", group: "nav" },
      { id: "sidebar-overlay", label: "侧栏覆盖不挤宽",   hint: "移动端侧栏以浮层展开覆盖内容，不挤压主区域宽度导致重排", default: true, kind: "mixed", group: "nav" },
      { id: "switch-collapse", label: "切换会话收起侧栏", hint: "在侧栏点选会话后自动收起，回到对话（仅窄屏）",            default: true,  kind: "js", group: "nav" },
      { id: "switch-nofocus",  label: "切换会话不拉键盘", hint: "切换后不自动聚焦输入框，避免输入法弹出；点输入框仍可手动聚焦", default: true,  kind: "js", group: "nav" },
      { id: "jump-user-msg",  label: "上一条用户消息按钮", hint: "在右下角“回到底部”按钮上方增加一个按钮，点击滚动到上一条（视口上方最近的一条）用户消息", default: true, kind: "mixed", group: "nav" },
      { id: "workspace-pin",  label: "工作区菜单置顶",     hint: "侧边栏工作区行的 ⋯ 菜单新增「置顶」：支持多个工作区置顶，置顶的工作区固定排在列表最前（顺序云端持久化，刷新不丢），行右侧显示小图钉图标；已置顶的菜单项变「取消置顶」", default: true, kind: "js", group: "nav" },
      // 输入与键盘
      { id: "ime-viewport",     label: "输入法/键盘适配",  hint: "viewport meta + 100dvh + 安全区 + iOS 兜底（不改元素尺寸/字号）", default: true,  kind: "mixed", group: "ime" },
      { id: "composer-permission", label: "隐藏权限选择下拉", hint: "隐藏输入框内的权限（Access mode）下拉触发器，省横向空间；模型选择与上下文用量不受影响", default: true, kind: "css", group: "ime" },
      // 触摸与反馈
      { id: "tap-feedback",     label: "按钮触摸反馈",     hint: "touch-action + 关系统灰闪 + :active 按压反馈（不改元素尺寸）",   default: true,  kind: "css", group: "touch" },
      { id: "no-touch-drag",    label: "禁用触摸长按拖拽", hint: "Android 长按会话行会触发系统拖拽且常使整页输入卡死（需刷新）；触摸时禁用原生拖拽，桌面鼠标拖拽排序不受影响", default: true, kind: "js", group: "touch" },
      // 显示与设置页
      { id: "settings-mobile",  label: "设置页全屏重写",   hint: "设置对话框在窄屏下全屏堆叠、标签横滚、右上角关闭与配置文件按钮",       default: true,  kind: "css", group: "display" },
      { id: "settings-remember-tab", label: "设置页记忆页签", hint: "打开设置时自动恢复上次选中的页签，避免每次重置回 General", default: false, kind: "js", group: "display" },
      { id: "code-scroll",      label: "代码块/表格内滚",   hint: "长代码与表格在容器内横向滚动，正文换行不溢出",           default: true,  kind: "css", group: "display" },
      { id: "perf-state-anim", label: "状态指示动画优化",   hint: "将 SVG opacity 追逐点动画替换为 CSS transform 脉冲，走合成器线程，零主线程开销。rAF 实测 idle FPS 35→55", default: true, kind: "css", group: "display" }
    ];

    // Defensive: a FEATURE whose group id is missing or typo'd still applies
    // its attribute gate but would render nowhere in the settings panel —
    // warn at load so the misconfig is visible early.
    (function () {
      var seen = {};
      for (var i = 0; i < GROUPS.length; i++) seen[GROUPS[i].id] = true;
      for (var j = 0; j < FEATURES.length; j++) {
        if (!seen[FEATURES[j].group]) console.warn("[dsh-qol] FEATURE missing group:", FEATURES[j].id);
      }
    })();

    function defaults() {
      var o = {};
      for (var i = 0; i < FEATURES.length; i++) o[FEATURES[i].id] = FEATURES[i].default;
      o[MODE_KEY] = "standard"; // non-boolean settings: stable shape from day one
      return o;
    }

    function loadConfig() {
      var base = defaults();
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var stored = JSON.parse(raw);
          if (stored && typeof stored === "object") {
            for (var k in base) if (k !== MODE_KEY && k in stored) base[k] = !!stored[k];
            // Non-boolean settings ride in the same JSON blob (validated).
            if (MODES.indexOf(stored[MODE_KEY]) !== -1) base[MODE_KEY] = stored[MODE_KEY];
          }
        }
      } catch (err) { /* ignore corrupt storage */ }
      return base;
    }

    var config = loadConfig();

    function persist() {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
      catch (err) { /* storage may be unavailable; config stays in memory */ }
    }

    // Runtime config-flip notifications. Settings panel mutations (toggle /
    // mode switch) happen out-of-band from every store the tab bar reads, so
    // subscribed components (ActiveSessionsOverlay) re-render on change.
    var _configListeners = [];
    function notifyConfigChange() {
      for (var i = 0; i < _configListeners.length; i++) {
        try { _configListeners[i](); } catch (err) { /* listener's problem */ }
      }
    }

    function attrName(id) { return "data-qol-" + id; }

    function applyAttr(id, on) {
      var h = document.documentElement;
      if (on) h.setAttribute(attrName(id), "on");
      else h.removeAttribute(attrName(id));
    }

    function isOn(id) { return !!config[id]; }

    // Group collapse state — UI-only, separate localStorage key so config
    // merges/backups stay feature-shaped. Absent group = expanded.
    var GROUP_COLLAPSE_KEY = "dsh.qol.groups";
    var collapsedGroups = loadCollapsedGroups();
    function loadCollapsedGroups() {
      try {
        var raw = window.localStorage.getItem(GROUP_COLLAPSE_KEY);
        if (raw) {
          var o = JSON.parse(raw);
          if (o && typeof o === "object" && !Array.isArray(o)) return o;
        }
      } catch (err) { /* ignore corrupt storage */ }
      return {};
    }
    function setGroupCollapsed(id, collapsed) {
      collapsedGroups[id] = collapsed;
      try { window.localStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify(collapsedGroups)); }
      catch (err) { /* storage may be unavailable; state stays in memory */ }
    }

    // ============ Open-tabs tracking (tab management) ============
    // Tracks which sessions are "open" as tabs — only sessions the user has
    // navigated to appear. Stored in localStorage, ordered by recency.
    var OPEN_TABS_KEY = "dsh.qol.opentabs";
    var MAX_TABS = 12;

    function loadOpenTabs() {
      try { return JSON.parse(window.localStorage.getItem(OPEN_TABS_KEY) || "[]"); }
      catch (err) { return []; }
    }
    function saveOpenTabs(tabs) {
      try { window.localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs)); }
      catch (err) { /* storage may be unavailable */ }
    }

    // ============ Shared IME-suppression helpers ============
    // Armed by session-switch actions (sidebar session row, tabbar
    // tab) so the host's post-navigation composer autofocus is blurred before
    // the IME opens. A direct pointerdown on the composer clears it.
    var _suppressUntil = 0;
    var _SUPPRESS_MS = 2500;

    function _armSuppress() {
      // Mobile-only feature: desktop keeps the host's native autofocus.
      if (!window.matchMedia(MOBILE_QUERY).matches) return;
      if (document.documentElement.hasAttribute(attrName("switch-nofocus"))) {
        _suppressUntil = Date.now() + _SUPPRESS_MS;
      }
    }
    function _isSuppressed() { return Date.now() <= _suppressUntil; }
    function _clearSuppress() { _suppressUntil = 0; }

    // ============ CSS ============
    // One style tag injected once; every rule is gated by its feature attribute
    // AND the mobile media query, so toggling is instant and desktop is untouched.
    var CSS = [
      "/* dsh-qol — quality-of-life (per-feature toggles via html[data-qol-*]; mobile rules ≤768px only) */",
      "@media (max-width: 768px) {",
      "",
      "/* ---- settings-mobile: settings dialog full-screen rewrite ----",
      "   Structure anchor :has(> nav) matches the settings dialog only (it has a",
      "   nav tab list), leaving other aria-modal dialogs (confirmations, pickers)",
      "   untouched. 100dvh double-declaration (100% fallback for old engines).",
      "   The tab label flex:0 1 auto fix is a hard bug fix: the stock label is",
      "   flex:1 / flex-basis:0 and collapses to zero width inside a content-sized",
      "   button — let the text drive the button width instead. */",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) {",
      "  position: relative !important;",
      "  flex-direction: column !important;",
      "  width: 100vw !important; max-width: 100vw !important;",
      "  height: 100vh !important; height: 100dvh !important;",
      "  max-height: 100vh !important; max-height: 100dvh !important;",
      "  border-radius: 0 !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav {",
      "  flex: none !important; flex-direction: column !important;",
      "  width: 100% !important; box-sizing: border-box !important;",
      "  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 6px !important;",
      "  gap: 8px !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav > div:first-child {",
      "  padding-right: 140px !important; min-height: 32px !important;",
      "  display: flex !important; align-items: center !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav > div:last-child {",
      "  flex-direction: row !important; flex-wrap: nowrap !important;",
      "  gap: 6px !important; overflow-x: auto !important;",
      "  scrollbar-width: none !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav > div:last-child::-webkit-scrollbar { display: none; }",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav button {",
      "  flex: 0 0 auto !important; height: 36px !important;",
      "  padding: 6px 12px !important; gap: 6px !important;",
      "  justify-content: center !important; white-space: nowrap !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav button > :last-child {",
      "  flex: 0 1 auto !important; min-width: 0 !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav button[aria-current=\"true\"] {",
      "  background: var(--dsw-specific-sidebar-nav-item-active, #e8ebf1) !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav + div {",
      "  flex: 1 1 0 !important; min-height: 0 !important;",
      "}",
      "html[data-qol-settings-mobile=\"on\"] [role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]:has(> nav) > nav + div > div:first-child {",
      "  position: absolute !important;",
      "  top: calc(8px + env(safe-area-inset-top, 0px)) !important;",
      "  right: 12px !important;",
      "  z-index: 20 !important;",
      "  height: 36px !important; min-height: 36px !important;",
      "  padding: 0 !important; margin: 0 !important;",
      "  background: transparent !important; border: none !important;",
      "  display: flex !important; align-items: center !important; gap: 8px !important;",
      "}",
      "",
      "/* ---- ime-viewport: dynamic viewport height + safe area ----",
      "   No font-size forcing (16px input rule removed 2026-09-15 per user",
      "   feedback: elements must not change size; the host's native sizes win). */",
      "html[data-qol-ime-viewport=\"on\"],",
      "html[data-qol-ime-viewport=\"on\"] body,",
      "html[data-qol-ime-viewport=\"on\"] #root { height: 100% !important; height: 100dvh !important; }",
      "html[data-qol-ime-viewport=\"on\"] #root { height: var(--app-height, 100dvh) !important; }",
      "html[data-qol-ime-viewport=\"on\"] [data-composer-seat] { padding-bottom: env(safe-area-inset-bottom, 0px) !important; }",
      "html[data-qol-ime-viewport=\"on\"] [data-phase] { --dsh-composer-text-max-height: min(336px, 30dvh); }",
      "",
      "/* ---- tap-feedback: touch-action + tap-highlight + :active ----",
      "   No 44px minimum-target rules (removed 2026-09-15 per user feedback:",
      "   forcing min sizes grew buttons/rows away from the compact layout the",
      "   user had with dsh-web-mobile-fix). Only non-sizing feedback remains. */",
      "html[data-qol-tap-feedback=\"on\"], html[data-qol-tap-feedback=\"on\"] body { touch-action: manipulation !important; }",
      "html[data-qol-tap-feedback=\"on\"] button,",
      "html[data-qol-tap-feedback=\"on\"] [role=\"button\"],",
      "html[data-qol-tap-feedback=\"on\"] a,",
      "html[data-qol-tap-feedback=\"on\"] [data-slot=\"sidebar\"] [class*=\"_iconButton\"],",
      "html[data-qol-tap-feedback=\"on\"] [data-slot=\"sidebar\"] [class*=\"_toggle\"] {",
      "  -webkit-tap-highlight-color: transparent !important;",
      "}",
      "@media (pointer: coarse) {",
      "  html[data-qol-tap-feedback=\"on\"] button:not(:disabled):active,",
      "  html[data-qol-tap-feedback=\"on\"] [role=\"button\"]:active {",
      "    filter: brightness(1.08) !important; transform: scale(0.985) !important;",
      "    transition: filter 80ms ease, transform 80ms ease !important;",
      "  }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  html[data-qol-tap-feedback=\"on\"] button:not(:disabled):active,",
      "  html[data-qol-tap-feedback=\"on\"] [role=\"button\"]:active { transform: none !important; transition: none !important; }",
      "}",
      "",
      "/* ---- code-scroll: code blocks / tables scroll horizontally, prose wraps ---- */",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] p,",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] li,",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] a,",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] code,",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] code * {",
      "  overflow-wrap: anywhere !important;",
      "  word-break: break-word !important;",
      "}",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] :not(pre) > code {",
      "  display: inline !important;",
      "  box-decoration-break: clone !important;",
      "  -webkit-box-decoration-break: clone !important;",
      "}",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] pre code {",
      "  overflow-wrap: normal !important;",
      "  word-break: normal !important;",
      "}",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] pre { max-width: 100% !important; overflow-x: auto !important; }",
      "html[data-qol-code-scroll=\"on\"] [data-conversation-scroll] table { display: block !important; max-width: 100% !important; overflow-x: auto !important; }",
      "",
      "/* ---- composer-permission: hide the composer's permission-mode dropdown ----",
      "   The access-mode select eats horizontal space on phones. Anchor is",
      "   structural + semantic: a _trigger-suffixed button inside the composer",
      "   card whose aria-label starts with the localized \"Access mode\" text",
      "   (zh/en covered). The model-select and context-meter triggers share the",
      "   _trigger suffix, so the aria prefix is what disambiguates — a locale or",
      "   wording change just makes the rule no-op (fail open, nothing breaks). */",
      "html[data-qol-composer-permission=\"on\"] [data-composer-card] button[class$=\"_trigger\"][aria-label^=\"Access mode\"],",
      "html[data-qol-composer-permission=\"on\"] [data-composer-card] button[class$=\"_trigger\"][aria-label^=\"访问模式\"] {",
      "  display: none !important;",
      "}",
      "",

      "/* ---- perf-state-anim: SVG dot-chase → compositor-friendly pulse ----",
      "   DSH uses 6 SVG <rect> opacity animations per running session for the",
      "   \"chasing dots\" state indicator (_dsh-state-dot-chase). SVG opacity",
      "   animations don't get compositor-layer promotion in most browsers →",
      "   main-thread paint every frame. 5 active sessions = 30 SVG pipeline",
      "   traversals/frame = jank. rAF measurement: 10 animations = FPS 35.6",
      "   vs 55.7 with animations paused (+56%).",
      "",
      "   Fix: freeze SVG cells at mid opacity (visual dot still shows), add a",
      "   single CSS transform pulse on the parent HTML span (compositor-friendly,",
      "   zero main-thread cost). Class hashes are build-specific (43g9j); if DSH",
      "   updates and the hash changes, this rule silently no-ops (fail open). */",
      "html[data-qol-perf-state-anim=\"on\"] [class*=\"_cell_43g9j\"] {",
      "  animation: none !important;",
      "  opacity: 0.35 !important;",
      "}",
      "html[data-qol-perf-state-anim=\"on\"] span:has(> [class*=\"_matrix_43g9j\"]) {",
      "  display: inline-block !important;",
      "  animation: _qol-state-pulse 2.5s infinite ease-in-out !important;",
      "}",
      "@keyframes _qol-state-pulse {",
      "  0%, 100% { transform: scale(0.92); opacity: 0.65; }",
      "  50% { transform: scale(1.08); opacity: 0.9; }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  html[data-qol-perf-state-anim=\"on\"] span:has(> [class*=\"_matrix_43g9j\"]) { animation: none !important; }",
      "  html[data-qol-perf-state-anim=\"on\"] [class*=\"_cell_43g9j\"] { opacity: 0.6 !important; }",
      "}",
      "",
      "/* ---- sidebar-overlay: sidebar as overlay, no content squeeze ----",
      "   DSH grid layout squeezes center column when sidebar opens on mobile.",
      "   JS tags the real app frame with data-qol-appframe (avoids [class*=_frame]",
      "   matching 6+ DSH elements). CSS overrides grid to give center full width",
      "   and makes sidebar an absolute overlay.",
      "",
      "   CRITICAL: when a grid item becomes position:absolute, CSS auto-placement",
      "   shifts remaining items forward — centerCol moves to column 1 (0px) and",
      "   detailsCol moves to column 2 (1fr = full width), causing the details panel",
      "   to cover the screen. Explicit grid-column assignments prevent this shift. */",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe] {",
      "  grid-template-columns: 0 minmax(0, 1fr) 0 !important;",
      "  transition: none !important;",
      "}",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe] > [class*=\"_sidebarCol\"] {",
      "  grid-column: 1 !important;",
      "  position: absolute !important;",
      "  z-index: 900 !important;",
      "  top: 0 !important; left: 0 !important; bottom: 0 !important;",
      "  width: 280px !important; max-width: 85vw !important;",
      "  box-shadow: 2px 0 8px rgba(0,0,0,0.15) !important;",
      "  transition: transform 0.2s ease !important;",
      "}",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe] > [class*=\"_centerCol\"] {",
      "  grid-column: 2 !important;",
      "}",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe] > [class*=\"_detailsCol\"] {",
      "  grid-column: 3 !important;",
      "}",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe][data-sidebar-collapsed] > [class*=\"_sidebarCol\"] {",
      "  transform: translateX(-100%) !important;",
      "}",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe]:not([data-sidebar-collapsed]) > [class*=\"_sidebarCol\"] {",
      "  transform: translateX(0) !important;",
      "}",
      "/* When a modal/dialog is open inside the sidebar, the sidebar's transform",
      "   becomes the containing block for position:fixed descendants (CSS spec),",
      "   trapping the settings dialog inside the 280px sidebar. Removing the",
      "   transform restores the viewport as containing block. The modal (z-index",
      "   1000) covers the sidebar (z-index 900) so it stays hidden.",
      "   Only apply when sidebar is NOT collapsed and modal is inside sidebarCol,",
      "   preventing external modals/plugins from inadvertently breaking collapsed sidebar. */",
      "html[data-qol-sidebar-overlay=\"on\"]:has([class*=\"_sidebarCol\"] [aria-modal=\"true\"]) [data-qol-appframe]:not([data-sidebar-collapsed]) > [class*=\"_sidebarCol\"] {",
      "  transform: none !important;",
      "  transition: none !important;",
      "}",
      "html[data-qol-sidebar-overlay=\"on\"] [data-qol-appframe] > [class*=\"_handle\"] { display: none !important; }",
      "",
      "} /* end @media (max-width: 768px) */",
      "",
      "/* ================= active-tabbar (Responsive & Global) ================= */",
      "/* Tab bar is portaled into .qol-tabbar-host inside the center column,",
      "   so it's in the document flow and pushes content down. No floating. */",
      ".qol-tabbar-host {",
      "  flex: none !important;",
      "  position: relative !important;",
      "  z-index: 10 !important;",
      "  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.08));",
      "  background: var(--dsw-alias-bg-base, transparent);",
      "}",
      "/* Feature off: the host div outlives the overlay's null render until the",
      "   next store tick; hide the empty strip via the attribute gate instantly. */",
      "html:not([data-qol-active-tabbar=\"on\"]) .qol-tabbar-host { display: none !important; }",
      "html[data-qol-active-tabbar=\"on\"] .astb-overlay {",
      "  position: relative !important;",
      "  left: auto !important; right: auto !important; top: auto !important;",
      "  z-index: auto !important;",
      "  pointer-events: auto !important;",
      "  transition: none !important;",
      "  box-sizing: border-box;",
      "  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif;",
      "  font-size: 12px;",
      "  user-select: none;",
      "  padding: 3px 6px 3px 8px;",
      "}",
      "",
      ".astb-bar {",
      "  display: flex !important;",
      "  flex-direction: row !important;",
      "  align-items: center !important;",
      "  gap: 2px;",
      "  width: 100% !important;",
      "  box-sizing: border-box !important;",
      "}",
      "/* Sidebar toggle button (hamburger) in tab bar — replaces floating button */",
      ".astb-sidebar-toggle {",
      "  display: none;",
      "  align-items: center;",
      "  justify-content: center;",
      "  width: 32px;",
      "  height: 28px;",
      "  border: none;",
      "  background: transparent;",
      "  color: var(--dsw-alias-label-secondary, #8b949e);",
      "  cursor: pointer;",
      "  flex: none;",
      "  border-radius: 0;",
      "}",
      ".astb-sidebar-toggle:hover { color: var(--dsw-alias-label-primary, #f0f6fc); }",
      "/* Only show when sidebar-overlay is on (always, regardless of collapsed state) */",
      "html[data-qol-sidebar-overlay=\"on\"] .astb-sidebar-toggle { display: flex; }",
      "",
      ".astb-tabs-container {",
      "  display: flex !important;",
      "  flex-direction: row !important;",
      "  flex-wrap: nowrap !important;",
      "  align-items: center !important;",
      "  gap: 2px !important;",
      "  flex: 1 1 auto !important;",
      "  min-width: 0 !important;",
      "  overflow-x: auto !important;",
      "  overflow-y: hidden !important;",
      "  scrollbar-width: none;",
      "  padding: 0 !important;",
      "}",
      ".astb-tabs-container::-webkit-scrollbar { display: none; }",
      "",
      "/* Modern tab design: clean, no per-tab background or borders */",
      ".astb-tab {",
      "  display: inline-flex !important;",
      "  flex-direction: row !important;",
      "  align-items: center !important;",
      "  flex: 0 0 auto !important;",
      "  min-width: 40px !important;",
      "  max-width: 120px !important;",
      "  gap: 4px !important;",
      "  padding: 4px 8px !important;",
      "  border: none !important;",
      "  border-radius: 8px !important;",
      "  cursor: pointer !important;",
      "  color: var(--dsw-alias-label-secondary, #8b949e) !important;",
      "  background: transparent !important;",
      "  transition: color 0.12s ease, background 0.12s ease !important;",
      "  white-space: nowrap !important;",
      "  font-size: 12px !important;",
      "  font-weight: 500 !important;",
      "  height: 28px !important;",
      "  box-sizing: border-box !important;",
      "  -webkit-tap-highlight-color: transparent !important;",
      "}",
      ".astb-tab:hover {",
      "  color: var(--dsw-alias-label-primary, #f0f6fc) !important;",
      "}",
      ".astb-tab.active {",
      "  color: var(--dsw-alias-label-primary, #f0f6fc) !important;",
      "  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06)) !important;",
      "  font-weight: 600 !important;",
      "}",
      "",
      ".astb-tab-title {",
      "  min-width: 16px !important;",
      "  overflow: hidden !important;",
      "  text-overflow: clip !important;",
      "  white-space: nowrap !important;",
      "  display: inline-block !important;",
      "  flex: 1 1 auto !important;",
      "}",
      "",
      ".astb-indicator-slot {",
      "  width: 6px !important;",
      "  height: 6px !important;",
      "  border-radius: 50% !important;",
      "  flex-shrink: 0 !important;",
      "  display: inline-block !important;",
      "  background: var(--dsw-alias-label-caption, #8b949e) !important;",
      "}",
      ".astb-indicator-slot.running {",
      "  background: #388bfd !important;",
      "  box-shadow: 0 0 8px #388bfd !important;",
      "  animation: astb-pulse 1.2s infinite ease-in-out !important;",
      "}",
      ".astb-indicator-slot.completed {",
      "  background: #2ea043 !important;",
      "  box-shadow: 0 0 6px rgba(46, 160, 67, 0.8) !important;",
      "}",
      "/* Warning yellow — session waits on the user (approval / plan review /",
      "   question). Mirrors the host StateDot warn color. */",
      ".astb-indicator-slot.warning {",
      "  background: var(--dsw-alias-state-warn-primary, #d29922) !important;",
      "  box-shadow: 0 0 6px rgba(210, 153, 34, 0.8) !important;",
      "}",
      "",
      "@keyframes astb-pulse {",
      "  0% { transform: scale(0.9); opacity: 0.7; }",
      "  50% { transform: scale(1.3); opacity: 1; }",
      "  100% { transform: scale(0.9); opacity: 0.7; }",
      "}",
      "",
      ".astb-close-btn {",
      "  display: inline-flex !important;",
      "  align-items: center !important;",
      "  justify-content: center !important;",
      "  width: 13px !important;",
      "  height: 13px !important;",
      "  border-radius: 50% !important;",
      "  font-size: 10px !important;",
      "  color: var(--dsw-alias-label-secondary, #8b949e) !important;",
      "  opacity: 0.5 !important;",
      "  transition: all 0.12s ease !important;",
      "  margin-left: 2px !important;",
      "  flex-shrink: 0 !important;",
      "}",
      ".astb-tab:hover .astb-close-btn { opacity: 0.85 !important; }",
      ".astb-close-btn:hover { opacity: 1 !important; background: rgba(248, 81, 73, 0.25) !important; color: #f85149 !important; }",
      "",
      "/* New-session \"+\" — pinned at the bar's right edge, OUTSIDE the tabs",
      "   scroll container (direct child of .astb-bar; tabs scroll under it). */",
      ".astb-controls {",
      "  display: flex !important;",
      "  flex-direction: row !important;",
      "  align-items: center !important;",
      "  gap: 3px !important;",
      "  flex-shrink: 0 !important;",
      "  align-self: center !important;",
      "  margin-left: 4px !important;",
      "}",
      "",
      ".astb-action-btn {",
      "  display: inline-flex !important;",
      "  align-items: center !important;",
      "  justify-content: center !important;",
      "  width: 22px !important;",
      "  height: 22px !important;",
      "  border-radius: 50% !important;",
      "  background: transparent !important;",
      "  border: none !important;",
      "  color: var(--dsw-alias-label-secondary, #8b949e) !important;",
      "  cursor: pointer !important;",
      "  transition: all 0.15s ease !important;",
      "  font-size: 12px !important;",
      "}",
      ".astb-action-btn:hover {",
      "  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.12)) !important;",
      "  color: var(--dsw-alias-label-primary, #f0f6fc) !important;",
      "}",
      "",
      ".astb-divider {",
      "  width: 1px !important;",
      "  height: 16px !important;",
      "  background: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.15)) !important;",
      "  margin: 0 2px !important;",
      "  flex-shrink: 0 !important;",
      "}",
      "",
      ".astb-badge {",
      "  font-size: 10px !important;",
      "  font-weight: 600 !important;",
      "  padding: 1px 5px !important;",
      "  border-radius: 10px !important;",
      "  background: rgba(56, 139, 253, 0.15);",
      "  color: #58a6ff;",
      "}",
      ".astb-badge.unread {",
      "  background: rgba(46, 160, 67, 0.2) !important;",
      "  color: #3fb950 !important;",
      "}",
      "/* ---- QoL settings: tab bar mode segmented selector ---- */",
      ".dsh-qol-moderow {",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 12px;",
      "  padding: 10px 4px;",
      "  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08));",
      "}",
      ".dsh-qol-mode-btns { display: flex; flex: none; width: 150px; }",
      ".dsh-qol-mode-btn {",
      "  flex: 1 1 0;",
      "  padding: 6px 10px;",
      "  font-size: 12px;",
      "  cursor: pointer;",
      "  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));",
      "  background: transparent;",
      "  color: var(--dsw-alias-label-secondary, #57606a);",
      "  font-weight: 400;",
      "}",
      ".dsh-qol-mode-btn[data-active=\"true\"] {",
      "  border-color: var(--dsw-alias-brand-primary, #4f6ef2);",
      "  background: var(--dsw-alias-brand-primary, #4f6ef2);",
      "  color: #fff;",
      "  font-weight: 600;",
      "}",
      ".dsh-qol-mode-btn[data-mode=\"standard\"] { border-radius: 8px 0 0 8px; }",
      ".dsh-qol-mode-btn[data-mode=\"recent\"] { border-radius: 0 8px 8px 0; }",
      "",
      "/* ---- settings panel group sections (collapsible headers) ---- */",
      ".dsh-qol-group[data-collapsed=\"true\"] > .dsh-qol-row,",
      ".dsh-qol-group[data-collapsed=\"true\"] > .dsh-qol-moderow { display: none !important; }",
      ".dsh-qol-group-header {",
      "  display: flex; align-items: center; gap: 6px;",
      "  padding: 10px 4px 6px;",
      "  cursor: pointer;",
      "  user-select: none;",
      "  -webkit-tap-highlight-color: transparent;",
      "}",
      ".dsh-qol-group-header:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); }",
      ".dsh-qol-group-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4f6ef2); outline-offset: -2px; }",
      ".dsh-qol-group-chevron {",
      "  flex: none; width: 10px;",
      "  font-size: 10px; line-height: 14px;",
      "  color: var(--dsw-alias-label-tertiary, GrayText);",
      "  text-align: center;",
      "}",
      ".dsh-qol-group-label {",
      "  font-size: 12px; font-weight: 600;",
      "  letter-spacing: 0.02em;",
      "  color: var(--dsw-alias-label-secondary, #57606a);",
      "}",
      "",
      "/* ---- jump-user-msg: previous-user-message button above Back-to-bottom ----",
      "   Host structure (CSS Modules): the Back-to-bottom round button lives in a",
      "   zero-height sticky flex slot (.EvIC1a_toBottomSlot, justify-content:",
      "   flex-end, bottom:16px) and pulls itself out of the slot with",
      "   margin-top:-34px. We stack the slot into a column so our injected",
      "   .dsh-qol-jump-user button sits exactly 8px above the host button. The",
      "   host button's own margin-top hack is neutralized (margin-top:0).",
      "   Global (desktop + mobile): Back-to-bottom exists on both. */",
      "html[data-qol-jump-user-msg=\"on\"] [class$=\"_toBottomSlot\"] {",
      "  flex-direction: column !important;",
      "  align-items: flex-end !important;",
      "}",
      "html[data-qol-jump-user-msg=\"on\"] [class$=\"_toBottomSlot\"] > [class$=\"_toBottom\"] {",
      "  margin-top: 0 !important;",
      "}",
      ".dsh-qol-jump-user {",
      "  --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);",
      "  corner-shape: round;",
      "  width: 34px; height: 34px;",
      "  color: var(--dsw-alias-label-primary);",
      "  background: var(--dsw-alias-button-floating-fill);",
      "  box-shadow: var(--dsw-elevation-panel);",
      "  cursor: pointer;",
      "  border: 0; border-radius: 100px;",
      "  justify-content: center; align-items: center;",
      "  display: flex;",
      "  margin-bottom: 8px;",
      "  padding: 0;",
      "}",
      ".dsh-qol-jump-user:hover { background: var(--dsw-alias-button-floating-hover); }",
      "html:not([data-qol-jump-user-msg=\"on\"]) .dsh-qol-jump-user { display: none !important; }"
    ].join("\n");

    function installCSS() {
      // Remove old style tags from previous HMR reloads — without this,
      // stale CSS (e.g. old [class*="_frame"] selectors) persists alongside
      // the new one, causing phantom breakage that looks like the fix didn't work.
      var stale = document.querySelectorAll('style[data-plugin-css="dsh-qol"]');
      for (var i = 0; i < stale.length; i++) stale[i].remove();
      var tag = document.createElement("style");
      tag.setAttribute("data-plugin-css", "dsh-qol");
      tag.textContent = CSS;
      (document.head || document.documentElement).appendChild(tag);
      return tag;
    }

    // ============ sidebar-gesture (JS) ============
    // Pointer Events swipe (xc pattern). Threshold-triggered, no finger-follow.
    // Checks the feature attribute at event time so toggling off instantly stops
    // it without re-adding/removing listeners. All listeners are passive capture
    // on window; they never preventDefault (don't steal scroll or system gestures).
    var EDGE_IGNORE_PX = 16;     // leftmost 16px yields to the OS back gesture
    var SWIPE_THRESHOLD_PX = 64; // minimum horizontal travel to fire a toggle

    function isHScrollable(el) {
      var n = el;
      while (n !== null && n !== document.body) {
        if (n.scrollWidth > n.clientWidth + 2) {
          var ox = getComputedStyle(n).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
        n = n.parentElement;
      }
      return false;
    }

    // Full-screen range: swipes respond anywhere on screen. Buttons are NOT
    // skipped — a moving finger on a button never fires click, so a swipe over
    // the New Session / Settings / toggle buttons is safe and keeps the whole
    // screen responsive. Typing surfaces and horizontally-scrollable ancestors
    // (code blocks, tables, carousels) stay skipped.
    function gestureShouldSkip(target) {
      if (!(target instanceof Element)) return true;
      if (target.closest("textarea, input, select, [contenteditable], [data-dsh-modal], [data-no-gesture]") !== null) return true;
      return isHScrollable(target);
    }

    // The sidebar frame is the grid element carrying data-sidebar-collapsed /
    // data-details-collapsed (0.1.5 renamed the right column to
    // data-rightbar-collapsed; recognize both for forward compatibility).
    function findSidebarFrame() {
      // Prefer the structural anchor (a frame that has a sidebarCol child).
      try {
        var f = document.querySelector("[class*=\"_frame\"]:has(> [class*=\"_sidebarCol\"])");
        if (f) return f;
      } catch (err) { /* :has unsupported — manual fallback below */ }
      var frames = document.querySelectorAll("[class*=\"_frame\"]");
      for (var i = 0; i < frames.length; i++) {
        var kids = frames[i].children;
        for (var j = 0; j < kids.length; j++) {
          var cn = kids[j].className;
          if (typeof cn === "string" && cn.indexOf("_sidebarCol") !== -1) return frames[i];
        }
      }
      return null;
    }

    // sidebarOpen: checks if the left sidebar is currently open.
    // The AppFrame carries `data-sidebar-collapsed` when collapsed;
    // when open, the attribute is removed. Do NOT check rightbar attributes
    // (`data-rightbar-collapsed` belongs to the right details column and is
    // present whenever details are closed).
    function sidebarOpen() {
      var f = document.querySelector("[data-qol-appframe]") || findSidebarFrame();
      if (!f) return false;
      return !f.hasAttribute("data-sidebar-collapsed");
    }

    function modalOpen() {
      return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
    }

    function toggleSidebar(ctx) {
      var layout = null;
      try { layout = ctx.get("layout"); } catch (err) { layout = void 0; }
      if (layout && typeof layout.toggleSidebar === "function") {
        layout.toggleSidebar();
      } else {
        // Fallback (webui route): click the host's own sidebar toggle button so
        // the gesture works even if the layout service is unavailable.
        var btn = null;
        try { btn = document.querySelector("[class*=\"_sidebarCol\"] [class*=\"_toggle\"]"); } catch (err) {}
        if (btn) btn.click();
      }
    }

    function installGesture(ctx) {
      // Touch Events + preventDefault capture (the classic drawer pattern):
      // on real devices the browser claims a touch for scrolling once it passes
      // the touch slop (pointercancel fires, the pointer/touch stream stops) —
      // with passive listeners the 64px threshold is never reached, which is
      // exactly the "works with synthetic dispatchEvent but not on a real
      // phone" trap. preventDefault on the FIRST horizontally-intent touchmove
      // is spec-guaranteed to stop the browser takeover, so the stream keeps
      // flowing until the finger lifts. Vertical intent is never prevented —
      // native scrolling stays untouched.
      var drag = null; // { x0, y0, fired, id, open, captured }

      // Shared move processing. Returns true while the touch must stay
      // captured (preventDefault) so the browser never races us into a scroll
      // takeover before the threshold fires.
      function processMove(d, x, y) {
        var dx = x - d.x0, dy = y - d.y0;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return d.captured;
        if (!d.captured) {
          if (Math.abs(dy) > Math.abs(dx)) { drag = null; return false; } // vertical intent → native scroll
          d.captured = true; // horizontal intent confirmed → claim this touch
        }
        if (!d.fired && Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
          var right = dx > 0;
          if (!d.open && right) toggleSidebar(ctx);
          else if (d.open && !right) toggleSidebar(ctx);
          d.fired = true;
        }
        return true; // keep preventing default until the finger lifts
      }

      var onTouchStart = function (event) {
        if (!document.documentElement.hasAttribute(attrName("sidebar-gesture"))) return;
        if (event.touches.length !== 1) return; // single-finger swipes only
        if (modalOpen()) return;
        var t = event.touches[0];
        if (t.clientX < EDGE_IGNORE_PX) return; // yield left edge to OS back
        if (gestureShouldSkip(event.target)) return;
        drag = { x0: t.clientX, y0: t.clientY, fired: false, id: t.identifier, open: sidebarOpen(), captured: false };
      };
      var onTouchMove = function (event) {
        var d = drag;
        if (d === null || event.defaultPrevented) return;
        var t = event.touches[0];
        if (!t || t.identifier !== d.id) return;
        if (processMove(d, t.clientX, t.clientY)) event.preventDefault();
      };
      var onTouchEnd = function () { drag = null; };

      window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
      window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
      window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
      window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

      return function () {
        window.removeEventListener("touchstart", onTouchStart, { passive: true, capture: true });
        window.removeEventListener("touchmove", onTouchMove, { passive: false, capture: true });
        window.removeEventListener("touchend", onTouchEnd, { passive: true, capture: true });
        window.removeEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
      };
    }

    // ============ no-touch-drag (JS) ============
    // Chrome Android 100+ starts a native HTML5 drag after a long-press on a
    // draggable element. DSH session rows are unconditionally draggable (the
    // desktop drag-reorder feature), so a long-press on a row in the sidebar
    // kicks off a native drag — and Chromium's touch drag sessions
    // frequently never terminate (dragend lost, e.g. when React re-renders
    // the source row mid-drag). While the zombie drag controller is alive it
    // consumes every touch event: the page keeps running but nothing is
    // clickable until reload (see docs/issues/260918-mobile-longpress-freeze).
    //
    // Fix: cancel touch-initiated dragstart before a drag session can exist.
    // preventDefault stops the native drag (spec: the drag never starts);
    // stopPropagation keeps the host's React onDragStart (drag state +
    // document dragover/drop listeners) from arming an orphaned app-level
    // drag. Mouse drags pass through untouched — touches.length is 0 for
    // pointer input, so desktop drag-reorder keeps working.
    function installNoTouchDrag() {
      var touches = 0;
      var syncTouches = function (event) { touches = event.touches.length; };
      var onDragStart = function (event) {
        if (!document.documentElement.hasAttribute(attrName("no-touch-drag"))) return;
        if (touches === 0) return; // pointer/mouse drag — desktop reorder stays
        event.preventDefault();
        event.stopPropagation();
      };
      window.addEventListener("touchstart", syncTouches, { passive: true, capture: true });
      window.addEventListener("touchend", syncTouches, { passive: true, capture: true });
      window.addEventListener("touchcancel", syncTouches, { passive: true, capture: true });
      window.addEventListener("dragstart", onDragStart, true);
      return function () {
        window.removeEventListener("touchstart", syncTouches, { passive: true, capture: true });
        window.removeEventListener("touchend", syncTouches, { passive: true, capture: true });
        window.removeEventListener("touchcancel", syncTouches, { passive: true, capture: true });
        window.removeEventListener("dragstart", onDragStart, true);
      };
    }

    // ============ ime-viewport (mixed: DOM mutation + listeners) ============
    // Extends the viewport meta (viewport-fit=cover makes env(safe-area-inset-*)
    // resolve; interactive-widget=resizes-content lets Android Chrome reflow
    // around the keyboard — Safari ignores it, so the dvh chain + visualViewport
    // CSS-var fallback covers iOS). Stores the original content to restore on
    // disable / unload. Monkey-patch guard prevents double-extension.
    var QOL_VIEWPORT_FLAG = "data-qol-viewport-extended";
    var originalViewport = null;
    var vvCleanup = null;

    function enableViewport() {
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) return;
      if (meta.hasAttribute(QOL_VIEWPORT_FLAG)) return; // already extended
      originalViewport = meta.getAttribute("content") || "";
      var c = originalViewport;
      if (!/viewport-fit=/.test(c)) c += ", viewport-fit=cover";
      if (!/interactive-widget=/.test(c)) c += ", interactive-widget=resizes-content";
      meta.setAttribute("content", c);
      meta.setAttribute(QOL_VIEWPORT_FLAG, "1");

      // iOS Safari ignores interactive-widget; use visualViewport to drive a CSS
      // var the #root height rule above reads. Recompute on resize/scroll.
      var vv = window.visualViewport;
      if (vv && typeof vv.addEventListener === "function") {
        var raf = 0;
        var sync = function () {
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(function () {
            var v = window.visualViewport;
            document.documentElement.style.setProperty("--app-height", v.height + "px");
            document.documentElement.style.setProperty("--kb-offset", v.offsetTop + "px");
          });
        };
        vv.addEventListener("resize", sync);
        vv.addEventListener("scroll", sync);
        sync();
        vvCleanup = function () {
          if (raf) cancelAnimationFrame(raf);
          vv.removeEventListener("resize", sync);
          vv.removeEventListener("scroll", sync);
          document.documentElement.style.removeProperty("--app-height");
          document.documentElement.style.removeProperty("--kb-offset");
        };
      }
    }

    function disableViewport() {
      var meta = document.querySelector('meta[name="viewport"]');
      if (meta && meta.hasAttribute(QOL_VIEWPORT_FLAG)) {
        meta.setAttribute("content", originalViewport !== null ? originalViewport : "");
        meta.removeAttribute(QOL_VIEWPORT_FLAG);
      }
      originalViewport = null;
      if (vvCleanup) { vvCleanup(); vvCleanup = null; }
    }

    function installViewport() {
      if (isOn("ime-viewport")) enableViewport();
      return function () { disableViewport(); };
    }

    // ============ switch-collapse / switch-nofocus (JS) ============
    // On mobile, tapping a session row in the expanded sidebar should (a) close
    // the sidebar so the conversation is visible, and (b) NOT auto-focus the
    // composer (the host does, which pops the IME keyboard). The host's focus
    // is fought only inside a short window armed by the row click; a direct tap
    // on the composer clears the window so the user can still type. The same
    // suppression window is armed by tabbar-tab / archive switches
    // (see _armSuppress callers in installActiveSessions), so every
    // sidebar-or-tabbar session switch keeps the IME closed.
    function installSwitchBehavior(ctx) {
      var isMobile = function () { return window.innerWidth <= 768; };

      // A session row: <div role="treeitem" class="<hash>_sessionRow ...">.
      // Sub-actions (trash/star/pin buttons inside the row) are excluded so a
      // delete doesn't read as a switch.
      function sessionRowOf(target) {
        if (!target || !target.closest) return null;
        var row = target.closest('[role="treeitem"]');
        if (!row) return null;
        var isRow = false;
        var cs = row.classList;
        if (cs) for (var i = 0; i < cs.length; i++) { if (cs[i].indexOf("_sessionRow", cs[i].length - 12) !== -1) { isRow = true; break; } }
        if (!isRow) return null;
        var innerCtl = target.closest('button, [role="button"], a, [contenteditable], input, textarea, select');
        if (innerCtl && innerCtl !== row && row.contains(innerCtl)) return null; // sub-action
        return row;
      }

      var onClick = function (event) {
        if (!isMobile()) return;
        var row = sessionRowOf(event.target);
        if (!row) return;

        _armSuppress();
        if (document.documentElement.hasAttribute(attrName("switch-collapse"))) {
          // Let the host's click handler + navigation settle, then collapse.
          setTimeout(function () { if (sidebarOpen()) toggleSidebar(ctx); }, 180);
        }
      };

      var onFocusIn = function (event) {
        if (!_isSuppressed()) return;
        var t = event.target;
        if (!t || !t.closest) return;
        if (!t.closest("[data-composer-seat]")) return; // only fight the composer
        // Defer the blur to a rAF so the host's synchronous post-focus() code
        // (selection/caret setup) runs against a still-focused element; the IME
        // keyboard opens asynchronously, so this still catches it before show.
        var el = t;
        var raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 0); });
        raf(function () { if (document.activeElement === el && _isSuppressed()) el.blur(); });
      };

      var onPointerDown = function (event) {
        var t = event.target;
        if (t && t.closest && t.closest("[data-composer-seat]")) _clearSuppress();
      };

      window.addEventListener("click", onClick, true);
      window.addEventListener("focusin", onFocusIn, true);
      window.addEventListener("pointerdown", onPointerDown, true);

      return function () {
        window.removeEventListener("click", onClick, true);
        window.removeEventListener("focusin", onFocusIn, true);
        window.removeEventListener("pointerdown", onPointerDown, true);
      };
    }

    // ============ tap-feedback (JS helper: iOS :active fix) ============
    // iOS Safari historically needs an empty touchstart listener on an element
    // for :active to fire promptly (webkit.org/blog/5610). A single passive
    // document-level touchstart satisfies it globally. Removed on unload.
    function installTouchstartFix() {
      var noop = function () {};
      document.addEventListener("touchstart", noop, { passive: true, capture: true });
      return function () { document.removeEventListener("touchstart", noop, { passive: true, capture: true }); };
    }

    // ============ settings-remember-tab ============
    var SETTINGS_TAB_STORAGE_KEY = "dsh.qol.settings-tab";

    function installSettingsRememberTab() {
      var restoreTimer = null;
      var pendingCheck = false;

      function tryRestoreTab(dialog) {
        if (!isOn("settings-remember-tab")) return false;
        var stored = null;
        try {
          var raw = window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
          if (raw) stored = JSON.parse(raw);
        } catch (err) {}
        if (!stored || (!stored.label && typeof stored.index !== "number")) return false;

        var nav = dialog.querySelector("nav");
        if (!nav) return false;
        var buttons = Array.prototype.slice.call(nav.querySelectorAll("button"));
        if (!buttons.length) return false;

        var target = null;
        if (stored.label) {
          for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent.trim() === stored.label) {
              target = buttons[i];
              break;
            }
          }
        }
        if (!target && typeof stored.index === "number" && buttons[stored.index]) {
          target = buttons[stored.index];
        }

        if (target) {
          if (target.getAttribute("aria-current") !== "true") {
            target.click();
          }
          setTimeout(function () {
            try {
              target.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
            } catch (e) {}
          }, 30);
          return true;
        }
        return false;
      }

      function checkDialog() {
        if (!isOn("settings-remember-tab")) return;
        var dialog = document.querySelector('[role="dialog"][aria-modal="true"]:has(> nav)');
        if (!dialog) return;
        if (dialog.getAttribute("data-qol-tab-restored") === "true") return;

        var restored = tryRestoreTab(dialog);
        if (restored) {
          dialog.setAttribute("data-qol-tab-restored", "true");
        }
      }

      var observer = new MutationObserver(function () {
        if (!isOn("settings-remember-tab")) return;
        if (pendingCheck) return;
        pendingCheck = true;
        (window.requestAnimationFrame || function (f) { setTimeout(f, 0); })(function () {
          pendingCheck = false;
          checkDialog();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });

      function onNavClick(e) {
        if (!isOn("settings-remember-tab")) return;
        var btn = e.target && e.target.closest ? e.target.closest('[role="dialog"] > nav button') : null;
        if (!btn) return;
        var nav = btn.closest("nav");
        if (!nav) return;
        var buttons = Array.prototype.slice.call(nav.querySelectorAll("button"));
        var idx = buttons.indexOf(btn);
        var label = btn.textContent.trim();
        try {
          window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, JSON.stringify({ label: label, index: idx }));
        } catch (err) {}
      }

      document.addEventListener("click", onNavClick, true);

      return function () {
        if (restoreTimer) clearTimeout(restoreTimer);
        observer.disconnect();
        document.removeEventListener("click", onNavClick, true);
      };
    }

    // ============ workspace-pin (工作区菜单置顶) ============
    // Adds 置顶 (Pin to top) / 取消置顶 (Unpin) entries to the workspace ROW
    // menu — the ⋯ menu with 重命名/删除工作区 in the sidebar. Pinned
    // workspaces form a pinned section fixed at the top of the sidebar list
    // (multiple allowed, ordered by pin time; the order is persisted
    // host-side via the reorder RPC), and each pinned row shows a small pin
    // icon at its right edge. The pinned set lives in localStorage
    // (dsh.qol.pinned-ws) so the icon state survives reloads.
    // Pure DOM augmentation: the Menu portal is React-rendered, so we inject
    // a native menuitem (reusing the item's own classes for styling) into the
    // open menu and drive the reorder through ctx.get("workspaces"). The
    // row → workspaceId mapping is by title text (rows carry no id attr);
    // duplicate titles resolve to the first match. NOTE: this outer-DOM
    // approach is brittle against future host Menu/row refactors — re-check
    // the class-name heuristics if the host upgrades its primitives.
    function installWorkspacePin(ctx) {
      if (!isOn("workspace-pin")) return function () {};

      var workspaces = null;
      try { workspaces = ctx.get("workspaces"); } catch (err) { workspaces = void 0; }

      var PIN_KEY = "dsh.qol.pinned-ws";
      var pinnedList = readPinned();
      function readPinned() {
        try {
          var v = JSON.parse(localStorage.getItem(PIN_KEY));
          return Array.isArray(v) ? v : [];
        } catch (err) { return []; }
      }
      function savePinned() {
        try { localStorage.setItem(PIN_KEY, JSON.stringify(pinnedList)); } catch (err) {}
      }
      function isPinned(id) { return pinnedList.indexOf(id) !== -1; }

      var lastRow = null; // { el, title } — the row whose ⋯ menu was opened
      var menuObserver = null;
      var iconObserver = null;
      var iconTimer = null;
      var disposed = false;

      // Record the workspace row whose ⋯ button was clicked. Capture phase
      // runs before React's own stopPropagation on the anchor button.
      function onDocClickCapture(e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var btn = t.closest('[class*="projectRow"] [class*="iconButton"]');
        if (!btn) return;
        var row = btn.closest('[class*="projectRow"]');
        if (!row) return;
        var titleEl = row.querySelector('[class*="title"]');
        if (!titleEl) return;
        lastRow = { el: row, title: (titleEl.textContent || "").trim() };
      }

      function getItems() {
        if (!workspaces) return null;
        try {
          var snapshot = workspaces.list.getSnapshot();
          return snapshot && snapshot.items ? snapshot.items : [];
        } catch (err) { return null; }
      }

      function indexOfId(items, id) {
        for (var i = 0; i < items.length; i++) {
          if (items[i] && items[i].workspaceId === id) return i;
        }
        return -1;
      }

      // Row title → { id, pinned }; null when unknown (ungrouped bucket,
      // list not ready yet, or title matches nothing).
      function resolveTarget() {
        if (!lastRow || !lastRow.title) return null;
        var items = getItems();
        if (!items) return null;
        for (var i = 0; i < items.length; i++) {
          if (items[i] && items[i].title === lastRow.title) {
            return { id: items[i].workspaceId, pinned: isPinned(items[i].workspaceId) };
          }
        }
        return null;
      }

      function closeMenu() {
        if (!lastRow || !lastRow.el) return;
        // Only toggle the ⋯ anchor when a menu is actually open — clicking
        // it while no menu is open would RE-OPEN one and leave a stray menu.
        if (!document.querySelector('[role="menu"]')) return;
        var anchor = lastRow.el.querySelector('[class*="iconButton"]');
        if (anchor) { try { anchor.click(); } catch (err) {} }
      }

      function menuHasZh(menu) {
        var items = menu.querySelectorAll('[role="menuitem"]');
        for (var i = 0; i < items.length; i++) {
          if ((items[i].textContent || "").indexOf("重命名") !== -1) return true;
        }
        return false;
      }

      var PIN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>';

      function buildPinItem(menu, protoItem, pinned) {
        var isZh = menuHasZh(menu);
        var label = pinned ? (isZh ? "取消置顶" : "Unpin") : (isZh ? "置顶" : "Pin to top");
        var wrap = document.createElement("div");
        if (protoItem.parentElement) wrap.className = protoItem.parentElement.className;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("role", "menuitem");
        btn.className = protoItem.className;
        btn.setAttribute("data-qol-pin", "1");
        var iconCls = "", labelCls = "";
        var spans = protoItem.querySelectorAll("span");
        for (var i = 0; i < spans.length; i++) {
          var c = spans[i].className || "";
          if (c.indexOf("Icon") !== -1) iconCls = c; else if (!labelCls) labelCls = c;
        }
        btn.innerHTML =
          '<span class="' + iconCls + '">' + PIN_SVG + '</span>' +
          '<span class="' + labelCls + '">' + label + '</span>';
        btn.title = pinned
          ? (isZh ? "取消置顶，移出列表最前区域" : "Unpin this workspace from the top section")
          : (isZh ? "固定到工作区列表最前" : "Pin this workspace to the top of the sidebar list");
        wrap.appendChild(btn);
        return wrap;
      }

      function maybeInject(menu) {
        if (menu.querySelector('[data-qol-pin]')) return;
        var items = menu.querySelectorAll('[role="menuitem"]');
        if (items.length < 2) return;
        var hasRename = false, hasDeleteWorkspace = false;
        for (var i = 0; i < items.length; i++) {
          var t = (items[i].textContent || "").trim();
          if (t.indexOf("Rename") !== -1 || t.indexOf("重命名") !== -1) hasRename = true;
          if (t.indexOf("Delete workspace") !== -1 || t.indexOf("删除工作区") !== -1) hasDeleteWorkspace = true;
        }
        // Workspace ROW menu only — session rows offer Rename/Fork/Archive
        // and carry no delete-workspace entry.
        if (!hasRename || !hasDeleteWorkspace) return;
        var target = resolveTarget();
        if (!target) return;
        var viewport = menu.querySelector('[role="presentation"]') || menu;
        var wrap = buildPinItem(menu, items[0], target.pinned);
        var btn = wrap.firstChild;
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          var t2 = resolveTarget();
          if (!t2) return;
          var order = getItems();
          if (!order) return;
          var p = null;
          if (t2.pinned) {
            // Unpin: drop X from the set, then move it right after the
            // pinned section (head of the unpinned section). With no pins
            // left it goes to the list tail.
            var xi = indexOfId(order, t2.id);
            pinnedList = pinnedList.filter(function (id) { return id !== t2.id; });
            savePinned();
            var lastPinnedId = pinnedList.length ? pinnedList[pinnedList.length - 1] : null;
            var li = lastPinnedId ? indexOfId(order, lastPinnedId) : -1;
            if (li < 0) {
              // No pins left — X was the only pinned workspace and already
              // sits at the head of the list; keep it in place (the host
              // order stays untouched).
            } else if (xi <= li) {
              var nxt = order[li + 1];
              // Host treats a null beforeId as no-op; omit the arg to append.
              p = nxt ? workspaces.insertBefore(t2.id, nxt.workspaceId) : workspaces.insertBefore(t2.id);
            } // else X already sits after the pinned section — order unchanged
          } else {
            // Pin: add X to the set and move it to the end of the pinned
            // section (right before the first unpinned workspace).
            var firstUnpinnedId = null;
            for (var i = 0; i < order.length; i++) {
              if (!isPinned(order[i].workspaceId)) { firstUnpinnedId = order[i].workspaceId; break; }
            }
            if (firstUnpinnedId !== t2.id) {
              // Host treats a null beforeId as no-op; omit the arg to append.
              p = firstUnpinnedId ? workspaces.insertBefore(t2.id, firstUnpinnedId) : workspaces.insertBefore(t2.id);
            }
            pinnedList = pinnedList.filter(function (id) { return id !== t2.id; });
            pinnedList.push(t2.id);
            savePinned();
          }
          if (p && typeof p.catch === "function") p.catch(function (err) { console.warn("[dsh-qol] 工作区置顶操作失败:", err && err.message); });
          syncPinIcons();
          closeMenu();
        });
        viewport.insertBefore(wrap, viewport.firstChild);
      }

      function scanMenus() {
        if (disposed || !isOn("workspace-pin")) return;
        var menus = document.querySelectorAll('[role="menu"]');
        for (var i = 0; i < menus.length; i++) maybeInject(menus[i]);
      }

      // ---- pinned-row pin icon (row right edge) ----
      function syncPinIcons() {
        if (disposed || !isOn("workspace-pin")) return;
        var order = getItems();
        if (!order) return;
        var rows = document.querySelectorAll('[class*="projectRow"]');
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var titleEl = row.querySelector('[class*="title"]');
          if (!titleEl) continue;
          var title = (titleEl.textContent || "").trim();
          var id = null;
          for (var i = 0; i < order.length; i++) {
            if (order[i] && order[i].title === title) { id = order[i].workspaceId; break; }
          }
          if (!id) continue;
          var pinned = isPinned(id);
          var icon = row.querySelector('[data-qol-pin-icon]');
          if (pinned && !icon) {
            var span = document.createElement("span");
            span.className = "dsh-qol-pin-icon";
            span.setAttribute("data-qol-pin-icon", "1");
            span.innerHTML = PIN_SVG;
            row.appendChild(span);
          } else if (!pinned && icon) {
            icon.remove();
          }
        }
      }

      document.addEventListener("click", onDocClickCapture, true);
      menuObserver = new MutationObserver(scanMenus);
      menuObserver.observe(document.body, { childList: true, subtree: true });
      iconObserver = new MutationObserver(function () {
        if (iconTimer) return;
        iconTimer = setTimeout(function () { iconTimer = null; syncPinIcons(); }, 150);
      });
      iconObserver.observe(document.body, { childList: true, subtree: true });
      scanMenus();
      syncPinIcons();

      return function () {
        disposed = true;
        if (iconTimer) clearTimeout(iconTimer);
        document.removeEventListener("click", onDocClickCapture, true);
        if (menuObserver) menuObserver.disconnect();
        if (iconObserver) iconObserver.disconnect();
        var icons = document.querySelectorAll('[data-qol-pin-icon]');
        for (var i = 0; i < icons.length; i++) icons[i].remove();
      };
    }

    // ============ sidebar-overlay (JS: tag app frame + expand button) ============
    // [class*="_frame"] matches 6+ DSH elements; JS finds the real app frame via
    // findSidebarFrame() and tags it with data-qol-appframe so CSS targets safely.
    // Also creates a floating expand button (top-left, lens shape) visible only
    // when the sidebar is collapsed, so users can open the sidebar overlay.
    var _overlayObserver = null;
    var _overlayTagged = null;

    function tagAppFrame() {
      var f = findSidebarFrame();
      if (f === _overlayTagged) return;
      if (_overlayTagged) _overlayTagged.removeAttribute("data-qol-appframe");
      if (f) { f.setAttribute("data-qol-appframe", ""); _overlayTagged = f; }
      else _overlayTagged = null;
    }

    function installSidebarOverlay(ctx) {
      if (!isOn("sidebar-overlay")) return function () {};
      if (!window.matchMedia(MOBILE_QUERY).matches) return function () {};

      tagAppFrame();

      var pending = false;
      _overlayObserver = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        (window.requestAnimationFrame || function (f) { setTimeout(f, 0); })(function () {
          pending = false;
          tagAppFrame();
        });
      });
      _overlayObserver.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["data-sidebar-collapsed"]
      });

      return function () {
        if (_overlayObserver) { _overlayObserver.disconnect(); _overlayObserver = null; }
        if (_overlayTagged) { _overlayTagged.removeAttribute("data-qol-appframe"); _overlayTagged = null; }
      };
    }

    // ============ jump-user-msg (JS: previous-user-message button) ============
    // The host renders a sticky "Back to bottom" round button inside a
    // zero-height sticky slot whenever the chat is scrolled off the bottom
    // (CSS Modules suffix _toBottom / _toBottomSlot; aria-label localized from
    // chat.toBottom). We watch for that button and inject our own round button
    // right before it; the CSS block re-stacks the slot into a column so ours
    // sits 8px above. Clicking ours scrolls to the nearest user message row
    // ([data-chat-flow-kind="user"]) whose top has scrolled past the viewport.
    var _jumpObserver = null;

    function findToBottomBtn() {
      var btns = document.querySelectorAll('button[class$="_toBottom"]');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (/_toBottomSlot$/.test(b.className || "")) continue;
        var aria = b.getAttribute("aria-label") || "";
        // class-suffix contract (CSS Modules) + localized aria fallback
        if (aria.indexOf("底部") !== -1 || /bottom/i.test(aria)) return b;
      }
      return null;
    }

    function syncJumpButton() {
      if (!isOn("jump-user-msg")) return;
      var btn = findToBottomBtn();
      if (!btn) return;
      var slot = btn.parentElement;
      if (!slot || slot.querySelector(".dsh-qol-jump-user")) return;
      var jump = document.createElement("button");
      jump.type = "button";
      jump.className = "dsh-qol-jump-user";
      jump.setAttribute("aria-label", "上一条用户消息");
      jump.title = "上一条用户消息";
      jump.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="5.4" r="2.7" stroke="currentColor" stroke-width="1.4"/><path d="M3.2 13.6c.8-2.8 2.7-4.2 4.8-4.2s4 1.4 4.8 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
      slot.insertBefore(jump, btn);
    }

    // The real chat scroller: normally the [data-conversation-scroll] element
    // itself; in composer-overlay layout the chat's inner scroller does the
    // scrolling. Walk up from the Back-to-bottom button to the nearest
    // scrollable ancestor (its slot is sticky inside the scroller).
    function chatScroller() {
      var btn = findToBottomBtn();
      if (!btn) return document.querySelector("[data-conversation-scroll]");
      var p = btn.parentElement;
      while (p) {
        var style = getComputedStyle(p);
        if (p.scrollHeight > p.clientHeight && style.overflowY !== "visible" && style.overflowY !== "hidden") return p;
        p = p.parentElement;
      }
      return document.querySelector("[data-conversation-scroll]");
    }

    function jumpToPrevUserMsg() {
      var scroller = chatScroller();
      if (!scroller) return;
      var users = scroller.querySelectorAll('[data-chat-flow-kind="user"]');
      if (users.length === 0) return;
      var scRect = scroller.getBoundingClientRect();
      var viewTop = scroller.scrollTop;
      var target = null;
      for (var i = 0; i < users.length; i++) {
        var contentTop = users[i].getBoundingClientRect().top - scRect.top + viewTop;
        if (contentTop < viewTop) target = users[i]; // top scrolled past the viewport
        else break; // rows are in document order
      }
      if (target === null) target = users[0]; // already above the first user message
      var targetTop = target.getBoundingClientRect().top - scRect.top + viewTop;
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var top = Math.max(0, targetTop - 16);
      try {
        scroller.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      } catch (err) {
        scroller.scrollTop = top;
      }
    }

    function onJumpClick(e) {
      if (!isOn("jump-user-msg")) return;
      var el = e.target && e.target.closest ? e.target.closest(".dsh-qol-jump-user") : null;
      if (el) { e.preventDefault(); jumpToPrevUserMsg(); }
    }

    function removeJumpButtons() {
      var jumps = document.querySelectorAll(".dsh-qol-jump-user");
      for (var i = 0; i < jumps.length; i++) jumps[i].remove();
    }

    function installJumpUserMsg() {
      if (!isOn("jump-user-msg")) return function () {};
      syncJumpButton();
      var pending = false;
      _jumpObserver = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        (window.requestAnimationFrame || function (f) { setTimeout(f, 0); })(function () {
          pending = false;
          syncJumpButton();
        });
      });
      _jumpObserver.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("click", onJumpClick, true);
      return function () {
        if (_jumpObserver) { _jumpObserver.disconnect(); _jumpObserver = null; }
        document.removeEventListener("click", onJumpClick, true);
        removeJumpButtons();
      };
    }

    // ============ toggle routing ============
    // Called when a feature flips. CSS-only features need no JS action (the
    // attribute change re-evaluates selectors). JS/mixed features call their
    // enable/disable hooks.
    function onToggle(id, on) {
      if (id === "ime-viewport") { if (on) enableViewport(); else disableViewport(); }
      if (id === "sidebar-overlay") { if (on) installSidebarOverlay(); else { if (_overlayTagged) { _overlayTagged.removeAttribute("data-qol-appframe"); _overlayTagged = null; } if (_overlayObserver) { _overlayObserver.disconnect(); _overlayObserver = null; } } }
      if (id === "jump-user-msg") {
        if (on) installJumpUserMsg();
        else {
          if (_jumpObserver) { _jumpObserver.disconnect(); _jumpObserver = null; }
          document.removeEventListener("click", onJumpClick, true);
          removeJumpButtons();
        }
      }
      // sidebar-gesture / no-touch-drag / switch-collapse / switch-nofocus /
      // settings-remember-tab reads the attribute or isOn() at
      // event/mutation time; no re-arm needed.
      // tap-feedback / settings-mobile / code-scroll are pure CSS.
    }

    function syncAllAttrs() {
      for (var i = 0; i < FEATURES.length; i++) applyAttr(FEATURES[i].id, config[FEATURES[i].id]);
    }

    // ============ Settings UI (settings.section slot) ============
    // A self-contained React panel of toggle switches, registered into the
    // host's Settings dialog via the settings.section list slot. Reads/writes
    // localStorage and flips the html attribute instantly on change. Styled
    // with host theme tokens so it matches the native settings rows.
    function ToggleRow(props) {
      var id = props.id;
      var on = !!config[id];
      var ref = React.useRef(null);

      var flip = function () {
        config[id] = !config[id];
        persist();
        applyAttr(id, config[id]);
        onToggle(id, config[id]);
        notifyConfigChange(); // subscribed live components (tab bar) re-render
        // force re-render of this row
        if (ref.current) ref.current.setAttribute("data-checked", config[id] ? "true" : "false");
        // re-render the whole panel so all rows reflect current state
        if (props.rerender) props.rerender();
      };

      return React.createElement("label", {
        ref: ref,
        "data-checked": on ? "true" : "false",
        className: "dsh-qol-row",
        style: {
          display: "flex", alignItems: "center", gap: "12px",
          padding: "10px 4px", cursor: "pointer",
          borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08))"
        }
      },
        React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0 } },
          React.createElement("div", { style: { fontSize: "14px", fontWeight: 500, color: "var(--dsw-alias-label-primary, #0f1115)" } }, props.label),
          props.hint ? React.createElement("div", { style: { fontSize: "12px", lineHeight: "16px", color: "var(--dsw-alias-label-tertiary, GrayText)", marginTop: "2px" } }, props.hint) : null
        ),
        React.createElement("span", {
          role: "switch",
          "aria-checked": on ? "true" : "false",
          "aria-label": props.label,
          tabIndex: 0,
          onClick: flip,
          onKeyDown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } },
          className: "dsh-qol-switch",
          style: {
            flex: "none", position: "relative",
            width: "36px", height: "20px", borderRadius: "999px",
            background: on ? "var(--dsw-alias-brand-primary, #4f6ef2)" : "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.12))",
            transition: "background 120ms ease",
            outline: "none"
          }
        },
          React.createElement("span", {
            style: {
              position: "absolute", top: "2px", left: on ? "18px" : "2px",
              width: "16px", height: "16px", borderRadius: "50%",
              background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)",
              transition: "left 120ms ease"
            }
          })
        )
      );
    }

    // Segmented mode selector for the tab bar (rendered under the
    // active-tabbar toggle, only while that feature is on).
    function ModeRow(props) {
      var mode = config[MODE_KEY] === "recent" ? "recent" : "standard";

      var btn = function (value, label) {
        return React.createElement("button", {
          key: value,
          className: "dsh-qol-mode-btn",
          "data-mode": value,
          "data-active": mode === value ? "true" : "false",
          onClick: function () {
            if (mode === value) return;
            config[MODE_KEY] = value;
            persist();
            notifyConfigChange();
            if (props.rerender) props.rerender();
          }
        }, label);
      };

      return React.createElement("div", { className: "dsh-qol-moderow" },
        React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0 } },
          React.createElement("div", { style: { fontSize: "14px", fontWeight: 500, color: "var(--dsw-alias-label-primary, #0f1115)" } }, "标签显示模式"),
          React.createElement("div", { style: { fontSize: "12px", lineHeight: "16px", color: "var(--dsw-alias-label-tertiary, GrayText)", marginTop: "2px" } },
            mode === "recent"
              ? "最近活跃：待处理/完成/运行中的会话排前（最久未动的在最左），空闲会话按最近活跃排后；无关闭按钮"
              : "标准：只显示打开过的会话，按打开顺序固定排列，中键/×关闭")
        ),
        React.createElement("div", { className: "dsh-qol-mode-btns" },
          btn("standard", "标准"),
          btn("recent", "最近活跃")
        )
      );
    }

    // Group section header — click toggles the section's collapse state.
    // State lives in collapsedGroups (localStorage dsh.qol.groups); groups
    // default to expanded so first-time users still see every row.
    function GroupHeader(props) {
      var collapsed = !!props.collapsed;
      var flip = function () {
        setGroupCollapsed(props.id, !collapsed);
        if (props.rerender) props.rerender();
      };
      return React.createElement("div", {
        className: "dsh-qol-group-header",
        role: "button",
        tabIndex: 0,
        "aria-expanded": collapsed ? "false" : "true",
        onClick: flip,
        onKeyDown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } }
      },
        React.createElement("span", { className: "dsh-qol-group-chevron" }, collapsed ? "▸" : "▾"),
        React.createElement("span", { className: "dsh-qol-group-label" }, props.label)
      );
    }

    function QolPanel() {
      var _ = React.useState(0)[1];
      var rerender = function () { _(function (n) { return n + 1; }); };

      var sections = [];
      for (var g = 0; g < GROUPS.length; g++) {
        var grp = GROUPS[g];
        var kids = [];
        for (var i = 0; i < FEATURES.length; i++) {
          var f = FEATURES[i];
          if (f.group !== grp.id) continue;
          kids.push(React.createElement(ToggleRow, {
            key: f.id, id: f.id, label: f.label, hint: f.hint, rerender: rerender
          }));
          // Mode row rides directly under its feature's toggle.
          if (f.id === "active-tabbar" && isOn("active-tabbar")) {
            kids.push(React.createElement(ModeRow, { key: "tabbar-mode", rerender: rerender }));
          }
        }
        sections.push(React.createElement("div", {
          key: grp.id,
          className: "dsh-qol-group",
          "data-group": grp.id,
          "data-collapsed": collapsedGroups[grp.id] ? "true" : "false"
        },
          React.createElement(GroupHeader, { id: grp.id, label: grp.label, collapsed: !!collapsedGroups[grp.id], rerender: rerender }),
          kids
        ));
      }

      return React.createElement("div", { className: "dsh-qol-panel" },
        React.createElement("div", {
          style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, GrayText)", padding: "4px 4px 8px" }
        }, "Web 界面体验优化（以移动端为主）。每个功能可独立开关，即时生效；点击分组标题可折叠。设置仅存于本浏览器。"),
        sections
      );
    }

    // ============ Active Sessions Overlay & Tab Bar ============
    function installActiveSessions(ctx) {
      var slots = null;
      try { slots = ctx.get("slots"); } catch (err) { slots = void 0; }
      if (!slots || typeof slots.inject !== "function") return function () {};

      // Host element for the tab bar — kept inside the center column so
      // the tab bar is in the document flow and pushes content down.
      // The component renders in shell.overlay but PORTALS its output into
      // this host, so React stays the owner of the .astb-overlay node.
      // (Previous implementation appendChild'd React's node out from under
      // the slot container; React's unmount deletion then threw
      // "removeChild: node is not a child of this node" and white-screened
      // the whole app on HMR reload / toggle-off — 260925.)
      var tabbarHost = document.createElement("div");
      tabbarHost.className = "qol-tabbar-host";
      // The observer only keeps the host positioned; it never moves React
      // nodes. Portal output lands in a detached host first, so the component
      // also calls ensureHostPlaced() once on mount (see below).
      var ensureHostPlaced = function () {
        var centerCol = document.querySelector("[class*=\"_centerCol\"]");
        if (centerCol && !centerCol.contains(tabbarHost)) {
          centerCol.insertBefore(tabbarHost, centerCol.firstChild);
        }
      };
      var hostObserver = new MutationObserver(ensureHostPlaced);
      hostObserver.observe(document.body, { childList: true, subtree: true });

      function ActiveSessionsOverlay(props) {
        var useSessions = props.useSessions;
        var useWorkspaces = props.useWorkspaces;
        var usePending = props.useSessionPendingInteraction;

        // All hooks run unconditionally — the early returns below used to sit
        // before them, so flipping the feature toggle at runtime changed the
        // hook count mid-mount ("Rendered fewer hooks than expected").
        // Re-render on runtime config flips: the settings panel mutates config
        // out-of-band from every store this component reads.
        var forceRerender = React.useReducer(function (n) { return n + 1; }, 0)[1];
        React.useEffect(function () {
          _configListeners.push(forceRerender);
          return function () {
            var i = _configListeners.indexOf(forceRerender);
            if (i !== -1) _configListeners.splice(i, 1);
          };
        }, []);

        var viewedCompletedRef = React.useRef(new Set());
        var prevCurrentRef = React.useRef(null);

        var sessionState = useSessions ? useSessions(function (s) { return s; }) : null;
        var workspaceState = useWorkspaces ? useWorkspaces(function (w) { return w; }) : null;
        // Map-like snapshot: id → pending interaction (approval / plan-review /
        // question). Absent prop or empty map degrades to "no yellow tabs".
        var pendingMap = usePending ? usePending(function (p) { return p; }) : null;

        var openTabsState = React.useState(loadOpenTabs);
        var openTabs = openTabsState[0];
        var setOpenTabs = openTabsState[1];

        var tabbarEnabled = isOn("active-tabbar");
        var isRecent = config[MODE_KEY] === "recent";
        var byId = sessionState ? (sessionState.byId || {}) : {};
        var ids = sessionState ? (sessionState.ids || []) : [];
        var current = sessionState ? sessionState.current : void 0;
        var jobsBySession = sessionState ? (sessionState.jobsBySession || {}) : {};

        if (prevCurrentRef.current !== current) {
          if (prevCurrentRef.current) {
            viewedCompletedRef.current.delete(prevCurrentRef.current);
          }
          prevCurrentRef.current = current;
        }

        if (current && byId[current] && byId[current].completed) {
          viewedCompletedRef.current.add(current);
        }

        // Open tabs tracking: when current changes, add to open tabs if new
        // (fixed order by open time, like browser tabs — switching doesn't
        // reorder). Runs in both modes so switching back to 标准 loses nothing.
        React.useEffect(function () {
          if (!current) return;
          // Prune destroyed sessions (abandoned blanks die on navigation) so
          // stale ids cannot evict live tabs from the MAX_TABS window.
          var tabs = loadOpenTabs().filter(function (tid) { return tid === current || byId[tid]; });
          if (tabs.indexOf(current) !== -1) { // already open, no reorder
            saveOpenTabs(tabs);
            setOpenTabs(tabs);
            return;
          }
          tabs.push(current); // append to end (open order)
          tabs = tabs.slice(-MAX_TABS); // keep most recent N
          saveOpenTabs(tabs);
          setOpenTabs(tabs);
        }, [current]);

        // Scroll active tab into view when current changes
        React.useEffect(function () {
          if (!current) return;
          var raf = requestAnimationFrame(function () {
            var el = document.querySelector(".astb-tab.active");
            if (el) el.scrollIntoView({ inline: "nearest", block: "nearest" });
          });
          return function () { cancelAnimationFrame(raf); };
        }, [current]);

        // Place the (portal) host once the overlay actually renders: portal
        // output lands in a detached host, which triggers no body mutation,
        // so the observer above alone would never position it.
        React.useEffect(function () {
          ensureHostPlaced();
        }, []);

        if (!tabbarEnabled || !sessionState) return null;

        var archivedIds = (workspaceState && workspaceState.archivedSessionIds) ? workspaceState.archivedSessionIds : [];
        var archivedSet = new Set(archivedIds);

        var isMainSession = function (item) {
          if (!item) return false;
          if (item.origin === "subagent") return false;
          return true;
        };

        var candidateMap = new Map();

        if (current && byId[current] && !archivedSet.has(current)) {
          var currItem = byId[current];
          if (isMainSession(currItem)) {
            candidateMap.set(current, currItem);
          }
        }

        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          if (!candidateMap.has(id) && byId[id] && !archivedSet.has(id)) {
            var item = byId[id];
            if (isMainSession(item)) {
              if (!item.blank || item.running || item.completed || viewedCompletedRef.current.has(id) || (jobsBySession[id] && jobsBySession[id].length > 0)) {
                candidateMap.set(id, item);
              }
            }
          }
        }

        var validSessions = Array.from(candidateMap.values());

        // Only real sessions get a tab: a blank 新会话 never occupies one —
        // starting fresh just deselects everything. Once the first message
        // is out (running, title not yet generated) the tab appears, titled
        // 新会话 until a real title lands — no flicker.
        var isReal = function (s) { return !s.blank || s.running; };

        // Pending interaction (warning yellow) lookup, null-safe across hosts.
        var pendingOf = function (s) {
          return (pendingMap && typeof pendingMap.get === "function") ? pendingMap.get(s.id) : null;
        };

        var displaySessions;
        if (isRecent) {
          // 最近活跃 mode: every real session auto-bids for a slot — no
          // open-tabs tracking. Two groups: colored states (pending 黄 /
          // completed 绿 / running 蓝, not tiered against each other) first,
          // idle (灰) after. Within each group by updatedAt, OPPOSITE
          // directions: colored oldest-first (the longest-waiting tab is
          // leftmost — a FIFO work queue), idle newest-first (the most
          // recently used tab is leftmost). Cap at MAX_TABS, keeping the
          // current session visible.
          var rankOf = function (s) {
            if (pendingOf(s) || s.completed || s.running) return 0;
            return 1;
          };
          displaySessions = validSessions.filter(isReal);
          displaySessions.sort(function (a, b) {
            var ra = rankOf(a), rb = rankOf(b);
            if (ra !== rb) return ra - rb;
            if (ra === 0) return (a.updatedAt || 0) - (b.updatedAt || 0); // colored: oldest first
            return (b.updatedAt || 0) - (a.updatedAt || 0);               // idle: newest first
          });
          if (displaySessions.length > MAX_TABS) {
            displaySessions = displaySessions.slice(0, MAX_TABS);
            var hasCurrent = displaySessions.some(function (s) { return s.id === current; });
            if (!hasCurrent) {
              for (var ri = 0; ri < validSessions.length; ri++) {
                if (validSessions[ri].id === current && isReal(validSessions[ri])) {
                  displaySessions[displaySessions.length - 1] = validSessions[ri];
                  break;
                }
              }
            }
          }
        } else {
          // 标准 mode: fixed open order, only user-opened sessions.
          var openTabsSet = new Set(openTabs);
          displaySessions = validSessions.filter(function (s) {
            return openTabsSet.has(s.id) && isReal(s);
          });
          displaySessions.sort(function (a, b) {
            return openTabs.indexOf(a.id) - openTabs.indexOf(b.id);
          });
        }

        var handleOpen = function (id, e) {
          if (e) e.stopPropagation();
          _armSuppress(); // tabbar session switch must not pop the IME
          var sService = null;
          try { sService = ctx.get("sessions"); } catch (err) {}
          if (sService) sService.open(id);
        };

        var startNewSession = function () {
          var uiWs = null;
          try { uiWs = ctx.get("uiWorkspace"); } catch (err) {}
          if (uiWs && uiWs.startSession) {
            uiWs.startSession();
          } else {
            var sService = null;
            try { sService = ctx.get("sessions"); } catch (err) {}
            if (sService) sService.create();
          }
        };

        var handleClose = function (id, e) {
          if (e) e.stopPropagation();
          // Remove from open tabs
          var tabs = loadOpenTabs().filter(function (tid) { return tid !== id; });
          saveOpenTabs(tabs);
          setOpenTabs(tabs);
          if (id !== current) return;
          // Closing the current tab: land on the last remaining VISIBLE tab
          // (storage may hold stale blank ids), or a deselected 新会话 when
          // that was the last one.
          _armSuppress(); // the induced switch must not pop the IME either
          var remaining = displaySessions.filter(function (s) { return s.id !== id; });
          if (remaining.length > 0) {
            var sService = null;
            try { sService = ctx.get("sessions"); } catch (err) {}
            if (sService) sService.open(remaining[remaining.length - 1].id);
          } else {
            startNewSession();
          }
        };

        var handleNew = function (e) {
          if (e) e.stopPropagation();
          _armSuppress(); // new-session switch must not pop the IME either
          startNewSession();
        };

        // A session that is running but still blank (first message out, title
        // not yet generated) shows 新会话 instead of the workspace name the
        // host's displayTitle falls back to.
        var sessionTitle = function (sess) {
          if (sess.blank) return "新会话";
          return sess.displayTitle || sess.title || sess.id.slice(0, 8);
        };

        return ReactDOM.createPortal(
          React.createElement(
          "div",
          { className: "astb-overlay" },
          React.createElement(
            "div",
            { className: "astb-bar" },
            // Sidebar toggle (hamburger) — only visible when sidebar-overlay + collapsed
            React.createElement("button", {
              className: "astb-sidebar-toggle",
              onClick: function () { toggleSidebar(ctx); },
              title: "展开侧栏",
              "aria-label": "展开侧栏"
            }, React.createElement("svg", {
              viewBox: "0 0 24 24", width: "16", height: "16",
              fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round"
            }, React.createElement("line", { x1: "5", y1: "8", x2: "19", y2: "8" }),
               React.createElement("line", { x1: "5", y1: "13", x2: "19", y2: "13" }),
               React.createElement("line", { x1: "5", y1: "18", x2: "19", y2: "18" })
            )),
            React.createElement(
              "div",
              { className: "astb-tabs-container" },
              displaySessions.map(function (sess) {
                var isCurrent = sess.id === current;
                var isRunning = sess.running;
                var isPending = !!pendingOf(sess);
                var isUnread = sess.completed && !isCurrent;
                var title = sessionTitle(sess);

                var tabClass = "astb-tab";
                if (isCurrent) tabClass += " active";
                if (isUnread) tabClass += " unread";

                var slotClass = "astb-indicator-slot";
                if (isPending) slotClass += " warning";
                else if (isRunning) slotClass += " running";
                else if (isUnread) slotClass += " completed";

                return React.createElement(
                  "div",
                  {
                    key: sess.id,
                    className: tabClass,
                    onClick: function (e) { handleOpen(sess.id, e); },
                    // Middle-mousedown preventDefault always stays on — it
                    // suppresses the browser's autoscroll cursor. The close
                    // itself rides on auxclick (standard mode only).
                    onMouseDown: function (e) { if (e.button === 1) e.preventDefault(); },
                    onAuxClick: isRecent ? undefined : function (e) { if (e.button === 1) handleClose(sess.id, e); },
                    title: title + " (" + sess.id + ")"
                      + (isPending ? " [待处理]" : "")
                      + (isUnread ? " [未读]" : "")
                      + (isRunning ? " [运行中]" : "")
                  },
                  React.createElement("div", { className: slotClass }),
                  React.createElement("span", { className: "astb-tab-title" }, title),
                  isRecent ? null : React.createElement(
                    "span",
                    {
                      className: "astb-close-btn",
                      onClick: function (e) { handleClose(sess.id, e); },
                      title: "归档/关闭会话"
                    },
                    "×"
                  )
                );
              })
            ),
            // "+" pinned at the bar's right edge — sibling of the scroll
            // container, not inside it, so it never scrolls away.
            React.createElement(
              "div",
              { className: "astb-controls" },
              React.createElement(
                "button",
                {
                  className: "astb-action-btn",
                  onClick: handleNew,
                  title: "新建会话"
                },
                "+"
              )
            )
          )),
          tabbarHost
        );
      }

      var removeOverlay = null;
      try {
        removeOverlay = slots.inject("shell.overlay", function () {
          return slots.register(
            { name: "shell.overlay", id: "active-sessions-tabbar", order: 50, label: "活跃会话 Tab Bar" },
            ActiveSessionsOverlay
          );
        }, "dsh-qol: active sessions overlay");
      } catch (err) {
        console.warn("[dsh-qol] shell.overlay registration failed:", err && err.message);
      }

      return function () {
        if (typeof removeOverlay === "function") removeOverlay();
        hostObserver.disconnect();
        tabbarHost.remove();
      };
    }

    // ============ apply ============
    function apply(ctx) {
      installCSS();
      syncAllAttrs();

      var disposers = [];
      disposers.push(installGesture(ctx));
      disposers.push(installNoTouchDrag());
      disposers.push(installSwitchBehavior(ctx));
      disposers.push(installViewport());
      disposers.push(installTouchstartFix());
      disposers.push(installSettingsRememberTab());
      disposers.push(installWorkspacePin(ctx));
      disposers.push(installSidebarOverlay(ctx));
      disposers.push(installActiveSessions(ctx));
      disposers.push(installJumpUserMsg());

      // Register the settings.section so the toggle panel appears in Settings.
      var slots = null;
      try { slots = ctx.get("slots"); } catch (err) { slots = void 0; }
      if (slots && typeof slots.inject === "function") {
        try {
          var removeSection = slots.inject("settings.section", function () {
            return slots.register(
              { name: "settings.section", id: "qol", order: 35, label: "QoL" },
              function () { return React.createElement(QolPanel, null); }
            );
          }, "dsh-qol: settings section");
          if (typeof removeSection === "function") disposers.push(removeSection);
        } catch (err) {
          console.warn("[dsh-qol] settings.section registration failed:", err && err.message);
        }
      } else {
        console.warn("[dsh-qol] slots service unavailable; toggle UI not registered. Features still apply with defaults from localStorage.");
      }

      ctx.effect(function () {
        return function () {
          for (var i = 0; i < disposers.length; i++) {
            try { disposers[i](); } catch (err) { /* best-effort */ }
          }
        };
      }, "dsh-qol: teardown");
    }

    module.exports = { inject: inject, apply: apply };
    return module.exports;
  }
});

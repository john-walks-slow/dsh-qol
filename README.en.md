# dsh-qol

<p align="center">
  <a href="./README.md"><strong>简体中文</strong></a> ·
  <a href="./README.en.md"><strong>English</strong></a>
</p>

Quality-of-life tweaks for the DeepSeek Harness (dsh) Web GUI: a session tab bar, sidebar swipe gestures, IME/keyboard adaptation, touch feedback, a full-screen settings rewrite and more — **13 features**, each independently toggleable from **Settings → QoL**, taking effect instantly and persisted per browser. Mobile-first; some features (tab bar, status animation, etc.) apply on desktop too.


![dsh-qol: mobile tab bar and desktop views of the DeepSeek Harness web UI](assets/hero.png)

## Features

| Feature | Description | Default |
|---|---|---|
| Active-session Tab Bar | Horizontally shows active session tabs at the top of the page; unread/running tabs pinned first, one-tap switching, no accidental keyboard pull-up; fresh sessions show as "New Session"; middle-click/× to close (closing the last tab lands on a fresh session, and the fresh session itself cannot be closed); **the + button sits right after the last tab** (Chrome-style) | On |
| Sidebar swipe | Expand the sidebar by swiping right and collapse by swiping left **anywhere on screen** (64px threshold, non-following; the left 16px edge yields to the system back gesture; input fields / horizontal scrollers skipped; no response while a dialog is open; swiping over buttons is safe — it never triggers a click) | On |
| Sidebar overlay | On mobile the sidebar opens as an overlay covering content instead of squeezing the main area into a reflow | On |
| Collapsed-sidebar recents | When the sidebar is collapsed, circular first-letter icons of recently active sessions appear under the search box, with status badges | On |
| Collapse sidebar on switch | On narrow screens, picking a session in the sidebar auto-collapses it and returns to the conversation (≤768px only) | On |
| No keyboard on switch | Switching sessions never auto-focuses the input box, so the IME never pops up; covers sidebar session rows, active tabs, collapsed rail icons and archive jumps; tapping the input box directly still focuses it manually | On |
| IME/keyboard adaptation | viewport meta (`viewport-fit=cover` + `interactive-widget=resizes-content`), a `100dvh` height chain, composer safe area, iOS `visualViewport` CSS-variable fallback (**never changes element sizes/fonts**) | On |
| Touch feedback | `touch-action: manipulation` (kills the 300ms delay and double-tap zoom), disables the system tap highlight, `:active` press feedback, iOS `:active` fix, respects `prefers-reduced-motion` (**never changes element sizes**) | On |
| Full-screen settings rewrite | The settings dialog stacks full-screen at ≤768px with horizontally scrolling tabs, a collapsed-tab-width bugfix and safe-area adaptation | On |
| Settings tab memory | Reopening settings restores the last selected tab instead of resetting to General | On |
| Code/table inner scroll | Long code blocks and tables scroll horizontally inside their containers; body text wraps without overflowing | On |
| Hide permission dropdown | Hides the permission (Access mode) dropdown trigger inside the input box to save horizontal space; model selection and context usage are unaffected | On |
| Status animation optimization | Replaces the SVG opacity chase-dot animation with a CSS transform pulse on the compositor thread, zero main-thread cost. Measured idle FPS via rAF: 35 → 55 | On |

## Install

```bash
dsh plugin --profile web add dsh-qol
```

No manual configuration needed after install — the bundled `cordis.patch.yml` mounts automatically; once installed, a **QoL** section appears on the settings page after refreshing the web UI.

Install straight from GitHub (source install; `lib/` is hand-written source and needs no local build, but the package declares a `prepare` syntax-check script, which pnpm ≥10 blocks the first time):

```bash
dsh plugin --profile web add github:john-walks-slow/dsh-qol
# Add the package name pnpm prints to allowBuilds in
# ~/.dsh/profiles/web/pnpm-workspace.yaml, then re-run
```

## Usage

1. Open the dsh Web GUI (best on mobile).
2. Settings → **QoL**: 13 toggle rows (name + one-line description). Each click takes effect **instantly**, no page refresh needed.
3. Toggles persist automatically in browser `localStorage` (key `dsh.qol.v1`) for this browser only; deleting that key restores the all-on defaults.

What a saved toggle set actually looks like (`localStorage["dsh.qol.v1"]`):

```json
{ "active-tabbar": true, "sidebar-gesture": true, "ime-viewport": true, "tap-feedback": true }
```

The implementation is an **attribute total-gate**: every feature maps to an `html[data-qol-<feature-id>]` attribute that both the CSS rules and the JS event handlers read — toggling just sets/removes the attribute, which is why it applies instantly with no reload.

## Permissions & compatibility

- **Pure client plugin**: the host-side `apply` is empty, **zero npm runtime dependencies**; all logic runs in the browser half (`lib/client.js`)
- **Zero permissions**: no external services, no network requests, no filesystem writes, no reading of session content — it only touches browser-side CSS, DOM events and the viewport meta
- **Config never leaves the browser**: toggle state lives only in this browser's `localStorage`; nothing is uploaded or written server-side
- **Zero desktop impact**: all mobile-specific rules are locked inside `@media (max-width: 768px)`; cross-platform features (tab bar, rail, status animation) behave the same on both
- **Never changes element sizes/fonts**: a deliberate design constraint (touch feedback and IME adaptation only touch behavior/compositor layers)
- **Degrades, never blocks**: every host-service lookup is wrapped in `ctx.get()` + try/catch; a missing service only logs a `console.warn`; if a structure-anchor selector stops matching after a host redesign, the matching rules silently stop applying and the page is unaffected
- **Coexists with dsh-web-mobile-fix** (see below)
- **Tested baseline**: current dsh stable (0.1.x) web profile + Chromium/Firefox engine mobile emulation; real-device (iOS Safari / Android Chrome) touch feel and IME details are worth a manual pass

### Relationship with dsh-web-mobile-fix

The two **coexist**: dsh-web-mobile-fix provides the compact mobile layout (32px session-header buttons, hidden breadcrumbs, etc.); this plugin adds the toggleable QoL layer (gestures / IME / tab bar, etc.). Their settings-dialog rules overlap but are visually equivalent — the union is safe. If you don't need mobile-fix's compact layout, you can remove it on its own — this plugin's `settings-mobile` covers the settings-page CSS.

## How it works

- **Pure client**: the empty host-side `apply` exists only to mount the package into the profile; the browser half is loaded through a `window.__ModuleLoader__.load` factory (via `exports["./client"]` and the `dsh.client` declaration in package.json).
- **Attribute total-gate**: see above — the key to instant toggles.
- **Structure anchors**: CSS uses structural selectors like `data-slot` / `:has(> nav)` with zero hash-class dependency (the status-animation rule's hash-class match is a **deliberate exception**; a mismatch just means a silent fallback — see the comments in client.js).
- **Shape defense**: every service lookup is try/catch-wrapped; any missing service degrades silently instead of blocking load.

## Local development

```bash
npm install
npm run build     # syntax-checks both artifacts: lib/index.js (host entry) + lib/client.js (browser bundle)
```

E2E (development only, targets a running dsh instance; tokens are read from environment variables so no credentials land in the repo):

```bash
export DSH_E2E_TOKEN_4175=<live instance token>   # printed by `dsh web` on startup
export DSH_E2E_TOKEN_4176=<temp instance token>
node e2e/mobile.mjs mobile     # Phase-1: mock harness against the real DOM
node e2e/mobile.mjs desktop    # desktop zero-impact verification
node e2e/integration.mjs       # Phase-2: real-plugin integration on a temp instance
```

Note: e2e depends on a local camoufox + playwright-core (paths are hardcoded at the top of each script; adjust for your machine). This repo has no unit tests; `npm test` is intentionally not provided.

- Feature docs: `docs/features/` (research / plan / validation / summary).
- Adding a feature: register one entry in the `FEATURES` registry in `lib/client.js` plus its CSS block / JS hooks.

## License

MIT

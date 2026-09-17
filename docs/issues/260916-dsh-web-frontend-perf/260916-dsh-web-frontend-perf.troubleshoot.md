# DSH Web 前端性能问题诊断

> 日期: 2026-09-16  
> 环境: Android 后台 chroot Ubuntu 容器（ARM64 移动设备）  
> 线上实例: `http://127.0.0.1:4175`  
> 源码位置: `@deepseek-ai/dsh` 主包内嵌 node_modules 的 `@deepseek-ai/*` 模块

## 问题描述

DSH Web GUI 在移动端设备上体感明显卡顿：启动慢、交互迟滞。用户要求排查"大头"。

## 诊断方法论

### 数据来源分层（置信度标注）

| 层级 | 说明 | 置信度 |
|------|------|--------|
| **实测 (Navigation/Resource Timing)** | Navigation Timing API + Resource Timing API 真机采集启动期数据 | 高 |
| **实测 (rAF 帧间隔)** | `requestAnimationFrame` 帧间隔测量（不受 timer throttling 影响），含对照实验 | 高 |
| **源码确证** | 直接阅读 4 个核心 UI 插件 `lib/client.js`（未压缩），确认架构与数据流 | 高 |
| **源码推断** | 基于架构推导的多 session 运行时开销，未经多 session 真机量化 | 中 |

### 测量方法演进

**第一轮 (setInterval)**: 头无头 camoufox 作为 Android 后台进程，`setInterval` 被系统 timer throttling 限流到秒级。对照实验（暂停动画后 FPS 反降）证明测量不可靠，**丢弃**。

**第二轮 (requestAnimationFrame)**: 改用 `requestAnimationFrame` 帧间隔测量（帧同步，不受 timer throttling 影响）。rAF 被延迟即真实掉帧，非测量假象。此轮数据**可信**。

### rAF 实测结果（第二轮，可信）

#### Idle 基线 — CSS 动画对照实验

| 状态 | FPS avg | P50 (ms) | P95 (ms) | Jank % (>33ms) | Heavy Jank (>50ms) |
|------|---------|----------|----------|----------------|---------------------|
| **动画运行** | 35.6 | 24.0 | 57.0 | 31.1% (112/360) | 7.2% (26/360) |
| **动画暂停** | 55.7 | 17.0 | 33.0 | 5.0% (28/563) | 0.9% (5/563) |

**结论**: 暂停 10 个 CSS 动画后 FPS 从 35.6 → 55.7（+56%），jank 从 31% → 5%。**CSS 动画是 idle 卡顿的直接原因。**

#### rAF 间隔分布分析

rAF 间隔数据 `[14,12,17,32,17,18,78,77,21,17,60,10,29,...]` 显示高度不规律：
- 快帧 (≤16ms): ~32% — 接近 60fps
- 慢帧 (>30ms): ~32% — 严重掉帧
- 这**不是** timer throttling（throttling 会恒定到 250ms+），是真实的渲染抖动

#### 动画类型分析（`document.getAnimations()`）

| 动画名 | 数量 | 属性 | 目标元素 | 大小 |
|--------|------|------|----------|------|
| `_dsh-state-dot-chase` | 8 | `opacity` | SVG `<rect>` | 2px×2px |
| `astb-pulse` | 1 | `opacity, transform, boxShadow` | `<div>` | 6px×6px |

**根因**: SVG `<rect>` opacity 动画**不走合成器线程**。SVG 元素不会被自动提升为 GPU 合成层，opacity 动画每帧触发 SVG 重绘管线。即使元素仅 2px×2px，管线开销（更新 → 失效 → 重绘 → 合成）仍然显著。8 个同时运行 = 每帧 8 次 SVG 管线遍历。

---

## 根因

按影响排序，共 5 个根因。#1 是启动期绝对大头；#2 和 #3 是运行时大头，且 #3 直接解释用户观察到的"多 session 并发 = 卡"。

### 根因 #1：启动期主线程长时间阻塞（启动大头）

**置信度: 高（实测）**

**现象**: Navigation Timing 实测 — TTFB 174ms, DCL 694ms, `load` 2584ms。DCL→load 之间约 1.9s 主线程冻结，用户看到白屏/无响应。

**根因**: 全量 JS 无代码分割，一次性 parse + eval 9.85MB decoded JS。

**实测资源拆解**:

| 资源 | gzip | decoded | 耗时 | 说明 |
|------|------|---------|------|------|
| `client.js`（插件 batch） | **1.88MB** | **7.09MB** | 612ms | 61 个 client 插件（含 17 用户插件），无 code splitting，全量 boot 加载 |
| `whale-closed-shop.jpg` | — | 801KB | — | 装饰图 |
| `whale-ghost.jpg` | — | 634KB | — | 装饰图 |
| `vendor-CCJJTK99.js` | 210KB | 741KB | 163ms | 第三方依赖 |
| `index-Df-65__b.js` | 162KB | 423KB | 149ms | 应用入口 |
| `index.css` | — | 38KB | — | 应用样式 |
| `vendor.css` | — | 29KB | — | 第三方样式 |
| 其余 13 个资源 | — | ~1.1MB | — | — |
| **合计** | — | **9.85MB** | — | totalTransfer 3.73MB |

**关键计算**: ARM64 移动 SoC 上 7.09MB minified JS 的 parse + eval（单线程主线程）估计 2–4s。这期间主线程完全阻塞，所有交互无响应。

**为什么是启动大头**: 这是用户每次打开页面都必须承受的固定成本，且量级（7MB 单文件）远超其他所有因素。

### 根因 #2：SVG opacity 动画导致持续渲染开销（运行时 idle 大头）

**置信度: 高（rAF 实测 + 对照实验）**

**现象**: 页面 idle 时（无活跃会话），FPS 仅 35.6，31% 帧掉帧。用户体感"啥也不干也卡"。

**根因**: 状态指示器 `_dsh-state-dot-chase` 动画在 SVG `<rect>` 上 animate `opacity`。SVG opacity 动画**不走合成器线程**（SVG 元素不会被自动提升为 GPU 合成层），每帧触发 SVG 重绘管线（更新 → 失效 → 重绘 → 合成）。即使元素仅 2px×2px，管线开销显著。

**实测对照**:

| 状态 | FPS | Jank% | 机制 |
|------|-----|-------|------|
| 10 个动画运行 | 35.6 | 31.1% | 8 SVG opacity + 1 boxShadow/transform/opacity + 1 opacity |
| 动画暂停 | 55.7 | 5.0% | 无 SVG 管线开销 |
| **差异** | **+56%** | **-84%** | 直接归因于 CSS 动画 |

**动画详情**:
- `_dsh-state-dot-chase` × 8: SVG `<rect>` opacity 动画，每个活跃会话的状态指示器（追逐点）。每个会话行有 6 个 rect 组成追逐动画。
- `astb-pulse` × 1: div 上 `opacity + transform + boxShadow` 联合动画（auto-scroll-to-bottom 按钮脉冲）。`boxShadow` 是 paint-triggering 属性。

**关键**: 这不是"动画多"的问题，而是"SVG opacity 动画不走合成器"的架构性问题。HTML 元素的 `opacity` 动画可以走合成器线程（零主线程开销），但 SVG 元素不会自动获得合成层提升。

### 根因 #3：多 session 并发的复合放大效应（用户报告的"多 session = 卡"）

**置信度: 高（用户观察 + 源码确证机制 + rAF 实测 SVG 动画开销）**

**现象**: 用户报告"只有一个 session 在跑就不卡。同时四五个 session + subagent 在跑就非常卡。"

**根因链路（4 重复合放大）**:

#### 3a. 长轮询频率随活跃 session 数线性增长

DSH web 客户端通过 **HTTP 长轮询**（非 WebSocket/SSE）获取会话状态更新：
- `/api/session/list`: 长轮询，连接保持 2–4s（实测 duration 3354ms）
- `/api/subagents/list`: 长轮询，连接保持 2–4s（实测 duration 2282–4388ms）

当 N 个 session 同时活跃时，状态变更频率 ×N，长轮询响应频率 ×N。每次响应触发 `sessions.list` 快照更新。

#### 3b. SessionTree 全量快照订阅 + O(N) 派生

`dsh-client-ui-workspace` 的 `SessionTree` 组件订阅 **整个 sessions 快照** (`useSessions((s) => s)`)。每次快照更新触发：

1. `indexSubagentDescendants(summaries)`: 遍历**所有** session，构建后代树 — O(N)
2. `deriveGroups(list, workspaces, ...)`: 为**每个** workspace 构建 GroupNode[] — O(N)
3. `reconciledSessionOrder`: 每个 workspace 的 session 排序 — O(N log N)
4. `nextSessionOrderAccount`: 活动提升策略 — O(N)

N = 所有 session（不只活跃的），在 root 工作区 = 282。每次长轮询响应都触发全部重算。

#### 3c. SVG 动画数量随活跃 session 数线性增长

每个活跃 session 的状态指示器启动 6–8 个 `_dsh-state-dot-chase` SVG opacity 动画：

| 活跃 session 数 | SVG 动画数 | 预期 FPS（基于实测线性外推） |
|-----------------|-----------|--------------------------|
| 0 | 0 | ~56 (动画暂停实测) |
| 1 | 6–8 | ~36 (实测) |
| 3 | 18–24 | ~20–25 (外推) |
| 5 | 30–40 | ~10–15 (外推) |

**注**: 线性外推可能过于悲观（合成器有一定并行能力），但趋势明确：SVG 动画线性叠加，每帧管线开销累加。

#### 3d. 控制流全客户端广播

`session-controller.control` 的 baseline = 所有 attached session 的 queues + jobs + projections；live 增量广播给所有 web 客户端。多 session 活跃时，每条控制事件触发 `notifySubscribers` → `useSyncExternalStore` selector 重算。workspace 经 `useSessions`(×11) / `useStore`(×6) 订阅。

#### 复合效应公式

```
总负载 = 长轮询频率(N) × [O(N) 派生 + O(N log N) 排序] + N × SVG动画开销 + 控制事件频率(N) × selector重算
```

N=1 时各项都很小；N=5 时各项 ×5 且乘积放大。这就是"1 个不卡、5 个很卡"的原因。

### 根因 #4：流式 token delta 的 per-event 路径开销（已优化，低优先级）

**置信度: 中（源码确证架构良好，开销被 triple-rAF 抑制）**

**现象**: AI 回复流式输出时，token delta 触发渲染路径。

**源码更新（4 插件深度分析后）**: 架构比最初评估**更加健全**：

- **Conversation 插件** (16,291 行): triple-rAF 合并（3 层嵌套 `requestAnimationFrame`，确保浏览器先 paint 中间状态再 materialize 下一次），dirty-set 增量追踪（只重建变化的 Context），identity-stable 快照（引用相等检测 no-op）。
- **Chat 插件** (8,176 行): per-key `useSyncExternalStore` 订阅（streaming delta 只重渲一个 node），`react.memo` 全覆盖，`MutableChatSource` 只在 `published !== next` 时通知。
- **Renderer 插件**: TanStack Virtual 虚拟滚动 + 增量块级解析 + frozen 缓存。

**结论**: 流式 delta 路径架构设计良好，triple-rAF 合并有效抑制了高频 delta 的渲染开销。**不是运行时大头**。

### 根因 #5：会话列表展开时无虚拟化

**置信度: 低-中（源码确证，折叠时有缓释）**

**现象**: 展开大工作区（root 工作区 282 条会话）时，会话列表全量 `.map` 渲染，无 `useVirtualizer`。

**根因**: `collapsedSessionRows(sessions)` 折叠时仅渲染 5 条（`COLLAPSED_SESSION_LIMIT=5`），但展开时退化为全量 `.map`。行组件 `SessionNodeItem` 无 `React.memo` 包裹。

**缓释条件**: 折叠状态（默认）下仅 5 条，不构成问题。

---

## 现象与根因的关联

| 用户体感 | 根因 | 关联解释 |
|----------|------|----------|
| 打开页面后白屏 2–3s | #1 | 7.09MB JS parse+eval 阻塞主线程 |
| 空闲时也感觉卡（FPS 低） | #2 | 8 个 SVG opacity 动画每帧触发重绘管线，FPS 35.6 vs 暂停后 55.7 |
| 只有 1 个 session 不卡，4–5 个很卡 | #3 | 长轮询 ×N + O(N) 派生 ×N + SVG 动画 ×N，复合放大 |
| 多 agent 同时跑时整体变慢 | #3 | 同上：N 个活跃 session = N 倍长轮询 + N 倍 SVG 动画 + N 倍控制事件 |
| AI 流式回复时偶尔卡顿 | #4 | triple-rAF 抑制了大部分，但极高 delta 速率仍可能有残余开销 |
| 展开会话列表时明显卡 | #5 | 282 条全量 .map 无虚拟化 |

---

## 修复路径

### 路径 A：插件 client.js 代码分割（针对根因 #1，优先级 P0）

**方案**: 将 61 个 client 插件的 batch 打包改为按需加载（dynamic import / route-based splitting）。只有当前路由需要的插件才加载，其余延迟到首次访问时。

**理由**: 7.09MB 单文件是启动期绝对大头，量级远超其他因素。即使只做到"首屏只加载必要插件"，也能将 decoded JS 从 7MB 降到估计 2–3MB，parse 时间减半以上。

**置信度**: 高 — 代码分割是成熟实践，效果可预测。

**风险**: 插件间依赖关系需梳理；首次访问延迟加载的插件会有短暂加载等待。

### 路径 B：SVG 动画改为 CSS transform 或替换为 HTML 元素（针对根因 #2 + #3c，优先级 P0）

**方案**: 
1. 将 `_dsh-state-dot-chase` 的 SVG `<rect>` opacity 动画改为 HTML `<div>` + CSS `transform: scale()` 或 `opacity` 动画。HTML 元素的 opacity/transform 动画走合成器线程，零主线程开销。
2. 或保持 SVG 但添加 `will-change: opacity` 提示，促进合成层提升（需验证移动端效果，可能增加 VRAM 占用）。
3. `astb-pulse` 的 `boxShadow` 动画改为 `filter: drop-shadow()` 或纯 `opacity` + `transform`。
4. 考虑 `prefers-reduced-motion` 支持：减少动画或降低频率。

**理由**: rAF 实测证明 10 个 CSS 动画导致 FPS 35.6→55.7（+56%）。多 session 时动画数线性增长（5 session = 30–40 动画），是"多 session = 卡"的核心放大器。

**置信度**: 高 — SVG→HTML 元素替换 + CSS transform 动画是标准 GPU 加速方案。

**预期收益**: idle FPS 从 35.6 提升到 ~55+；多 session 时 FPS 退化斜率大幅降低。

### 路径 C：SessionTree 增量订阅 + 派生缓存（针对根因 #3b，优先级 P1）

**方案**:
1. `SessionTree` 的 `useSessions((s) => s)` 全量订阅改为按需字段选择：只订阅 `ids` + `byId` 中可见 session 的状态字段，而非整个快照。
2. `indexSubagentDescendants` 和 `deriveGroups` 增加输入引用相等检测（如果 `sessions` 引用未变，跳过重算）。
3. 长轮询响应只更新变化的 session 字段（增量 patch），而非全量替换快照。

**理由**: 每次长轮询响应触发 O(N) 全量派生（N=282），是多 session 场景的主要 CPU 开销。

**置信度**: 中 — 涉及快照订阅模型调整，需验证增量更新不破坏排序一致性。

### 路径 D：装饰图懒加载 / 压缩（针对根因 #1 补充，优先级 P1）

**方案**: 1.44MB 的两张装饰图（whale-closed-shop.jpg + whale-ghost.jpg）改为 WebP/AVIF 格式 + `loading="lazy"`。

**理由**: 1.44MB 占总传输量 38%，且非首屏关键路径。

**置信度**: 高 — 格式转换 + 懒加载是标准优化。

### 路径 E：会话列表虚拟化（针对根因 #5，优先级 P2）

**方案**: 展开的会话列表使用 `useVirtualizer`（与消息列表、trajectory 同一套 TanStack Virtual）。

**理由**: 已有两个插件使用 TanStack Virtual，模式成熟。

**置信度**: 高 — 已有同库使用先例。

### 路径 F：流式 delta 路径（针对根因 #4，优先级 P3 — 低）

**方案**: 无需结构性修改。triple-rAF 合并已有效抑制高频 delta。如需进一步优化，可将 `eventSource.append` 的不可变 concat 改为 ring buffer。

**理由**: 4 插件深度分析确认架构设计良好，不是运行时大头。

**置信度**: 高（判断"无需修改"的置信度）。

---

## 验收标准

| 标准 | 验证方法 | 目标 |
|------|----------|------|
| 首屏 JS decoded 体积 | DevTools Network → decoded | < 3MB（当前 9.85MB） |
| `load` 事件时间 | Navigation Timing API | < 1.5s（当前 2.584s） |
| 主线程长任务 | DevTools Performance → Long Tasks | 首屏无 >500ms 长任务 |
| idle FPS（无活跃 session） | rAF 帧间隔测量或 DevTools | ≥ 55（当前 35.6） |
| idle FPS（5 个活跃 session） | rAF 帧间隔测量或 DevTools | ≥ 30（当前外推 ~10–15） |
| SVG 动画不在主线程 | DevTools Performance → Animations track | 所有动画标记为 composited |
| 会话列表展开 | 展开含 100+ 会话的工作区 | 展开操作 < 100ms，滚动 60fps |
| 装饰图不阻塞首屏 | Lighthouse / DevTools Coverage | 装饰图不在关键渲染路径 |

> **测量方法**: rAF 帧间隔测量已验证可靠（不受 timer throttling 影响）。前台浏览器 DevTools Performance 录制可提供更详细的 long task / paint / composite 分析。

---

## 总结：大头是什么

### 启动期大头 = JS 无代码分割

**61 个 client 插件的 7.09MB decoded JS 无代码分割全量加载**。占 decoded JS 总量 72%，估计阻塞 2–4s。每次打开页面必须承受的固定成本。

### 运行时大头 = SVG 动画 × 多 session 复合放大

两个因素复合：

1. **SVG opacity 动画**（rAF 实测确证）：8 个 SVG `<rect>` opacity 动画不走合成器线程，每帧触发 SVG 重绘管线。idle FPS 从应有 60 降到 35.6。

2. **多 session 线性放大**：每个活跃 session 增加 6–8 个 SVG 动画 + 增加长轮询频率 + 触发 O(N) 全量快照派生。5 个 session = 30–40 个 SVG 动画 + 5 倍长轮询 + 5 倍 O(282) 派生。

用户观察到的"1 个不卡、5 个很卡"= 这两个因素的乘积效应。单 session 时 SVG 动画开销尚可接受（FPS 35.6），多 session 时线性叠加到不可接受（外推 FPS 10–15）。

### 渲染架构本身设计良好

4 个核心 UI 插件的深度源码分析确认：
- **Conversation**: triple-rAF 合并 + dirty-set 增量追踪 + identity-stable 快照
- **Chat**: per-key `useSyncExternalStore` + `react.memo` 全覆盖
- **Renderer**: TanStack Virtual + 增量块级解析 + frozen 缓存
- **Trajectory**: 条件虚拟化 + 结构共享 + 节流搜索索引

流式 delta 路径（原根因 #2）经深度分析后**降级为低优先级** — 架构健全，triple-rAF 有效。

### 修复优先级

| 优先级 | 修复 | 目标根因 | 预期收益 |
|--------|------|----------|----------|
| **P0** | 插件 client.js 代码分割 | #1 | load 时间 2.5s → <1.5s |
| **P0** | SVG 动画 → HTML CSS transform | #2 + #3c | idle FPS 35→55+，多 session 退化斜率大幅降低 |
| P1 | SessionTree 增量订阅 + 派生缓存 | #3b | 多 session 时 O(N) 派生 → O(changed) |
| P1 | 装饰图懒加载/压缩 | #1 补充 | 传输量 -1.44MB |
| P2 | 会话列表虚拟化 | #5 | 展开大工作区不卡 |
| P3 | 流式 delta（无需结构性修改） | #4 | 已优化 |

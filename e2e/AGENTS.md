# e2e AGENTS.md

## 职责

面向 4188 隔离实例（dsh-e2e skill）的端到端测试脚本与共享工具。

## 地图

- `tabbar-mode.mjs` — tab bar 双模式语义全量断言（含 guard 接入模板）
- `lib/run-guard.mjs` — run 级互斥 guard；GUI 驱动脚本顶部一律接入
- `verify-*.mjs` — 只读验证脚本（无需持锁）
- 实例启停与执行入口：`dsh-e2e`（start / wait / stop / status / run）

## 核心设计

**run 级互斥（2026-09-25 起结构性强制）**：同一 4188 实例上，会改实例状态的 GUI e2e（切 current / 开关 tab / 发消息 / 触发 pendingInteraction）必须串行——并发互踩实证：播种会话被对方切走、断言吃到对方状态翻转。

- 首选：`dsh-e2e run e2e/x.mjs`（自动持锁排队，`--wait N` 默认 900s）
- 或脚本内置 guard（裸跑也自动持锁）：
  ```js
  import { guard } from './lib/run-guard.mjs';
  await guard(); // 顶部，先于任何浏览器/实例操作
  ```
- 锁 `/tmp/dsh-e2e-run.lock`（flock 内核级，持有进程死亡即释放）；与实例锁 `/tmp/dsh-e2e.lock` 相互独立；持有者记录 `/tmp/dsh-e2e-run.owner.json`
- 只读 verify（curl / 纯观察）不受限

**断言风格**（多 agent 并存下的可靠性）：

- openTabs 含 host 自动恢复的 blank 隐藏会话——用包含性断言，勿死数数
- openTabs 的 tab id 带 `session-` 前缀，与裸 uuid 比较前先归一化
- 标题断言用多重集差分（diff）检测新增，抗侧栏 byRecency 重排

## Pitfalls

- 工作树可能被并发 agent 瞬时回退（未提交改动被暂时移走）→ HMR 把旧代码回写 rev 图 → e2e reload 吃到旧代码。**改动过完 e2e 尽快提交进 HEAD**；断言要能区分"并发翻转"与真回归
- 全量 GUI e2e 3~6 分钟且跑真实 LLM：攒批 + 定向（见 dsh-e2e skill 成本控制节）

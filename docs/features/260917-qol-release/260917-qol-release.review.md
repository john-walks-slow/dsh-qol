# 检视报告

## 概要

本次检视覆盖 `dsh-qol` 1.0.0 发布准备的所有变更，包括 `popover-recenter` 功能删除、Tab Bar 中键关闭实现、项目全面重命名（`dsh-mobile-qol` → `dsh-qol`）以及发布元数据与文档重写。整体代码架构优良，事件处理严谨，但由于 **E2E 脚本中硬编码了公网可访问实例的真实访问令牌（Token）**，存在严重安全风险，必须修复后方可发布。

## 需求对齐

变更与发布计划高度对齐：
1. **删除 popover-recenter**：已彻底清理代码中的注册项、四组 CSS 规则及注释，除作为历史归档保留的 `docs/` 文档外，无任何残留引用或死代码。
2. **Tab Bar 中键关闭**：通过 `onMouseDown` 阻止默认滚动行为结合 `onAuxClick` 执行关闭，精确实现了中键关闭语义，且与原生 `onClick` 及子节点关闭按钮互不干扰。
3. **项目重命名**：模块 ID、配置存储键（`dsh.qol.v1` 等）、CSS 标记、设置面板槽位配置及日志前缀均已完成重命名。
4. **发布准备**：`package.json` 补充了 `exports["./cordis.patch.yml"]`，更新了版本号、协议（MIT LICENSE）与仓库地址，重写了覆盖 13 项功能的完整 README。

---

## 阻塞问题

[Must fix before admission. 必须在发布前修复。]

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| BLK-01 | `e2e/mobile.mjs:30`<br>`e2e/verify-real.mjs:8`<br>`e2e/test-settings-features.mjs:4`<br>`e2e/integration.mjs:14` | **硬编码公网暴露实例的真实访问令牌（Token）**：检视发现 `<redacted>...` 等 Token 为本地 DSH 实例的真实认证凭据，且系统配置中已通过 Cloudflare 命名隧道将该实例映射至公网（`<dsh-host>`）。若按计划将仓库推送到公开 GitHub 仓库，公网用户可通过该 Token 绕过鉴权直接接管 DSH 实例，进而通过 Agent 获得宿主系统的终端执行权限。 | 将 E2E 脚本中的 Token 和目标 URL 改为从环境变量读取（例如 `process.env.DSH_TOKEN`，缺省时提示并退出），并在发布前重置/轮转线上当前的 DSH Token。确保发布至 Git 仓库的文件不含任何真实私密凭据。 |

---

## 建议修改

[Should fix；不影响基本运行，但强烈建议在交付前处理。]

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| REC-01 | `lib/client.js:1311-1335` | **关闭当前激活 Tab 时未触发输入法键盘抑制**：当用户在中键或点击 `×` 关闭当前正在浏览的 Tab 时，`handleClose` 会自动将视图切换到剩余的最后一个 Tab（或新建会话）。此处直接调用了 `sService.open()`，但未调用 `_armSuppress()`。在移动端上，这会导致关闭当前 Tab 后宿主自动聚焦输入框而误拉起软键盘，与 README 中声称的“切换会话不拉键盘…归档跳转全覆盖”承诺存在不一致。 | 在 `handleClose` 内执行会话切换（`sService.open` / `startSession`）之前，加入 `_armSuppress();` 调用。 |
| REC-02 | `lib/client.js:289, 1114, 1132, 1163` | **遗留旧项目缩写命名 (`dsh-mq-*` 与 `_mq-state-pulse`)**：插件已更名为 `dsh-qol`，但设置面板的容器类名依然沿用 `dsh-mq-row`、`dsh-mq-switch`、`dsh-mq-panel`，动画关键帧依然命名为 `_mq-state-pulse`。虽然无功能故障，但在新命名空间下属于坏味道。 | 建议将 DOM 类名与动画帧名称平滑统一为 `dsh-qol-*` / `_qol-state-pulse`，并同步更新 `e2e/integration.mjs` 中的选择器。 |
| REC-03 | `README.md:53-55` 对比 `lib/client.js:27-33` | **插件共存策略文档冲突**：`lib/client.js` 头注释中注明“Coexists with dsh-web-mobile-fix ... union is safe”，而 `README.md` 中写道“两者同时启用时对设置对话框的 !important 规则互相覆盖... 启用本插件时应移除 dsh-web-mobile-fix”。两处对用户的指引相反，容易引起困惑。 | 统一两处表述，明确推荐策略（建议以 README 为准，明确建议卸载旧插件避免样式竞态）。 |

---

## 非阻塞问题

[Nice to have；记录备忘。]

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| NBL-01 | `lib/client.js:49, 111, 939` | **localStorage 存储键更名导致既有配置丢失**：从旧键迁移至 `dsh.qol.v1` 等新键未做兼容读取，老用户升级后自定义开关将恢复为默认开状态。由于项目为 1.0.0 首发且设置项不多，影响有限。 | 可考虑在 `loadConfig` 中增加对旧键的一次性回退读取与迁移逻辑。 |
| NBL-02 | `e2e/integration.mjs:5, 66`<br>`e2e/mobile.mjs:6, 112` | **E2E 脚本中存在过期注释和较弱的断言**：`integration.mjs` 注释中仍提及“移动 QoL”；`mobile.mjs` 注释称“6 attributes”，断言用 `>= 11` 而非精确的 `13`。 | 清理过时注释，将断言统一对齐为 13 个功能。 |

---

## 准入结论

**结论**：`不准入`

**说明**：代码功能实现完整且逻辑清晰，中键关闭与属性总闸架构均满足规范。但因 **E2E 测试文件中包含公网映射实例的真实敏感访问 Token（BLK-01）**，若推送到 GitHub 会造成直接的安全接管漏洞，必须先完成凭据剥离与环境变量化后再予以准入。

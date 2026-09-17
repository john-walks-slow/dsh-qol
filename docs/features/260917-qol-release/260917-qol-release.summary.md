# dsh-qol 发布准备 — 总结

日期：2026-09-17 · 状态：e2e 全绿，待用户实机验证与发布指令

## 交付内容

四项任务（用户 2026-09-17 14:58 提出）：

1. **删除弹窗居中重锚（popover-recenter）**：用户判定无用。移除 FEATURES 注册表条目、CSS 四组规则（hero 重锚、active 态宽度/z-index、backdrop-filter 消解、portal safe-area）、相关注释与 README 行。`docs/issues/260916-mobile-dropdown-position/` 历史记录保留不动。
2. **Tab Bar 鼠标中键关闭**：`.astb-tab` 增加 `onMouseDown`（button===1 preventDefault，抑制浏览器自动滚动光标）+ `onAuxClick`（button===1 → 既有 handleClose）。auxclick 不产生 click 事件，不会误触切换。hint 文案更新。
3. **项目改名 dsh-mobile-qol → dsh-qol**（搜索替换）：
   - 目录 `/root/projects/dsh-mobile-qol` → `/root/projects/dsh-qol`（旧路径留兼容软链至本会话结束）
   - `package.json` name、`cordis.patch.yml`（id: qol / name: 'dsh-qol'，遵循 wait-subagent/whip 的 id 约定）
   - client.js：模块 id、localStorage 三键（dsh.qol.v1 / .opentabs / .settings-tab）、style 标记、日志前缀、设置分区 id/label（"移动 QoL"→"QoL"）
   - e2e 全部引用、README
   - profile：bundles/dependencies + pnpm install；workspace.json 注册项路径与标题
   - **docs/ 历史文档有意不改**（历史记录保留当时的名字）
4. **发布准备**：version 1.0.0、MIT LICENSE（John Walks Slow）、repository/bugs/homepage（github.com/john-walks-slow/dsh-qol）、exports 补 ./cordis.patch.yml、files 补 README+LICENSE、.gitignore、README 重写（13 功能表 + 安装说明 + 状态动画等补齐条目）。

## 验证

- `node --check lib/client.js` 通过。
- Phase-1 mobile **19/19**、desktop **9/9**（4175 真实页面 mock eval；desktop 断言 touch-action 非 manipulation，媒体查询不命中）。
- Phase-2 integration **18/18**（4176 临时实例 `dsh web --patch /tmp/enable-qol.yml`，含中键关闭端到端用例）。
- 顺手修复：e2e 手势用例派发 PointerEvent 但插件监听 Touch Events（历史失效），改为 TouchEvent 派发后对真实 layout 服务验证通过。

## 关键发现与过程记录

- **loader entry 语义**：combo URL 与 `__ModuleLoader__.load` 的 id = 包名（`/plugins/<pkg>/client.js`），cordis.patch.yml 的 `id` 是 loader 行 id、`name` 必须等于包名。
- **e2e 中键用例的三次修正**：① `[role=treeitem]` 混含 `_projectRow`（项目组行）与 `_sessionRow`，需按类名过滤；② 空白 "New Session" 会话在导航离开后被宿主销毁，造双 tab 需两次切换到真实会话；③ 项目组展开状态 `aria-expanded` 不可靠（当前组默认展开也显示 false），用"已尝试名单"跳过点过的组。
- **并发写入方**：profile `package.json` 由 dshmarket/GUI 活跃管理（本次观察到 15:19 的外部改写与 15:23 的外部触发重启）。改 profile 需原子写并复查。
- **15:19 另一会话在用户层禁用了本插件**（`~/.dsh/profiles/web/cordis.patch.yml`: `- id: qol, disabled: true`，注释"2026-09-17: 禁用 dsh-mobile-qol"）。当前线上 4175 实例：新包名已生效但处于禁用态（无 tab bar/移动优化）。线上重新启用需用户决定 + 重启。
- **临时实例启用法**：`dsh web --patch <overlay.yml> --port 4176 --no-open`（--patch 须在 --port 之前；overlay 写 `disabled: false` 覆盖用户层）。
- 4176 临时实例与 4175 共享 ~/.dsh 存储（会话数据互通），e2e 切换会话对线上无副作用；空白会话导航后自动销毁是宿主行为。

## 遗留事项

- 线上是否重新启用 dsh-qol（移除用户层 disable 补丁）+ 重启 4175：待用户决定。
- npm publish / GitHub 建仓推送：待用户指令（本地 git 仓库已就绪）。
- 用户实机验证清单：`260917-qol-release.validation.md`。

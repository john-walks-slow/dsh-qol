# 检视报告

## 概要

本次检视覆盖 `enter-newline`（输入框回车换行不发送）功能的完整改动，包括插件核心逻辑 `lib/client.js`、端到端测试 `e2e/enter-newline.mjs`、功能元数据与文档 `package.json`、`README.md`、`README.en.md` 以及设计规划 `docs/features/260925-enter-newline/260925-enter-newline.plan.md`。实现采用在 `document` capture 阶段精确截断普通 Enter 并派发合成 `Shift+Enter` 借用宿主原生换行链路的方案，设计精巧克制，生命周期与宿主边界处理严密，E2E 覆盖完备，整体质量优秀。

## 需求对齐

变更完全满足需求：
- 开启后输入框内按下普通 Enter 插入换行而非发送；
- Shift+Enter 原生换行逻辑保持放行；
- Ctrl+Enter 与 Cmd+Enter 保持放行，作为开启该功能后的快捷发送途径（在 busy 状态下走宿主原生插话/排队语义）；
- 输入法选词过程（`isComposing` / `keyCode === 229`）与 `@` 触发器菜单打开时（`[data-trigger-menu]`）均正确放行；
- QueueDock 队列编辑框与外部输入控件不误伤；
- 行为反转类功能默认关闭（`default: false`），支持在设置面板即时切换与持久化；
- 与 plan 文档对齐良好，且实际实现采用合成 `Shift+Enter` 方案替代了跨引擎存在兼容性隐患的 `document.execCommand("insertText")`，更为稳健。

## 阻塞问题

无

## 建议修改

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| S01 | `lib/client.js:1105` | 长按 Enter（`e.repeat === true`）时被 guard 直接拦截，导致长按无法连续换行。虽然注释说明是对齐宿主 submit 守卫，但文本编辑场景下用户对 Enter 换行的直觉认知通常与常规文字输入一致（按住连续换行），当前行为会导致长按仅换行一次。 | 建议评估是否允许在 `e.repeat` 时同样触发合成 `Shift+Enter` 派发；或者若有防事件风暴等特定考量，在注释与文档中补充说明该设计取舍。 |

## 非阻塞问题

| ID  | 位置 | 问题 | 建议 |
| --- | ---- | ---- | ---- |
| N01 | `docs/features/260925-enter-newline/260925-enter-newline.plan.md:32` | 设计文档方案章节中仍保留了早期 `document.execCommand("insertText", false, "\n")` 的描述，与最终落地使用的“合成 Shift+Enter”实现存在微小脱节。 | 建议将 plan 文档方案中的动作描述更新为合成 Shift+Enter，保持文档与实际代码的一致性。 |
| N02 | `lib/client.js:1109` | 合成 KeyboardEvent 目前仅传递了 `{ key: "Enter", shiftKey: true, bubbles: true, cancelable: true }`，未显式附带 `code: "Enter"`。 | 虽然当前 Lexical 与浏览器环境主要依赖 `key`，但补充 `code: "Enter"` 可以提高合成事件的结构完整性与防御性。 |

## 准入结论

**结论**：`条件准入`

**说明**：无任何阻塞问题，架构设计与实现均十分扎实可靠，E2E 测试与规范完全合规。仅存在一项关于实体键盘长按 Enter 是否允许连续换行的体验建议（S01），可在合并前确认或在后续迭代中根据用户反馈决定。

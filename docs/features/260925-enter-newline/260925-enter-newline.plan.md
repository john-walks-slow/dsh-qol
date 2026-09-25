# enter-newline — 输入框回车换行不发送

日期：2026-09-25
状态：实施中

## 需求

输入框内按 Enter 插入换行，而不是发送消息。用户在手机上写多行内容（列表、代码片段）时，Enter 误触发送是高频痛点。

## 宿主行为调研（dsh-client-ui-conversation）

宿主 composer 是 Lexical contenteditable（`[data-composer-card]` 内，`[data-input-scroll]` 容器中）。按键链路：

1. Lexical 在 root element（bubble 阶段）监听 keydown，把无 Shift 的 Enter 转成 `ENTER_COMMAND`（`isInsertLineBreak=false`），把 Shift+Enter 转成 `ENTER_COMMAND`（`isInsertLineBreak=true`）。
2. 宿主 `registerComposerKeymap` 注册 `ENTER_COMMAND` 处理器（priority 4）：
   - `shiftKey === true` → `return false`（Lexical 默认 insertLineBreak，即换行）；
   - composing（`isComposing || keyCode===229 || recentlyComposing`）→ `return true`（IME 自己处理）；
   - `arbitrate("enter")` 非 `pass`（@ 触发器菜单开着且有高亮项）→ preventDefault，菜单选中；
   - 否则 preventDefault，`repeat` 忽略，`canSubmit()` 通过则 `submit(ctrl||meta)` —— **Enter/Ctrl+Enter/Cmd+Enter 都发送**，Ctrl/Cmd 版本在 busy 会话走另一 busyEnter 行为。
3. composing 期间 Lexical 的 root keydown handler 直接 return，不 dispatch 任何 command。
4. `@` 菜单（input-trigger）open 时渲染 `[data-trigger-menu]` 元素（挂在 composer card 内），close 时 unmount（`if (!state.open) return null`）。
5. `conversation.input.dock`（QueueDock）在 composer card **外部**；card 内无其他文本输入元素；hero 工作区选择卡的 contenteditable 为 `false`。
6. Lexical beforeinput handler 明确支持换行插入：`insertText`+`data="\n"` 与 `insertLineBreak` 两个 inputType 都 dispatch `INSERT_LINE_BREAK_COMMAND`。

## 方案

新 feature `enter-newline`（组：输入与键盘，默认**关**——行为反转类功能由用户主动开启）。

document **capture 阶段** keydown 常驻监听（事件时 `isOn()` 懒检查，模式同 no-touch-drag）：

- 命中条件：`key==="Enter"`、无任何修饰键、非 composing（`isComposing || keyCode===229` 放行）、target 自身 `isContentEditable` 且 `closest("[data-composer-card]")`、`[data-trigger-menu]` 不存在。
- 动作：`preventDefault()` + `stopPropagation()`（在 Lexical root listener 之前截断 → ENTER_COMMAND 不派发 → 不发送），随后派发合成 `Shift+Enter` keydown（`{key:"Enter", code:"Enter", shiftKey:true, bubbles, cancelable}`）—— 借宿主自己的换行路径（Lexical keymap → ENTER_COMMAND(shiftKey) → Lexical insertLineBreak 默认），撤销栈与编辑器状态天然一致。
  - 实施变更：最初方案是 `execCommand("insertText", "\n")` 走 beforeinput，但 Firefox 从未实现该命令（e2e 实证：插入无效果），改为合成 Shift+Enter 方案，任何宿主能跑换行的引擎都成立。
- `repeat`（按住）时同样插入换行——文本编辑直觉是按住连续换行；宿主的 repeat 守卫防的是重复**提交**（破坏性动作），换行不是。合成事件不带 repeat 标记，每次都被 Lexical 处理。

各场景语义：

| 输入 | 功能关（宿主原生） | 功能开 |
|---|---|---|
| Enter | 发送 | **换行** |
| Shift+Enter | 换行 | 换行（放行，宿主原生） |
| Ctrl/Cmd+Enter | 发送（busy 时走另一行为） | 同左（放行，**这是开启后的发送途径**） |
| 发送按钮 | 发送 | 发送（不受影响） |
| IME composition 中的 Enter | IME 确认候选 | 同左（放行） |
| @ 菜单开着时 Enter | 选中高亮菜单项 | 同左（放行，宿主仲裁） |
| 队列编辑框 Enter | 保存编辑 | 同左（在 card 外，不命中） |

## 已否决的备选

- 注册更高优先级的 Lexical `ENTER_COMMAND` 处理器：需复刻宿主闭包内的 `recentlyComposing` 窗口（拿不到），且菜单仲裁在宿主处理器内、无法保持原序。
- capture 阶段改写 `event.shiftKey = true` 冒充 Shift+Enter：依赖宿主 keymap 对 shiftKey 的防御性分支 + defineProperty 覆盖只读属性，脆。

## 验证

- e2e（`e2e/enter-newline.mjs`，run-guard 接入）：真实插件配置驱动——开启后 Enter/Shift+Enter 换行且不发送、关闭后 Enter 发送、开关持久化。
- 用户真机 validation：真键盘 IME（中文输入法确认候选）、@ 菜单 Enter 选项、Ctrl+Enter 发送、busy 会话 Ctrl+Enter 插话。

# enter-newline — 输入框回车换行不发送

日期：2026-09-25
状态：已实施，e2e 27/27 绿，reviewer 条件准入，待用户真机验证

## 背景

输入框内按 Enter 直接发送，手机上写多行内容（列表、代码片段）时误触发送是高频痛点。

## 实现

新 feature `enter-newline`（设置 → QoL → 输入与键盘，**默认关**）。完整设计与宿主链路调研见 [plan](./260925-enter-newline.plan.md)。

核心：document capture 阶段 keydown 常驻监听（懒检查 `html[data-qol-enter-newline]`）。仅在「宿主语义 = 提交」的精确条件下拦截——无修饰键、非 IME composition（`isComposing || keyCode===229`）、target 是 composer card 内的 contenteditable、无打开的 `[data-trigger-menu]`——然后 `preventDefault + stopPropagation`（在 Lexical root listener 之前截断，ENTER_COMMAND 不派发、不发送），并派发合成 `Shift+Enter` 借宿主自己的换行路径插入换行（Lexical keymap → insertLineBreak，撤销栈一致）。

开启后的完整语义：

| 输入 | 行为 |
|---|---|
| Enter | 换行（按住连续换行） |
| Shift+Enter | 换行（宿主原生，未拦截） |
| Ctrl/⌘+Enter | 发送（busy 时插话/排队，宿主原生） |
| 发送按钮 | 发送（不受影响） |
| IME 选词 Enter / @ 菜单 Enter | 放行（宿主/输入法处理） |

## 实施中的关键发现

1. **Firefox 未实现 `execCommand("insertText")`**：最初换行插入走该 API，e2e 实证在 Firefox (Camoufox) 上静默无效；改为派发合成 Shift+Enter，借宿主换行路径，任何宿主能跑换行的引擎都成立。
2. **e2e 时序**：Lexical DOM reconcile 异步，dispatch 后同步读 `innerText` 读到旧值，需等一拍；段落**末尾** line break 渲染双 `<br>`（contenteditable 标准 hack），`innerText` 出 `\n\n` 但模型层单 `\n`——与宿主 Shift+Enter 行为一致。
3. **宿主层会丢弃 composing keydown**（modal 层），e2e 中合成 IME 事件到不了 editable——断言"我的 handler 放行"以 `defaultPrevented === false` 为准，事件是否到达 editable 是宿主行为。
4. **e2e 实例等待**：固定 6s 等待在实例忙（agent turn 在跑）时不够，改为轮询 `style[data-plugin-css="dsh-qol"]`；且实例刚重启时首屏可能在 hero 页，开新会话前先等 `[data-composer-card]` 渲染。

## Review 结论

条件准入（[review](./260925-enter-newline.review.md)）。三项均已处理：
- S01：长按 Enter 改为连续换行（文本编辑直觉；宿主 repeat 守卫防的是重复提交）
- N01：plan 文档同步合成 Shift+Enter 方案
- N02：合成事件补 `code: "Enter"`

## 文件

- `lib/client.js`：FEATURES 条目 + `installEnterNewline()` + apply 注册
- `e2e/enter-newline.mjs`：真实插件配置驱动 e2e（27 断言，run-guard 接入）
- `README.md` / `README.en.md`：功能表格；`package.json`：计数 15→16

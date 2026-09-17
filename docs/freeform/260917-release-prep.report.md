# dsh-qol 发布准备报告（260917）

执行者：子代理 · 日期：2026-09-17 · 铁律遵守：未 git add/commit、未改 lib/ 行为、未发布、version 保持 1.0.0

## 一、隐私/密钥扫描（git ls-files 范围）

扫描模式：密钥/token/密码、`/root/`、`/home/`、`<dsh-host>`、机器特定配置（设备型号/SoC）、真实个人信息；另查了 git 全历史。

### 已处置（文档类 → 通用占位，工作树已改）

| 位置 | 原文（摘要） | 处置 |
|---|---|---|
| docs/features/260917-qol-release/260917-qol-release.review.md:23 | 部分 token 片段 `<redacted>...` + 私人域名 `<dsh-host>` | 替换为「token 片段已脱敏 / 域名已脱敏」 |
| docs/features/260917-qol-release/260917-qol-release.summary.md:32 | `<dsh-host>` | 「公网，域名已脱敏」 |
| docs/features/260917-qol-release/260917-qol-release.summary.md:12 | `/root/projects/dsh-mobile-qol → /root/projects/dsh-qol` | 「项目目录 dsh-mobile-qol → dsh-qol」 |
| docs/features/260917-qol-release/260917-qol-release.summary.md:63 | `共享 /root/.dsh 会 seq 对撞` | 「共享同一 DSH_HOME」 |
| docs/features/260915-mobile-qol/260915-mobile-qol.summary.md:7,32,34,42,44 | `/root/projects/dsh-mobile-qol`、`/root/.dsh/profiles/web/package.json` | `<插件项目目录>`、`~/.dsh/...` |
| docs/features/260915-mobile-qol/260915-mobile-qol.plan.md:30,395,396 | `/root/projects/...`、`/root/.cache/camoufox/...`、`/var/log/dsh.log` | `~/...`、「camoufox 缓存目录」、「dsh 服务日志」 |
| docs/issues/260916-dsh-web-frontend-perf/260916-dsh-web-frontend-perf.troubleshoot.md:4,6,84 | 红米 K30S Ultra（骁龙865, 8GB）、`/usr/lib/node_modules/...`、骁龙865 ARM64 | 「ARM64 移动设备」「@deepseek-ai/dsh 主包内嵌 node_modules」「ARM64 移动 SoC」 |

### 仅报告（代码类，按指令不改）

| 位置 | 摘录 | 说明 |
|---|---|---|
| e2e/integration.mjs:11,13 | `import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js'`、`const CHROMIUM = '/root/.cache/camoufox/camoufox-bin'` | 本机绝对路径（机器特定配置）；e2e 仅开发用、不进 npm files。建议后续参数化（环境变量） |
| e2e/mobile.mjs:18,21,33 | 同上 + `fs.readFileSync('/root/projects/dsh-qol/lib/client.js')` | 同上 |
| e2e/test-settings-features.mjs:1,3 / e2e/verify-permission.mjs:3,5 / e2e/verify-real.mjs:5,7 | 同上 | 同上 |

### Git 历史警告（推送 GitHub 前必须处理）

- **全历史 6 个 commit（含首个 release commit）的 review/summary 文档都含** `<dsh-host>` + 截断 token 片段 `<redacted>...`。工作树脱敏后历史仍在。
- **好消息**：完整 token 从未入库——首个 commit 起 e2e 就用 `DSH_E2E_TOKEN_*` 环境变量（已逐 commit 验证）。
- 处置建议（二选一）：① squash 成单个干净初始 commit 再 push（仓库无 remote，最简单）；② `git filter-repo` 按字符串改写历史。此操作涉及 git 历史改写，超出本任务权限，留给主会话决定。

### 干净项确认

lib/client.js、lib/index.js 无 URL/路径/密钥；LICENSE 署名 "John Walks Slow"（公开笔名，有意）；package.json 的 john-walks-slow 仓库 URL 与 `author: "johnnren"` 均为发布元数据（非泄漏）。

## 二、改动文件清单

| 文件 | 改动 |
|---|---|
| README.md | 重写至发布规格：居中语言切换、一行价值、`dsh plugin --profile web add dsh-qol` 安装命令、13 功能表（逐条对 FEATURES 注册表核实）、使用说明 + localStorage 真实输出样例、权限与兼容（纯客户端/零依赖/零网络/配置不出浏览器/≤768px/降级不阻断/与 mobile-fix 共存/实测基线）、工作原理、本地开发 |
| README.en.md | 新建，忠实英文版 |
| package.json | description 改英中双语一段（EN 前 CN 后）；keywords 补中文 6 词（共 16）；author: "johnnren"；scripts 补 `build`（node --check 两份产物）+ `prepare`；homepage/bugs 已有未动；files 核对无误；version 保持 1.0.0。**未加 prepublishOnly**（无 test 脚本，任务条件不满足）。JSON 已验证合法 |
| docs/freeform/260917-awesome-entry-draft.yml | 新建 awesome 投稿草稿：category `ui`（按 contributing.md 22 个分类表选，Web 界面优化最贴合；session 是会话管理类）；双语 keyword 密集描述（tab bar/标签页、sidebar/侧栏、IME/输入法、touch/触摸、settings/设置页、toggle/开关、localStorage、≤768px）；全部表述对代码核实；含 ": " 已加单引号，yaml.safe_load 解析通过 |
| docs/features/…（4 个 md）+ docs/issues/…（1 个 md） | 见上表脱敏改动 |
| package-lock.json | npm install 生成（零依赖 lockfile），untracked，随主会话决定是否入库 |

## 三、构建/测试结果

- `npm install` ✅（零依赖，931ms）
- `npm run build` ✅（`node --check lib/index.js && node --check lib/client.js` 双绿）
- `npm test` ❌ 不存在（本仓库无单元测试；e2e 需运行中 dsh 实例 + 环境变量 token，不可作 publish 门禁）——按任务条件未加 prepublishOnly，README 已如实注明
- `npm pack --dry-run` ✅：7 文件（README.md/LICENSE/cordis.patch.yml/lib×2/package.json/package-lock.json），与 files/main/exports 完全一致，28.6 kB
- build 语义说明：lib/ 是手写源码即发布产物（非 tsc 构建），`build` 定位为发布前语法校验闸（呼应 dev-dsh-plugin「node --check lib/client.js」防线）；git 直装需 allowBuilds 放行 prepare（README 已注明）

## 四、插件功能概括

dsh-qol 是面向 DeepSeek Harness Web GUI 的移动优先体验优化插件：Chrome 式活跃会话 Tab Bar、全屏侧栏滑动开合、切换会话不拉键盘、viewport/键盘安全区适配、触摸反馈、设置页全屏重写等 13 项功能。纯客户端 CSS/JS（host apply 为空、零 npm 依赖、无网络无文件写入），每项功能在「设置 → QoL」独立开关，经 html[data-qol-*] 属性总闸即时生效并按浏览器持久保存在 localStorage。

## 五、后续动作清单（主会话）

1. push 前处理 git 历史（squash 或 filter-repo，见上）
2. 建仓 GitHub john-walks-slow/dsh-qol → push → `gh repo edit --add-topic dsh-plugin`（可加 deepseek-harness、ai-agent、mobile、ui）
3. npm 发布走 npm-publish 技能（pack 后指纹发布；repository 已回指仓库）
4. 2026-09-18 起提 awesome PR：data/plugins/john-walks-slow__dsh-qol.yml（内容即 docs/freeform/260917-awesome-entry-draft.yml）

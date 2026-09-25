// GUI 驱动型 e2e 的 run 级互斥——结构性防护，不依赖调用方记得套 flock。
//
// 用法（脚本最顶部，先于任何浏览器/实例操作）：
//   import { guard } from './lib/run-guard.mjs';
//   await guard();
//
// 行为：
//   - 由 dsh-e2e run 包裹时（DSH_E2E_RUN_GUARD=1，已持锁）直接放行；
//   - 裸跑（node e2e/x.mjs）时 self-reexec under flock——拿到 /tmp/dsh-e2e-run.lock
//     才在持锁子进程里执行真正逻辑，退出码透传；
//   - 锁为 flock 内核级，持有进程死亡即释放，无陈旧锁问题。
// 可调环境变量：DSH_E2E_RUN_LOCK（锁路径）、DSH_E2E_RUN_WAIT（等待上限秒数，默认 900）。
const waitRaw = Number(process.env.DSH_E2E_RUN_WAIT);
const LOCK = process.env.DSH_E2E_RUN_LOCK || '/tmp/dsh-e2e-run.lock';
const INFO = process.env.DSH_E2E_RUN_INFO || '/tmp/dsh-e2e-run.owner.json';
const WAIT = Number.isFinite(waitRaw) ? waitRaw : 900;

export async function guard() {
  if (process.env.DSH_E2E_RUN_GUARD) {
    // 本进程就是持锁执行体（dsh-e2e run 子进程 / guard re-exec 子进程）：
    // 写 owner 记录便于排队超时者定位持有者，退出时清理（被 kill -9 时留残档，无害）。
    const { writeFileSync, rmSync } = await import('node:fs');
    writeFileSync(INFO, JSON.stringify({
      owner: process.env.DSH_AGENT || `${process.env.USER || 'unknown'}@run-guard`,
      pid: String(process.pid),
      cmd: process.argv.slice(1).join(' '),
      started: new Date().toLocaleString('sv-SE', { hour12: false }),
    }));
    process.on('exit', () => { try { rmSync(INFO); } catch {} });
    return;
  }
  const { spawnSync } = await import('node:child_process');
  console.log(`[run-guard] 裸跑未持锁，self-reexec under flock ${LOCK}（等待上限 ${WAIT}s）`);
  const r = spawnSync('flock', ['-w', String(WAIT), LOCK, process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, DSH_E2E_RUN_GUARD: '1' },
  });
  if (r.error) {
    console.error(`[run-guard] flock 启动失败: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[run-guard] run 锁获取失败（exit=${r.status ?? 'signal'}）——另一 GUI e2e 正在跑；调等待: DSH_E2E_RUN_WAIT=N`);
  }
  process.exit(r.status ?? 1);
}

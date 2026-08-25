/**
 * Run Registry — 本地录制运行的进程内句柄表
 *
 * 供双通道（HTTP controller / WS relay）路由 abort 与 takeover 结果：
 *   - local runner 启动时 registerLocalRun(runId, handle)，结束时 unregisterLocalRun(runId)
 *   - deleteRun 通过 handle.abort() 中止本地会话（避免向无关 agent 广播 STOP）
 *   - AI_RECORDER_TAKEOVER_COMPLETE 通过 handle.resolveTakeover(true) 唤醒等待 takeover 的本地会话
 */

export interface LocalRunHandle {
  abort(): void;
  resolveTakeover(result: boolean): void;
}

const registry = new Map<string, LocalRunHandle>();

export function registerLocalRun(runId: string, handle: LocalRunHandle): void {
  registry.set(runId, handle);
}

export function unregisterLocalRun(runId: string): void {
  registry.delete(runId);
}

export function getLocalRunHandle(runId: string | undefined): LocalRunHandle | undefined {
  if (!runId) return undefined;
  return registry.get(runId);
}

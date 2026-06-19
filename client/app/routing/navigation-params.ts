/**
 * 跨 Tab 导航参数暂存
 *
 * 用于在 Tab 切换时传递一次性参数（如 NlCasesPage → AI Recorder 的预选 NlCase ID）。
 * 消费后自动清空，避免残留。
 */

let pendingRecorderNlCaseId: string | null = null;

export function setPendingRecorderNlCaseId(id: string | null): void {
  pendingRecorderNlCaseId = id;
}

export function consumePendingRecorderNlCaseId(): string | null {
  const id = pendingRecorderNlCaseId;
  pendingRecorderNlCaseId = null;
  return id;
}

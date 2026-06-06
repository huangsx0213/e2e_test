import { Router } from 'express';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { TestGenController } from './controller.ts';
import { startPipelineSchema, resumePipelineSchema, checkpointUpdateSchema } from './schema.ts';

const router = Router();
const controller = new TestGenController();

function p(param: string | string[]): string {
  return typeof param === 'string' ? param : param[0];
}

// ============================================================
// 查询接口
// ============================================================

// 运行历史列表
router.get('/runs/:projectId', withErrorHandling((req, res) => {
  res.json(controller.listRuns(p(req.params.projectId)));
}));

// 检查活跃运行
router.get('/active/:projectId', withErrorHandling((req, res) => {
  res.json(controller.getActiveRun(p(req.params.projectId)));
}));

// 运行详情
router.get('/:runId', withErrorHandling((req, res) => {
  const run = controller.getRun(p(req.params.runId));
  if (!run) { res.status(404).json({ error: 'Test gen run not found' }); return; }
  res.json(run);
}));

// 运行信息
router.get('/:runId/info', withErrorHandling((req, res) => {
  const info = controller.getRunInfo(p(req.params.runId));
  if (!info) { res.status(404).json({ error: 'Test gen run not found' }); return; }
  res.json(info);
}));

// agent 日志
router.get('/:runId/logs', withErrorHandling((req, res) => {
  const { agent } = req.query;
  res.json(controller.getLogs(p(req.params.runId), agent as string | undefined));
}));

// 审核日志
router.get('/:runId/audit', withErrorHandling((req, res) => {
  res.json(controller.getAuditLogs(p(req.params.runId)));
}));

// checkpoint 数据
router.get('/:runId/checkpoint', withErrorHandling(async (req, res) => {
  const state = await controller.getCheckpointState(p(req.params.runId));
  res.json(state ?? null);
}));

// checkpoint 状态
router.get('/:runId/checkpoint-state', withErrorHandling(async (req, res) => {
  const state = await controller.getCheckpointState(p(req.params.runId));
  res.json(state ?? null);
}));

// SSE 流
router.get('/:runId/stream', (req, res) => {
  controller.sseGateway.attachStream(p(req.params.runId), res);
});

// ============================================================
// 操作接口
// ============================================================

// 启动流水线
router.post('/:projectId/start', withErrorHandling(async (req, res) => {
  const result = await controller.startPipeline(p(req.params.projectId), req.body);
  res.status(201).json(result);
}));

// 审核通过/重试
router.post('/:runId/resume', withErrorHandling((req, res) => {
  const result = controller.resumeRun(p(req.params.runId), req.body);
  res.json(result);
}));

// 从失败的 agent 重试
router.post('/:runId/retry', withErrorHandling(async (req, res) => {
  const result = await controller.retryRun(p(req.params.runId));
  res.json(result);
}));

// 中止
router.post('/:runId/abort', withErrorHandling((req, res) => {
  const result = controller.abortRun(p(req.params.runId));
  res.json(result);
}));

// 保存 checkpoint 编辑
router.post('/:runId/checkpoint-update', withErrorHandling(async (req, res) => {
  const result = await controller.saveCheckpointEdits(p(req.params.runId), req.body);
  res.json(result);
}));

// 保存用例到项目
router.post('/:runId/save-cases', withErrorHandling((req, res) => {
  const result = controller.saveCases(p(req.params.runId));
  res.json(result);
}));

// 删除
router.delete('/:runId', withErrorHandling((req, res) => {
  const result = controller.deleteRun(p(req.params.runId));
  res.json(result);
}));

export const recoverInterruptedTestGenRuns = () => controller.recoverInterruptedRuns();

export const aiTestGenModule = { basePath: '/api/test-gen', router };

export default router;
/**
 * AI-Driven Recorder Module
 *
 * 独立模块，basePath: /api/ai-driven-recorder
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §8
 */

import { Router } from 'express';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { AiDrivenRecorderController } from './controller.ts';
import { AiDrivenRecorderRepository } from './repository.ts';
import { createAiRecorderSseGateway, registerAiRecorderWsRelay } from './ws-relay.ts';

const router = Router();

// 模块单例：SSEGateway + Repository + Controller
const sseGateway = createAiRecorderSseGateway();
const repository = new AiDrivenRecorderRepository();
const controller = new AiDrivenRecorderController(sseGateway, repository);

// 注册 WS Relay（监听 globalEventBus 的 RECORDING_EVENT）
registerAiRecorderWsRelay({ sseGateway, repository });

function p(param: string | string[]): string {
  return typeof param === 'string' ? param : param[0];
}

// ============================================================
// 查询接口
// ============================================================

// 列出项目的所有 AI 录制 run
router.get('/:projectId/runs', withErrorHandling((req, res) => {
  res.json(controller.listRuns(p(req.params.projectId)));
}));

// 查询 run 状态
router.get('/:projectId/runs/:runId', withErrorHandling((req, res) => {
  const status = controller.getRun(p(req.params.projectId), p(req.params.runId));
  res.json(status);
}));

// SSE 流
router.get('/:projectId/runs/:runId/stream', (req, res) => {
  sseGateway.attachStream(p(req.params.runId), res);
});

// ============================================================
// 操作接口
// ============================================================

// 启动 AI 录制 run
router.post('/:projectId/runs', withErrorHandling((req, res) => {
  const result = controller.startRun(p(req.params.projectId), req.body);
  res.status(201).json(result);
}));

// 中止并删除 run
router.delete('/:projectId/runs/:runId', withErrorHandling((req, res) => {
  const result = controller.deleteRun(p(req.params.projectId), p(req.params.runId));
  res.json(result);
}));

export const aiDrivenRecorderModule = { basePath: '/api/ai-driven-recorder', router };

export default router;

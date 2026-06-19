/**
 * WS Relay — Agent ↔ Server ↔ Client 事件路由
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §2 (Pipeline) 和 §1.2 (职责边界)
 *
 * 职责：
 *   1. 监听 globalEventBus 上的 RECORDING_EVENT（来自 Agent）
 *   2. 路由 AI 录制相关事件：
 *      - step-recorded / element-recorded → 由现有 registerRecordingWsHandlers() 处理（不重复）
 *      - step:start / step:observe / step:complete / step:failed / step:takeover → SSEGateway.emit
 *      - AI_RECORDER_COMPLETE → 保存 draft suite + 更新 run 状态 + SSEGateway.emit('run:complete')
 *      - AI_RECORDER_PROVIDER_CONFIG_REQUEST → 查询 DB 解密 config + 通过 WS 回传 RESPONSE
 *   3. 不重复调用 RecordingService（step-recorded/element-recorded 已由 ws-handlers.ts 处理）
 *
 * 注意：本模块只做事件路由和 DB 更新，不运行 Refiner、不调 LLM、不碰浏览器。
 */

import type { WebSocket } from 'ws';
import { globalEventBus } from '../../shared/services/eventBus.ts';
import { wsService } from '../../shared/services/websocketService.ts';
import { SSEGateway } from '../ai-test-gen/sse-gateway.ts';
import { AiDrivenRecorderRepository } from './repository.ts';
import { saveDraftSuite } from './draft-suite-saver.ts';
import { saveSuite } from '../suites/repository.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';
import type { TestSuite, TestCase } from '../../../shared/contracts/index.ts';
import {
  AI_RECORDER_COMPLETE_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT,
} from '../../../shared/recording/protocol.ts';

/**
 * ReplayReport 的最小化类型（与 agent/recorder/ai-recording-session.ts 对齐）。
 * Server 端只持久化 JSON，不解析其内部结构，因此用 unknown 兼容。
 */
type ReplayReport = unknown;

/** AI 录制专用 SSE 事件（用于 SSEGateway cleanup 配置） */
export const AI_RECORDER_SSE_CLEANUP_EVENTS = ['run:complete', 'run:error'];

/** AI 录制 SSE 事件名 */
export type AiRecorderSseEvent =
  | 'run:start'
  | 'step:start'
  | 'step:observe'
  | 'step:complete'
  | 'step:failed'
  | 'step:takeover'
  | 'recorder:fallback'
  | 'run:complete'
  | 'run:error';

/**
 * 创建 AI 录制专用的 SSEGateway 实例。
 * cleanup 事件为 run:complete / run:error。
 */
export function createAiRecorderSseGateway(): SSEGateway {
  return new SSEGateway({
    cleanupEvents: AI_RECORDER_SSE_CLEANUP_EVENTS,
    checkpointEvent: null, // AI 录制无 checkpoint 机制
  });
}

/**
 * WS Relay 上下文：依赖注入，便于测试。
 */
export interface WsRelayContext {
  sseGateway: SSEGateway;
  repository: AiDrivenRecorderRepository;
  /** 发送 WS 消息到指定 agent（默认用 wsService.broadcast，因为 Agent 是唯一的 WS 客户端） */
  sendToAgent?: (event: string, data: unknown) => void;
}

/**
 * 注册 AI 录制 WS Relay 处理器。
 *
 * 必须在 registerRecordingWsHandlers() 之后注册，
 * 因为后者处理 step-recorded/element-recorded（本 relay 不重复处理）。
 */
export function registerAiRecorderWsRelay(ctx: WsRelayContext): void {
  const { sseGateway, repository } = ctx;
  const sendToAgent = ctx.sendToAgent ?? ((event: string, data: unknown) => {
    wsService.broadcast(event, data);
  });

  globalEventBus.on('RECORDING_EVENT', (data: any, _ws: WebSocket) => {
    const envelope = data as { event: string; data: any };
    if (!envelope?.event) return;

    const innerData = envelope.data || {};
    const runId: string | undefined = innerData.runId;

    switch (envelope.event) {
      // === step-recorded / element-recorded 由 ws-handlers.ts 处理，此处不重复 ===
      case 'step-recorded':
      case 'element-recorded':
      case 'api-recorded':
        return;

      // === SSE 进度事件 ===
      case 'step:start':
      case 'step:observe':
      case 'step:failed':
      case 'step:takeover':
      case 'recorder:fallback':
        if (runId) {
          sseGateway.emit(runId, envelope.event, innerData);
        }
        return;

      case 'step:complete':
        if (runId) {
          // 更新 step_log（如果需要）+ SSE 广播
          sseGateway.emit(runId, 'step:complete', innerData);
        }
        return;

      // === Run 完成：保存 draft suite + 更新 DB + SSE 广播 ===
      case AI_RECORDER_COMPLETE_EVENT: {
        if (!runId) return;
        handleAiRecorderComplete(runId, innerData, sseGateway, repository);
        return;
      }

      // === Provider Config 请求：查询 DB + WS 回传 ===
      case AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT: {
        handleProviderConfigRequest(innerData, sendToAgent, repository);
        return;
      }

      default:
        return;
    }
  });
}

/**
 * 处理 AI_RECORDER_COMPLETE 事件：
 *   1. 保存 draft suite（如果 result 中包含 refinedSteps）
 *   2. 更新 run 状态为 completed + 写入 replayReport
 *   3. SSE 广播 run:complete
 */
function handleAiRecorderComplete(
  runId: string,
  data: {
    result?: {
      refinedSteps?: any[];
      replayReport?: ReplayReport;
    };
    error?: string;
    caseId?: string;
    suiteId?: string;
    projectId?: string;
  },
  sseGateway: SSEGateway,
  repository: AiDrivenRecorderRepository,
): void {
  const run = repository.getRun(runId);
  if (!run) {
    console.warn(`[WS_RELAY] AI_RECORDER_COMPLETE for unknown run: ${runId}`);
    return;
  }

  // 错误路径
  if (data.error) {
    repository.updateRunStatus(runId, 'failed', data.error);
    sseGateway.emit(runId, 'run:error', { runId, error: data.error });
    return;
  }

  const result = data.result || {};
  const replayReport = result.replayReport;

  // 保存 draft suite（如果 Agent 已预分配 suiteId/caseId，则更新 existing suite；否则创建新的）
  let suiteId = data.suiteId || run.result_suite_id || '';
  let caseId = data.caseId || run.result_case_id || '';

  if (result.refinedSteps && result.refinedSteps.length > 0) {
    if (suiteId) {
      // 预分配路径：更新已有的 suite/case 为 refined steps
      const nlCase = nlCaseRepo.get(run.nl_case_id);
      const caseTitle = nlCase?.title ?? `AI Recorded Case (${run.nl_case_id})`;
      const testCase: TestCase = {
        id: caseId,
        name: caseTitle,
        description: `AI 驱动录制生成，关联 NlCase: ${run.nl_case_id}`,
        steps: result.refinedSteps,
      };
      const suite: TestSuite = {
        id: suiteId,
        projectId: run.project_id,
        name: `[AI Draft] ${caseTitle}`,
        description: `AI 驱动录制生成的草稿套件，来源 NlCase: ${run.nl_case_id}`,
        cases: [testCase],
        position: 0,
      };
      saveSuite(suite);
      if (nlCase) {
        nlCaseRepo.save({ ...nlCase, generatedSuiteId: suiteId });
      }
    } else {
      // 兜底：创建新的 draft suite
      const saved = saveDraftSuite(run.project_id, run.nl_case_id, {
        steps: result.refinedSteps,
      });
      suiteId = saved.suiteId;
      caseId = saved.caseId;
    }
  }

  // 更新 DB
  repository.updateRunResult(runId, {
    suiteId: suiteId || undefined,
    caseId: caseId || undefined,
    replayReport,
  });
  repository.updateRunStatus(runId, 'completed');

  // SSE 广播
  sseGateway.emit(runId, 'run:complete', {
    runId,
    suiteId,
    caseId,
    replayReport,
    durationMs: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
  });
}

/**
 * 处理 AI_RECORDER_PROVIDER_CONFIG_REQUEST：
 *   1. 从 DB 查询并解密 providerConfig
 *   2. 通过 WS 回传 AI_RECORDER_PROVIDER_CONFIG_RESPONSE
 */
function handleProviderConfigRequest(
  data: { runId?: string; providerConfigId?: string },
  sendToAgent: (event: string, data: unknown) => void,
  repository: AiDrivenRecorderRepository,
): void {
  const { runId, providerConfigId } = data;
  if (!runId || !providerConfigId) {
    console.warn('[WS_RELAY] PROVIDER_CONFIG_REQUEST missing runId or providerConfigId');
    return;
  }

  const config = repository.getDecryptedProviderConfig(providerConfigId);
  if (!config) {
    sendToAgent(AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT, {
      runId,
      providerConfigId,
      error: 'Provider config not found',
    });
    return;
  }

  sendToAgent(AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT, {
    runId,
    providerConfigId,
    providerConfig: config,
  });
}

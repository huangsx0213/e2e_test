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
 *      - AI_RECORDER_TAKEOVER_COMPLETE → wsService.broadcast 转发给 Agent（ws-handlers 仅投递给浏览器）
 *   3. 不重复调用 RecordingService（step-recorded/element-recorded 已由 ws-handlers.ts 处理）
 *
 * 注意：本模块只做事件路由和 DB 更新，不运行 Refiner、不调 LLM、不碰浏览器。
 */

import type { WebSocket } from 'ws';
import { globalEventBus } from '../../shared/services/eventBus.ts';
import { wsService } from '../../shared/services/websocketService.ts';
import { Log } from '../../shared/services/logger';
import { SSEGateway } from '../ai-test-gen/sse-gateway.ts';
import { AiDrivenRecorderRepository } from './repository.ts';
import { persistStepLog } from './step-log-persistence.ts';
import { finalizeRunCompletion, finalizeRunFailure } from './finalize-run.ts';
import { getLocalRunHandle } from './run-registry.ts';
import {
  AI_RECORDER_COMPLETE_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT,
  AI_RECORDER_TAKEOVER_COMPLETE_EVENT,
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
      case 'step:takeover':
      case 'recorder:fallback':
        if (runId) {
          sseGateway.emit(runId, envelope.event, innerData);
        }
        return;

      case 'step:failed':
        if (runId) {
          // 终态：持久化步骤日志（含时间线与错误），再 SSE 广播
          try {
            persistStepLog({
              runId,
              nlStepIndex: Number(innerData.nlStepIndex),
              instruction: innerData.instruction,
              expected: innerData.expected,
              success: false,
              error: innerData.error,
              retryCount: innerData.retryCount,
              logs: innerData.logs,
            });
          } catch (persistErr: any) {
            Log.for('ws-relay').warn(`step log persist failed: ${persistErr?.message}`);
          }
          sseGateway.emit(runId, 'step:failed', innerData);
        }
        return;

      case 'step:complete':
        if (runId) {
          // 终态：持久化步骤日志（含时间线与验证警告），再 SSE 广播
          try {
            persistStepLog({
              runId,
              nlStepIndex: Number(innerData.nlStepIndex),
              instruction: innerData.instruction,
              expected: innerData.expected,
              success: true,
              recordedStepCount: innerData.recordedStepCount,
              durationMs: innerData.durationMs,
              verificationWarning: innerData.verificationWarning,
              logs: innerData.logs,
            });
          } catch (persistErr: any) {
            Log.for('ws-relay').warn(`step log persist failed: ${persistErr?.message}`);
          }
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

      // === Takeover 完成：ws-handlers 仅投递给订阅 project 的浏览器，Agent 收不到，
      //     因此仿照 AI_RECORDER_STOP（controller.ts）用 wsService.broadcast 全量转发 ===
      case AI_RECORDER_TAKEOVER_COMPLETE_EVENT: {
        if (!runId || typeof runId !== 'string') {
          Log.for('ws-relay').warn('AI_RECORDER_TAKEOVER_COMPLETE missing/invalid runId, dropped');
          return;
        }
        // 本地会话：解析等待中的 takeover promise（未注册的 agent 会话无此句柄，忽略）
        getLocalRunHandle(runId)?.resolveTakeover(true);
        // 仅转发 Agent 消费的 runId，丢弃客户端提供的其余字段（防伪造 payload 透传）
        wsService.broadcast(AI_RECORDER_TAKEOVER_COMPLETE_EVENT, { runId });
        Log.for('ws-relay').info(`AI_RECORDER_TAKEOVER_COMPLETE relayed to agents: run=${runId}`);
        return;
      }

      default:
        return;
    }
  });
}

/**
 * 处理 AI_RECORDER_COMPLETE 事件：
 * 薄委托层 —— 校验 run 存在后，将成功/失败的持久化逻辑委托给共享的
 * finalize-run 模块（与 local runner 共用同一实现）。
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
    Log.for('ws-relay').warn(`AI_RECORDER_COMPLETE for unknown run: ${runId}`);
    return;
  }

  // 错误路径
  if (data.error) {
    finalizeRunFailure({ repository, sseGateway }, { runId, error: data.error });
    return;
  }

  const result = data.result || {};
  finalizeRunCompletion({ repository, sseGateway }, {
    runId,
    suiteId: data.suiteId || '',
    caseId: data.caseId || '',
    refinedSteps: result.refinedSteps,
    replayReport: result.replayReport,
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
    Log.for('ws-relay').warn('PROVIDER_CONFIG_REQUEST missing runId or providerConfigId');
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

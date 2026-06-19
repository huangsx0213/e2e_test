/**
 * AI-Driven Recorder Controller
 *
 * 业务编排层，协调 Repository / SSEGateway / WS Relay / Provider Matrix。
 * 不直接操作 DB，不调 LLM，不碰浏览器。
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §8
 */

import { randomId } from '../../shared/utils/index.ts';
import { AiDrivenRecorderRepository } from './repository.ts';
import { SSEGateway } from '../ai-test-gen/sse-gateway.ts';
import { canTriggerAiRecording } from './provider-matrix.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';
import { agentRegistry } from '../agent/registry.ts';
import { wsService } from '../../shared/services/websocketService.ts';
import { saveSuite } from '../suites/repository.ts';
import type { TestSuite } from '../../../shared/contracts/index.ts';
import {
  AI_RECORDER_START_EVENT,
  AI_RECORDER_STOP_EVENT,
} from '../../../shared/recording/protocol.ts';

export interface StartRunRequest {
  nlCaseId: string;
  providerConfigId: string;
  model?: string;
  options?: {
    headless?: boolean;
    maxRetriesPerStep?: number;
    timeoutPerStep?: number;
  };
}

export interface StartRunResponse {
  runId: string;
  suiteId: string;
  caseId: string;
  status: 'started';
}

export interface RunStatusResponse {
  runId: string;
  nlCaseId: string;
  status: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  result?: { suiteId: string; caseId: string };
  replayReport?: unknown;
  error?: string;
}

export class AiDrivenRecorderController {
  public readonly sseGateway: SSEGateway;
  private readonly repository: AiDrivenRecorderRepository;

  constructor(sseGateway: SSEGateway, repository: AiDrivenRecorderRepository) {
    this.sseGateway = sseGateway;
    this.repository = repository;
  }

  /** 启动 AI 录制 run */
  startRun(projectId: string, body: unknown): StartRunResponse {
    const params = body as StartRunRequest;
    if (!params?.nlCaseId) throw new Error('nlCaseId is required');
    if (!params?.providerConfigId) throw new Error('providerConfigId is required');

    // 1. 校验 NlCase 存在且为 APPROVED 状态
    const nlCase = nlCaseRepo.get(params.nlCaseId);
    if (!nlCase) throw new Error(`NlCase not found: ${params.nlCaseId}`);
    if (nlCase.projectId !== projectId) throw new Error('NlCase does not belong to this project');
    if (nlCase.status !== 'APPROVED') {
      throw new Error(`NlCase must be APPROVED, current: ${nlCase.status}`);
    }
    if (nlCase.generatedSuiteId) {
      throw new Error(`NlCase already has generatedSuiteId: ${nlCase.generatedSuiteId}`);
    }

    // 2. 校验 providerConfig 存在且在认证矩阵中允许触发
    const providerConfig = this.repository.getDecryptedProviderConfig(params.providerConfigId);
    if (!providerConfig) {
      throw new Error(`Provider config not found: ${params.providerConfigId}`);
    }
    if (!canTriggerAiRecording(providerConfig)) {
      throw new Error(`Provider type ${providerConfig.type} is not allowed for AI recording (unverified)`);
    }

    // 3. 检查是否有进行中的 run（同一 NlCase 不允许并发录制）
    const existingRuns = this.repository.getRunsByProject(projectId);
    const conflictingRun = existingRuns.find(
      (r) => r.nl_case_id === params.nlCaseId && (r.status === 'running' || r.status === 'refining' || r.status === 'replaying'),
    );
    if (conflictingRun) {
      throw new Error(`NlCase already has an active run: ${conflictingRun.id}`);
    }

    // 4. 预分配 draft suiteId / caseId（Agent 完成后回填内容）
    const suiteId = randomId('ai-draft-suite');
    const caseId = randomId('ai-draft-case');
    // 立即创建空的 draft suite + case，否则录制中的 step 插入会因外键约束失败
    const draftSuite: TestSuite = {
      id: suiteId,
      projectId,
      name: `[AI Draft] ${nlCase.title}`,
      description: `AI 驱动录制草稿套件，来源 NlCase: ${nlCase.id}`,
      cases: [{ id: caseId, name: nlCase.title, description: '', steps: [] }],
      position: 0,
    };
    saveSuite(draftSuite);

    // 5. 创建 run 记录
    const runId = this.repository.createRun({
      projectId,
      nlCaseId: params.nlCaseId,
      providerConfigId: params.providerConfigId,
      options: params.options,
    });

    // 6. 发现 idle Agent
    const activeConnections = agentRegistry.getActiveConnections();
    let idleAgent: { id: string; ws?: import('ws').WebSocket } | undefined;
    for (const agent of activeConnections.values()) {
      if (agent.status === 'idle' && agent.ws) {
        idleAgent = agent;
        break;
      }
    }
    if (!idleAgent) {
      this.repository.updateRunStatus(runId, 'failed', 'No idle agent available');
      throw new Error('No idle agent available');
    }

    // 7. 通过 WS 下发 AI_RECORDER_START
    const startPayload = {
      runId,
      projectId,
      nlCase,
      providerConfigId: params.providerConfigId, // 只传 ID，Agent 通过 WS 请求解密 config
      model: params.model,
      options: params.options ?? {},
      caseId,
      suiteId,
    };
    const packet = JSON.stringify({ event: AI_RECORDER_START_EVENT, data: startPayload });
    idleAgent.ws!.send(packet);

    // 8. SSE 广播 run:start
    this.sseGateway.emit(runId, 'run:start', {
      runId,
      nlCaseId: params.nlCaseId,
      totalSteps: nlCase.steps.length,
    });

    return { runId, suiteId, caseId, status: 'started' };
  }

  /** 查询 run 状态 */
  getRun(projectId: string, runId: string): RunStatusResponse {
    const run = this.repository.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.project_id !== projectId) throw new Error('Run does not belong to this project');

    const response: RunStatusResponse = {
      runId: run.id,
      nlCaseId: run.nl_case_id,
      status: run.status,
      progress: {
        total: run.total_steps,
        completed: run.completed_steps,
        failed: run.failed_steps,
      },
    };

    if (run.result_suite_id && run.result_case_id) {
      response.result = { suiteId: run.result_suite_id, caseId: run.result_case_id };
    }
    if (run.replay_report) {
      try {
        response.replayReport = JSON.parse(run.replay_report);
      } catch {
        // ignore parse error
      }
    }
    if (run.error) {
      response.error = run.error;
    }
    return response;
  }

  /** 列出项目的所有 run */
  listRuns(projectId: string): RunStatusResponse[] {
    return this.repository.getRunsByProject(projectId).map((run) => ({
      runId: run.id,
      nlCaseId: run.nl_case_id,
      status: run.status,
      progress: {
        total: run.total_steps,
        completed: run.completed_steps,
        failed: run.failed_steps,
      },
      result: run.result_suite_id && run.result_case_id
        ? { suiteId: run.result_suite_id, caseId: run.result_case_id }
        : undefined,
      replayReport: run.replay_report ? safeParse(run.replay_report) : undefined,
      error: run.error || undefined,
    }));
  }

  /** 中止并删除 run */
  deleteRun(projectId: string, runId: string): { success: true } {
    const run = this.repository.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.project_id !== projectId) throw new Error('Run does not belong to this project');

    // 如果 run 还在进行中，先发送 STOP 给 Agent
    if (run.status === 'running' || run.status === 'refining' || run.status === 'replaying') {
      wsService.broadcast(AI_RECORDER_STOP_EVENT, { runId });
    }

    // SSE 广播 run:error（让前端关闭连接）
    this.sseGateway.emit(runId, 'run:error', { runId, error: 'Run aborted by user' });
    this.sseGateway.cleanup(runId);

    return { success: true };
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

import { randomId } from '../../shared/utils/index.ts';
import { pipelineRepo } from './repository.ts';
import { SSEGateway } from './sse-gateway.ts';
import { Orchestrator } from './orchestrator.ts';
import { startPipelineSchema, resumePipelineSchema, checkpointUpdateSchema } from './schema.ts';
import { deduplicateTestCases } from './helpers.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';
import { Log } from '../../shared/services/logger.ts';

export class TestGenController {
  public readonly orchestrator: Orchestrator;
  public readonly sseGateway: SSEGateway;

  constructor() {
    this.sseGateway = new SSEGateway();
    this.orchestrator = new Orchestrator(this.sseGateway);
  }

  /** 列出项目下的所有运行 */
  listRuns(projectId: string) {
    return pipelineRepo.listRunsByProject(projectId);
  }

  /** 获取活跃运行 */
  getActiveRun(projectId: string) {
    return pipelineRepo.getActiveRun(projectId);
  }

  /** 获取运行日志 */
  getLogs(runId: string, agent?: string) {
    return pipelineRepo.getAgentLogs(runId, agent);
  }

  /** 获取运行详情 */
  getRun(runId: string) {
    const row = pipelineRepo.getRun(runId);
    if (!row) return null;
    return pipelineRepo.getRunInfo(runId);
  }

  /** 获取运行信息 */
  getRunInfo(runId: string) {
    return pipelineRepo.getRunInfo(runId);
  }

  /** 删除运行 */
  deleteRun(runId: string) {
    const row = pipelineRepo.getRun(runId);
    if (!row) throw new Error('Test gen run not found');
    this.orchestrator.delete(runId);
    return { success: true };
  }

  /** 中止运行 */
  abortRun(runId: string) {
    this.orchestrator.abort(runId);
    return { success: true };
  }

  /** 启动流水线 */
  async startPipeline(projectId: string, body: unknown) {
    const params = startPipelineSchema.parse(body);
    const runId = randomId('tgr');
    pipelineRepo.createRun(runId, projectId, params.mode, params);
    // 异步执行，不阻塞响应
    this.orchestrator.start(runId, projectId, params).catch(err => {
      Log.for('controller').error(`Pipeline ${runId} failed: ${err.message}`);
    });
    return { runId };
  }

  /** 审核通过/重试 */
  resumeRun(runId: string, body: unknown) {
    const { action, feedback, editedData } = resumePipelineSchema.parse(body);
    this.orchestrator.resume(runId, action, feedback, editedData);
    return { success: true, action };
  }

  /** 从失败的 agent 重试 */
  async retryRun(runId: string) {
    await this.orchestrator.retry(runId);
    return { success: true };
  }

  /** 保存 checkpoint 编辑 */
  async saveCheckpointEdits(runId: string, body: unknown) {
    const { editedData, checkpointNumber } = checkpointUpdateSchema.parse(body);
    await this.orchestrator.saveCheckpointEdits(runId, editedData, checkpointNumber);
    return { success: true };
  }

  /** 获取 checkpoint 状态 */
  async getCheckpointState(runId: string) {
    return this.orchestrator.getCheckpointState(runId);
  }

  /** 保存用例到项目 */
  saveCases(runId: string) {
    const run = pipelineRepo.getRun(runId);
    if (!run) throw new Error('Run not found');

    const logs = pipelineRepo.getAgentLogs(runId);
    const allCases = logs
      .filter(l => l.agent_name === 'quality_manager' && l.output_data?.finalTestCases)
      .flatMap(l => l.output_data.finalTestCases);
    if (allCases.length === 0) throw new Error('No test cases found to export');

    const { allCases: deduped, removedCount } = deduplicateTestCases(allCases);
    for (const tc of deduped) {
      nlCaseRepo.save({ ...tc, projectId: run.project_id });
    }
    return { saved: deduped.length, removed: removedCount };
  }

  /** 获取思考数据（持久化的） */
  getThinkingData(runId: string) {
    return pipelineRepo.getThinkingData(runId);
  }

  /** 获取审核日志 */
  getAuditLogs(runId: string, checkpointId?: string) {
    return pipelineRepo.getAuditLogs(runId, checkpointId);
  }

  // ---- Prompt Overrides ----

  getPromptOverrides(projectId: string) {
    return pipelineRepo.getPromptOverrides(projectId);
  }

  upsertPromptOverride(projectId: string, agentName: string, customPrompt: string | null, modelOverride: string | null) {
    pipelineRepo.upsertPromptOverride(projectId, agentName, customPrompt, modelOverride);
    return { success: true };
  }

  deletePromptOverride(projectId: string, agentName: string) {
    pipelineRepo.deletePromptOverride(projectId, agentName);
    return { success: true };
  }

  /** 恢复中断的运行（服务重启后调用） */
  async recoverInterruptedRuns(): Promise<void> {
    const waitingRuns = pipelineRepo.getWaitingRuns();
    const log = Log.for('controller');
    if (waitingRuns.length === 0) {
      log.info('No interrupted test gen runs to recover');
      return;
    }

    log.info(`Recovering ${waitingRuns.length} interrupted run(s)...`);
    for (const run of waitingRuns) {
      log.info(`Resuming run ${run.id} (phase: ${run.phase})`);
      this.orchestrator.resume(run.id, 'approve').catch(err => {
        log.error(`Failed to resume run ${run.id}: ${err.message}`);
      });
    }
  }
}
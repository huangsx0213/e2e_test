import { requirementRepo } from '../requirements/repository.ts';
import type { BusinessFlow, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBusinessFlowBlueprintsInput {
  flows: BusinessFlow[];
}

export function buildBusinessFlowBlueprints({ flows }: BuildBusinessFlowBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  return flows
    .filter((flow) => flow.status === 'APPROVED')
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      type: flow.type,
      // 填充步骤摘要（含关联需求标题），让 AI 知道每个流程的规模和内容
      steps: flow.steps.map((step) => {
        // 保留全量 requirementIds（用于 preparation 节点过滤相关 flow），
        // 同时取第一个作为 primary 用于展示/排序
        const requirementIds = step.requirementIds ?? [];
        const primaryReqId = requirementIds[0] ?? '';
        const primaryReq = primaryReqId ? requirementRepo.get(primaryReqId) : null;
        return {
          sequence: step.sequence,
          requirementId: primaryReqId,
          requirementIds,
          requirementTitle: primaryReq?.title ?? step.actionSummary,
          requirementLevel: (primaryReq?.level ?? 'story') as any,
          actionSummary: step.actionSummary,
          acceptanceCriteria: [],  // 按需通过 flow_detail_query 获取完整 AC
        };
      }),
    }));
}

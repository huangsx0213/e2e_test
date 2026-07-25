import type { TestGenState, CrossEpicDependency } from '../state';
import type { AgentObserver } from './types';
import { requirementRepo } from '../../../requirements/repository.ts';
import { Log } from '../../../../shared/services/logger.ts';

export interface PreparationNodeOptions {
  observer?: AgentObserver;
}

export function makePreparationNode(opts: PreparationNodeOptions) {
  const { observer } = opts;
  const agentName = 'preparation';
  const log = Log.for(agentName);

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    observer?.onStart?.(agentName);

    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? 1}/${state.batchContext?.totalBatches ?? 1}`;
    const flowCount = state.businessFlowBlueprints?.length ?? 0;
    const selectedFlowCount = state.selectedFlowIds?.length ?? 0;

    observer?.onStep?.(agentName, 0, `Preparing: ${reqCount} requirements, ${flowCount} flows, ${selectedFlowCount} user-selected (${batchInfo})`);

    log.info(`ENTER ── batch ${batchInfo}, ${reqCount} requirements, ${flowCount} flows, ${selectedFlowCount} user-selected`);
    log.kv('mode', state.mode);
    log.kv('userSelectedFlows', selectedFlowCount);

    // ── L2 关联层预计算 ──
    const currentReqIds = new Set((state.currentBatch ?? []).map(r => r.id));
    const allReqs = requirementRepo.listByProject(state.projectId);
    const epicTitleMap = new Map<string, string>();
    const epicIdSet = new Set<string>();
    if (state.globalEpicIndex) {
      for (const e of state.globalEpicIndex) {
        epicTitleMap.set(e.epicId, e.title);
        epicIdSet.add(e.epicId);
      }
    }
    // 动态构建 reqId → epicId：从每个需求向上找 root，root 即 epicId
    const parentMap = new Map<string, string | null>();
    for (const r of allReqs) parentMap.set(r.id, r.parentId ?? null);
    const reqEpicMap = new Map<string, { epicId: string; epicTitle: string }>();
    for (const r of allReqs) {
      let current: string | null = r.id;
      for (let depth = 0; depth < 20 && current; depth++) {
        if (epicIdSet.has(current)) {
          reqEpicMap.set(r.id, {
            epicId: current,
            epicTitle: epicTitleMap.get(current) ?? current,
          });
          break;
        }
        current = parentMap.get(current) ?? null;
      }
    }
    // 当前 Epic ID：从批次内任一需求的 epicId 推断
    let currentEpicId: string | null = null;
    for (const reqId of currentReqIds) {
      const m = reqEpicMap.get(reqId);
      if (m) { currentEpicId = m.epicId; break; }
    }

    const crossEpicDependencies: CrossEpicDependency[] = [];
    if (currentEpicId && currentReqIds.size > 0) {
      for (const reqId of currentReqIds) {
        const req = allReqs.find(r => r.id === reqId);
        if (!req) continue;
        // 上游依赖：当前需求 depends-on 跨 Epic 需求
        for (const depId of req.dependencies ?? []) {
          if (currentReqIds.has(depId)) continue; // 同批次内，由 graph_query 处理
          const depReq = allReqs.find(r => r.id === depId);
          const depEpic = reqEpicMap.get(depId);
          if (depReq && depEpic && depEpic.epicId !== currentEpicId) {
            crossEpicDependencies.push({
              fromRequirementId: reqId,
              toRequirementId: depId,
              toEpicId: depEpic.epicId,
              toEpicTitle: depEpic.epicTitle,
              toRequirementTitle: depReq.title,
              relationType: 'depends-on',
            });
          }
        }
        // 下游 dependents：跨 Epic 的需求依赖于当前需求
        for (const other of allReqs) {
          if (currentReqIds.has(other.id)) continue;
          if ((other.dependencies ?? []).includes(reqId)) {
            const otherEpic = reqEpicMap.get(other.id);
            if (otherEpic && otherEpic.epicId !== currentEpicId) {
              crossEpicDependencies.push({
                fromRequirementId: reqId,
                toRequirementId: other.id,
                toEpicId: otherEpic.epicId,
                toEpicTitle: otherEpic.epicTitle,
                toRequirementTitle: other.title,
                relationType: 'depended-by',
              });
            }
          }
        }
      }
    }

    // L2 关联层：过滤与当前批次需求相关的 flow 蓝图
    // 优先包含用户显式选中的 flow（用于 integration 测试的强信号），
    // 再补充与当前批次需求有 requirementId 交集的其他 flow 作为补充 integration 场景
    const allBlueprints = state.businessFlowBlueprints ?? [];
    const selectedFlowIdSet = new Set(state.selectedFlowIds ?? []);
    const relevantFlowBlueprints = allBlueprints.filter(f => {
      if (selectedFlowIdSet.has(f.id)) return true; // 用户选中的 flow 一定保留
      return f.steps?.some((s: any) =>
        (s.requirementIds ?? []).some((rid: string) => currentReqIds.has(rid))
      );
    });
    // 标记哪些 flow 是用户显式选中的，便于 prompt 区分强信号 vs 推导
    const relevantFlowsWithFlag = relevantFlowBlueprints.map(f => ({
      ...f,
      userSelected: selectedFlowIdSet.has(f.id),
    }));

    log.kv('crossEpicDeps', crossEpicDependencies.length);
    log.kv('relevantFlows', `${relevantFlowBlueprints.length}/${allBlueprints.length} (user-selected: ${selectedFlowIdSet.size})`);

    const avgTokensPerReq = 1000;
    const estimated = reqCount * avgTokensPerReq;
    log.kv('tokenBudget.estimated', estimated);

    observer?.onStep?.(agentName, 1, `Token estimation: ~${estimated} tokens; cross-epic deps: ${crossEpicDependencies.length}`);

    if (flowCount > 0) {
      log.kv('flows', flowCount);
    }

    const latencyMs = Date.now() - startTime;
    observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs);
    log.success(`EXIT ── environment ready (${latencyMs}ms)`);

    return {
      environmentReady: true,
      initializationLogs: [],
      tokenBudget: { estimated, limit: null },
      crossEpicDependencies,
      relevantFlowBlueprints: relevantFlowsWithFlag,
      phase: 'analysis',
    };
  };
}

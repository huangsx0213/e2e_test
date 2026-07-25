import { Annotation } from '@langchain/langgraph';
import type {
  TestCondition,
  NlTestCase,
  CoverageMatrix,
  PipelineBusinessFlowBlueprint,
} from '../../../../shared/contracts/index.ts';

export interface BatchContext {
  currentBatch: number;
  totalBatches: number;
  processedCount: number;
}

export interface SkillCallRecord {
  agent: string;
  skillName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  timestamp: number;
}

export type Phase =
  | 'init'
  | 'preparation'
  | 'analysis'
  | 'review-conditions'
  | 'design'
  | 'review-draft'
  | 'quality'
  | 'final-review'
  | 'complete';

export const CHECKPOINT_BY_PHASE: Readonly<Record<string, number>> = {
  'review-conditions': 1,
  'review-draft': 2,
  'final-review': 3,
};

export const PHASE_BY_CHECKPOINT: Readonly<Record<number, Phase>> = {
  1: 'review-conditions',
  2: 'review-draft',
  3: 'final-review',
};

export const AGENT_NAME_BY_CHECKPOINT: Readonly<Record<number, string>> = {
  1: 'test_analyst',
  2: 'test_designer',
  3: 'quality_manager',
};

// L1 索引层：Epic 级全局摘要（替代需求级 globalRequirementIndex 注入到 prompt）
export interface GlobalEpicEntry {
  epicId: string;
  title: string;
  requirementCount: number;
  flowCount: number;
  statusBreakdown: Record<string, number>;
}

// L2 关联层：跨 Epic 依赖摘要（preparation 节点预计算，仅含与当前批次相关的条目）
export interface CrossEpicDependency {
  fromRequirementId: string;       // 当前批次内的需求
  toRequirementId: string;         // 跨 Epic 的目标需求
  toEpicId: string;
  toEpicTitle: string;
  toRequirementTitle: string;
  relationType: 'depends-on' | 'depended-by' | 'sibling-in-other-epic';
}

// L2 关联层：已完成批次的覆盖摘要（按 requirementId 分组，替代 condition 全文累积）
export interface PreviousBatchCoverageSummary {
  requirementId: string;
  conditionCount: number;
  categories: string[];
  techniques: string[];
  conditionTitles: string[];       // 仅保留截断后的标题，避免全文累积
  // case 级跨批次去重视图（让 Designer 知道前面批次已生成哪些用例）
  caseTitles: string[];            // 截断后的用例标题，按 testLevel 分组注入 prompt
  caseLevels: string[];            // 与 caseTitles 一一对应：'component' | 'integration'
}

export const TestGenStateAnnotation = Annotation.Root({
  // === 运行标识 ===
  projectId: Annotation<string>,
  runId: Annotation<string>,
  mode: Annotation<'auto' | 'interactive'>,

  // === 批次上下文 ===
  requirementIds: Annotation<string[]>,
  currentBatch: Annotation<{ id: string; title: string; level: string; parentId: string }[]>,
  batchContext: Annotation<BatchContext>,
  projectContext: Annotation<{ name: string; pages: { name: string }[]; endpoints: { name: string; method: string }[] }>,
  businessFlowBlueprints: Annotation<PipelineBusinessFlowBlueprint[] | undefined>,

  // === 全局统计（所有批次共享） ===
  globalStats: Annotation<{ totalRequirements: number; totalEpics: number; totalFlows: number } | undefined>,

  // === L1 索引层：Epic 级全局摘要（替代需求级列表注入到 prompt） ===
  globalEpicIndex: Annotation<GlobalEpicEntry[] | undefined>,

  // === L2 关联层：跨 Epic 依赖摘要（preparation 节点预计算） ===
  crossEpicDependencies: Annotation<CrossEpicDependency[] | undefined>,

  // === L2 关联层：已完成批次覆盖摘要（按 requirementId 分组，替代 condition 全文累积） ===
  previousBatchCoverageSummary: Annotation<PreviousBatchCoverageSummary[] | undefined>,

  // === L2 关联层：与当前批次相关的 flow 蓝图（preparation 节点过滤后写入） ===
  relevantFlowBlueprints: Annotation<PipelineBusinessFlowBlueprint[] | undefined>,

  // === Preparation 产物 ===
  environmentReady: Annotation<boolean>,
  initializationLogs: Annotation<string[]>,
  tokenBudget: Annotation<{ estimated: number; limit: number | null }>,

  // === Test Analyst 产物 ===
  requirementAnalysis: Annotation<{ overallApproach: string; riskAssessmentSummary: string } | undefined>,
  testConditions: Annotation<TestCondition[] | undefined>,
  approvedConditions: Annotation<TestCondition[] | undefined>,

  // === Test Designer 产物 ===
  draftTestCases: Annotation<NlTestCase[] | undefined>,
  approvedDraftCases: Annotation<NlTestCase[] | undefined>,

  // === Quality Manager 产物 ===
  finalTestCases: Annotation<NlTestCase[] | undefined>,
  coverageMatrix: Annotation<CoverageMatrix | undefined>,

  // === 生成模式 ===
  selectedFlowIds: Annotation<string[]>,

  // === 审核反馈 ===
  humanReviewFeedback: Annotation<string>,

  // === Skill 调用记录 ===
  skillCalls: Annotation<SkillCallRecord[]>,

  // === 阶段追踪 ===
  phase: Annotation<Phase>,
  errors: Annotation<{ phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }[]>,
});

export type TestGenState = typeof TestGenStateAnnotation.State;
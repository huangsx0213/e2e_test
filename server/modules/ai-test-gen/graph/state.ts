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

export interface GlobalRequirementEntry {
  id: string;
  title: string;
  level: string;
  parentId: string | null;
  epicId: string | null;  // 所属 epic 的 ID，方便 AI 理解层级
}

export interface PreviousBatchConditionSummary {
  id: string;
  condition: string;
  requirementId: string;
  category: string;
  primaryTechnique: string;
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

  // === 全局需求索引（所有批次共享，用于跨 Epic 感知） ===
  globalRequirementIndex: Annotation<GlobalRequirementEntry[] | undefined>,
  globalStats: Annotation<{ totalRequirements: number; totalEpics: number; totalFlows: number } | undefined>,

  // === 跨批次感知：已完成批次的 test conditions 摘要 ===
  previousBatchConditions: Annotation<PreviousBatchConditionSummary[] | undefined>,

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
  includeFlowCases: Annotation<boolean>,
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
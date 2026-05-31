interface DesignerDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface ConditionInput {
  id: string;
  requirementId: string;
  condition: string;
  category: 'happy-path' | 'alternate' | 'error' | 'boundary';
  riskLevel: 'high' | 'medium' | 'low';
  priority: 'critical' | 'high' | 'medium' | 'low';
  primaryTechnique: string;
  coverageDimensions: Array<{ dimension: string; variants: string[] }>;
}

export interface BusinessFlow {
  id: string;
  name: string;
  steps: Array<{
    id: string;
    actionSummary: string;
    acceptanceCriteria: string[];
    requirementId?: string;
  }>;
}

export interface DraftTestCase {
  id: string;
  title: string;
  requirementId: string;
  conditionId: string;
  techniqueApplied: string;
  priority: string;
  category: string;
  preconditions: string[];
  testData: Array<{ key: string; value: string; description: string }>;
  steps: Array<{ sequence: number; action: string; expected: string }>;
  postconditions: string[];
  tags: string[];
}

export function designTestCases(conditions: ConditionInput[], businessFlows?: BusinessFlow[]): DraftTestCase[] {
  const cases: DraftTestCase[] = [];

  for (const cond of conditions) {
    const flowSteps = findFlowStepsForCondition(cond, businessFlows);

    if (flowSteps.length > 0) {
      const tc = buildFlowTestCase(cond, flowSteps);
      cases.push(tc);
    } else {
      const variants = expandVariants(cond);
      for (const variant of variants) {
        cases.push(buildTestCase(cond, variant));
      }
    }
  }

  return cases;
}

function findFlowStepsForCondition(cond: ConditionInput, flows?: BusinessFlow[]): BusinessFlow['steps'] {
  if (!flows) return [];
  const steps: BusinessFlow['steps'] = [];
  for (const flow of flows) {
    for (const step of flow.steps) {
      if (step.requirementId === cond.requirementId) {
        steps.push(step);
      }
    }
  }
  return steps;
}

function expandVariants(cond: ConditionInput): string[] {
  const variants: string[] = [];
  for (const dim of cond.coverageDimensions) {
    for (const v of dim.variants) {
      variants.push(`${dim.dimension}:${v}`);
    }
  }
  if (variants.length === 0) variants.push('default');
  return variants;
}

function buildFlowTestCase(cond: ConditionInput, steps: BusinessFlow['steps']): DraftTestCase {
  const tcSteps = steps.map((s, i) => ({
    sequence: i + 1,
    action: s.actionSummary,
    expected: s.acceptanceCriteria[0] ?? 'Step completes successfully',
  }));

  return {
    id: `tc-${cond.id}-flow`,
    title: `Flow test for: ${cond.condition}`,
    requirementId: cond.requirementId,
    conditionId: cond.id,
    techniqueApplied: cond.primaryTechnique,
    priority: cond.priority,
    category: cond.category,
    preconditions: ['System is in initial state', 'Required data exists in database'],
    testData: [{ key: 'conditionId', value: cond.id, description: 'Source condition' }],
    steps: tcSteps,
    postconditions: ['Flow completes end-to-end', 'All acceptance criteria met'],
    tags: [cond.primaryTechnique, cond.category, 'flow'],
  };
}

function buildTestCase(cond: ConditionInput, variant: string): DraftTestCase {
  return {
    id: `tc-${cond.id}-${variant.replace(/[:/]/g, '-')}`,
    title: `${cond.category} test: ${cond.condition} [${variant}]`,
    requirementId: cond.requirementId,
    conditionId: cond.id,
    techniqueApplied: cond.primaryTechnique,
    priority: cond.priority,
    category: cond.category,
    preconditions: [`System is ready for ${cond.category} testing`],
    testData: [{ key: 'variant', value: variant, description: 'Coverage variant' }],
    steps: [
      { sequence: 1, action: `Execute test for condition: ${cond.condition}`, expected: `Verify ${variant} behavior` },
    ],
    postconditions: [`Condition ${cond.id} verified for ${variant}`],
    tags: [cond.primaryTechnique, cond.category],
  };
}

export function createService(deps: DesignerDeps) {
  return {
    designTestCases: async (conditions: ConditionInput[], businessFlows?: BusinessFlow[]): Promise<DraftTestCase[]> => {
      if (deps.db) {
        const reqIds = [...new Set(conditions.map(c => c.requirementId))];
        const placeholders = reqIds.map(() => '?').join(',');
        const rows = await deps.db.query(
          `SELECT id, title FROM requirements WHERE id IN (${placeholders})`,
          reqIds
        );
        const titleMap = new Map((rows as any[]).map(r => [r.id, r.title] as const));
        const enriched = conditions.map(c => ({
          ...c,
          condition: c.condition || `Test condition for ${titleMap.get(c.requirementId) ?? c.requirementId}`,
        }));
        return designTestCases(enriched, businessFlows);
      }
      return designTestCases(conditions, businessFlows);
    },
  };
}

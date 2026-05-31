interface AnalystDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface RequirementInput {
  id: string;
  title: string;
  description?: string;
  module?: string;
  priority?: string;
  level?: string;
  acceptanceCriteria?: string[];
  parentId?: string;
}

export interface ProjectContext {
  moduleName?: string;
  existingCoverage?: string[];
  businessFlows?: Array<{ id: string; name: string; steps: unknown[] }>;
}

export interface TestCondition {
  id: string;
  requirementId: string;
  condition: string;
  category: 'happy-path' | 'alternate' | 'error' | 'boundary';
  riskLevel: 'high' | 'medium' | 'low';
  priority: 'critical' | 'high' | 'medium' | 'low';
  primaryTechnique: string;
  coverageDimensions: Array<{ dimension: string; variants: string[] }>;
}

export function analyzeConditions(requirements: RequirementInput[], projectContext?: ProjectContext): TestCondition[] {
  const conditions: TestCondition[] = [];
  const flowReqIds = new Set<string>();

  if (projectContext?.businessFlows) {
    for (const flow of projectContext.businessFlows) {
      for (const step of flow.steps as Array<{ requirementId?: string }>) {
        if (step.requirementId) flowReqIds.add(step.requirementId);
      }
    }
  }

  for (const req of requirements) {
    const inFlow = flowReqIds.has(req.id);
    const riskLevel = inferRiskLevel(req, inFlow);
    const priority = inferPriority(riskLevel, req.priority);
    const category = inferCategories(req);

    for (const cat of category) {
      conditions.push({
        id: `cond-${req.id}-${cat}`,
        requirementId: req.id,
        condition: buildConditionText(req, cat),
        category: cat,
        riskLevel,
        priority,
        primaryTechnique: selectTechnique(req, cat),
        coverageDimensions: buildCoverageDimensions(req, cat),
      });
    }
  }

  return conditions;
}

function inferRiskLevel(req: RequirementInput, inFlow: boolean): 'high' | 'medium' | 'low' {
  if (req.priority === 'critical' || req.priority === 'high') return 'high';
  if (inFlow) return 'medium';
  if (req.priority === 'medium') return 'medium';
  return 'low';
}

function inferPriority(riskLevel: string, reqPriority?: string): 'critical' | 'high' | 'medium' | 'low' {
  if (riskLevel === 'high' && (reqPriority === 'critical' || reqPriority === 'high')) return 'critical';
  if (riskLevel === 'high') return 'high';
  if (riskLevel === 'medium') return 'medium';
  return 'low';
}

function inferCategories(req: RequirementInput): Array<'happy-path' | 'alternate' | 'error' | 'boundary'> {
  const cats: Array<'happy-path' | 'alternate' | 'error' | 'boundary'> = ['happy-path'];
  if (req.acceptanceCriteria && req.acceptanceCriteria.length > 1) cats.push('alternate');
  if (req.description && /\b(must|shall|should|validate|reject|prevent)\b/i.test(req.description)) cats.push('error');
  if (req.description && /\b(range|limit|min|max|boundary|threshold)\b/i.test(req.description)) cats.push('boundary');
  return cats;
}

function buildConditionText(req: RequirementInput, category: string): string {
  const verb = category === 'error' ? 'rejects invalid' : category === 'boundary' ? 'handles edge case for' : 'verifies';
  return `${verb} ${req.title}`;
}

function selectTechnique(req: RequirementInput, category: string): string {
  if (category === 'boundary') return 'boundary-value-analysis';
  if (req.description && /\b(if|when|condition|rule|logic)\b/i.test(req.description)) return 'decision-table';
  if (req.description && /\b(state|status|transition|workflow)\b/i.test(req.description)) return 'state-transition';
  if (req.description && /\b(user|flow|step|scenario)\b/i.test(req.description)) return 'use-case';
  return 'equivalence-partitioning';
}

function buildCoverageDimensions(req: RequirementInput, category: string): Array<{ dimension: string; variants: string[] }> {
  if (category === 'boundary') {
    return [{ dimension: 'boundary-values', variants: ['min-1', 'min', 'min+1', 'max-1', 'max', 'max+1'] }];
  }
  if (category === 'error') {
    return [{ dimension: 'invalid-inputs', variants: ['empty', 'invalid-format', 'out-of-range'] }];
  }
  return [{ dimension: 'valid-inputs', variants: ['typical', 'alternative'] }];
}

export function createService(deps: AnalystDeps) {
  return {
    analyzeConditions: async (requirements: RequirementInput[], projectContext?: ProjectContext): Promise<TestCondition[]> => {
      if (deps.db) {
        const ids = requirements.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const rows = await deps.db.query(
          `SELECT id, title, description, module, priority FROM requirements WHERE id IN (${placeholders})`,
          ids
        );
        const enriched = requirements.map(r => {
          const row = (rows as any[]).find(rr => rr.id === r.id);
          return row ? { ...r, description: r.description ?? row.description, module: r.module ?? row.module } : r;
        });
        return analyzeConditions(enriched, projectContext);
      }
      return analyzeConditions(requirements, projectContext);
    },
  };
}

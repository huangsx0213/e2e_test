interface AnalysisDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface RequirementEntry {
  id: string;
  title: string;
  description?: string;
  level?: string;
  priority?: string;
  status?: string;
  module?: string;
  acceptanceCriteria?: string[];
  parentId?: string;
  tags?: string[];
}

export interface AnalysisIssue {
  requirementId: string;
  severity: 'blocker' | 'major' | 'minor';
  category: 'completeness' | 'testability' | 'consistency';
  description: string;
  suggestion: string;
}

export interface AnalysisResult {
  rankedRequirements: RequirementEntry[];
  issues: AnalysisIssue[];
  suggestedApproach: string;
}

export function analyzeRequirements(requirements: RequirementEntry[]): AnalysisResult {
  const issues: AnalysisIssue[] = [];

  for (const req of requirements) {
    if (!req.acceptanceCriteria || req.acceptanceCriteria.length === 0) {
      issues.push({
        requirementId: req.id,
        severity: 'major',
        category: 'testability',
        description: `Requirement "${req.title}" has no acceptance criteria`,
        suggestion: 'Add measurable acceptance criteria with pass/fail conditions',
      });
    }

    if (!req.description || req.description.trim().length < 10) {
      issues.push({
        requirementId: req.id,
        severity: 'major',
        category: 'completeness',
        description: `Requirement "${req.title}" has insufficient description`,
        suggestion: 'Provide a detailed description covering functional behavior',
      });
    }

    if (req.description && /\b(should|may|might|could)\b/i.test(req.description) && !/\b(shall|must)\b/i.test(req.description)) {
      issues.push({
        requirementId: req.id,
        severity: 'minor',
        category: 'testability',
        description: `Requirement "${req.title}" uses ambiguous language (should/may)`,
        suggestion: 'Use definitive language (shall/must) for testable requirements',
      });
    }

    if (req.parentId && !requirements.some(r => r.id === req.parentId)) {
      issues.push({
        requirementId: req.id,
        severity: 'blocker',
        category: 'consistency',
        description: `Requirement "${req.title}" references non-existent parent: ${req.parentId}`,
        suggestion: 'Fix the parentId reference or create the parent requirement',
      });
    }
  }

  const ranked = rankByRiskAndValue(requirements, issues);
  const suggestedApproach = buildApproach(ranked, issues);

  return {
    rankedRequirements: ranked,
    issues,
    suggestedApproach,
  };
}

function rankByRiskAndValue(requirements: RequirementEntry[], issues: AnalysisIssue[]): RequirementEntry[] {
  const issueMap = new Map<string, number>();
  for (const issue of issues) {
    const weight = issue.severity === 'blocker' ? 3 : issue.severity === 'major' ? 2 : 1;
    issueMap.set(issue.requirementId, (issueMap.get(issue.requirementId) ?? 0) + weight);
  }

  return [...requirements].sort((a, b) => {
    const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const aPri = priorityOrder[a.priority ?? 'medium'] ?? 2;
    const bPri = priorityOrder[b.priority ?? 'medium'] ?? 2;
    if (aPri !== bPri) return bPri - aPri;

    const aIssues = issueMap.get(a.id) ?? 0;
    const bIssues = issueMap.get(b.id) ?? 0;
    return bIssues - aIssues;
  });
}

function buildApproach(ranked: RequirementEntry[], issues: AnalysisIssue[]): string {
  const blockerCount = issues.filter(i => i.severity === 'blocker').length;
  const majorCount = issues.filter(i => i.severity === 'major').length;
  const highRiskCount = ranked.filter(r => r.priority === 'critical' || r.priority === 'high').length;

  let approach = `Analyzed ${ranked.length} requirements. `;
  approach += `Found ${blockerCount} blocker(s), ${majorCount} major issue(s). `;
  approach += `${highRiskCount} requirement(s) are high/critical priority. `;

  if (blockerCount > 0) {
    approach += 'Resolve blockers before test design. ';
  }
  if (highRiskCount > 0) {
    approach += 'Prioritize risk-based testing for high-priority requirements. ';
  }

  return approach;
}

export function createService(deps: AnalysisDeps) {
  return {
    analyzeRequirements: async (requirements: RequirementEntry[]): Promise<AnalysisResult> => {
      if (deps.db) {
        const ids = requirements.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const rows = await deps.db.query(
          `SELECT id, title, description, module, priority, status FROM requirements WHERE id IN (${placeholders})`,
          ids
        );
        const enriched = requirements.map(r => {
          const row = (rows as any[]).find(rr => rr.id === r.id);
          return row ? { ...r, description: r.description ?? row.description, module: r.module ?? row.module, priority: r.priority ?? row.priority } : r;
        });
        return analyzeRequirements(enriched);
      }
      return analyzeRequirements(requirements);
    },
  };
}

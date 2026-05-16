import type { NlTestCase } from '../../shared/contracts/index.ts';
import { asId, asText, asArray } from '../../shared/utils/index.ts';

export function normalizeNlCase(input: Partial<NlTestCase>): NlTestCase {
  return {
    id: asId(input.id, 'nlc'),
    projectId: asText(input.projectId),
    title: asText(input.title, 'New Test Case'),
    requirementId: input.requirementId,
    conditionId: input.conditionId,
    techniqueApplied: input.techniqueApplied,
    priority: (input.priority || 'medium') as NlTestCase['priority'],
    category: input.category,
    preconditions: asArray(input.preconditions),
    testData: asArray(input.testData),
    steps: asArray(input.steps),
    postconditions: asArray(input.postconditions),
    tags: asArray(input.tags),
    selfReview: input.selfReview,
    reviewSummary: input.reviewSummary,
    changeLog: input.changeLog || [],
    status: (input.status || 'DRAFT') as NlTestCase['status'],
    generatedSuiteId: input.generatedSuiteId,
  };
}
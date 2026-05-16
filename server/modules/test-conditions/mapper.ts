import type { TestCondition } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

export function normalizeTestCondition(input: Partial<TestCondition>): TestCondition {
  return {
    id: asId(input.id, 'tc'),
    requirementId: asText(input.requirementId),
    requirementLevel: (input.requirementLevel || 'story') as TestCondition['requirementLevel'],
    condition: asText(input.condition, 'New condition'),
    category: (input.category || 'happy-path') as TestCondition['category'],
    riskLevel: (input.riskLevel || 'medium') as TestCondition['riskLevel'],
    priority: (input.priority || 'medium') as TestCondition['priority'],
    dataRequirements: input.dataRequirements,
    dependencies: input.dependencies || [],
    primaryTechnique: (input.primaryTechnique || 'use-case') as TestCondition['primaryTechnique'],
    secondaryTechniques: input.secondaryTechniques || [],
    techniqueRationale: asText(input.techniqueRationale),
    coverageDimensions: input.coverageDimensions || [],
  };
}
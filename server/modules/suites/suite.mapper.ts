import type { SuiteVariable, TestCase, TestSuite } from '../../../client/types';
import { asArray, asId, asOptionalText, asText, normalizeStringRecord } from '../../utils.ts';
import { normalizeStep } from '../common/step.mapper.ts';

function normalizeSuiteVariable(input: Partial<SuiteVariable>): SuiteVariable {
  return {
    id: asId(input.id, 'var'),
    key: asText(input.key, 'VAR_1'),
    value: asText(input.value),
  };
}

function normalizeCase(input: Partial<TestCase>): TestCase {
  return {
    id: asId(input.id, 'case'),
    name: asText(input.name, 'New Test Case'),
    description: asText(input.description),
    steps: asArray(input.steps).map((step) => normalizeStep(step)),
    setupSteps: asArray(input.setupSteps).map((step) => normalizeStep(step)),
    teardownSteps: asArray(input.teardownSteps).map((step) => normalizeStep(step)),
  };
}

export function normalizeSuite(input: Partial<TestSuite>): TestSuite {
  return {
    id: asId(input.id, 'suite'),
    projectId: asOptionalText(input.projectId),
    name: asText(input.name, 'New Test Suite'),
    description: asText(input.description),
    cases: asArray<TestCase>(input.cases).map((testCase) => normalizeCase(testCase)),
    variables: asArray<SuiteVariable>(input.variables).map((variable) => normalizeSuiteVariable(variable)),
    dataRows: asArray<Record<string, unknown>>(input.dataRows).map((row) => normalizeStringRecord(row)),
    setupSteps: asArray(input.setupSteps).map((step) => normalizeStep(step)),
    teardownSteps: asArray(input.teardownSteps).map((step) => normalizeStep(step)),
  };
}

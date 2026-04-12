import type {
  ModuleParameter,
  Page,
  Project,
  ScenarioSuite,
  SuiteVariable,
  TestModule,
  TestScenario,
  TestPlan,
  PlanScenario,
  UIElement,
} from '../../shared/contracts/index.ts';
import { asArray, asId, asText, normalizeStringRecord } from '../../shared/utils/index.ts';
import { normalizeStep } from '../common/mapper.ts';

function normalizeElement(input: Partial<UIElement>): UIElement {
  return {
    id: asId(input.id, 'el'),
    name: asText(input.name, 'New Element'),
    selectorType: asText(input.selectorType, 'CSS') as UIElement['selectorType'],
    value: asText(input.value),
    description: asText(input.description),
  };
}

function normalizePage(input: Partial<Page>): Page {
  return {
    id: asId(input.id, 'pg'),
    name: asText(input.name, 'New Page'),
    description: asText(input.description),
    elements: asArray<UIElement>(input.elements).map((element) => normalizeElement(element)),
  };
}

function normalizeModuleParameter(input: Partial<ModuleParameter>): ModuleParameter {
  return {
    id: asId(input.id, 'mp'),
    name: asText(input.name, 'PARAM'),
    defaultValue: asText(input.defaultValue),
    description: asText(input.description),
  };
}

function normalizeModule(input: Partial<TestModule>): TestModule {
  return {
    id: asId(input.id, 'mod'),
    name: asText(input.name, 'New Module'),
    description: asText(input.description),
    params: asArray<ModuleParameter>(input.params).map((param) => normalizeModuleParameter(param)),
    steps: asArray(input.steps).map((step) => normalizeStep(step)),
  };
}

function normalizeScenarioSuite(input: Partial<ScenarioSuite>): ScenarioSuite {
  return {
    id: asId(input.id, 'ss'),
    suiteId: asText(input.suiteId),
    variableOverrides: normalizeStringRecord(input.variableOverrides),
    dataSource: input.dataSource === 'SUITE' ? 'SUITE' : 'SCENARIO',
  };
}

function normalizeSuiteVariable(input: Partial<SuiteVariable>): SuiteVariable {
  return {
    id: asId(input.id, 'var'),
    key: asText(input.key, 'VAR_1'),
    value: asText(input.value),
  };
}

function normalizeScenario(input: Partial<TestScenario>): TestScenario {
  return {
    id: asId(input.id, 'scenario'),
    name: asText(input.name, 'New Scenario'),
    description: asText(input.description),
    variables: asArray<SuiteVariable>(input.variables).map((variable) => normalizeSuiteVariable(variable)),
    dataRows: asArray<Record<string, unknown>>(input.dataRows).map((row) => normalizeStringRecord(row)),
    suites: asArray<ScenarioSuite>(input.suites).map((suite) => normalizeScenarioSuite(suite)),
  };
}

function normalizePlanScenario(input: Partial<PlanScenario>): PlanScenario {
  return {
    id: asId(input.id, 'ps'),
    scenarioId: asText(input.scenarioId),
  };
}

function normalizePlan(input: Partial<TestPlan>): TestPlan {
  return {
    id: asId(input.id, 'plan'),
    projectId: asText(input.projectId),
    name: asText(input.name, 'New Test Plan'),
    description: asText(input.description),
    scenarios: asArray<PlanScenario>(input.scenarios).map((scenario) => normalizePlanScenario(scenario)),
  };
}

export function normalizeProject(input: Partial<Project>): Project {
  return {
    id: asId(input.id, 'project'),
    name: asText(input.name, 'Untitled Project'),
    description: asText(input.description),
    pages: asArray<Page>(input.pages).map((page) => normalizePage(page)),
    modules: asArray<TestModule>(input.modules).map((module) => normalizeModule(module)),
    scenarios: asArray<TestScenario>(input.scenarios).map((scenario) => normalizeScenario(scenario)),
    plans: asArray<TestPlan>(input.plans).map((plan) => normalizePlan(plan)),
  };
}

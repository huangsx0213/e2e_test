import type {
  ModuleParameter,
  Page,
  Project,
  ScenarioSuite,
  TestModule,
  TestScenario,
  UIElement,
} from '../../../client/types';
import { asArray, asId, asText, normalizeStringRecord } from '../../utils.ts';
import { normalizeStep } from '../common/step.mapper.ts';

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
  };
}

function normalizeScenario(input: Partial<TestScenario>): TestScenario {
  return {
    id: asId(input.id, 'scenario'),
    name: asText(input.name, 'New Scenario'),
    description: asText(input.description),
    suites: asArray<ScenarioSuite>(input.suites).map((suite) => normalizeScenarioSuite(suite)),
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
  };
}

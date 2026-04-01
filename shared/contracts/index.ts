export type ActionType = string;
export type SelectorType = 'CSS' | 'XPATH' | 'TEXT' | 'ID' | 'TEST_ID' | string;

export interface UIElement {
  id: string;
  name: string;
  selectorType: SelectorType;
  value: string;
  description?: string;
}

export interface Page {
  id: string;
  name: string;
  description?: string;
  elements?: UIElement[];
}

export interface ModuleParameter {
  id: string;
  name: string;
  defaultValue?: string;
  description?: string;
}

export interface TestStep {
  id: string;
  action: ActionType;
  target?: string;
  data?: string;
  description?: string;
  headerProfileId?: string;
  bodyTemplateId?: string;
  endpointId?: string;
  screenshot?: boolean;
  enabled?: boolean;
}

export interface TestModule {
  id: string;
  name: string;
  description?: string;
  params?: ModuleParameter[];
  steps?: TestStep[];
}

export interface SuiteVariable {
  id: string;
  key: string;
  value: string;
}

export interface ScenarioSuite {
  id: string;
  suiteId: string;
  variableOverrides?: Record<string, string>;
  iterationStrategy?: 'SCENARIO_DRIVEN' | 'CROSS_MATRIX' | 'SUITE_DRIVEN';
}

export interface TestScenario {
  id: string;
  name: string;
  description?: string;
  variables?: SuiteVariable[];
  dataRows?: Record<string, string>[];
  suites?: ScenarioSuite[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  pages?: Page[];
  modules?: TestModule[];
  scenarios?: TestScenario[];
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  steps?: TestStep[];
  setupSteps?: TestStep[];
  teardownSteps?: TestStep[];
}

export interface TestSuite {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  cases: TestCase[];
  variables?: SuiteVariable[];
  dataRows?: Record<string, string>[];
  setupSteps?: TestStep[];
  teardownSteps?: TestStep[];
}

export interface HeaderProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  headers: { key: string; value: string; enabled: boolean; }[];
}

export interface BodyTemplate {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  contentType?: 'application/json' | 'application/xml' | 'text/plain' | string;
  content: string;
  defaultValues?: Record<string, string>;
}

export interface ApiEndpoint {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  method?: string;
  url?: string;
  baseUrls?: Record<string, string>;
  parameters?: { key: string; value: string; enabled: boolean }[];
}

export interface ExecutionLog {
  stepId: string;
  timestamp: number;
  status: string;
  message: string;
  screenshot?: string;
}

export interface ExecutionReport {
  id: string;
  suiteId: string;
  suiteName: string;
  environment: string;
  startTime: number;
  endTime: number;
  status: string;
  passRate: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  logs: ExecutionLog[];
}

export interface Settings {
  id: string;
  currentProjectId?: string;
  currentEnvironment?: string;
  headlessMode?: boolean;
}

export interface ExecutionRequest {
  type: 'case' | 'suite' | 'scenario';
  projectId: string;
  environment: string;
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
}

export type ExecutionRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';

export interface ExecutionLogEvent {
  stepId: string;
  timestamp: number;
  status: string;
  message: string;
  screenshot?: string;
  details?: any;
}

export interface ExecutionProgressEvent {
  completed: number;
  total: number;
  percent: number;
}

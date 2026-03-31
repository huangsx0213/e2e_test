export type SelectorType = string;
export type ActionType = string;
export type EnvironmentType = string;

export interface UIElement {
  id: string;
  pageId?: string;
  name: string;
  selectorType: SelectorType;
  value: string;
  description?: string;
  position?: number;
}

export interface Page {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  elements: UIElement[];
  position?: number;
}

export interface ModuleParameter {
  id: string;
  moduleId?: string;
  name: string;
  defaultValue?: string;
  description?: string;
  position?: number;
}

export interface TestStep {
  id: string;
  moduleId?: string;
  suiteId?: string;
  caseId?: string;
  stepGroup?: string;
  action: ActionType;
  target?: string;
  data?: string;
  description?: string;
  endpointId?: string;
  headerProfileId?: string;
  bodyTemplateId?: string;
  screenshot?: boolean;
  enabled?: boolean;
  position?: number;
}

export interface TestModule {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  params?: ModuleParameter[];
  steps?: TestStep[];
  position?: number;
}

export interface ScenarioSuite {
  id: string;
  scenarioId?: string;
  suiteId: string;
  variableOverrides?: Record<string, string>;
  position?: number;
}

export interface TestScenario {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  suites?: ScenarioSuite[];
  position?: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  pages?: Page[];
  modules?: TestModule[];
  scenarios?: TestScenario[];
}

export interface SuiteVariable {
  id: string;
  suiteId?: string;
  key: string;
  value: string;
  position?: number;
}
export type TestVariable = SuiteVariable;

export interface TestCase {
  id: string;
  suiteId?: string;
  name: string;
  description?: string;
  steps?: TestStep[];
  setupSteps?: TestStep[];
  teardownSteps?: TestStep[];
  position?: number;
}

export interface TestSuite {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  variables?: SuiteVariable[];
  dataRows?: Record<string, string>[];
  setupSteps?: TestStep[];
  cases?: TestCase[];
  teardownSteps?: TestStep[];
}

export interface HeaderItem {
  id?: string | number;
  headerId?: string;
  key: string;
  value: string;
  enabled: boolean;
  position?: number;
}

export interface HeaderProfile {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  headers?: HeaderItem[];
}

export interface BodyTemplate {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  contentType?: string;
  content?: string;
  defaultValues?: Record<string, string>;
}

export interface ApiParameter {
  id?: string | number;
  endpointId?: string;
  key: string;
  value: string;
  enabled: boolean;
  position?: number;
}

export interface ApiEndpoint {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  method?: string;
  baseUrls?: Record<string, string>;
  parameters?: ApiParameter[];
}

export interface ExecutionLog {
  id?: string | number;
  reportId?: string;
  stepId: string;
  timestamp: number;
  status: string;
  message: string;
  screenshot?: string;
  position?: number;
}
export type LogEntry = ExecutionLog;

export interface ExecutionReport {
  id: string;
  suiteId: string;
  suiteName?: string;
  environment?: string;
  startTime: number;
  endTime?: number;
  status: string;
  passRate: number;
  totalCases?: number;
  passedCases?: number;
  failedCases?: number;
  logs: ExecutionLog[];
}

export interface Settings {
  id: string;
  currentProjectId: string;
  currentEnvironment: string;
  headlessMode?: boolean;
}

// --- Execution Engine Types ---

export type ExecutionRunType = 'case' | 'suite' | 'scenario';
export type ExecutionRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';

export interface ExecutionRequest {
  type: ExecutionRunType;
  projectId: string;
  environment: string;
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
}

export interface ExecutionLogEvent {
  stepId: string;
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'SKIP' | 'INFO';
  message: string;
  timestamp: number;
  screenshot?: string;
  details?: {
    httpStatus?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    durationMs?: number;
    extractedValue?: string;
  };
}

export interface ExecutionProgressEvent {
  completed: number;
  total: number;
  percent: number;
}

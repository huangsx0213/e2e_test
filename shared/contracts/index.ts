export interface UIElement {
  id: string;
  name: string;
  selectorType: string;
  value: string;
  description?: string;
}

export interface Page {
  id: string;
  name: string;
  description?: string;
  elements: UIElement[];
}

export interface ModuleParameter {
  id: string;
  name: string;
  defaultValue?: string;
  description?: string;
}

export interface TestStep {
  id: string;
  action: string;
  target?: string;
  data?: string;
  description?: string;
  endpointId?: string;
  headerProfileId?: string;
  bodyTemplateId?: string;
}

export interface TestModule {
  id: string;
  name: string;
  description?: string;
  params: ModuleParameter[];
  steps: TestStep[];
}

export interface ScenarioSuite {
  id: string;
  suiteId: string;
  variableOverrides?: Record<string, string>;
}

export interface TestScenario {
  id: string;
  name: string;
  description?: string;
  suites: ScenarioSuite[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  pages: Page[];
  modules: TestModule[];
  scenarios: TestScenario[];
}

export interface TestVariable {
  id: string;
  key: string;
  value: string;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  steps: TestStep[];
}

export interface TestSuite {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  variables: TestVariable[];
  dataRows: Record<string, string>[];
  setupSteps: TestStep[];
  cases: TestCase[];
  teardownSteps: TestStep[];
}

export interface HeaderItem {
  key: string;
  value: string;
  enabled: boolean;
}

export interface HeaderProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  headers: HeaderItem[];
}

export interface BodyTemplate {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  contentType: string;
  content: string;
  defaultValues: Record<string, string>;
}

export interface ApiParameter {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiEndpoint {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  method: string;
  baseUrls: Record<string, string>;
  parameters: ApiParameter[];
}

export interface LogEntry {
  stepId: string;
  timestamp: number;
  status: string;
  message: string;
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
  logs: LogEntry[];
}

export interface Settings {
  id: string;
  currentProjectId: string;
  currentEnvironment: string;
}

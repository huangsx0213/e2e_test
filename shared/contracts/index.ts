export type ActionType = string;
export type SelectorType = 'CSS' | 'XPATH' | 'TEXT' | 'ID' | 'TEST_ID' | string;

export type ExtractorSource = 
  | 'API_BODY_JSON'
  | 'API_BODY_XML'
  | 'API_BODY_REGEX'
  | 'API_HEADER'
  | 'UI_TEXT'
  | 'UI_VALUE'
  | 'UI_ATTRIBUTE'
  | 'UI_PAGE_URL'
  | 'UI_PAGE_TITLE';

export type AssertionSource = 
  | 'API_BODY_JSON'
  | 'API_BODY_XML'
  | 'API_STATUS'
  | 'API_HEADER';

export type AssertionOperator = 
  | 'EQUALS'
  | 'CONTAINS'
  | 'NOT_EQUALS'
  | 'NOT_CONTAINS'
  | 'EXISTS'
  | 'NOT_EXISTS'
  | 'MATCHES_REGEX';

export interface StepAssertion {
  id: string;
  source: AssertionSource;
  expression?: string;
  operator: AssertionOperator;
  expectedValue?: string;
}

export interface VariableExtractor {
  id: string;
  name: string;
  source: ExtractorSource;
  expression?: string;
  scope: 'CASE' | 'SUITE' | 'SCENARIO' | 'ENVIRONMENT';
}

export interface UIElement {
  id: string;
  name: string;
  selectorType: SelectorType;
  value: string;
  description?: string;
  originalHtml?: string;
  pageUrl?: string;
  locators?: { selectorType: SelectorType; value: string }[];
  isVerified?: boolean;
  metadata?: any;
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

export interface NetworkWaitConfig {
  enabled: boolean;
  urlPattern: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY' | string;
  expectedStatus?: number;
  timeoutMs?: number;
  extractors?: VariableExtractor[];
  assertions?: StepAssertion[];
}

export interface NetworkMockConfig {
  id: string;
  enabled: boolean;
  urlPattern: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY' | string;
  status: number;
  body: string;
  delayMs?: number;
}

export interface TestStep {
  id: string;
  action: ActionType;
  target?: string;
  data?: string;
  description?: string;
  namespace?: string;
  headerProfileId?: string;
  bodyTemplateId?: string;
  endpointId?: string;
  screenshot?: boolean;
  enabled?: boolean;
  extractors?: VariableExtractor[];
  waitForNetwork?: NetworkWaitConfig;
  networkMocks?: NetworkMockConfig[];
  assertions?: StepAssertion[];
  isVerified?: boolean;
  metadata?: any;
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

export interface PlanScenario {
  id: string;
  scenarioId: string;
}

export interface DynamicVariable {
  id: string;
  projectId: string;
  name: string;
  expression: string;
  description?: string;
  evaluationStrategy?: 'ONCE_PER_RUN' | 'EVERY_TIME' | 'ONCE_PER_CASE' | 'ONCE_PER_SUITE' | 'ONCE_PER_SCENARIO';
  createdAt?: string;
  updatedAt?: string;
}

export interface TestPlan {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  scenarios: PlanScenario[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  pages?: Page[];
  modules?: TestModule[];
  scenarios?: TestScenario[];
  plans?: TestPlan[];
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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface ExecutionLog {
  id?: string;
  stepId: string;
  timestamp: number;
  status: string; // Keep for backward compatibility, but map to level
  level?: LogLevel;
  message: string;
  screenshot?: string;
  metadata?: any;
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
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface ExecutionRequest {
  type: 'case' | 'suite' | 'scenario' | 'plan';
  projectId: string;
  environment: string;
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
  planId?: string;
}

export type ExecutionRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';

export interface ExecutionLogEvent {
  stepId: string;
  timestamp: number;
  status: string;
  level?: LogLevel;
  message: string;
  screenshot?: string;
  metadata?: any;
}

export interface ExecutionProgressEvent {
  completed: number;
  total: number;
  percent: number;
}

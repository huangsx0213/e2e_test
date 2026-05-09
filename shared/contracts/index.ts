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
  | 'API_HEADER'
  | 'API_DURATION'
  | 'UI_TEXT'
  | 'UI_VALUE'
  | 'UI_ATTRIBUTE'
  | 'UI_PAGE_URL'
  | 'UI_PAGE_TITLE'
  | 'UI_ELEMENT_COUNT'
  | 'UI_ELEMENT_STATE';

export type AssertionOperator =
  | 'EQUALS'
  | 'CONTAINS'
  | 'NOT_EQUALS'
  | 'NOT_CONTAINS'
  | 'EXISTS'
  | 'NOT_EXISTS'
  | 'MATCHES_REGEX'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL'
  | 'IS_TYPE'
  | 'HAS_LENGTH'
  | 'CONTAINS_KEY'
  | 'MATCHES_JSON_SCHEMA'
  | 'LESS_THAN_DURATION';

export interface StepAssertion {
  id: string;
  source: AssertionSource;
  expression?: string;
  operator: AssertionOperator;
  expectedValue?: string;
  flags?: string;
  message?: string;
  continueOnFailure?: boolean;
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
  failureStrategy?: 'fail-fast' | 'soft';
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
  dataSource?: 'SCENARIO' | 'SUITE';
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
  executionType?: string; // suite | case | scenario | plan
  planId?: string;
  planName?: string;
  logs: ExecutionLog[];
}

export interface Settings {
  id: string;
  currentProjectId?: string;
  currentEnvironment?: string;
  headlessMode?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  recordVideo?: boolean;
}

export interface ExecutionRequest {
  type: 'case' | 'suite' | 'scenario' | 'plan';
  projectId: string;
  environment: string;
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
  planId?: string;
  agentId?: string; // Target agent for execution. Null/undefined means default Server runner.
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

export interface RunResult {
  reportId: string;
  status: 'COMPLETED' | 'FAILED' | 'ABORTED' | string;
  passRate: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  durationMs: number;
}

export interface IExecutionLogger {
  log(event: Omit<ExecutionLogEvent, 'timestamp'>): void;
  progress(event: ExecutionProgressEvent): void;
  complete(summary: RunResult): void;
}

export interface ExecutionProgressEvent {
  completed: number;
  total: number;
  percent: number;
}

export type LayerName =
  | 'DYNAMIC'
  | 'ENVIRONMENT'
  | 'RUNTIME_ENVIRONMENT'
  | 'SUITE'
  | 'SUITE_DATA'
  | 'RUNTIME_SUITE'
  | 'MODULE_DEFAULT'
  | 'SCENARIO'
  | 'SCENARIO_DATA'
  | 'RUNTIME_SCENARIO'
  | 'OVERRIDE'
  | 'CALLER_OVERRIDE'
  | 'CASE';

export interface IVariableContext {
  resolve(key: string): string | undefined;
  resolveAll(): Record<string, string>;
  resolveDetailed(): Record<string, unknown>;
  interpolate(template: string): string;
  getCurrentStep(): string | null;
  setCurrentStep(stepId: string): void;
  setCurrentContext(scenarioName: string | null, suiteName: string | null, caseName: string | null): void;
  onVariableSet(callback: (key: string, value: string, scope: string) => void): void;
  createChildContext(moduleDefaults: Record<string, string>, callerOverrides: Record<string, string>): IVariableContext;
  mergeChildExtractedVars(childContext: IVariableContext, namespace?: string): void;
  clearCaseVars(): void;
  clearSuiteVars(): void;
  clearScenarioVars(): void;
  setSharedRuntimeVars(vars: Record<string, string>): void;
  setDynamicVariableCaches(caches: Record<string, string>): void;
  getDynamicVariableCaches(): Record<string, string>;
  setRuntimeVar(key: string, value: string, scope: string, namespace?: string): void;
}

export type IUiExecutor = {
  initialize(options: {
    headless: boolean;
    viewportWidth?: number;
    viewportHeight?: number;
    logger?: IExecutionLogger;
    recordVideo?: boolean;
  }): Promise<void>;
  executeStep(
    step: TestStep,
    context: IVariableContext,
    pages: Page[],
    environment: string,
    onEnvVarExtracted?: (name: string, value: string) => void,
  ): Promise<{
    durationMs: number;
    screenshot?: string;
    extractedValue?: string;
    assertionDetails?: { expected: string; actual: string; target?: string };
    logs?: { status: string; level: string; message: string }[];
  }>;
  captureStateScreenshot(): Promise<string | undefined>;
  cleanup(): Promise<void>;
};

export type IApiStepExecutor = (
  step: TestStep,
  context: IVariableContext,
  assets: { headers: HeaderProfile[]; bodies: BodyTemplate[]; endpoints: ApiEndpoint[] },
  environment: string,
  logger?: IExecutionLogger,
  indent?: string,
  onEnvVarExtracted?: (name: string, value: string) => void,
) => Promise<ApiExecutionResult>;

export interface ApiExecutionResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  resolvedUrl: string;
  resolvedMethod: string;
  resolvedHeaders: Record<string, string>;
  resolvedBody: string;
  assertionLogs: { stepId?: string; status: string; level: LogLevel; message: string; metadata?: any }[];
  extractionLogs: { stepId?: string; status: string; level: LogLevel; message: string; metadata?: any }[];
}

export interface TaskPayload {
  runId: string;
  reportId: string;
  request: ExecutionRequest;
  project: Project;
  suite?: TestSuite;       // Packaged if it's a suite/case run
  suites?: TestSuite[];    // Packaged if it's a scenario/plan run
  assets: {
    headers: HeaderProfile[];
    bodies: BodyTemplate[];
    endpoints: ApiEndpoint[];
  };
  environmentVariables: Record<string, string>;
  dynamicVariables: Record<string, string>;
  dynamicVariableConfigs: Record<string, DynamicVariable>;
  settings: Settings;
}

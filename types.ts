
export type SelectorType = 'CSS' | 'XPath' | 'getByRole' | 'getByText' | 'getByTestId' | 'getByLabel' | 'getByPlaceholder';

export type ActionType = 'OPEN' | 'CLICK' | 'TYPE' | 'ASSERT_VISIBLE' | 'ASSERT_TEXT' | 'API_GET' | 'API_POST' | 'API_PUT' | 'API_DELETE' | 'WAIT' | 'RUN_MODULE';

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
  elements: UIElement[];
}

export type EnvironmentType = string;

export interface ApiEndpoint {
  id: string;
  name: string;
  description?: string;
  baseUrls: Record<string, string>;
}

export interface TestStep {
  id: string;
  action: ActionType;
  target: string; // Format: "PageName/ElementName", raw value, or Module ID
  data: string; // Input data, Expected result, or Parameter overrides (JSON)
  description?: string;
  headerProfileId?: string;
  bodyTemplateId?: string;
  endpointId?: string;
}

export interface ModuleParameter {
  id: string;
  name: string; // The variable name used in steps, e.g. "USER"
  defaultValue?: string;
  description?: string;
}

export interface TestModule {
  id: string;
  name: string;
  description?: string;
  params?: ModuleParameter[]; // Defined inputs for the module
  steps: TestStep[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  pages: Page[];
  modules: TestModule[]; // Reusable modules scoped to project
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
}

export interface SuiteVariable {
  id: string;
  key: string;
  value: string; // Default value
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  cases: TestCase[];
  variables?: SuiteVariable[]; 
  dataRows?: Record<string, string>[]; 
}

export interface ExecutionLog {
  stepId: string;
  timestamp: number;
  status: 'PASS' | 'FAIL' | 'RUNNING' | 'PENDING' | 'SKIPPED';
  message: string;
  screenshot?: string; 
}

export interface ExecutionReport {
  id: string;
  suiteId: string;
  startTime: number;
  endTime?: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  passRate: number;
  logs: ExecutionLog[];
}

export interface HeaderProfile {
  id: string;
  name: string;
  description?: string;
  headers: { key: string; value: string; enabled: boolean }[];
}

export interface BodyTemplate {
  id: string;
  name: string;
  description?: string;
  contentType: 'application/json' | 'application/xml' | 'text/plain' | 'application/x-www-form-urlencoded';
  content: string; // The raw template string with {{variables}}
}

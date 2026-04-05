export type DbBaseProjectRow = {
  id: string;
  name: string;
  description: string;
};

export type DbBaseSuiteRow = {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
};

export type DbPageRow = {
  id: string;
  name: string;
  description: string;
};

export type DbElementRow = {
  id: string;
  name: string;
  selector_type: string;
  value: string;
  description: string;
  original_html: string | null;
  page_url: string | null;
};

export type DbModuleRow = {
  id: string;
  name: string;
  description: string;
};

export type DbModuleParamRow = {
  id: string;
  name: string;
  default_value: string;
  description: string;
};

export type DbScenarioRow = {
  id: string;
  name: string;
  description: string;
};

export type DbScenarioSuiteRow = {
  id: string;
  suite_id: string;
};

export type DbSuiteVariableRow = {
  id: string;
  variable_key: string;
  variable_value: string;
};

export type DbCaseRow = {
  id: string;
  name: string;
  description: string;
};

export type DbStepRow = {
  id: string;
  action: string;
  target: string;
  data: string;
  description: string;
  header_profile_id: string | null;
  body_template_id: string | null;
  endpoint_id: string | null;
  screenshot: number | null;
  enabled: number;
  extractors?: string | null;
};

export type DbHeaderRow = {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
};

export type DbHeaderItemRow = {
  item_key: string;
  item_value: string;
  enabled: number;
};

export type DbBodyRow = {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  content_type: string;
  content: string;
};

export type DbBodyDefaultValueRow = {
  item_key: string;
  item_value: string;
};

export type DbEndpointRow = {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  method: string | null;
};

export type DbEndpointBaseUrlRow = {
  environment: string;
  url: string;
};

export type DbEndpointParameterRow = {
  item_key: string;
  item_value: string;
  enabled: number;
};

export type DbReportRow = {
  id: string;
  suite_id: string;
  suite_name: string | null;
  environment: string | null;
  start_time: number;
  end_time: number | null;
  status: string;
  pass_rate: number;
  total_cases: number | null;
  passed_cases: number | null;
  failed_cases: number | null;
};

export type DbReportLogRow = {
  step_id: string;
  timestamp: number;
  status: string;
  level: string | null;
  message: string;
  screenshot: string | null;
  metadata: string | null;
};

export type DbSettingsRow = {
  id: string;
  current_project_id: string;
  current_environment: string;
  headless_mode: number;
  viewport_width: number;
  viewport_height: number;
};

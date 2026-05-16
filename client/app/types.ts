export type AppTab =
  | 'DASHBOARD'
  | 'RUN'
  | 'ELEMENTS'
  | 'MODULES'
  | 'TESTS'
  | 'HEADERS'
  | 'BODIES'
  | 'ENDPOINTS'
  | 'REPORTS'
  | 'SETTINGS'
  | 'DOCUMENTATION'
  | 'DYNAMIC_VARIABLES'
  | 'AGENTS'
  | 'REQUIREMENTS';

export interface ExecutionState {
  suiteId: string;
  caseId?: string;
  runSuite?: boolean;
}

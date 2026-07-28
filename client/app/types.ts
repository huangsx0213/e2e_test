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
  | 'REQUIREMENTS'
  | 'NL_CASES'
  | 'AI_TEST_GEN'
  | 'AI_DRIVEN_RECORDER';

export interface ExecutionState {
  suiteId: string;
  caseId?: string;
  runSuite?: boolean;
}

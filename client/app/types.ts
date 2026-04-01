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
  | 'SETTINGS';

export interface ExecutionState {
  suiteId: string;
  caseId?: string;
  runSuite?: boolean;
}

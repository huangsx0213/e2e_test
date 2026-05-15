import type { Project, HeaderProfile, BodyTemplate, ApiEndpoint, DynamicVariable, TestSuite, ExecutionReport, Settings } from '../../shared/contracts/index.ts';

export interface ExecutionDataLoader {
  getProject(id: string): Project | undefined;
  listHeaders(): HeaderProfile[];
  listBodies(): BodyTemplate[];
  listEndpoints(): ApiEndpoint[];
  getEnvironmentVariables(env: string): Record<string, string>;
  updateEnvironmentVariables(env: string, vars: Record<string, string>): void;
  findDynamicVariables(projectId: string): DynamicVariable[];
  listSettings(): Settings[];
  listSuites(): TestSuite[];
  getSuite(id: string): TestSuite | undefined;
  saveReport(report: Partial<ExecutionReport>): void;
}

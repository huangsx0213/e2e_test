import type { Project, ApiEndpoint, HeaderProfile, BodyTemplate, TestStep } from '../../shared/contracts/index.ts';

export interface BroadcastService {
  broadcastToProject(projectId: string, event: string, data: unknown): void;
}

export interface RecordingIngestService {
  getProject(id: string): Project | undefined;
  saveProject(project: Project): void;
  listApiEndpoints(): ApiEndpoint[];
  saveApiEndpoint(data: Partial<ApiEndpoint>): ApiEndpoint;
  listHeaderProfiles(): HeaderProfile[];
  saveHeaderProfile(data: Partial<HeaderProfile>): HeaderProfile;
  listBodyTemplates(): BodyTemplate[];
  saveBodyTemplate(data: Partial<BodyTemplate>): BodyTemplate;
  addStepToCase(caseId: string, step: TestStep): void;
}

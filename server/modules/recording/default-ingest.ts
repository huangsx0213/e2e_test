import type { RecordingIngestService } from './ingest-service.ts';
import { getProject, saveProject } from '../projects/repository.ts';
import { saveApiEndpoint, listApiEndpoints } from '../endpoints/repository.ts';
import { saveHeaderProfile, listHeaderProfiles } from '../headers/repository.ts';
import { saveBodyTemplate, listBodyTemplates } from '../bodies/repository.ts';
import { addStepToCase } from '../suites/repository.ts';
import type { Project, ApiEndpoint, HeaderProfile, BodyTemplate, TestStep } from '../../shared/contracts/index.ts';

export const defaultIngestService: RecordingIngestService = {
  getProject: (id) => getProject(id),
  saveProject: (project) => saveProject(project),
  listApiEndpoints: () => listApiEndpoints(),
  saveApiEndpoint: (data) => saveApiEndpoint(data),
  listHeaderProfiles: () => listHeaderProfiles(),
  saveHeaderProfile: (data) => saveHeaderProfile(data),
  listBodyTemplates: () => listBodyTemplates(),
  saveBodyTemplate: (data) => saveBodyTemplate(data),
  addStepToCase: (caseId, step) => addStepToCase(caseId, step),
};

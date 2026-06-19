import { registerRoute, type RouteContext } from './route-registry';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { ElementRepo } from '@/features/elements/ElementRepo';
import { TestRunner } from '@/features/execution/TestRunner';
import { ModuleBuilder } from '@/features/modules/ModuleBuilder';
import { BodyManager } from '@/features/api-assets/BodyManager';
import { EndpointManager } from '@/features/api-assets/EndpointManager';
import { HeadersManager } from '@/features/api-assets/HeadersManager';
import { TestReport } from '@/features/reports/TestReport';
import { Settings } from '@/features/settings/Settings';
import { TestBuilder } from '@/features/tests/TestBuilder';
import { DynamicVariables } from '@/features/dynamic-variables/DynamicVariables';
import { Documentation } from '@/features/documentation/Documentation';
import { AgentManagement } from '@/features/agents/AgentManagement';
import { RequirementsPage } from '@/features/requirements/RequirementsPage';
import { BusinessFlowsPage } from '@/features/business-flows/BusinessFlowsPage';
import { NlCasesPage } from '@/features/nl-cases/NlCasesPage';
import { AiTestGenPage } from '@/features/ai-test-gen/AiTestGenPage';
import { AiDrivenRecorderPage } from '@/features/ai-driven-recorder/AiDrivenRecorderPage';
import { setPendingRecorderNlCaseId, consumePendingRecorderNlCaseId } from './navigation-params';

registerRoute('DASHBOARD', Dashboard, (ctx) => ({
  projects: ctx.projects,
  suites: ctx.scopedSuites,
  environments: ctx.environments,
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('RUN', TestRunner, (ctx) => ({
  projects: ctx.projects,
  projectsApi: ctx.projectsApi,
  suites: ctx.scopedSuites,
  currentProjectId: ctx.currentProjectId,
  headers: ctx.scopedHeaders,
  bodies: ctx.scopedBodies,
  endpoints: ctx.scopedEndpoints,
  environments: ctx.environments,
  initialEnvironment: ctx.currentEnvironment,
}));

registerRoute('ELEMENTS', ElementRepo, (ctx) => ({
  projects: ctx.projects,
  projectsApi: ctx.projectsApi,
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('MODULES', ModuleBuilder, (ctx) => ({
  projects: ctx.projects,
  projectsApi: ctx.projectsApi,
  headers: ctx.scopedHeaders,
  bodies: ctx.scopedBodies,
  endpoints: ctx.scopedEndpoints,
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('TESTS', TestBuilder, (ctx) => ({
  suites: ctx.scopedSuites,
  suitesApi: ctx.suitesApi,
  projects: ctx.projects,
  headers: ctx.scopedHeaders,
  headersApi: ctx.headersApi,
  bodies: ctx.scopedBodies,
  bodiesApi: ctx.bodiesApi,
  endpoints: ctx.scopedEndpoints,
  endpointsApi: ctx.endpointsApi,
  onRunCase: (suiteId: string, caseId: string, runSuite?: boolean) =>
    ctx.setExecutionState({ suiteId, caseId, runSuite }),
  currentProjectId: ctx.currentProjectId,
  currentEnvironment: ctx.currentEnvironment,
}));

registerRoute('ENDPOINTS', EndpointManager, (ctx) => ({
  endpoints: ctx.scopedEndpoints,
  endpointsApi: ctx.endpointsApi,
  environments: ctx.environments,
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('HEADERS', HeadersManager, (ctx) => ({
  headers: ctx.scopedHeaders,
  headersApi: ctx.headersApi,
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('BODIES', BodyManager, (ctx) => ({
  bodies: ctx.scopedBodies,
  bodiesApi: ctx.bodiesApi,
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('REPORTS', TestReport, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
  suites: ctx.suites,
}));

registerRoute('SETTINGS', Settings, (ctx) => ({
  environments: ctx.environments,
  environmentsApi: ctx.environmentsApi,
  currentEnvironment: ctx.currentEnvironment,
  setCurrentEnvironment: ctx.setCurrentEnvironment,
  projects: ctx.projects,
  projectsApi: ctx.projectsApi,
  currentProjectId: ctx.currentProjectId,
  setCurrentProjectId: ctx.setCurrentProjectId,
  settings: ctx.settings,
  settingsApi: ctx.settingsApi,
}));

registerRoute('DOCUMENTATION', Documentation, () => ({}));

registerRoute('DYNAMIC_VARIABLES', DynamicVariables, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('AGENTS', AgentManagement, () => ({}));

registerRoute('REQUIREMENTS', RequirementsPage, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('BUSINESS_FLOWS', BusinessFlowsPage, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('NL_CASES', NlCasesPage, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
  onRecordWithAI: (nlCaseId: string) => {
    setPendingRecorderNlCaseId(nlCaseId);
    ctx.navigateToTab('AI_DRIVEN_RECORDER');
  },
}));

registerRoute('AI_TEST_GEN', AiTestGenPage, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
}));

registerRoute('AI_DRIVEN_RECORDER', AiDrivenRecorderPage, (ctx) => ({
  currentProjectId: ctx.currentProjectId,
  preselectNlCaseId: consumePendingRecorderNlCaseId(),
  onNavigateToTestBuilder: (suiteId: string, caseId: string) =>
    ctx.setExecutionState({ suiteId, caseId, runSuite: false }),
}));

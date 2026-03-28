import type { Dispatch, SetStateAction } from 'react';
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
import { AppTab, ExecutionState } from '@/app/types';
import { CrudActions, EnvironmentActions } from '@/shared/hooks/useCrud';
import {
  ApiEndpoint,
  BodyTemplate,
  HeaderProfile,
  Project,
  TestSuite,
} from '@/shared/types';

interface AppContentProps {
  activeTab: AppTab;
  projects: Project[];
  projectsApi: CrudActions<Project>;
  suites: TestSuite[];
  suitesApi: CrudActions<TestSuite>;
  headers: HeaderProfile[];
  headersApi: CrudActions<HeaderProfile>;
  bodies: BodyTemplate[];
  bodiesApi: CrudActions<BodyTemplate>;
  endpoints: ApiEndpoint[];
  endpointsApi: CrudActions<ApiEndpoint>;
  environments: string[];
  environmentsApi: EnvironmentActions;
  currentEnvironment: string;
  currentProjectId: string;
  setCurrentEnvironment: Dispatch<SetStateAction<string>>;
  setCurrentProjectId: Dispatch<SetStateAction<string>>;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setExecutionState: Dispatch<SetStateAction<ExecutionState | null>>;
}

export function AppContent({
  activeTab,
  projects,
  projectsApi,
  suites,
  suitesApi,
  headers,
  headersApi,
  bodies,
  bodiesApi,
  endpoints,
  endpointsApi,
  environments,
  environmentsApi,
  currentEnvironment,
  currentProjectId,
  setCurrentEnvironment,
  setCurrentProjectId,
  setActiveTab,
  setExecutionState,
}: AppContentProps) {
  switch (activeTab) {
    case 'DASHBOARD':
      return (
        <Dashboard
          projects={projects}
          suites={suites}
          environments={environments}
          currentProjectId={currentProjectId}
          onNavigate={setActiveTab}
        />
      );
    case 'RUN':
      return (
        <TestRunner
          projects={projects}
          projectsApi={projectsApi}
          suites={suites}
          currentProjectId={currentProjectId}
          headers={headers}
          bodies={bodies}
          endpoints={endpoints}
          environments={environments}
          initialEnvironment={currentEnvironment}
        />
      );
    case 'ELEMENTS':
      return (
        <ElementRepo
          projects={projects}
          projectsApi={projectsApi}
          currentProjectId={currentProjectId}
        />
      );
    case 'MODULES':
      return (
        <ModuleBuilder
          projects={projects}
          projectsApi={projectsApi}
          headers={headers}
          bodies={bodies}
          endpoints={endpoints}
          currentProjectId={currentProjectId}
        />
      );
    case 'TESTS':
      return (
        <TestBuilder
          suites={suites}
          suitesApi={suitesApi}
          projects={projects}
          headers={headers}
          bodies={bodies}
          endpoints={endpoints}
          onRunCase={(suiteId, caseId) => setExecutionState({ suiteId, caseId })}
          currentProjectId={currentProjectId}
        />
      );
    case 'ENDPOINTS':
      return (
        <EndpointManager
          endpoints={endpoints}
          endpointsApi={endpointsApi}
          environments={environments}
          currentProjectId={currentProjectId}
        />
      );
    case 'HEADERS':
      return (
        <HeadersManager
          headers={headers}
          headersApi={headersApi}
          currentProjectId={currentProjectId}
        />
      );
    case 'BODIES':
      return (
        <BodyManager
          bodies={bodies}
          bodiesApi={bodiesApi}
          currentProjectId={currentProjectId}
        />
      );
    case 'REPORTS':
      return <TestReport />;
    case 'SETTINGS':
      return (
        <Settings
          environments={environments}
          environmentsApi={environmentsApi}
          currentEnvironment={currentEnvironment}
          setCurrentEnvironment={setCurrentEnvironment}
          projects={projects}
          projectsApi={projectsApi}
          currentProjectId={currentProjectId}
          setCurrentProjectId={setCurrentProjectId}
        />
      );
    default:
      return null;
  }
}

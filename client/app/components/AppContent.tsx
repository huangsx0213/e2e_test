import { Dashboard } from "@/features/dashboard/Dashboard";
import { ElementRepo } from "@/features/elements/ElementRepo";
import { TestRunner } from "@/features/execution/TestRunner";
import { ModuleBuilder } from "@/features/modules/ModuleBuilder";
import { BodyManager } from "@/features/api-assets/BodyManager";
import { EndpointManager } from "@/features/api-assets/EndpointManager";
import { HeadersManager } from "@/features/api-assets/HeadersManager";
import { TestReport } from "@/features/reports/TestReport";
import { Settings } from "@/features/settings/Settings";
import { TestBuilder } from "@/features/tests/TestBuilder";
import { DynamicVariables } from "@/features/dynamic-variables/DynamicVariables";
import { Documentation } from "@/features/documentation/Documentation";
import { AgentManagement } from "@/features/agents/AgentManagement";
import { RequirementsPage } from "@/features/requirements/RequirementsPage";
import { BusinessFlowsPage } from "@/features/business-flows/BusinessFlowsPage";
import type { Dispatch, SetStateAction } from "react";
import { AppTab } from "@/app/types";
import { useWorkspaceContext } from "@/app/contexts/WorkspaceContext";
import { useDataContext } from "@/app/contexts/DataContext";
import { useExecutionPanelContext } from "@/app/contexts/ExecutionContext";

interface AppContentProps {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
}

export function AppContent({ activeTab, setActiveTab }: AppContentProps) {
  const {
    projects, projectsApi, currentProjectId, currentEnvironment,
    setCurrentEnvironment, setCurrentProjectId, settings, settingsApi,
    environments, environmentsApi,
  } = useWorkspaceContext();

  const {
    suites, suitesApi, headers, headersApi, bodies, bodiesApi,
    endpoints, endpointsApi, scopedSuites, scopedHeaders, scopedBodies, scopedEndpoints,
  } = useDataContext();

  const { setExecutionState } = useExecutionPanelContext();

  switch (activeTab) {
    case "DASHBOARD":
      return (
        <Dashboard
          projects={projects}
          suites={scopedSuites}
          environments={environments}
          currentProjectId={currentProjectId}
        />
      );
    case "RUN":
      return (
        <TestRunner
          projects={projects}
          projectsApi={projectsApi}
          suites={scopedSuites}
          currentProjectId={currentProjectId}
          headers={scopedHeaders}
          bodies={scopedBodies}
          endpoints={scopedEndpoints}
          environments={environments}
          initialEnvironment={currentEnvironment}
        />
      );
    case "ELEMENTS":
      return (
        <ElementRepo
          projects={projects}
          projectsApi={projectsApi}
          currentProjectId={currentProjectId}
        />
      );
    case "MODULES":
      return (
        <ModuleBuilder
          projects={projects}
          projectsApi={projectsApi}
          headers={scopedHeaders}
          bodies={scopedBodies}
          endpoints={scopedEndpoints}
          currentProjectId={currentProjectId}
        />
      );
    case "TESTS":
      return (
        <TestBuilder
          suites={scopedSuites}
          suitesApi={suitesApi}
          projects={projects}
          headers={scopedHeaders}
          headersApi={headersApi}
          bodies={scopedBodies}
          bodiesApi={bodiesApi}
          endpoints={scopedEndpoints}
          endpointsApi={endpointsApi}
          onRunCase={(suiteId, caseId, runSuite) =>
            setExecutionState({ suiteId, caseId, runSuite })
          }
          currentProjectId={currentProjectId}
          currentEnvironment={currentEnvironment}
        />
      );
    case "ENDPOINTS":
      return (
        <EndpointManager
          endpoints={scopedEndpoints}
          endpointsApi={endpointsApi}
          environments={environments}
          currentProjectId={currentProjectId}
        />
      );
    case "HEADERS":
      return (
        <HeadersManager
          headers={scopedHeaders}
          headersApi={headersApi}
          currentProjectId={currentProjectId}
        />
      );
    case "BODIES":
      return (
        <BodyManager
          bodies={scopedBodies}
          bodiesApi={bodiesApi}
          currentProjectId={currentProjectId}
        />
      );
    case "REPORTS":
      return (
        <TestReport
          currentProjectId={currentProjectId}
          suites={suites}
        />
      );
    case "SETTINGS":
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
          settings={settings}
          settingsApi={settingsApi}
        />
      );
    case "DOCUMENTATION":
      return <Documentation />;
    case "DYNAMIC_VARIABLES":
      return <DynamicVariables currentProjectId={currentProjectId} />;
    case "AGENTS":
      return <AgentManagement />;
    case "REQUIREMENTS":
      return <RequirementsPage currentProjectId={currentProjectId} />;
    case "BUSINESS_FLOWS":
      return <BusinessFlowsPage currentProjectId={currentProjectId} />;
    default:
      return null;
  }
}

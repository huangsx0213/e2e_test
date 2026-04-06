import React, { useMemo, useState } from "react";
import { ExecutionRunner } from "@/features/execution/ExecutionRunner";
import { SuiteExecutionRunner } from "@/features/execution/SuiteExecutionRunner";
import { AppContent } from "@/app/components/AppContent";
import { AppHeader } from "@/app/components/AppHeader";
import { AppLoadingScreen } from "@/app/components/AppLoadingScreen";
import { AppSidebar } from "@/app/components/AppSidebar";
import { useProjectScope } from "@/app/hooks/useProjectScope";
import { useWorkspaceSelection } from "@/app/hooks/useWorkspaceSelection";
import { AppTab, ExecutionState } from "@/app/types";
import {
  Project,
  TestSuite,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
  Settings as SettingsType,
  ExecutionReport,
} from "@/shared/types";
import { useCrud, useEnvCrud } from "@/shared/hooks/useCrud";
import { api } from "@/shared/services/api";

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("DASHBOARD");

  const [projects, projectsApi, loadingProjects] = useCrud<Project>(
    api.projects,
  );
  const [suites, suitesApi, loadingSuites] = useCrud<TestSuite>(api.suites);
  const [headers, headersApi, loadingHeaders] = useCrud<HeaderProfile>(
    api.headers,
  );
  const [bodies, bodiesApi, loadingBodies] = useCrud<BodyTemplate>(api.bodies);
  const [endpoints, endpointsApi, loadingEndpoints] = useCrud<ApiEndpoint>(
    api.endpoints,
  );
  const [environments, environmentsApi, loadingEnvironments] = useEnvCrud(
    api.environments,
  );
  const [settings, settingsApi, loadingSettings] = useCrud<SettingsType>(
    api.settings,
  );
  const [reports, reportsApi, loadingReports] = useCrud<ExecutionReport>(
    api.reports,
  );

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(
    null,
  );

  const {
    currentEnvironment,
    currentProjectId,
    setCurrentEnvironment,
    setCurrentProjectId,
  } = useWorkspaceSelection({
    projects,
    environments,
    settings,
    loadingProjects,
    loadingEnvironments,
    loadingSettings,
    settingsApi,
  });

  const isLoading =
    loadingProjects ||
    loadingSuites ||
    loadingHeaders ||
    loadingBodies ||
    loadingEndpoints ||
    loadingEnvironments ||
    loadingSettings;

  const currentProject = useMemo(
    () =>
      projects.find((project) => project.id === currentProjectId) ||
      projects[0],
    [projects, currentProjectId],
  );

  const activeSuite = useMemo(
    () => suites.find((suite) => suite.id === executionState?.suiteId),
    [suites, executionState],
  );

  const activeCase = useMemo(
    () =>
      activeSuite?.cases.find(
        (testCase) => testCase.id === executionState?.caseId,
      ),
    [activeSuite, executionState],
  );

  const scopedData = useProjectScope({
    currentProjectId,
    suites,
    headers,
    bodies,
    endpoints,
  });

  const currentProjectName = currentProject?.name || "No Project Selected";

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  return (
    <div className="flex h-screen bg-gray-50 text-slate-900 font-sans">
      <AppSidebar
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        onCollapseChange={setIsSidebarCollapsed}
        onTabChange={setActiveTab}
      />

      <main className="flex-1 overflow-hidden relative flex flex-col bg-white">
        <AppHeader currentProjectName={currentProjectName} />

        <div className="flex-1 overflow-hidden relative bg-gray-50/50">
          <AppContent
            activeTab={activeTab}
            projects={projects}
            projectsApi={projectsApi}
            suites={scopedData.suites}
            allSuites={suites}
            suitesApi={suitesApi}
            headers={scopedData.headers}
            headersApi={headersApi}
            bodies={scopedData.bodies}
            bodiesApi={bodiesApi}
            endpoints={scopedData.endpoints}
            endpointsApi={endpointsApi}
            environments={environments}
            environmentsApi={environmentsApi}
            currentEnvironment={currentEnvironment}
            currentProjectId={currentProjectId}
            setCurrentEnvironment={setCurrentEnvironment}
            setCurrentProjectId={setCurrentProjectId}
            setActiveTab={setActiveTab}
            setExecutionState={setExecutionState}
            settings={settings}
            settingsApi={settingsApi}
          />
        </div>
      </main>

      {executionState &&
        activeSuite &&
        !executionState.runSuite &&
        activeCase && (
          <div className="fixed inset-0 z-50">
            <ExecutionRunner
              suite={activeSuite}
              testCase={activeCase}
              project={currentProject}
              headers={headers}
              bodies={bodies}
              endpoints={endpoints}
              environments={environments}
              initialEnvironment={currentEnvironment}
              reportsApi={reportsApi}
              onClose={() => setExecutionState(null)}
            />
          </div>
        )}

      {executionState && activeSuite && executionState.runSuite && (
        <div className="fixed inset-0 z-50 bg-white">
          <SuiteExecutionRunner
            suite={activeSuite}
            project={currentProject}
            headers={headers}
            bodies={bodies}
            endpoints={endpoints}
            environments={environments}
            initialEnvironment={currentEnvironment}
            reportsApi={reportsApi}
            onClose={() => setExecutionState(null)}
          />
        </div>
      )}
    </div>
  );
}

export default App;

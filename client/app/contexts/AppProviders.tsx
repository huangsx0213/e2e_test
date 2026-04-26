import { useMemo, useState, useCallback } from 'react';
import { Project, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint, Settings as SettingsType, ExecutionReport } from '@/shared/types';
import { useCrud, useEnvCrud } from '@/shared/hooks/useCrud';
import { api } from '@/shared/services/api';
import { useProjectScope } from '@/app/hooks/useProjectScope';
import { useWorkspaceSelection } from '@/app/hooks/useWorkspaceSelection';
import { DataContext, DataContextValue } from '@/app/contexts/DataContext';
import { WorkspaceContext, WorkspaceContextValue } from '@/app/contexts/WorkspaceContext';
import { ExecutionPanelContext, ExecutionContextValue } from '@/app/contexts/ExecutionContext';
import { ExecutionState } from '@/app/types';

export function AppProviders({ children }: { children: (isLoading: boolean) => React.ReactNode }) {
  const [projects, projectsApi, loadingProjects] = useCrud<Project>(api.projects);
  const [suites, suitesApi, loadingSuites] = useCrud<TestSuite>(api.suites);
  const [headers, headersApi, loadingHeaders] = useCrud<HeaderProfile>(api.headers);
  const [bodies, bodiesApi, loadingBodies] = useCrud<BodyTemplate>(api.bodies);
  const [endpoints, endpointsApi, loadingEndpoints] = useCrud<ApiEndpoint>(api.endpoints);
  const [environments, environmentsApi, loadingEnvironments] = useEnvCrud(api.environments);
  const [settings, settingsApi, loadingSettings] = useCrud<SettingsType>(api.settings);
  const [, reportsApi] = useCrud<ExecutionReport>(api.reports);

  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);

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

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) || projects[0],
    [projects, currentProjectId],
  );

  const scopedData = useProjectScope({
    currentProjectId,
    suites,
    headers,
    bodies,
    endpoints,
  });

  const isLoading =
    loadingProjects || loadingSuites || loadingHeaders || loadingBodies || loadingEndpoints || loadingEnvironments || loadingSettings;

  const setExecutionStateStable = useCallback((s: ExecutionState | null) => setExecutionState(s), []);

  const setCurrentProjectIdStable = useCallback((id: string) => setCurrentProjectId(id), [setCurrentProjectId]);
  const setCurrentEnvironmentStable = useCallback((env: string) => setCurrentEnvironment(env), [setCurrentEnvironment]);

  const workspaceValue: WorkspaceContextValue = useMemo(
    () => ({
      projects,
      projectsApi,
      currentProjectId,
      setCurrentProjectId: setCurrentProjectIdStable,
      currentProject,
      settings,
      settingsApi,
      currentEnvironment,
      setCurrentEnvironment: setCurrentEnvironmentStable,
      environments,
      environmentsApi,
    }),
    [projects, projectsApi, currentProjectId, setCurrentProjectIdStable, currentProject, settings, settingsApi, currentEnvironment, setCurrentEnvironmentStable, environments, environmentsApi],
  );

  const dataValue: DataContextValue = useMemo(
    () => ({
      suites,
      suitesApi,
      headers,
      headersApi,
      bodies,
      bodiesApi,
      endpoints,
      endpointsApi,
      reportsApi,
      scopedSuites: scopedData.suites,
      scopedHeaders: scopedData.headers,
      scopedBodies: scopedData.bodies,
      scopedEndpoints: scopedData.endpoints,
    }),
    [suites, suitesApi, headers, headersApi, bodies, bodiesApi, endpoints, endpointsApi, reportsApi, scopedData],
  );

  const executionValue: ExecutionContextValue = useMemo(
    () => ({ executionState, setExecutionState: setExecutionStateStable }),
    [executionState, setExecutionStateStable],
  );

  if (isLoading) {
    return <>{children(true)}</>;
  }

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <DataContext.Provider value={dataValue}>
        <ExecutionPanelContext.Provider value={executionValue}>
          {children(false)}
        </ExecutionPanelContext.Provider>
      </DataContext.Provider>
    </WorkspaceContext.Provider>
  );
}

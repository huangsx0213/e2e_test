import { useMemo, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Project, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint, Settings as SettingsType, ExecutionReport } from '@/shared/types';
import {
  useProjects,
  useSuites,
  useHeaders,
  useBodies,
  useEndpoints,
  useSettings,
  useEnvironments,
  useProjectMutations,
  useSuiteMutations,
  useHeaderMutations,
  useBodyMutations,
  useEndpointMutations,
  useSettingsMutations,
  useEnvironmentMutations,
  useReportMutations,
} from '@/shared/hooks/useQueryHooks';
import { useProjectScope } from '@/app/hooks/useProjectScope';
import { useWorkspaceSelection } from '@/app/hooks/useWorkspaceSelection';
import { DataContext, DataContextValue } from '@/app/contexts/DataContext';
import { WorkspaceContext, WorkspaceContextValue } from '@/app/contexts/WorkspaceContext';
import { ExecutionPanelContext, ExecutionContextValue } from '@/app/contexts/ExecutionContext';
import { ExecutionState } from '@/app/types';
import { PipelineRunDepsProvider } from '@/shared/pipeline-run';
import { createFetchSSEConnection } from '@/shared/sse';
import { api } from '@/shared/services/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

export { queryClient };

export function AppProviders({ children }: { children: (isLoading: boolean) => React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvidersInner>{children}</AppProvidersInner>
    </QueryClientProvider>
  );
}

function AppProvidersInner({ children }: { children: (isLoading: boolean) => React.ReactNode }) {
  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const { data: suites = [], isLoading: loadingSuites } = useSuites();
  const { data: headers = [], isLoading: loadingHeaders } = useHeaders();
  const { data: bodies = [], isLoading: loadingBodies } = useBodies();
  const { data: endpoints = [], isLoading: loadingEndpoints } = useEndpoints();
  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments();
  const { data: settings = [], isLoading: loadingSettings } = useSettings();

  const projectsApi = useProjectMutations();
  const suitesApi = useSuiteMutations();
  const headersApi = useHeaderMutations();
  const bodiesApi = useBodyMutations();
  const endpointsApi = useEndpointMutations();
  const settingsApi = useSettingsMutations();
  const environmentsApi = useEnvironmentMutations();
  const reportsApi = useReportMutations();

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

  const pipelineDeps = useMemo(() => ({
    api: api.pipeline as any,
    createSSEConnection: (url: string) => createFetchSSEConnection(url, {}),
  }), []);

  if (isLoading) {
    return <>{children(true)}</>;
  }

  return (
    <PipelineRunDepsProvider deps={pipelineDeps}>
      <WorkspaceContext.Provider value={workspaceValue}>
        <DataContext.Provider value={dataValue}>
          <ExecutionPanelContext.Provider value={executionValue}>
            {children(false)}
          </ExecutionPanelContext.Provider>
        </DataContext.Provider>
      </WorkspaceContext.Provider>
    </PipelineRunDepsProvider>
  );
}

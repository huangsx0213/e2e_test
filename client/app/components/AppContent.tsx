import type { Dispatch, SetStateAction } from 'react';
import { AppTab } from '@/app/types';
import { useWorkspaceContext } from '@/app/contexts/WorkspaceContext';
import { useDataContext } from '@/app/contexts/DataContext';
import { useExecutionPanelContext } from '@/app/contexts/ExecutionContext';
import { renderRoute } from '@/app/routing/route-registry';
import '@/app/routing/routes';

interface AppContentProps {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
}

export function AppContent({ activeTab, setActiveTab }: AppContentProps) {
  const workspace = useWorkspaceContext();
  const data = useDataContext();
  const { setExecutionState } = useExecutionPanelContext();

  return renderRoute(activeTab, {
    currentProjectId: workspace.currentProjectId,
    currentEnvironment: workspace.currentEnvironment,
    projects: workspace.projects,
    projectsApi: workspace.projectsApi,
    settings: workspace.settings,
    settingsApi: workspace.settingsApi,
    environments: workspace.environments,
    environmentsApi: workspace.environmentsApi,
    suites: data.suites,
    suitesApi: data.suitesApi,
    headers: data.headers,
    headersApi: data.headersApi,
    bodies: data.bodies,
    bodiesApi: data.bodiesApi,
    endpoints: data.endpoints,
    endpointsApi: data.endpointsApi,
    scopedSuites: data.scopedSuites,
    scopedHeaders: data.scopedHeaders,
    scopedBodies: data.scopedBodies,
    scopedEndpoints: data.scopedEndpoints,
    setCurrentEnvironment: workspace.setCurrentEnvironment,
    setCurrentProjectId: workspace.setCurrentProjectId,
    setExecutionState,
    navigateToTab: setActiveTab,
  });
}

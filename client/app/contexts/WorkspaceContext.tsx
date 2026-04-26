import { createContext, useContext } from 'react';
import { CrudActions } from '@/shared/hooks/useCrud';
import { Project, Settings as SettingsData } from '@/shared/types';

export interface WorkspaceContextValue {
  projects: Project[];
  projectsApi: CrudActions<Project>;
  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;
  currentProject: Project | undefined;
  settings: SettingsData[];
  settingsApi: CrudActions<SettingsData>;
  currentEnvironment: string;
  setCurrentEnvironment: (env: string) => void;
  environments: string[];
  environmentsApi: import('@/shared/hooks/useCrud').EnvironmentActions;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceContext.Provider');
  return ctx;
}

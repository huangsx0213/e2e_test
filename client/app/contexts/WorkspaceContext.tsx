import { createContext, useContext } from 'react';
import { MutationActions, EnvironmentMutationActions } from '@/shared/hooks/useQueryHooks';
import { Project, Settings as SettingsData } from '@/shared/types';

export interface WorkspaceContextValue {
  projects: Project[];
  projectsApi: MutationActions<Project>;
  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;
  currentProject: Project | undefined;
  settings: SettingsData[];
  settingsApi: MutationActions<SettingsData>;
  currentEnvironment: string;
  setCurrentEnvironment: (env: string) => void;
  environments: string[];
  environmentsApi: EnvironmentMutationActions;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceContext.Provider');
  return ctx;
}

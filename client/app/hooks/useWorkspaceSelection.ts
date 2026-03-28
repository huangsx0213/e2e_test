import { useEffect, useState } from 'react';
import { CrudActions } from '@/shared/hooks/useCrud';
import { Project, Settings } from '@/shared/types';

interface WorkspaceSelectionParams {
  projects: Project[];
  environments: string[];
  settings: Settings[];
  loadingProjects: boolean;
  loadingEnvironments: boolean;
  loadingSettings: boolean;
  settingsApi: CrudActions<Settings>;
}

export function useWorkspaceSelection({
  projects,
  environments,
  settings,
  loadingProjects,
  loadingEnvironments,
  loadingSettings,
  settingsApi,
}: WorkspaceSelectionParams) {
  const [currentEnvironment, setCurrentEnvironment] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  useEffect(() => {
    if (
      settingsHydrated ||
      loadingSettings ||
      loadingProjects ||
      loadingEnvironments
    ) {
      return;
    }

    const globalSettings = settings.find((item) => item.id === 'global');
    const savedProjectId = globalSettings?.currentProjectId;
    const savedEnvironment = globalSettings?.currentEnvironment;

    const nextProjectId =
      savedProjectId && projects.some((project) => project.id === savedProjectId)
        ? savedProjectId
        : projects[0]?.id || '';

    const nextEnvironment =
      savedEnvironment && environments.includes(savedEnvironment)
        ? savedEnvironment
        : environments[0] || '';

    setCurrentProjectId(nextProjectId);
    setCurrentEnvironment(nextEnvironment);
    setSettingsHydrated(true);
  }, [
    settingsHydrated,
    loadingSettings,
    loadingProjects,
    loadingEnvironments,
    settings,
    projects,
    environments,
  ]);

  useEffect(() => {
    if (
      !settingsHydrated ||
      !currentProjectId ||
      !currentEnvironment ||
      settings.length === 0
    ) {
      return;
    }

    const globalSettings = settings.find((item) => item.id === 'global');
    if (!globalSettings) {
      return;
    }

    if (
      globalSettings.currentProjectId !== currentProjectId ||
      globalSettings.currentEnvironment !== currentEnvironment
    ) {
      settingsApi.update('global', { currentProjectId, currentEnvironment });
    }
  }, [
    currentEnvironment,
    currentProjectId,
    settings,
    settingsApi,
    settingsHydrated,
  ]);

  return {
    currentEnvironment,
    currentProjectId,
    setCurrentEnvironment,
    setCurrentProjectId,
    settingsHydrated,
  };
}

import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Save,
  Settings as SettingsIcon,
  Globe,
  FolderGit2,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MutationActions, EnvironmentMutationActions } from "@/shared/hooks/useQueryHooks";
import { queryKeys } from "@/shared/hooks/queryKeys";
import { Project, Settings as SettingsType } from "@/shared/types";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";

interface SettingsProps {
  environments: string[];
  environmentsApi: EnvironmentMutationActions;
  currentEnvironment: string;
  setCurrentEnvironment: React.Dispatch<React.SetStateAction<string>>;
  projects: Project[];
  projectsApi: MutationActions<Project>;
  currentProjectId: string;
  setCurrentProjectId: React.Dispatch<React.SetStateAction<string>>;
  settings: SettingsType[];
  settingsApi: MutationActions<SettingsType>;
}

export const Settings: React.FC<SettingsProps> = ({
  environments,
  environmentsApi,
  currentEnvironment,
  setCurrentEnvironment,
  projects,
  projectsApi,
  currentProjectId,
  setCurrentProjectId,
  settings,
  settingsApi,
}) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [activeTab, setActiveTab] = useState<
    "PROJECTS" | "ENVIRONMENTS" | "SYSTEM"
  >("PROJECTS");

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "project" | "environment";
    id: string;
  } | null>(null);

  const handleAddEnvironment = async () => {
    if (newEnvName && !environments.includes(newEnvName.toUpperCase())) {
      await environmentsApi.create(newEnvName.toUpperCase());
      setNewEnvName("");
    }
  };

  const handleRemoveEnvironment = async (env: string) => {
    if (environments.length > 1) {
      await environmentsApi.remove(env);
      if (currentEnvironment === env) {
        setCurrentEnvironment(environments.filter((e) => e !== env)[0]);
      }
    }
  };

  const handleAddProject = async () => {
    if (newProjectName) {
      const newProject: Project = {
        id: `proj-${Date.now()}`,
        name: newProjectName,
        description: "",
        pages: [],
        modules: [],
      };
      await projectsApi.create(newProject);
      setNewProjectName("");
      if (!currentProjectId) {
        setCurrentProjectId(newProject.id);
      }
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    await projectsApi.remove(projectId);
    if (currentProjectId === projectId) {
      const remaining = projects.filter((p) => p.id !== projectId);
      setCurrentProjectId(remaining[0]?.id || "");
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 relative">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={
          deleteConfirm?.type === "project"
            ? "Delete Project"
            : "Remove Environment"
        }
        message={
          deleteConfirm?.type === "project"
            ? "Are you sure you want to delete this project? This action cannot be undone."
            : "Are you sure you want to remove this environment?"
        }
        onConfirm={() => {
          if (deleteConfirm?.type === "project") {
            handleRemoveProject(deleteConfirm.id);
          } else if (deleteConfirm?.type === "environment") {
            handleRemoveEnvironment(deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}
        onClose={() => setDeleteConfirm(null)}
      />
      <div className="p-8 w-full mx-auto space-y-6 pb-20">
        {/* Settings Header & Tabs */}
        <div className="flex flex-col gap-6">
          <div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
        Settings
        <HelpTooltip content="Configure projects, environments, and system settings." />
          <button
            onClick={() => {
              setIsRefreshing(true);
              queryClient.invalidateQueries({ queryKey: queryKeys.projects });
              queryClient.invalidateQueries({ queryKey: queryKeys.environments });
              queryClient.invalidateQueries({ queryKey: queryKeys.settings });
              setTimeout(() => setIsRefreshing(false), 500);
            }}
            className="ml-2 p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </h2>
            <p className="text-slate-500 text-sm mt-1">
              Manage your workspace, environments, and system configuration.
            </p>
          </div>

          <div className="flex items-center gap-1 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("PROJECTS")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "PROJECTS" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
            >
              Projects
            </button>
            <button
              onClick={() => setActiveTab("ENVIRONMENTS")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "ENVIRONMENTS" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
            >
              Environments
            </button>
            <button
              onClick={() => setActiveTab("SYSTEM")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "SYSTEM" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
            >
              System
            </button>
          </div>
        </div>

        {/* Project Management Section */}
        {activeTab === "PROJECTS" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <FolderGit2 size={16} className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                Project Management
              </h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Current Project
                </label>
                <select
                  className="w-full max-w-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  value={currentProjectId}
                  onChange={(e) => setCurrentProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {projects.length === 0 && (
                    <option value="">No Projects Available</option>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  All modules will automatically load data from this project.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-4">
                  Available Projects
                </label>
                <div className="space-y-3 mb-4">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-200 group"
                    >
                      <span className="font-medium text-sm text-slate-700">
                        {p.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {p.id === currentProjectId && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                            Active
                          </span>
                        )}
                        <button
                          onClick={() =>
                            setDeleteConfirm({ type: "project", id: p.id })
                          }
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove Project"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <p className="text-sm text-slate-400 italic">
                      No projects created yet.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-400"
                    placeholder="New Project Name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddProject()}
                  />
                  <button
                    onClick={handleAddProject}
                    disabled={!newProjectName}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Environment Management Section */}
        {activeTab === "ENVIRONMENTS" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <Globe size={16} className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                Environment Management
              </h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Current Environment
                </label>
                <select
                  className="w-full max-w-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  value={currentEnvironment}
                  onChange={(e) => setCurrentEnvironment(e.target.value)}
                >
                  {environments.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  This environment will be selected by default when running
                  tests.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-4">
                  Defined Environments
                </label>
                <div className="space-y-3 mb-4">
                  {environments.map((env) => (
                    <div
                      key={env}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-200 group"
                    >
                      <span className="font-mono text-sm font-medium text-slate-700">
                        {env}
                      </span>
                      <div className="flex items-center gap-2">
                        {env === currentEnvironment && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                            Active
                          </span>
                        )}
                        <button
                          onClick={() =>
                            setDeleteConfirm({ type: "environment", id: env })
                          }
                          disabled={environments.length <= 1}
                          className={`p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors ${environments.length <= 1 ? "opacity-50 cursor-not-allowed" : ""}`}
                          title="Remove Environment"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none uppercase placeholder-slate-400"
                    placeholder="NEW_ENV_NAME"
                    value={newEnvName}
                    onChange={(e) =>
                      setNewEnvName(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAddEnvironment()
                    }
                  />
                  <button
                    onClick={handleAddEnvironment}
                    disabled={!newEnvName || environments.includes(newEnvName)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* System Configuration Section */}
        {activeTab === "SYSTEM" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <SettingsIcon size={16} className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                System Configuration
              </h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Playwright Headless Mode
                </label>
                <div className="flex items-center gap-3">
                  <button
                    role="switch"
                    aria-checked={(() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      return currentSettings
                        ? currentSettings.headlessMode !== false
                        : true;
                    })()}
                    onClick={() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      if (currentSettings) {
                        const isHeadless =
                          currentSettings.headlessMode !== false;
                        settingsApi.update(currentSettings.id, {
                          ...currentSettings,
                          headlessMode: !isHeadless,
                        });
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${(() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      const isHeadless = currentSettings
                        ? currentSettings.headlessMode !== false
                        : true;
                      return isHeadless ? "bg-blue-600" : "bg-slate-200";
                    })()}`}
                  >
                    <span className="sr-only">Toggle Headless Mode</span>
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(() => {
                        const currentSettings =
                          settings.find(
                            (s) => s.currentProjectId === currentProjectId,
                          ) || settings[0];
                        const isHeadless = currentSettings
                          ? currentSettings.headlessMode !== false
                          : true;
                        return isHeadless ? "translate-x-6" : "translate-x-1";
                      })()}`}
                    />
                  </button>
                  <span className="text-sm text-slate-600">
                    {(() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      const isHeadless = currentSettings
                        ? currentSettings.headlessMode !== false
                        : true;
                      return isHeadless
                        ? "Runs tests invisibly (Headless)"
                        : "Opens browser visually (Headed)";
                    })()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Turning this off allows you to see the browser interacting
                  with the UI in real-time, helpful for debugging UI execution.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Browser Viewport
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-tight">Width</span>
                    <input
                      type="number"
                      className="w-24 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      placeholder="1920"
                      value={(() => {
                        const currentSettings = settings.find(s => s.currentProjectId === currentProjectId) || settings[0];
                        return currentSettings?.viewportWidth || 1920;
                      })()}
                      onChange={(e) => {
                        const currentSettings = settings.find(s => s.currentProjectId === currentProjectId) || settings[0];
                        if (currentSettings) {
                          settingsApi.update(currentSettings.id, {
                            ...currentSettings,
                            viewportWidth: parseInt(e.target.value, 10) || 1920,
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-tight">Height</span>
                    <input
                      type="number"
                      className="w-24 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      placeholder="1080"
                      value={(() => {
                        const currentSettings = settings.find(s => s.currentProjectId === currentProjectId) || settings[0];
                        return currentSettings?.viewportHeight || 1080;
                      })()}
                      onChange={(e) => {
                        const currentSettings = settings.find(s => s.currentProjectId === currentProjectId) || settings[0];
                        if (currentSettings) {
                          settingsApi.update(currentSettings.id, {
                            ...currentSettings,
                            viewportHeight: parseInt(e.target.value, 10) || 1080,
                          });
                        }
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  The viewport resolution (width x height) used by the browser during execution. Default is 1920x1080.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Record Execution Video
                </label>
                <div className="flex items-center gap-3">
                  <button
                    role="switch"
                    aria-checked={(() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      return currentSettings
                        ? currentSettings.recordVideo !== false
                        : true;
                    })()}
                    onClick={() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      if (currentSettings) {
                        const isRecording =
                          currentSettings.recordVideo !== false;
                        settingsApi.update(currentSettings.id, {
                          ...currentSettings,
                          recordVideo: !isRecording,
                        });
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${(() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      const isRecording = currentSettings
                        ? currentSettings.recordVideo !== false
                        : true;
                      return isRecording ? "bg-blue-600" : "bg-slate-200";
                    })()}`}
                  >
                    <span className="sr-only">Toggle Video Recording</span>
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(() => {
                        const currentSettings =
                          settings.find(
                            (s) => s.currentProjectId === currentProjectId,
                          ) || settings[0];
                        const isRecording = currentSettings
                          ? currentSettings.recordVideo !== false
                          : true;
                        return isRecording ? "translate-x-6" : "translate-x-1";
                      })()}`}
                    />
                  </button>
                  <span className="text-sm text-slate-600">
                    {(() => {
                      const currentSettings =
                        settings.find(
                          (s) => s.currentProjectId === currentProjectId,
                        ) || settings[0];
                      const isRecording = currentSettings
                        ? currentSettings.recordVideo !== false
                        : true;
                      return isRecording
                        ? "Video recording enabled"
                        : "Video recording disabled";
                    })()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Automatically records UI actions during execution. Turn off to save disk space and improve run speed slightly.
                </p>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MutationActions } from "@/shared/hooks/useQueryHooks";
import { queryKeys } from "@/shared/hooks/queryKeys";
import {
  Project,
  TestModule,
  TestStep,
  ActionType,
  ModuleParameter,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
} from "@/shared/types";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit2,
  Check,
  Search,
  Database,
  Workflow,
  Variable,
  RefreshCw,
} from "lucide-react";
import { StepList } from "@/shared/testing/StepList";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";

interface ModuleBuilderProps {
  projects: Project[];
  projectsApi: MutationActions<Project>;
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  currentProjectId: string;
}

export const ModuleBuilder: React.FC<ModuleBuilderProps> = ({
  projects,
  projectsApi,
  headers,
  bodies,
  endpoints,
  currentProjectId,
}) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  // Module Editing State
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editModuleName, setEditModuleName] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "module" | "param";
    id: string;
  } | null>(null);

  const activeProject = projects.find((p) => p.id === currentProjectId);
  const activeModule = activeProject?.modules.find(
    (m) => m.id === activeModuleId,
  );

  // Handle Project Selection Reset
  React.useEffect(() => {
    if (!activeProject) {
      setActiveModuleId("");
    } else if (
      activeModuleId &&
      !activeProject.modules.find((m) => m.id === activeModuleId)
    ) {
      setActiveModuleId("");
    }
  }, [activeProject, activeModuleId]);

  // Filter Logic
  const filteredModules = useMemo(() => {
    if (!activeProject) return [];
    if (!searchTerm) return activeProject.modules;
    const lower = searchTerm.toLowerCase();
    return activeProject.modules.filter((m) =>
      m.name.toLowerCase().includes(lower),
    );
  }, [activeProject, searchTerm]);

  // --- Module Actions ---
  const addModule = async () => {
    if (!activeProject) return;
    const newModule: TestModule = {
      id: `mod-${Date.now()}`,
      name: "New Module",
      description: "",
      params: [],
      steps: [],
    };

    await projectsApi.update(activeProject.id, {
      modules: [...activeProject.modules, newModule],
    });

    setActiveModuleId(newModule.id);
    setEditingModuleId(newModule.id);
    setEditModuleName("New Module");
  };

  const updateModule = async (updates: Partial<TestModule>) => {
    if (!activeProject || !activeModuleId) return;
    const newModules = activeProject.modules.map((m) =>
      m.id === activeModuleId ? { ...m, ...updates } : m,
    );
    await projectsApi.update(activeProject.id, { modules: newModules });
  };

  const saveModuleName = async () => {
    if (editingModuleId && activeProject) {
      const newModules = activeProject.modules.map((m) =>
        m.id === editingModuleId ? { ...m, name: editModuleName } : m,
      );
      await projectsApi.update(activeProject.id, { modules: newModules });
      setEditingModuleId(null);
    }
  };

  const deleteModule = async (moduleId: string) => {
    if (!activeProject) return;
    const newModules = activeProject.modules.filter((m) => m.id !== moduleId);
    await projectsApi.update(activeProject.id, { modules: newModules });
    if (activeModuleId === moduleId) setActiveModuleId("");
  };

  // --- Parameter Actions ---
  const addParam = () => {
    if (!activeModule) return;
    const newParam: ModuleParameter = {
      id: `mp-${Date.now()}`,
      name: "PARAM_NAME",
      defaultValue: "",
      description: "",
    };
    updateModule({ params: [...(activeModule.params || []), newParam] });
  };

  const updateParam = (paramId: string, updates: Partial<ModuleParameter>) => {
    if (!activeModule) return;
    updateModule({
      params: (activeModule.params || []).map((p) =>
        p.id === paramId ? { ...p, ...updates } : p,
      ),
    });
  };

  const deleteParam = (paramId: string) => {
    if (!activeModule) return;
    updateModule({
      params: (activeModule.params || []).filter((p) => p.id !== paramId),
    });
  };

  // --- Step Actions ---
  const addStep = (action?: ActionType) => {
    if (!activeModule) return;
    const newStep: TestStep = {
      id: `ms-${Date.now()}`,
      action: action || "click",
      target: "",
      data: "",
      description: "",
    };
    updateModule({ steps: [...activeModule.steps, newStep] });
  };

  const updateStep = (stepId: string, updates: Partial<TestStep>) => {
    if (!activeModule) return;
    updateModule({
      steps: activeModule.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s,
      ),
    });
  };

  const deleteStep = (stepId: string) => {
    if (!activeModule) return;
    updateModule({
      steps: activeModule.steps.filter((s) => s.id !== stepId),
    });
  };

  const duplicateStep = (step: TestStep) => {
    if (!activeModule) return;
    const index = activeModule.steps.findIndex((s) => s.id === step.id);
    if (index === -1) return;
    const newStep: TestStep = {
      ...step,
      id: `ms-${Date.now()}`,
    };
    const newSteps = [...activeModule.steps];
    newSteps.splice(index + 1, 0, newStep);
    updateModule({ steps: newSteps });
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (!activeModule) return;
    if (toIndex < 0 || toIndex >= activeModule.steps.length) return;
    const newSteps = [...activeModule.steps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);
    updateModule({ steps: newSteps });
  };

  return (
    <div className="h-full flex overflow-hidden bg-gray-50 relative">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={
          deleteConfirm?.type === "module"
            ? "Delete Module"
            : "Delete Parameter"
        }
        message={
          deleteConfirm?.type === "module"
            ? "Are you sure you want to delete this module? This action cannot be undone."
            : "Are you sure you want to delete this parameter? This action cannot be undone."
        }
        onConfirm={() => {
          if (deleteConfirm?.type === "module") {
            deleteModule(deleteConfirm.id);
          } else if (deleteConfirm?.type === "param") {
            deleteParam(deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}
        onClose={() => setDeleteConfirm(null)}
      />
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col z-10">
        <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
          <div className="relative">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
              <span className="text-sm font-semibold text-gray-900 truncate">
                {activeProject?.name || "No Project Selected"}
              </span>
            </div>
          </div>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Filter modules..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center">
          Shared Modules
          <HelpTooltip content="Create reusable sequences of test steps that can be included in multiple test cases." />
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setIsRefreshing(true);
              queryClient.invalidateQueries({ queryKey: queryKeys.projects });
              setTimeout(() => setIsRefreshing(false), 500);
            }}
            className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={addModule}
            disabled={!activeProject}
            className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50"
            title="Add Module"
          >
            <Plus size={14} />
          </button>
        </div>
          </div>

          {!activeProject && (
            <div className="text-center py-8 px-4 text-gray-400 text-xs italic">
              Select a project in Settings to start.
            </div>
          )}

          <div className="space-y-0.5">
            {filteredModules.map((mod) => (
              <div
                key={mod.id}
                className={`group px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center justify-between transition-all duration-200 ${
                  activeModuleId === mod.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                onClick={() => setActiveModuleId(mod.id)}
              >
                <div className="flex items-center gap-2 overflow-hidden w-full">
                  <Workflow
                    size={14}
                    className={`shrink-0 ${activeModuleId === mod.id ? "text-blue-500" : "text-gray-400"}`}
                  />
                  {editingModuleId === mod.id ? (
                    <input
                      className="w-full px-1 py-0.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editModuleName}
                      onChange={(e) => setEditModuleName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.key === "Enter" && saveModuleName()}
                      onBlur={saveModuleName}
                      autoFocus
                    />
                  ) : (
                    <span className="truncate">{mod.name}</span>
                  )}
                </div>

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingModuleId === mod.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveModuleName();
                      }}
                      className="p-1 text-green-600"
                    >
                      <Check size={12} />
                    </button>
                  ) : (
                    <div className="flex gap-0.5 relative z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingModuleId(mod.id);
                          setEditModuleName(mod.name);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ type: "module", id: mod.id });
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        {activeModule ? (
          <>
            <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {activeModule.name}
                </h2>
              </div>
              <div className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">
                {activeModule.steps.length} Steps
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50">
              <div className="flex flex-col min-h-full">
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="mb-0">
                    <input
                      className="w-full px-0 py-1 bg-transparent border-none text-sm text-gray-500 focus:ring-0 placeholder-gray-300 transition-all"
                      value={activeModule.description || ""}
                      onChange={(e) =>
                        updateModule({ description: e.target.value })
                      }
                      placeholder="Add a description for this module..."
                    />
                  </div>

                  {/* Parameters Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                        <Variable size={12} /> Input Parameters
                      </label>
                      <button
                        onClick={addParam}
                        className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                      >
                        <Plus size={12} /> Add Parameter
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-12 gap-2">
                          <div className="col-span-5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider pl-1">
                            Name
                          </div>
                          <div className="col-span-7 text-[10px] font-semibold text-gray-500 uppercase tracking-wider pl-1">
                            Default Value
                          </div>
                        </div>
                        <div className="w-[26px]"></div>
                      </div>
                      {(activeModule.params || []).map((param) => (
                        <div
                          key={param.id}
                          className="flex items-center gap-2 group"
                        >
                          <div className="flex-1 grid grid-cols-12 gap-2">
                            <div className="col-span-5">
                              <input
                                className="w-full bg-blue-50 border border-blue-100 rounded px-2 py-1.5 text-xs font-mono font-medium text-blue-900 placeholder-blue-300 focus:border-blue-500 outline-none"
                                value={param.name}
                                onChange={(e) =>
                                  updateParam(param.id, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="PARAM_NAME"
                              />
                            </div>
                            <div className="col-span-7">
                              <input
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 outline-none placeholder-gray-300"
                                value={param.defaultValue || ""}
                                onChange={(e) =>
                                  updateParam(param.id, {
                                    defaultValue: e.target.value,
                                  })
                                }
                                placeholder="Default Value"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setDeleteConfirm({ type: "param", id: param.id })
                            }
                            className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {(activeModule.params || []).length === 0 && (
                        <div className="text-xs text-gray-400 italic py-2 bg-gray-50/50 rounded border border-dashed border-gray-200 text-center">
                          No parameters defined. Steps will use global variables
                          or hardcoded values.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-6 flex-1 space-y-3 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Execution Steps
                    </label>
                  </div>
                  {/* Steps Loop (simplified reuse of TestBuilder logic) */}
                  <StepList
                    title="Execution Steps"
                    defaultExpanded={true}
                    steps={activeModule.steps}
                    onUpdateStep={updateStep}
                    onDeleteStep={deleteStep}
                    onDuplicateStep={duplicateStep}
                    onMoveStep={moveStep}
                    onAddStep={addStep}
                    activeProject={activeProject}
                    variables={(activeModule.params || []).map((p) => ({
                      id: p.id,
                      key: p.name,
                      value: p.defaultValue,
                    }))}
                    endpoints={endpoints}
                    headers={headers}
                    bodies={bodies}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-4 bg-gray-50/50 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center">
              <Workflow size={32} className="text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">
              Select a module to edit or create a new one
            </p>
            <button
              onClick={addModule}
              className="text-xs text-blue-600 hover:underline"
            >
              Create Shared Module
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

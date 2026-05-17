import React, { useState, useMemo } from "react";
import {
  Play,
  Search,
  Filter,
  Layers,
  ChevronRight,
  ChevronDown,
  FlaskConical,
  Clock,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Edit2,
  Save,
  Variable,
  X,
  Workflow,
  Terminal,
  Database,
  Table2,
  Sparkles,
  GripVertical,
} from "lucide-react";
import {
  Project,
  TestSuite,
  TestCase,
  TestScenario,
  ScenarioSuite,
  SuiteVariable,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
} from "@/shared/types";
import { MutationActions, useReports, useReportMutations } from "@/shared/hooks/useQueryHooks";
import { AutosaveTextField } from "@/shared/testing/AutosaveTextField";
import { ScenarioExecutionRunner } from "@/features/execution/ScenarioExecutionRunner";
import { TestPlanBuilder } from "@/features/execution/TestPlanBuilder";
import { TestPlanExecutionRunner } from "@/features/execution/TestPlanExecutionRunner";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";

interface TestRunnerProps {
  projects: Project[];
  projectsApi: MutationActions<Project>;
  suites: TestSuite[];
  currentProjectId: string;
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  environments: string[];
  initialEnvironment: string;
}

export const TestRunner: React.FC<TestRunnerProps> = ({
  projects,
  projectsApi,
  suites,
  currentProjectId,
  headers,
  bodies,
  endpoints,
  environments,
  initialEnvironment,
}) => {
  const currentProject = projects.find((p) => p.id === currentProjectId);
  const scenarios = currentProject?.scenarios || [];

  const [activeTab, setActiveTab] = useState<"PLANS" | "SCENARIOS" | "CONSOLE">(
    "PLANS",
  );
  const [scenarioToRunId, setScenarioToRunId] = useState<string | null>(null);
  const [planToRunId, setPlanToRunId] = useState<string | null>(null);

  const scenarioToRun = useMemo(() => {
    return scenarios.find((s) => s.id === scenarioToRunId) || null;
  }, [scenarios, scenarioToRunId]);

  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    scenarios[0]?.id || null,
  );
  const activeScenario = scenarios.find((s) => s.id === activeScenarioId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "scenario" | "variable" | "suite";
    id: string;
  } | null>(null);

  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>(
    {},
  );
  const [isDataVariablesExpanded, setIsDataVariablesExpanded] = useState(false);

  const { data: reports = [] } = useReports();
  const reportsApi = useReportMutations();

  const handleAddDataRow = () => {
    if (!activeScenario) return;
    const currentRows = activeScenario.dataRows || [];
    const newRow: Record<string, string> = {};
    (activeScenario.variables || []).forEach((v) => (newRow[v.key] = ""));

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? { ...s, dataRows: [...currentRows, newRow] }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleUpdateDataRow = (
    rowIndex: number,
    key: string,
    value: string,
  ) => {
    if (!activeScenario || !activeScenario.dataRows) return;
    const newRows = [...activeScenario.dataRows];
    newRows[rowIndex] = { ...newRows[rowIndex], [key]: value };

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id ? { ...s, dataRows: newRows } : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleDeleteDataRow = (rowIndex: number) => {
    if (!activeScenario || !activeScenario.dataRows) return;
    const newRows = activeScenario.dataRows.filter((_, i) => i !== rowIndex);

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id ? { ...s, dataRows: newRows } : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleAddVariable = () => {
    if (!activeScenario) return;
    const newVar = {
      id: `var-${Date.now()}`,
      key: `VAR_${(activeScenario.variables || []).length + 1}`,
      value: "",
    };
    const currentRows = activeScenario.dataRows || [];
    const newRows = currentRows.map((row) => ({ ...row, [newVar.key]: "" }));

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? {
            ...s,
            variables: [...(s.variables || []), newVar],
            dataRows: newRows,
          }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleDeleteVariable = (varId: string) => {
    if (!activeScenario || !activeScenario.variables) return;
    const v = activeScenario.variables.find((v) => v.id === varId);
    if (!v) return;
    const keyToDelete = v.key;

    const newVars = activeScenario.variables.filter((v) => v.id !== varId);
    const currentRows = activeScenario.dataRows || [];
    const newRows = currentRows.map((row) => {
      const newRow = { ...row };
      delete newRow[keyToDelete];
      return newRow;
    });

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? {
            ...s,
            variables: newVars,
            dataRows: newRows,
          }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleImportSuiteVariables = () => {
    if (!activeScenario) return;

    // Get all variables from all suites in the scenario
    const suiteVariables: SuiteVariable[] = [];
    activeScenario.suites.forEach((ss) => {
      const suite = suites.find((s) => s.id === ss.suiteId);
      if (suite && suite.variables) {
        suiteVariables.push(...suite.variables);
      }
    });

    if (suiteVariables.length === 0) return;

    // Filter out duplicates and variables already present in the scenario
    const currentVars = activeScenario.variables || [];
    const existingKeys = new Set(currentVars.map((v) => v.key));
    const newVarsToAdd: SuiteVariable[] = [];
    const addedKeys = new Set<string>();

    suiteVariables.forEach((v) => {
      if (!existingKeys.has(v.key) && !addedKeys.has(v.key)) {
        newVarsToAdd.push({
          id: `var-import-${v.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          key: v.key,
          value: v.value,
        });
        addedKeys.add(v.key);
      }
    });

    if (newVarsToAdd.length === 0) return;

    const updatedVars = [...currentVars, ...newVarsToAdd];

    // Also update dataRows with new keys
    const currentRows = activeScenario.dataRows || [];
    const newRows = currentRows.map((row) => {
      const newRow = { ...row };
      newVarsToAdd.forEach((v) => {
        if (newRow[v.key] === undefined) {
          newRow[v.key] = "";
        }
      });
      return newRow;
    });

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? {
            ...s,
            variables: updatedVars,
            dataRows: newRows,
          }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleUpdateVariable = (
    varId: string,
    field: "key" | "value",
    val: string,
  ) => {
    if (!activeScenario || !activeScenario.variables) return;

    let updatedVars = [...activeScenario.variables];
    let newRows = [...(activeScenario.dataRows || [])];

    if (field === "key") {
      const oldVar = activeScenario.variables.find((v) => v.id === varId);
      if (!oldVar) return;
      const oldKey = oldVar.key;

      updatedVars = updatedVars.map((v) =>
        v.id === varId ? { ...v, key: val } : v,
      );
      newRows = newRows.map((row) => {
        const newRow = { ...row };
        if (newRow[oldKey] !== undefined) {
          newRow[val] = newRow[oldKey];
          delete newRow[oldKey];
        }
        return newRow;
      });
    } else {
      updatedVars = updatedVars.map((v) =>
        v.id === varId ? { ...v, value: val } : v,
      );
    }

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? {
            ...s,
            variables: updatedVars,
            dataRows: newRows,
          }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleCreateScenario = () => {
    const newScenario: TestScenario = {
      id: `scenario-${Date.now()}`,
      name: "New Scenario",
      description: "",
      suites: [],
    };

    const updatedScenarios = [...scenarios, newScenario];
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
    setActiveScenarioId(newScenario.id);
    setIsEditing(true);
    setEditName(newScenario.name);
    setEditDescription(newScenario.description || "");
  };

  const handleDeleteScenario = (id: string) => {
    const updatedScenarios = scenarios.filter((s) => s.id !== id);
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
    if (activeScenarioId === id) {
      setActiveScenarioId(updatedScenarios[0]?.id || null);
    }
  };

  const handleSaveScenario = () => {
    if (!activeScenario) return;
    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? { ...s, name: editName, description: editDescription }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
    setIsEditing(false);
  };

  const handleAddSuiteToScenario = (suiteId: string) => {
    if (!activeScenario) return;
    const newScenarioSuite: ScenarioSuite = {
      id: `ss-${Date.now()}`,
      suiteId,
      variableOverrides: {},
    };
    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? { ...s, suites: [...s.suites, newScenarioSuite] }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
    setExpandedSuites((prev) => ({ ...prev, [newScenarioSuite.id]: true }));
  };

  const handleRemoveSuiteFromScenario = (scenarioSuiteId: string) => {
    if (!activeScenario) return;
    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id
        ? { ...s, suites: s.suites.filter((ss) => ss.id !== scenarioSuiteId) }
        : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const moveSuite = (index: number, direction: -1 | 1) => {
    if (!activeScenario) return;
    const newSuites = [...activeScenario.suites];
    if (index + direction < 0 || index + direction >= newSuites.length) return;

    const temp = newSuites[index];
    newSuites[index] = newSuites[index + direction];
    newSuites[index + direction] = temp;

    const updatedScenarios = scenarios.map((s) =>
      s.id === activeScenario.id ? { ...s, suites: newSuites } : s,
    );
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const handleUpdateOverride = (
    scenarioSuiteId: string,
    key: string,
    value: string,
  ) => {
    if (!activeScenario) return;
    const updatedScenarios = scenarios.map((s) => {
      if (s.id !== activeScenario.id) return s;
      return {
        ...s,
        suites: s.suites.map((ss) => {
          if (ss.id !== scenarioSuiteId) return ss;
          return {
            ...ss,
            variableOverrides: {
              ...ss.variableOverrides,
              [key]: value,
            },
          };
        }),
      };
    });
    projectsApi.update(currentProjectId, { scenarios: updatedScenarios });
  };

  const toggleSuite = (id: string) => {
    setExpandedSuites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const planToRun = useMemo(() => {
    return currentProject?.plans?.find((p) => p.id === planToRunId) || null;
  }, [currentProject?.plans, planToRunId]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={
          deleteConfirm?.type === "scenario"
            ? "Delete Scenario"
            : deleteConfirm?.type === "variable"
              ? "Delete Variable"
              : "Remove Suite"
        }
        message={
          deleteConfirm?.type === "scenario"
            ? "Are you sure you want to delete this scenario? This action cannot be undone."
            : deleteConfirm?.type === "variable"
              ? "Are you sure you want to delete this variable?"
              : "Are you sure you want to remove this suite from the scenario?"
        }
        onConfirm={() => {
          if (deleteConfirm?.type === "scenario") {
            handleDeleteScenario(deleteConfirm.id);
          } else if (deleteConfirm?.type === "variable") {
            handleDeleteVariable(deleteConfirm.id);
          } else if (deleteConfirm?.type === "suite") {
            handleRemoveSuiteFromScenario(deleteConfirm.id);
          }
        }}
        onClose={() => setDeleteConfirm(null)}
      />
      {/* Top Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-6 shrink-0 z-20">
        <button
          onClick={() => setActiveTab("PLANS")}
          className={`py-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "PLANS"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Test Plans
        </button>
        <button
          onClick={() => setActiveTab("SCENARIOS")}
          className={`py-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "SCENARIOS"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Scenario Builder
        </button>
        <button
          onClick={() => setActiveTab("CONSOLE")}
          className={`py-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "CONSOLE"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Execution Console
        </button>
      </div>

      {activeTab === "PLANS" && (
        <TestPlanBuilder
          projects={projects}
          projectsApi={projectsApi}
          currentProjectId={currentProjectId}
          onRunPlan={(planId) => {
            setPlanToRunId(planId);
            setScenarioToRunId(null);
            setActiveTab("CONSOLE");
          }}
        />
      )}

      {activeTab === "SCENARIOS" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Scenarios List */}
          <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col z-10">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Layers size={18} className="text-blue-600" />
                Scenarios
                <HelpTooltip content="Manage test scenarios which combine multiple test suites for execution." />
              </h2>
              <button
                onClick={handleCreateScenario}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                title="Create Scenario"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {scenarios.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No scenarios yet.
                  <br />
                  Click + to create one.
                </div>
              ) : (
                scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    onClick={() => {
                      setActiveScenarioId(scenario.id);
                      setIsEditing(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group cursor-pointer ${
                      activeScenarioId === scenario.id
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="truncate pr-2">{scenario.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ type: "scenario", id: scenario.id });
                      }}
                      className={`p-1 text-slate-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity ${activeScenarioId === scenario.id ? "opacity-100" : ""}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Main Area - Scenario Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeScenario ? (
              <>
                {/* Scenario Header */}
                <div className="bg-white border-b border-slate-200 px-8 py-6 shadow-sm z-10">
                  <div className="w-full">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        {isEditing ? (
                          <div className="space-y-3 max-w-lg">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="text-2xl font-bold text-slate-900 bg-white border border-blue-300 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              placeholder="Scenario Name"
                              autoFocus
                            />
                            <textarea
                              value={editDescription}
                              onChange={(e) =>
                                setEditDescription(e.target.value)
                              }
                              className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 resize-none"
                              placeholder="Scenario Description (optional)"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveScenario}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 flex items-center gap-1.5"
                              >
                                <Save size={14} /> Save
                              </button>
                              <button
                                onClick={() => setIsEditing(false)}
                                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-50 flex items-center gap-1.5"
                              >
                                <X size={14} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group flex items-start gap-3">
                            <div>
                              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                {activeScenario.name}
                                <button
                                  onClick={() => {
                                    setIsEditing(true);
                                    setEditName(activeScenario.name);
                                    setEditDescription(
                                      activeScenario.description || "",
                                    );
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 transition-all"
                                >
                                  <Edit2 size={16} />
                                </button>
                              </h1>
                              {activeScenario.description && (
                                <p className="text-slate-500 text-sm mt-1">
                                  {activeScenario.description}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-sm"
                          onClick={() => {
                            setPlanToRunId(null);
                            setScenarioToRunId(activeScenario.id);
                            setActiveTab("CONSOLE");
                          }}
                        >
                          <Play size={16} />
                          Run Scenario
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scenario Content */}
                <div className="flex-1 overflow-y-auto p-8">
                  <div className="w-full flex flex-col gap-8">
                    {/* Scenario Variables & Data Driven */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <div
                        className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() =>
                          setIsDataVariablesExpanded(!isDataVariablesExpanded)
                        }
                      >
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <Database size={16} className="text-blue-600" />
                          Scenario Data & Variables
                          <HelpTooltip content="Define scenario-level variables and data rows. This data will be available to all suites in the scenario and drive scenario execution." />
                        </h3>
                        <div
                          className={`p-1 rounded hover:bg-slate-200 transition-transform duration-200 ${isDataVariablesExpanded ? "rotate-90" : ""}`}
                        >
                          <ChevronRight size={16} className="text-slate-400" />
                        </div>
                      </div>

                      {isDataVariablesExpanded && (
                        <div className="p-4 space-y-6">
                          {/* Variables List */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Scenario Variables
                              </h4>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleImportSuiteVariables}
                                  className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-medium bg-emerald-50 px-2 py-1 rounded transition-colors"
                                  title="Import all unique variables from suites in this scenario"
                                >
                                  <Sparkles size={12} /> Sync from Suites
                                </button>
                                <button
                                  onClick={handleAddVariable}
                                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium bg-blue-50 px-2 py-1 rounded transition-colors"
                                >
                                  <Plus size={12} /> Add Variable
                                </button>
                              </div>
                            </div>

                            {(activeScenario.variables || []).length === 0 ? (
                              <div className="text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                <p className="text-xs text-slate-400">
                                  No variables defined
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {(activeScenario.variables || []).map((v) => (
                                  <div
                                    key={v.id}
                                    className="flex items-center gap-2"
                                  >
                                    <AutosaveTextField
                                      value={v.key}
                                      onSave={(next) =>
                                        handleUpdateVariable(
                                          v.id,
                                          "key",
                                          next,
                                        )
                                      }
                                      placeholder="Variable Key"
                                      className="w-1/3 text-sm font-mono px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-blue-400"
                                    />
                                    <span className="text-slate-400">=</span>
                                    <AutosaveTextField
                                      value={v.value}
                                      onSave={(next) =>
                                        handleUpdateVariable(
                                          v.id,
                                          "value",
                                          next,
                                        )
                                      }
                                      placeholder="Default Value"
                                      className="flex-1 text-sm px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-blue-400"
                                    />
                                    <button
                                      onClick={() =>
                                        setDeleteConfirm({
                                          type: "variable",
                                          id: v.id,
                                        })
                                      }
                                      className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Data Rows Table */}
                          {(activeScenario.variables || []).length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                  <Table2 size={14} /> Data Driven Executions
                                  <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] ml-2">
                                    {(activeScenario.dataRows || []).length}{" "}
                                    Iterations
                                  </span>
                                </h4>
                                <button
                                  onClick={handleAddDataRow}
                                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium bg-blue-50 px-2 py-1 rounded"
                                >
                                  <Plus size={12} /> Add Row
                                </button>
                              </div>

                              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="w-full text-sm">
                                  <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium text-slate-500 w-12 text-center">
                                        #
                                      </th>
                                      {(activeScenario.variables || []).map(
                                        (v) => (
                                          <th
                                            key={v.id}
                                            className="px-3 py-2 text-left font-mono text-xs font-semibold text-slate-600"
                                          >
                                            {v.key}
                                          </th>
                                        ),
                                      )}
                                      <th className="px-3 py-2 w-12"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(activeScenario.dataRows || []).length ===
                                    0 ? (
                                      <tr>
                                        <td
                                          colSpan={
                                            (activeScenario.variables || [])
                                              .length + 2
                                          }
                                          className="px-3 py-4 text-center text-xs text-slate-400 bg-slate-50/50"
                                        >
                                          No data rows defined. The scenario
                                          will execute exactly once using
                                          default variable values.
                                        </td>
                                      </tr>
                                    ) : (
                                      (activeScenario.dataRows || []).map(
                                        (row, rowIndex) => (
                                          <tr
                                            key={rowIndex}
                                            className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 group"
                                          >
                                            <td className="px-3 py-2 text-center text-slate-400 text-xs">
                                              {rowIndex + 1}
                                            </td>
                                            {(
                                              activeScenario.variables || []
                                            ).map((v) => (
                                              <td
                                                key={v.id}
                                                className="px-3 py-1"
                                              >
                                                <AutosaveTextField
                                                  className="w-full bg-transparent border-none focus:ring-0 text-xs text-slate-700 placeholder-slate-300 py-1"
                                                  value={row[v.key] || ""}
                                                  onSave={(next) =>
                                                    handleUpdateDataRow(
                                                      rowIndex,
                                                      v.key,
                                                      next,
                                                    )
                                                  }
                                                  placeholder="(default)"
                                                />
                                              </td>
                                            ))}
                                            <td className="px-2 py-1 text-center">
                                              <button
                                                onClick={() =>
                                                  handleDeleteDataRow(rowIndex)
                                                }
                                                className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                <X size={14} />
                                              </button>
                                            </td>
                                          </tr>
                                        ),
                                      )
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="w-full flex gap-8">
                      {/* Left Column: Suites in Scenario */}
                      <div className="flex-1 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Layers size={16} className="text-blue-600" />
                          Execution Sequence
                          <HelpTooltip content="Define the order of test suites to run in this scenario and override their variables." />
                        </h3>

                        {activeScenario.suites.length === 0 ? (
                          <div className="text-center py-12 bg-white border border-dashed border-slate-300 rounded-xl">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Layers size={20} className="text-slate-400" />
                            </div>
                            <p className="text-slate-500 text-sm">
                              No suites added to this scenario yet.
                            </p>
                            <p className="text-slate-400 text-xs mt-1">
                              Add suites from the panel on the right.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[15px] before:w-0.5 before:bg-slate-200">
                            {activeScenario.suites.map(
                              (scenarioSuite, index) => {
                                const originalSuite = suites.find(
                                  (s) => s.id === scenarioSuite.suiteId,
                                );
                                if (!originalSuite) return null;

                                const isExpanded =
                                  expandedSuites[scenarioSuite.id];

                                return (
                                  <div
                                    key={scenarioSuite.id}
                                    className="relative flex items-start gap-4"
                                  >
                                    {/* Timeline Node */}
                                    <div className="w-8 h-8 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center text-xs font-bold text-blue-600 z-10 shrink-0 mt-2 shadow-sm">
                                      {index + 1}
                                    </div>

                                    {/* Suite Card */}
                                    <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all group overflow-hidden">
                                      <div
                                        className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                        onClick={() =>
                                          toggleSuite(scenarioSuite.id)
                                        }
                                      >
                                        <div className="flex items-center gap-3">
                                          <div
                                            className={`p-1 rounded hover:bg-slate-200 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                          >
                                            <ChevronRight
                                              size={16}
                                              className="text-slate-400"
                                            />
                                          </div>
                                          <h4 className="font-medium text-slate-900">
                                            {originalSuite.name}
                                          </h4>
                                          {originalSuite.variables &&
                                            originalSuite.variables.length >
                                              0 && (
                                              <span className="px-2 py-0.5 rounded-full bg-blue-100/50 text-blue-700 text-[10px] font-medium border border-blue-200/50">
                                                {originalSuite.variables.length}{" "}
                                                vars
                                              </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <div className="flex flex-col gap-1 mr-2">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                moveSuite(index, -1);
                                              }}
                                              disabled={index === 0}
                                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                              title="Move Up"
                                            >
                                              <GripVertical
                                                size={14}
                                                className="rotate-90"
                                              />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                moveSuite(index, 1);
                                              }}
                                              disabled={
                                                index ===
                                                activeScenario.suites.length - 1
                                              }
                                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                              title="Move Down"
                                            >
                                              <GripVertical
                                                size={14}
                                                className="rotate-90"
                                              />
                                            </button>
                                          </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteConfirm({
                                                type: "suite",
                                                id: scenarioSuite.id,
                                              });
                                            }}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Remove from Scenario"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </div>

                                      {isExpanded && (
                                        <div className="p-4 bg-white">
                                          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                            <Variable size={14} /> Variable
                                            Overrides
                                            <HelpTooltip
                                              content={
                                                <div className="space-y-2 text-xs w-64">
                                                  <p className="font-semibold text-white">
                                                    Variable Resolution Priority
                                                  </p>
                                                  <p className="text-slate-300 text-[10px] leading-tight mb-2">
                                                    Variables are resolved from
                                                    highest to lowest priority:
                                                  </p>
                                                  <ol className="list-decimal pl-4 space-y-1 text-slate-200 text-[11px]">
                                                    <li>
                                                      <strong className="text-white">
                                                        Runtime Variables
                                                      </strong>{" "}
                                                      (e.g., EXTRACT_VAR)
                                                    </li>
                                                    <li>
                                                      <strong className="text-white">
                                                        Variable Overrides
                                                      </strong>{" "}
                                                      (Values set here)
                                                    </li>
                                                    <li>
                                                      <strong className="text-white">
                                                        Scenario Data Row
                                                      </strong>{" "}
                                                      (Current row in Scenario
                                                      Data)
                                                    </li>
                                                    <li>
                                                      <strong className="text-white">
                                                        Scenario Variables
                                                      </strong>{" "}
                                                      (Global Scenario
                                                      variables)
                                                    </li>
                                                    <li>
                                                      <strong className="text-white">
                                                        Suite Data Row
                                                      </strong>{" "}
                                                      (Current row in Suite
                                                      Data)
                                                    </li>
                                                    <li>
                                                      <strong className="text-white">
                                                        Suite Default Variables
                                                      </strong>{" "}
                                                      (Original Suite defaults)
                                                    </li>
                                                  </ol>
                                                  <div className="mt-2 pt-2 border-t border-slate-600 text-[10px] text-blue-300">
                                                    <strong>Tip:</strong> Leave
                                                    the override empty to allow
                                                    the Scenario Data Matrix or
                                                    Scenario Variables to drive
                                                    the value.
                                                  </div>
                                                </div>
                                              }
                                            />
                                          </h5>
                                          {originalSuite.variables &&
                                          originalSuite.variables.length > 0 ? (
                                            <div className="space-y-2">
                                              {originalSuite.variables.map(
                                                (v) => (
                                                  <div
                                                    key={v.id}
                                                    className="flex items-center gap-3"
                                                  >
                                                    <div
                                                      className="w-1/3 text-sm font-mono text-slate-600 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 truncate"
                                                      title={v.key}
                                                    >
                                                      {v.key}
                                                    </div>
                                                    <div className="flex-1 relative">
                                                      <input
                                                        type="text"
                                                        value={
                                                          scenarioSuite
                                                            .variableOverrides[
                                                            v.key
                                                          ] ?? ""
                                                        }
                                                        onChange={(e) =>
                                                          handleUpdateOverride(
                                                            scenarioSuite.id,
                                                            v.key,
                                                            e.target.value,
                                                          )
                                                        }
                                                        placeholder={`Default: ${v.value}`}
                                                        className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-shadow"
                                                      />
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          ) : (
                                            <div className="flex items-center justify-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                              <p className="text-xs text-slate-400 italic">
                                                This suite has no variables to
                                                override.
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Column: Available Suites */}
                      <div className="w-80 flex-shrink-0">
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm sticky top-6">
                          <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                              <Layers size={16} className="text-blue-600" />
                              Available Suites
                              <HelpTooltip content="Test suites available in this project. Click the plus icon to add them to the execution sequence." />
                            </h3>
                          </div>
                          <div className="p-3 max-h-[calc(100vh-250px)] overflow-y-auto space-y-2">
                            {suites.length === 0 ? (
                              <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                <p className="text-xs text-slate-400">
                                  No suites available in this project.
                                </p>
                              </div>
                            ) : (
                              suites.map((suite) => (
                                <div
                                  key={suite.id}
                                  className="flex items-center justify-between p-3 bg-white border border-slate-100 hover:border-blue-200 hover:shadow-sm rounded-lg group transition-all"
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                                      <Layers
                                        size={14}
                                        className="text-slate-400 group-hover:text-blue-500 transition-colors"
                                      />
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                      <span className="text-sm font-medium text-slate-700 truncate group-hover:text-slate-900">
                                        {suite.name}
                                      </span>
                                      {suite.variables &&
                                        suite.variables.length > 0 && (
                                          <span className="text-[10px] text-slate-400">
                                            {suite.variables.length} variables
                                          </span>
                                        )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleAddSuiteToScenario(suite.id)
                                    }
                                    className="p-1.5 text-blue-600 hover:bg-blue-600 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 shadow-sm border border-transparent hover:border-blue-700"
                                    title="Add to Scenario"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-slate-50">
                <div className="text-center">
                  <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <Workflow size={24} className="text-blue-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Scenario Orchestrator
                  </h2>
                  <p className="text-slate-500 mt-2 max-w-md mx-auto">
                    Create execution scenarios by combining multiple test suites
                    and overriding their variables for different environments or
                    data setups.
                  </p>
                  <button
                    onClick={handleCreateScenario}
                    className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm inline-flex items-center gap-2"
                  >
                    <Plus size={16} /> Create First Scenario
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution Console Tab */}
      <div
        className={`flex-1 overflow-hidden ${activeTab === "CONSOLE" ? "block" : "hidden"}`}
      >
        {planToRun ? (
          <TestPlanExecutionRunner
            plan={planToRun}
            suites={suites}
            project={currentProject}
            environments={environments}
            initialEnvironment={initialEnvironment}
            onClose={() => setActiveTab("PLANS")}
          />
        ) : scenarioToRun ? (
          <ScenarioExecutionRunner
            scenario={scenarioToRun}
            project={currentProject}
            environments={environments}
            initialEnvironment={initialEnvironment}
            onClose={() => setActiveTab("SCENARIOS")}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50 h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Terminal size={24} className="text-slate-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                No Execution Running
              </h2>
              <p className="text-slate-500 mt-2 max-w-md mx-auto">
                Go to the Test Plans or Scenario Builder and click "Run" to
                start an execution.
              </p>
              <div className="mt-6 flex gap-3 justify-center">
                <button
                  onClick={() => setActiveTab("PLANS")}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm inline-flex items-center gap-2"
                >
                  Go to Test Plans
                </button>
                <button
                  onClick={() => setActiveTab("SCENARIOS")}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm inline-flex items-center gap-2"
                >
                  Go to Scenarios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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
} from "lucide-react";
import {
  Project,
  TestSuite,
  TestCase,
  TestScenario,
  ScenarioSuite,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
} from "../types";
import { ScenarioExecutionRunner } from "./ScenarioExecutionRunner";

import { HelpTooltip } from "./HelpTooltip";

interface TestRunnerProps {
  projects: Project[];
  projectsApi: any;
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

  const [activeTab, setActiveTab] = useState<"BUILDER" | "CONSOLE">("BUILDER");
  const [scenarioToRunId, setScenarioToRunId] = useState<string | null>(null);

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

  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>(
    {},
  );

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
    if (!confirm("Are you sure you want to delete this scenario?")) return;
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

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-6 shrink-0 z-20">
        <button
          onClick={() => setActiveTab("BUILDER")}
          className={`py-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "BUILDER"
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

      {activeTab === "BUILDER" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Scenarios List */}
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
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
                        handleDeleteScenario(scenario.id);
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
                        activeScenario.suites.map((scenarioSuite, index) => {
                          const originalSuite = suites.find(
                            (s) => s.id === scenarioSuite.suiteId,
                          );
                          if (!originalSuite) return null;

                          const isExpanded = expandedSuites[scenarioSuite.id];

                          return (
                            <div
                              key={scenarioSuite.id}
                              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
                            >
                              <div
                                className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => toggleSuite(scenarioSuite.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                  </div>
                                  <div
                                    className={`p-1 rounded hover:bg-slate-200 transition-colors ${isExpanded ? "rotate-90" : ""}`}
                                  >
                                    <ChevronRight
                                      size={16}
                                      className="text-slate-400"
                                    />
                                  </div>
                                  <h4 className="font-medium text-slate-900">
                                    {originalSuite.name}
                                  </h4>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSuiteFromScenario(
                                      scenarioSuite.id,
                                    );
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="p-4 bg-white">
                                  <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Variable size={14} /> Variable Overrides
                                  </h5>
                                  {originalSuite.variables &&
                                  originalSuite.variables.length > 0 ? (
                                    <div className="space-y-2">
                                      {originalSuite.variables.map((v) => (
                                        <div
                                          key={v.id}
                                          className="flex items-center gap-3"
                                        >
                                          <div className="w-1/3 text-sm font-mono text-slate-600 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 truncate">
                                            {v.key}
                                          </div>
                                          <div className="flex-1 relative">
                                            <input
                                              type="text"
                                              value={
                                                scenarioSuite.variableOverrides[
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
                                              className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">
                                      This suite has no variables to override.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Right Column: Available Suites */}
                    <div className="w-80 flex-shrink-0">
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm sticky top-0">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            Available Suites
                            <HelpTooltip content="Test suites available in this project. Click the plus icon to add them to the execution sequence." />
                          </h3>
                        </div>
                        <div className="p-2 max-h-[600px] overflow-y-auto">
                          {suites.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">
                              No suites available in this project.
                            </p>
                          ) : (
                            suites.map((suite) => (
                              <div
                                key={suite.id}
                                className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group"
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <Layers
                                    size={14}
                                    className="text-slate-400 flex-shrink-0"
                                  />
                                  <span className="text-sm text-slate-700 truncate">
                                    {suite.name}
                                  </span>
                                </div>
                                <button
                                  onClick={() =>
                                    handleAddSuiteToScenario(suite.id)
                                  }
                                  className="p-1 text-blue-600 hover:bg-blue-100 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
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
        {scenarioToRun ? (
          <ScenarioExecutionRunner
            scenario={scenarioToRun}
            suites={suites}
            project={currentProject}
            headers={headers}
            bodies={bodies}
            endpoints={endpoints}
            environments={environments}
            initialEnvironment={initialEnvironment}
            onClose={() => setActiveTab("BUILDER")}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50 h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Terminal size={24} className="text-slate-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                No Scenario Running
              </h2>
              <p className="text-slate-500 mt-2 max-w-md mx-auto">
                Go to the Scenario Builder and click "Run Scenario" to start an
                execution.
              </p>
              <button
                onClick={() => setActiveTab("BUILDER")}
                className="mt-6 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm inline-flex items-center gap-2"
              >
                Go to Builder
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

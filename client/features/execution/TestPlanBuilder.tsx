import React, { useState, useMemo } from "react";
import {
  Play,
  Layers,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Workflow,
  GripVertical,
} from "lucide-react";
import { Project, TestPlan, TestScenario } from "@/shared/types";
import { CrudActions } from "@/shared/hooks/useCrud";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";

interface TestPlanBuilderProps {
  projects: Project[];
  projectsApi: CrudActions<Project>;
  currentProjectId: string;
  onRunPlan: (planId: string) => void;
}

export const TestPlanBuilder: React.FC<TestPlanBuilderProps> = ({
  projects,
  projectsApi,
  currentProjectId,
  onRunPlan,
}) => {
  const currentProject = projects.find((p) => p.id === currentProjectId);
  const plans = currentProject?.plans || [];
  const scenarios = currentProject?.scenarios || [];

  const [activePlanId, setActivePlanId] = useState<string | null>(
    plans[0]?.id || null,
  );
  const activePlan = plans.find((p) => p.id === activePlanId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "plan" | "scenario";
    id: string;
  } | null>(null);

  const handleCreatePlan = () => {
    const newPlan: TestPlan = {
      id: `plan-${Date.now()}`,
      projectId: currentProjectId,
      name: "New Test Plan",
      description: "",
      scenarios: [],
    };
    const updatedPlans = [...plans, newPlan];
    projectsApi.update(currentProjectId, { plans: updatedPlans });
    setActivePlanId(newPlan.id);
    setIsEditing(true);
    setEditName(newPlan.name);
    setEditDescription("");
  };

  const handleDeletePlan = (id: string) => {
    const updatedPlans = plans.filter((p) => p.id !== id);
    projectsApi.update(currentProjectId, { plans: updatedPlans });
    if (activePlanId === id) {
      setActivePlanId(updatedPlans[0]?.id || null);
    }
  };

  const handleSavePlan = () => {
    if (!activePlan) return;
    const updatedPlans = plans.map((p) =>
      p.id === activePlan.id
        ? { ...p, name: editName, description: editDescription }
        : p,
    );
    projectsApi.update(currentProjectId, { plans: updatedPlans });
    setIsEditing(false);
  };

  const handleAddScenarioToPlan = (scenarioId: string) => {
    if (!activePlan) return;
    if (activePlan.scenarios.some((s) => s.scenarioId === scenarioId)) return;

    const newPlanScenario = {
      id: `ps-${Date.now()}`,
      scenarioId,
    };

    const updatedPlans = plans.map((p) =>
      p.id === activePlan.id
        ? { ...p, scenarios: [...p.scenarios, newPlanScenario] }
        : p,
    );
    projectsApi.update(currentProjectId, { plans: updatedPlans });
  };

  const handleRemoveScenarioFromPlan = (planScenarioId: string) => {
    if (!activePlan) return;
    const updatedPlans = plans.map((p) =>
      p.id === activePlan.id
        ? {
            ...p,
            scenarios: p.scenarios.filter((s) => s.id !== planScenarioId),
          }
        : p,
    );
    projectsApi.update(currentProjectId, { plans: updatedPlans });
  };

  const moveScenario = (index: number, direction: -1 | 1) => {
    if (!activePlan) return;
    const newScenarios = [...activePlan.scenarios];
    if (index + direction < 0 || index + direction >= newScenarios.length)
      return;

    const temp = newScenarios[index];
    newScenarios[index] = newScenarios[index + direction];
    newScenarios[index + direction] = temp;

    const updatedPlans = plans.map((p) =>
      p.id === activePlan.id ? { ...p, scenarios: newScenarios } : p,
    );
    projectsApi.update(currentProjectId, { plans: updatedPlans });
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={
          deleteConfirm?.type === "plan"
            ? "Delete Test Plan"
            : "Remove Scenario"
        }
        message={
          deleteConfirm?.type === "plan"
            ? "Are you sure you want to delete this test plan? This action cannot be undone."
            : "Are you sure you want to remove this scenario from the test plan?"
        }
        onConfirm={() => {
          if (deleteConfirm?.type === "plan") {
            handleDeletePlan(deleteConfirm.id);
          } else if (deleteConfirm?.type === "scenario") {
            handleRemoveScenarioFromPlan(deleteConfirm.id);
          }
        }}
        onClose={() => setDeleteConfirm(null)}
      />
      {/* Left Sidebar - Plans List */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Workflow size={18} className="text-indigo-600" />
            Test Plans
            <HelpTooltip content="Manage test plans which orchestrate multiple test scenarios." />
          </h2>
          <button
            onClick={handleCreatePlan}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title="Create Test Plan"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {plans.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No test plans yet.
              <br />
              Click + to create one.
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => {
                  setActivePlanId(plan.id);
                  setIsEditing(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group cursor-pointer ${
                  activePlanId === plan.id
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="truncate pr-2">{plan.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm({ type: "plan", id: plan.id });
                  }}
                  className={`p-1 text-slate-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    activePlanId === plan.id ? "opacity-100" : ""
                  }`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Main Area - Plan Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activePlan ? (
          <>
            {/* Plan Header */}
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
                          className="text-2xl font-bold text-slate-900 bg-white border border-indigo-300 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Plan Name"
                          autoFocus
                        />
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                          placeholder="Plan Description (optional)"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSavePlan}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 flex items-center gap-1.5"
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
                            {activePlan.name}
                            <button
                              onClick={() => {
                                setIsEditing(true);
                                setEditName(activePlan.name);
                                setEditDescription(
                                  activePlan.description || "",
                                );
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 transition-all"
                            >
                              <Edit2 size={16} />
                            </button>
                          </h1>
                          {activePlan.description && (
                            <p className="text-slate-500 text-sm mt-1">
                              {activePlan.description}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-sm"
                      onClick={() => onRunPlan(activePlan.id)}
                    >
                      <Play size={16} />
                      Run Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Plan Content */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="w-full flex gap-8">
                {/* Left Column: Scenarios in Plan */}
                <div className="flex-1 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    Execution Sequence
                    <HelpTooltip content="Define the order of test scenarios to run in this plan." />
                  </h3>

                  {activePlan.scenarios.length === 0 ? (
                    <div className="text-center py-12 bg-white border border-dashed border-slate-300 rounded-xl">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Layers size={20} className="text-slate-400" />
                      </div>
                      <p className="text-slate-500 text-sm">
                        No scenarios added to this plan yet.
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        Add scenarios from the panel on the right.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[15px] before:w-0.5 before:bg-slate-200">
                      {activePlan.scenarios.map((planScenario, index) => {
                        const scenario = scenarios.find(
                          (s) => s.id === planScenario.scenarioId,
                        );
                        if (!scenario) return null;

                        return (
                          <div
                            key={planScenario.id}
                            className="relative flex items-start gap-4"
                          >
                            {/* Timeline Node */}
                            <div className="w-8 h-8 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center text-xs font-bold text-indigo-600 z-10 shrink-0 mt-1 shadow-sm">
                              {index + 1}
                            </div>

                            {/* Scenario Card */}
                            <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group overflow-hidden">
                              <div className="p-4 flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-sm font-semibold text-slate-900 truncate">
                                      {scenario.name}
                                    </h4>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium border border-slate-200">
                                      {scenario.suites.length} suites
                                    </span>
                                  </div>
                                  {scenario.description && (
                                    <p className="text-xs text-slate-500 line-clamp-2">
                                      {scenario.description}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex flex-col gap-1 mr-2">
                                    <button
                                      onClick={() => moveScenario(index, -1)}
                                      disabled={index === 0}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                      title="Move Up"
                                    >
                                      <GripVertical
                                        size={14}
                                        className="rotate-90"
                                      />
                                    </button>
                                    <button
                                      onClick={() => moveScenario(index, 1)}
                                      disabled={
                                        index ===
                                        activePlan.scenarios.length - 1
                                      }
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                      title="Move Down"
                                    >
                                      <GripVertical
                                        size={14}
                                        className="rotate-90"
                                      />
                                    </button>
                                  </div>
                                  <button
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "scenario",
                                        id: planScenario.id,
                                      })
                                    }
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Remove from Plan"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Column: Available Scenarios */}
                <div className="w-80 flex-shrink-0">
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm sticky top-6">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Layers size={16} className="text-indigo-600" />
                        Available Scenarios
                        <HelpTooltip content="Test scenarios available in this project. Click the plus icon to add them to the execution sequence." />
                      </h3>
                    </div>
                    <div className="p-3 max-h-[calc(100vh-250px)] overflow-y-auto space-y-2">
                      {scenarios.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400">
                            No scenarios available in this project.
                          </p>
                        </div>
                      ) : (
                        scenarios.map((scenario) => {
                          const isAdded = activePlan.scenarios.some(
                            (s) => s.scenarioId === scenario.id,
                          );

                          return (
                            <div
                              key={scenario.id}
                              className={`flex items-center justify-between p-3 bg-white border rounded-lg group transition-all ${
                                isAdded
                                  ? "border-slate-100 opacity-60"
                                  : "border-slate-100 hover:border-indigo-200 hover:shadow-sm"
                              }`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div
                                  className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                    isAdded
                                      ? "bg-slate-50"
                                      : "bg-slate-50 group-hover:bg-indigo-50"
                                  }`}
                                >
                                  <Layers
                                    size={14}
                                    className={`transition-colors ${
                                      isAdded
                                        ? "text-slate-300"
                                        : "text-slate-400 group-hover:text-indigo-500"
                                    }`}
                                  />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                  <span
                                    className={`text-sm font-medium truncate ${
                                      isAdded
                                        ? "text-slate-500"
                                        : "text-slate-700 group-hover:text-slate-900"
                                    }`}
                                  >
                                    {scenario.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {scenario.suites.length} suites
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  !isAdded &&
                                  handleAddScenarioToPlan(scenario.id)
                                }
                                disabled={isAdded}
                                className={`p-1.5 rounded-md transition-all flex-shrink-0 shadow-sm border ${
                                  isAdded
                                    ? "text-slate-300 bg-slate-50 border-transparent cursor-not-allowed"
                                    : "text-indigo-600 hover:bg-indigo-600 hover:text-white opacity-0 group-hover:opacity-100 border-transparent hover:border-indigo-700"
                                }`}
                                title={
                                  isAdded ? "Already added" : "Add to Plan"
                                }
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Workflow size={28} className="text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                No Test Plan Selected
              </h3>
              <p className="text-slate-500 text-sm">
                Select a test plan from the sidebar or create a new one to start
                orchestrating scenarios.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

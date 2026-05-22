import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, GitBranchPlus, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';

import type { BusinessFlow, BusinessFlowStep, Requirement } from '../../../shared/contracts/index';
import { useBusinessFlowMutations, useBusinessFlows, useRequirements } from '../../shared/hooks/useQueryHooks';
import { orderRequirementsLikeTree } from '../../shared/requirements/order';
import { buildRequirementPath } from '../../shared/requirements/path';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';

interface Props {
  currentProjectId?: string;
}

function createEmptyFlow(projectId: string): Omit<BusinessFlow, 'id'> {
  return {
    projectId,
    name: 'New Business Flow',
    description: '',
    type: 'happy-path',
    status: 'DRAFT',
    steps: [],
  };
}

export function BusinessFlowsPage({ currentProjectId }: Props) {
  const projectId = currentProjectId || '';
  const { data: requirements = [], isLoading: requirementsLoading } = useRequirements(projectId);
  const { data: flows = [], isLoading: flowsLoading } = useBusinessFlows(projectId);
  const { create, update, remove, approve, unapprove } = useBusinessFlowMutations(projectId);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BusinessFlow | Omit<BusinessFlow, 'id'> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [deleteConfirmFlowId, setDeleteConfirmFlowId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [expandedReferenceStepIndex, setExpandedReferenceStepIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!flows.length) {
      setSelectedFlowId(null);
      setDraft(null);
      setEditingStepIndex(null);
      setExpandedReferenceStepIndex(null);
      return;
    }

    setSelectedFlowId((current) => current && flows.some((flow) => flow.id === current) ? current : flows[0].id);
  }, [flows]);

  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) || null;
  const requirementMap = useMemo(() => new Map(requirements.map((requirement) => [requirement.id, requirement])), [requirements]);
  const filteredFlows = useMemo(
    () => searchTerm ? flows.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase())) : flows,
    [flows, searchTerm],
  );

  useEffect(() => {
    if (selectedFlow) {
      setDraft({ ...selectedFlow, steps: selectedFlow.steps.map((step) => ({ ...step })) });
      setEditingStepIndex(null);
      setExpandedReferenceStepIndex(null);
    }
  }, [selectedFlow]);

  const loading = requirementsLoading || flowsLoading;
  const storyRequirements = useMemo(
    () => orderRequirementsLikeTree(requirements).filter((requirement) => requirement.level === 'story'),
    [requirements],
  );

  const updateDraft = (updater: (current: BusinessFlow | Omit<BusinessFlow, 'id'>) => BusinessFlow | Omit<BusinessFlow, 'id'>) => {
    setErrorMessage(null);
    setDraft((current) => current ? updater(current) : current);
  };

  const hasInvalidSteps = (flow: BusinessFlow | Omit<BusinessFlow, 'id'>): boolean => {
    if (flow.steps.length === 0) {
      return true;
    }

    return flow.steps.some((step, index) => {
      return step.requirementIds.length === 0 ||
        step.requirementIds.some((id) => !requirementMap.get(id)) ||
        step.sequence !== index + 1 ||
        !step.actionSummary.trim();
    });
  };

  const handleCreate = async () => {
    if (!projectId) return;
    const created = await create(createEmptyFlow(projectId));
    setSelectedFlowId(created.id);
  };

  const handleSave = async () => {
    if (!draft || !('id' in draft)) return;
    setErrorMessage(null);
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      await update(draft.id, draft);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDelete = async (flowId: string) => {
    setErrorMessage(null);
    setIsDeleting(true);
    try {
      await remove(flowId);
      setDeleteConfirmFlowId(null);
      if (selectedFlowId === flowId) {
        setSelectedFlowId(null);
        setDraft(null);
        setEditingStepIndex(null);
        setExpandedReferenceStepIndex(null);
      }
    } catch (e) {
      setErrorMessage('Failed to delete business flow.');
      throw e;
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApprovalToggle = async () => {
    if (!draft || !('id' in draft)) return;
    setErrorMessage(null);
    if (draft.status === 'APPROVED') {
      await unapprove(draft.id);
      return;
    }

    if (hasInvalidSteps(draft)) {
      setErrorMessage('Fix invalid or empty steps before approving this flow.');
      return;
    }

    await approve(draft.id);
  };

  const handleAddStep = () => {
    if (!draft) return;
    setExpandedReferenceStepIndex(draft.steps.length);
    updateDraft((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          sequence: current.steps.length + 1,
          requirementIds: [],
          actionSummary: '',
        },
      ],
    }));
  };

  const handleStepChange = (index: number, updater: (step: BusinessFlowStep) => BusinessFlowStep) => {
    updateDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? updater(step) : step),
    }));
  };

  const toggleRequirementForStep = (index: number, requirementId: string) => {
    handleStepChange(index, (current) => ({
      ...current,
      requirementIds: current.requirementIds.includes(requirementId)
        ? current.requirementIds.filter((id) => id !== requirementId)
        : [...current.requirementIds, requirementId],
    }));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    updateDraft((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.steps.length) {
        return current;
      }

      const nextSteps = [...current.steps];
      [nextSteps[index], nextSteps[targetIndex]] = [nextSteps[targetIndex], nextSteps[index]];

      return {
        ...current,
        steps: nextSteps.map((step, stepIndex) => ({ ...step, sequence: stepIndex + 1 })),
      };
    });
  };

  const removeStep = (index: number) => {
    updateDraft((current) => ({
      ...current,
      steps: current.steps
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({ ...step, sequence: stepIndex + 1 })),
    }));
    setEditingStepIndex((current) => current === index ? null : current);
    setExpandedReferenceStepIndex((current) => current === index ? null : current);
  };

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to manage business flows.</div>;
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400">Loading business flows...</div>;
  }

  return (
    <div className="h-full flex bg-slate-50 overflow-hidden">
      <ConfirmModal
        isOpen={!!deleteConfirmFlowId}
        title="Delete Business Flow"
        message="Are you sure you want to delete this business flow? This action cannot be undone."
        onConfirm={() => deleteConfirmFlowId && handleDelete(deleteConfirmFlowId)}
        onClose={() => setDeleteConfirmFlowId(null)}
        loading={isDeleting}
      />
      <div className="w-80 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <GitBranchPlus size={14} />
              Business Flows
              <HelpTooltip content="Define sequential business paths with linked requirements. Approve a flow to use it as a blueprint for AI test generation." />
            </h2>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => {
                  setIsRefreshing(true);
                  queryClient.invalidateQueries({ queryKey: queryKeys.businessFlows });
                  setTimeout(() => setIsRefreshing(false), 500);
                }}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              </button>
              <button
                onClick={handleCreate}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
                title="Create Business Flow"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Filter flows..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {filteredFlows.map((flow) => (
            <div
              key={flow.id}
              className={`group flex items-center gap-2 px-1.5 py-1 cursor-pointer rounded-md text-sm transition-all duration-150 ${
                flow.id === selectedFlowId
                  ? 'bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-300'
                  : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 hover:shadow-sm'
              }`}
            >
              <button
                onClick={() => setSelectedFlowId(flow.id)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="truncate font-medium text-sm">{flow.name}</div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase">{flow.type}</div>
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteConfirmFlowId(flow.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                title="Delete Business Flow"
                aria-label="Delete Business Flow"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {filteredFlows.length === 0 && (
            <div className="text-center py-12 px-4">
              <GitBranchPlus size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 font-medium">{searchTerm ? 'No matching flows' : 'No business flows yet'}</p>
              <p className="text-xs text-slate-400 mt-1">{searchTerm ? 'Try adjusting your search.' : 'Create your first business flow to get started.'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!draft ? (
          <div className="h-full flex items-center justify-center text-slate-400 bg-slate-50"><p className="font-medium text-slate-500">Select a business flow to view details</p></div>
        ) : (
          <div className="max-w-[1600px] mx-auto w-full px-8 pt-6 pb-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <input
                  value={draft.name}
                  onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))}
                  className="w-full text-2xl font-bold text-slate-900 bg-transparent border-none outline-none placeholder-slate-300 tracking-tight p-0"
                  placeholder="Flow name"
                />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {saveStatus === 'saving' && (
                  <span className="text-xs text-slate-500 animate-pulse">Saving...</span>
                )}
                {saveStatus === 'success' && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <Check size={14} /> Saved successfully
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                    <X size={14} /> Save failed
                  </span>
                )}
                {'id' in draft && (
                  <button
                    onClick={handleApprovalToggle}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                      draft.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {draft.status === 'APPROVED' ? 'Unapprove' : 'Approve'}
                  </button>
                )}
                {'id' in draft && (
                  <button
                    onClick={handleSave}
                    disabled={saveStatus === 'saving'}
                    className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md transition-colors shadow-sm ${
                      saveStatus === 'saving'
                        ? 'bg-blue-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <Save size={16} />
                    <span>Save</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={draft.description}
              onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
              className="w-full min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-400 resize-none"
              placeholder="Describe the business path and its preconditions..."
            />

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center gap-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Type</label>
              <select
                value={draft.type}
                onChange={(event) => updateDraft((current) => ({
                  ...current,
                  type: event.target.value as BusinessFlow['type'],
                }))}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
              >
                <option value="happy-path">Happy Path</option>
                <option value="alternate">Alternate</option>
                <option value="exception">Exception</option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center">
                <h3 className="text-sm font-semibold text-slate-700">Steps</h3>
                <button
                  onClick={handleAddStep}
                  className="ml-auto px-2.5 py-1.5 rounded-md text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  Add Step
                </button>
              </div>
              <div className="p-4 space-y-3">
                {draft.steps.map((step, index) => {
                  const linkedRequirements = step.requirementIds.map((id) => requirementMap.get(id)).filter(Boolean) as Requirement[];
                  const allAcceptanceCriteria = linkedRequirements.length > 0
                    ? requirements.filter((candidate) =>
                        candidate.level === 'ac' && linkedRequirements.some((req) => candidate.parentId === req.id)
                      )
                    : [];
                  const stepInvalid = step.requirementIds.length === 0 || step.sequence !== index + 1 || !step.actionSummary.trim();
                  const isEditingStory = editingStepIndex === index;
                  const isReferenceExpanded = expandedReferenceStepIndex === index;
                  return (
                    <div
                      key={`${step.sequence}-${step.requirementIds.join(',')}`}
                      className={`group rounded-lg border p-4 space-y-3 ${stepInvalid ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}
                    >
                <div
                  data-testid={`business-flow-step-header-${index}`}
                  className="flex items-center gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
                >
                  <span>Step {step.sequence}</span>
                  {stepInvalid && <span className="text-amber-700">Invalid</span>}
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => moveStep(index, -1)}
                            className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            disabled={index === 0}
                            title="Move Step Up"
                            aria-label="Move Step Up"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            onClick={() => moveStep(index, 1)}
                            className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            disabled={index === draft.steps.length - 1}
                            title="Move Step Down"
                            aria-label="Move Step Down"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            onClick={() => removeStep(index)}
                            className="p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete Step"
                            aria-label="Delete Step"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Action Summary
                        </label>
                        <textarea
                          value={step.actionSummary}
                          onChange={(event) => handleStepChange(index, (current) => ({ ...current, actionSummary: event.target.value }))}
                          className="w-full min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-400 resize-none"
                          placeholder="Describe the business action for this step..."
                        />
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setExpandedReferenceStepIndex((current) => current === index ? null : index)}
                          data-testid={`linked-requirement-toggle-${index}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
                        >
                    {isReferenceExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {`Linked Requirement${linkedRequirements.length > 0 ? ` · ${linkedRequirements.map((r) => r.title).join(', ')}` : ''}`}
                  </button>

                        {isReferenceExpanded && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                  Linked Requirements
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setEditingStepIndex((current) => current === index ? null : index)}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                >
                                  {isEditingStory ? 'Hide Requirement Picker' : 'Link Requirements'}
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {linkedRequirements.length > 0 ? linkedRequirements.map((req) => (
                                  <span
                                    key={req.id}
                                    title={buildRequirementPath(req.id, requirements)}
                                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                                  >
                                    {req.title}
                                  </span>
                                )) : (
                                  <p className="text-xs text-slate-400">No linked requirements</p>
                                )}
                              </div>

                              {isEditingStory && (
                                <div className="max-h-80 overflow-y-auto border-t border-slate-200 pt-3 space-y-2">
                                  {storyRequirements.map((requirementItem) => (
                                    <label
                                      key={requirementItem.id}
                                      className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        aria-label={`Select requirement ${requirementItem.title}`}
                                        checked={step.requirementIds.includes(requirementItem.id)}
                                        onChange={() => toggleRequirementForStep(index, requirementItem.id)}
                                        className="mt-0.5 accent-blue-600"
                                      />
                                      <span className="min-w-0">
                                        <span className="block font-medium text-sm text-slate-700">{requirementItem.title}</span>
                                        <span className="block text-xs text-slate-400 mt-0.5">
                                          {buildRequirementPath(requirementItem.id, requirements)}
                                        </span>
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>

                            <hr className="border-slate-200" />

                            <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                                Acceptance Criteria Reference
                              </label>
                              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                                {allAcceptanceCriteria.length === 0 ? (
                                  <p className="text-xs text-slate-400">No acceptance criteria linked to selected stories.</p>
                                ) : (
                                  allAcceptanceCriteria.map((candidate) => (
                                    <div key={candidate.id} className="text-sm text-slate-700">
                                      {candidate.title}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {step.requirementIds.length === 0 && (
                        <div className="text-sm font-medium text-amber-700">Missing requirement reference</div>
                      )}
                    </div>
                  );
                })}
                {draft.steps.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-sm text-slate-500 font-medium">No steps yet</p>
                    <p className="text-xs text-slate-400 mt-1">Add a step to define this business flow.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Play, FileText, GitBranch, Settings2, Zap, CheckCircle } from 'lucide-react';
import type { Requirement, BusinessFlow } from '../../../shared/contracts/index';
import { useProviderConfigs } from '../../shared/hooks/useQueryHooks';

interface TestGenConfigPanelProps {
  requirements: Requirement[];
  businessFlows: BusinessFlow[];
  onStart: (config: TestGenStartConfig) => void;
  disabled?: boolean;
}

export interface TestGenStartConfig {
  name: string;
  requirementIds: string[];
  flowIds: string[];
  mode: 'auto' | 'interactive';
  providerConfigName: string;
  model?: string;
  modelName?: string;
  includeFlowCases?: boolean;
  useCache?: boolean;
  reasoningEffort?: string;
  reasoningSummary?: string;
  textVerbosity?: string;
}

interface TreeNode {
  req: Requirement;
  children: TreeNode[];
  depth: number;
}

function buildTree(requirements: Requirement[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const req of requirements) {
    map.set(req.id, { req, children: [], depth: 0 });
  }
  for (const req of requirements) {
    const node = map.get(req.id)!;
    if (req.parentId && map.has(req.parentId)) {
      map.get(req.parentId)!.children.push(node);
    } else if (!req.parentId) {
      roots.push(node);
    }
  }
  function setDepth(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  }
  setDepth(roots, 0);
  return roots;
}

function collectLeafIds(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.req.id];
  return node.children.flatMap(collectLeafIds);
}

function RequirementTreeNode({
  node,
  selectedIds,
  onToggle,
  forceExpanded,
}: {
  node: TreeNode;
  selectedIds: Set<string>;
  onToggle: (ids: string[]) => void;
  forceExpanded: boolean;
}) {
  const [selfExpanded, setSelfExpanded] = useState(forceExpanded);
  const expanded = selfExpanded;
  const hasChildren = node.children.length > 0;
  const allDescendantIds = hasChildren ? collectLeafIds(node) : [node.req.id];
  const allSelected = allDescendantIds.every(id => selectedIds.has(id));
  const someSelected = allDescendantIds.some(id => selectedIds.has(id));
  const labelRef = useRef<HTMLSpanElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    setSelfExpanded(forceExpanded);
  }, [forceExpanded]);

  const handleTitleMouseEnter = () => {
    if (labelRef.current && labelRef.current.scrollWidth > labelRef.current.clientWidth) {
      setShowTooltip(true);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded-md cursor-pointer transition-colors ${
          someSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
        }`}
        style={{ paddingLeft: `${node.depth * 20 + 6}px` }}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setSelfExpanded(!expanded); }} className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
          onChange={() => onToggle(allDescendantIds)}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 shrink-0"
        />
        <span
          ref={labelRef}
          className={`text-[13px] truncate flex-1 min-w-0 leading-snug ${
            allSelected ? 'text-slate-800 font-medium' : someSelected ? 'text-slate-700' : 'text-slate-600'
          }`}
          title={showTooltip ? node.req.title : undefined}
          onMouseEnter={handleTitleMouseEnter}
        >
          {node.req.title}
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">
          {node.req.level}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <RequirementTreeNode key={child.req.id} node={child} selectedIds={selectedIds} onToggle={onToggle} forceExpanded={forceExpanded} />
          ))}
        </div>
      )}
    </div>
  );
}

const CONFIG_KEY = 'ai-test-gen-config';

interface SavedConfig {
  mode: 'auto' | 'interactive';
  showApprovedOnly: boolean;
  selectedModel: string;
  modelName: string;
  includeFlowCases: boolean;
  useCache: boolean;
  reasoningEffort?: string;
  reasoningSummary?: string;
  textVerbosity?: string;
}

function loadConfig(): SavedConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(config: SavedConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

const defaultConfig: SavedConfig = {
  mode: 'auto',
  showApprovedOnly: true,
  selectedModel: '',
  modelName: '',
  includeFlowCases: false,
  useCache: false,
};

export function TestGenConfigPanel({
  requirements,
  businessFlows,
  onStart,
  disabled,
}: TestGenConfigPanelProps) {
  const { data: providerConfigs = [] } = useProviderConfigs();
  const savedConfig = useMemo(() => loadConfig(), []);

  const [selectedReqs, setSelectedReqs] = useState<Set<string>>(new Set());
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'auto' | 'interactive'>(savedConfig?.mode ?? defaultConfig.mode);
  const [showApprovedOnly, setShowApprovedOnly] = useState(savedConfig?.showApprovedOnly ?? defaultConfig.showApprovedOnly);

  // Note: requirement/flow selections are intentionally NOT restored from localStorage
  // to avoid silently carrying over selections across sessions (which caused
  // unexpected batch splitting when a previous run had a different epic selection).

  const [expandAll, setExpandAll] = useState(false);
  const [selectedModel, setSelectedModel] = useState(savedConfig?.selectedModel ?? defaultConfig.selectedModel);
  const [modelName, setModelName] = useState(savedConfig?.modelName ?? defaultConfig.modelName);
  const [modelOpen, setModelOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen]);
  // Build model options grouped by provider name, sorted alphabetically
  const modelGroups = useMemo(() => {
    const groups: { providerName: string; models: { model: string; providerName: string; providerType: string }[] }[] = [];
    for (const p of providerConfigs) {
      const models: string[] = p.models || [];
      if (models.length === 0) continue;
      groups.push({
        providerName: p.name,
        models: models.map(m => ({ model: m, providerName: p.name, providerType: p.type })),
      });
    }
    return groups.sort((a, b) => a.providerName.localeCompare(b.providerName));
  }, [providerConfigs]);
  const modelOptions = useMemo(() => modelGroups.flatMap(g => g.models), [modelGroups]);
  // Selected provider derived from selected model
  const selectedProvider = useMemo(() => {
    const opt = modelOptions.find(o => o.model === selectedModel);
    return opt?.providerName || '';
  }, [modelOptions, selectedModel]);
  const selectedProviderType = useMemo(() => {
    const opt = modelOptions.find(o => o.model === selectedModel);
    return opt?.providerType || '';
  }, [modelOptions, selectedModel]);
  // Auto-select first model from active provider
  useEffect(() => {
    if (!selectedModel && modelOptions.length > 0) {
      const active = providerConfigs.find((p: any) => p.isActive);
      if (active) {
        const firstModel = modelOptions.find(o => o.providerName === active.name);
        if (firstModel) {
          setSelectedModel(firstModel.model);
          setModelName(`${firstModel.model} (${firstModel.providerName})`);
        }
      } else if (modelOptions[0]) {
        setSelectedModel(modelOptions[0].model);
        setModelName(`${modelOptions[0].model} (${modelOptions[0].providerName})`);
      }
    }
  }, [modelOptions, selectedModel, providerConfigs]);
  const [includeFlowCases, setIncludeFlowCases] = useState(savedConfig?.includeFlowCases ?? defaultConfig.includeFlowCases);
  const [useCache, setUseCache] = useState(savedConfig?.useCache ?? defaultConfig.useCache);
  const [reasoningEffort, setReasoningEffort] = useState(savedConfig?.reasoningEffort ?? '');
  const [reasoningSummary, setReasoningSummary] = useState(savedConfig?.reasoningSummary ?? '');
  const [textVerbosity, setTextVerbosity] = useState(savedConfig?.textVerbosity ?? '');

  useEffect(() => {
    saveConfig({
      mode, showApprovedOnly, selectedModel, modelName, includeFlowCases, useCache,
      reasoningEffort, reasoningSummary, textVerbosity,
    });
  }, [mode, showApprovedOnly, selectedModel, modelName, includeFlowCases, useCache, reasoningEffort, reasoningSummary, textVerbosity]);

  const tree = useMemo(() => buildTree(requirements), [requirements]);

  const flows = showApprovedOnly
    ? businessFlows.filter(f => f.status === 'APPROVED')
    : businessFlows;

  const handleReqToggle = (ids: string[]) => {
    setSelectedReqs(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleFlowToggle = (id: string) => {
    setSelectedFlows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleReset = () => {
    setMode(defaultConfig.mode);
    setShowApprovedOnly(defaultConfig.showApprovedOnly);
    setSelectedModel(defaultConfig.selectedModel);
    setModelName(defaultConfig.modelName);
    setIncludeFlowCases(defaultConfig.includeFlowCases);
    setUseCache(defaultConfig.useCache);
    setReasoningEffort('');
    setReasoningSummary('');
    setTextVerbosity('');
    setSelectedReqs(new Set());
    setSelectedFlows(new Set());
  };

  const handleStart = () => {
    const now = new Date();
    const defaultName = `TestGen_${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 5).replace(':', '-')}`;
    onStart({
      name: defaultName,
      requirementIds: Array.from(selectedReqs),
      flowIds: Array.from(selectedFlows),
      mode,
      providerConfigName: selectedProvider,
      model: selectedModel || undefined,
      modelName: modelName || undefined,
      includeFlowCases,
      useCache,
      reasoningEffort: reasoningEffort || undefined,
      reasoningSummary: reasoningSummary || undefined,
      textVerbosity: textVerbosity || undefined,
    });
  };

  const canStart = (includeFlowCases ? selectedFlows.size > 0 : selectedReqs.size > 0) && selectedProvider !== '' && !disabled;

  return (
    <div className="h-full flex overflow-hidden bg-white">
      {/* Column 1: Requirements */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-100">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-50">
            <FileText size={14} className="text-blue-600" />
          </div>
          <h3 className="text-[13px] font-semibold text-slate-700">Requirements</h3>
          {selectedReqs.size > 0 && (
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {selectedReqs.size}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col px-4 pt-3 pb-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedReqs.size === requirements.length && requirements.length > 0}
                ref={el => {
                  if (el) el.indeterminate = selectedReqs.size > 0 && selectedReqs.size < requirements.length;
                }}
                onChange={() => {
                  if (selectedReqs.size === requirements.length) {
                    setSelectedReqs(new Set());
                  } else {
                    setSelectedReqs(new Set(requirements.map(r => r.id)));
                  }
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
              />
              <span>Select all</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setExpandAll(!expandAll)}
                className="text-[11px] font-medium text-slate-400 hover:text-blue-600 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                title={expandAll ? 'Collapse all' : 'Expand all'}
              >
                {expandAll ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <FileText size={28} className="mb-2 opacity-40" />
                <p className="text-xs">No requirements found</p>
              </div>
            ) : (
              tree.map(node => (
                <RequirementTreeNode
                  key={node.req.id}
                  node={node}
                  selectedIds={selectedReqs}
                  onToggle={handleReqToggle}
                  forceExpanded={expandAll}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Column 2: Business Flows */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-100">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-50">
            <GitBranch size={14} className="text-violet-600" />
          </div>
          <h3 className="text-[13px] font-semibold text-slate-700">Business Flows</h3>
          {selectedFlows.size > 0 && (
            <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {selectedFlows.size}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col px-4 pt-3 pb-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedFlows.size === flows.length && flows.length > 0}
                ref={el => {
                  if (el) el.indeterminate = selectedFlows.size > 0 && selectedFlows.size < flows.length;
                }}
                onChange={() => {
                  if (selectedFlows.size === flows.length) {
                    setSelectedFlows(new Set());
                  } else {
                    setSelectedFlows(new Set(flows.map(f => f.id)));
                  }
                }}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/20"
              />
              <span>Select all</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showApprovedOnly}
                onChange={e => setShowApprovedOnly(e.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/20"
              />
              <span>Approved only</span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {flows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <GitBranch size={28} className="mb-2 opacity-40" />
                <p className="text-xs">No business flows available</p>
              </div>
            ) : (
              flows.map(flow => (
                <label key={flow.id} className={`flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer text-sm transition-colors ${
                  selectedFlows.has(flow.id) ? 'bg-violet-50/70' : 'hover:bg-slate-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={selectedFlows.has(flow.id)}
                    onChange={() => handleFlowToggle(flow.id)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/20 shrink-0"
                  />
                  <span className={`truncate flex-1 min-w-0 ${
                    selectedFlows.has(flow.id) ? 'text-slate-800 font-medium' : 'text-slate-600'
                  }`} title={flow.name + ' (' + flow.type + ')'}>
                    {flow.name}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">
                    {flow.type}
                  </span>
                  {flow.status === 'APPROVED' && (
                    <span className="shrink-0" title="Approved">
                      <CheckCircle size={12} className="text-green-500" />
                    </span>
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Column 3: Settings */}
      <div className="w-96 flex flex-col bg-slate-50/50 shrink-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100">
            <Settings2 size={14} className="text-slate-600" />
          </div>
          <h3 className="text-[13px] font-semibold text-slate-700">Settings</h3>
          <button
            onClick={handleReset}
            className="ml-auto text-[11px] font-medium text-slate-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Run Mode */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Run Mode</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white p-0.5">
              <button
                onClick={() => setMode('auto')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === 'auto'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Zap size={13} />
                Auto
              </button>
              <button
                onClick={() => setMode('interactive')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === 'interactive'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CheckCircle size={13} />
                Interactive
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {mode === 'auto' ? 'Run all stages automatically' : 'Pause at each checkpoint for review'}
            </p>
          </div>

          {/* Model */}
          <div className="relative" ref={modelDropdownRef}>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Model</label>
            <button
              onClick={() => setModelOpen(!modelOpen)}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white hover:border-slate-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 transition-all"
            >
              <span className="text-slate-700">{selectedModel || 'Select a model'}</span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
            </button>
            {modelOpen && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {modelGroups.map(group => (
                  <div key={group.providerName}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50">{group.providerName}</div>
                    {group.models.map((o, i) => (
                      <button
                        key={`${o.providerName}-${o.model}-${i}`}
                        onClick={() => { setSelectedModel(o.model); setModelName(`${o.model} (${o.providerName})`); setModelOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors ${
                          selectedModel === o.model ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-slate-700'
                        }`}
                      >
                        {o.model}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {modelOptions.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1.5">No models configured. Go to Settings &gt; AI Provider.</p>
            )}
          </div>

          {/* Model Options */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Reasoning Effort</label>
              <select
                value={reasoningEffort}
                onChange={e => setReasoningEffort(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
              >
                <option value="">Provider default</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            {(selectedProviderType === 'azure-openai' || selectedProviderType === 'openai-responses') && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Reasoning Summary</label>
              <select
                value={reasoningSummary}
                onChange={e => setReasoningSummary(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
              >
                <option value="">Provider default</option>
                <option value="auto">Auto</option>
                <option value="detailed">Detailed</option>
                <option value="concise">Concise</option>
              </select>
            </div>
            )}
            {(selectedProviderType === 'azure-openai' || selectedProviderType === 'openai-responses') && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Text Verbosity</label>
              <select
                value={textVerbosity}
                onChange={e => setTextVerbosity(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
              >
                <option value="">Provider default</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-2.5 text-xs cursor-pointer group p-2 rounded-lg hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={includeFlowCases}
                onChange={e => setIncludeFlowCases(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Flow-level test cases</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Generate end-to-end flow cases instead of atomic per-requirement cases</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 text-xs cursor-pointer group p-2 rounded-lg hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={!useCache}
                onChange={e => setUseCache(!e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Disable cache</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Bypass cache for fresh LLM responses each run</p>
              </div>
            </label>
          </div>
        </div>

        {/* Start button */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow disabled:shadow-none"
          >
            <Play size={16} fill="currentColor" />
            Start Test Gen
          </button>
          {!canStart && selectedProvider === '' && (
            <p className="text-[11px] text-amber-600 mt-1.5 text-center">Select a model to continue</p>
          )}
          {!canStart && selectedProvider !== '' && (includeFlowCases ? selectedFlows.size === 0 : selectedReqs.size === 0) && (
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              {includeFlowCases ? 'Select at least one business flow' : 'Select at least one requirement'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

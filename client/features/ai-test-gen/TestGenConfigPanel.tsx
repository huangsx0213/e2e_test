import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, Play, RefreshCw } from 'lucide-react';
import type { Requirement, BusinessFlow } from '../../../shared/contracts/index';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
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
  includeFlowCases?: boolean;
  useCache?: boolean;
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
  const [selfExpanded, setSelfExpanded] = useState(false);
  const expanded = forceExpanded || selfExpanded;
  const hasChildren = node.children.length > 0;
  const allDescendantIds = hasChildren ? collectLeafIds(node) : [node.req.id];
  const allSelected = allDescendantIds.every(id => selectedIds.has(id));
  const someSelected = allDescendantIds.some(id => selectedIds.has(id));
  const labelRef = useRef<HTMLSpanElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleTitleMouseEnter = () => {
    if (labelRef.current && labelRef.current.scrollWidth > labelRef.current.clientWidth) {
      setShowTooltip(true);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 hover:bg-slate-100 rounded px-1 cursor-pointer"
        style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setSelfExpanded(!selfExpanded); }} className="p-0.5">
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
          className="rounded shrink-0"
        />
        <span
          ref={labelRef}
          className="text-sm truncate flex-1 min-w-0"
          title={showTooltip ? node.req.title : undefined}
          onMouseEnter={handleTitleMouseEnter}
        >
          {node.req.title}
        </span>
        <span className="text-xs text-slate-400 shrink-0">{node.req.level}</span>
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

export function TestGenConfigPanel({
  requirements,
  businessFlows,
  onStart,
  disabled,
}: TestGenConfigPanelProps) {
  const queryClient = useQueryClient();
  const { data: providerConfigs = [] } = useProviderConfigs();
  const [name, setName] = useState('');
  const [reqSearch, setReqSearch] = useState('');
  const [selectedReqs, setSelectedReqs] = useState<Set<string>>(new Set());
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'auto' | 'interactive'>('auto');
  const [showApprovedOnly, setShowApprovedOnly] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  // Build flat model list: { model, providerName, providerType }
  const modelOptions = useMemo(() => {
    const opts: { model: string; providerName: string; providerType: string }[] = [];
    for (const p of providerConfigs) {
      const models: string[] = p.models || [];
      for (const m of models) {
        opts.push({ model: m, providerName: p.name, providerType: p.type });
      }
    }
    return opts;
  }, [providerConfigs]);
  // Selected provider derived from selected model
  const selectedProvider = useMemo(() => {
    const opt = modelOptions.find(o => o.model === selectedModel);
    return opt?.providerName || '';
  }, [modelOptions, selectedModel]);
  // Auto-select first model from active provider
  useEffect(() => {
    if (!selectedModel && modelOptions.length > 0) {
      const active = providerConfigs.find((p: any) => p.isActive);
      if (active) {
        const firstModel = modelOptions.find(o => o.providerName === active.name);
        if (firstModel) setSelectedModel(firstModel.model);
      } else {
        setSelectedModel(modelOptions[0].model);
      }
    }
  }, [modelOptions, selectedModel, providerConfigs]);
  const [includeFlowCases, setIncludeFlowCases] = useState(false);
  const [useCache, setUseCache] = useState(false);

  const tree = useMemo(() => buildTree(requirements), [requirements]);
  const filteredTree = useMemo(() => {
    if (!reqSearch) return tree;
    function filter(nodes: TreeNode[]): TreeNode[] {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const matches = node.req.title.toLowerCase().includes(reqSearch.toLowerCase());
        const filteredChildren = filter(node.children);
        if (matches || filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);
    }
    return filter(tree);
  }, [tree, reqSearch]);

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

  const handleRefresh = () => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: queryKeys.requirements as any });
    queryClient.invalidateQueries({ queryKey: queryKeys.businessFlows as any });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleStart = () => {
    const now = new Date();
    const defaultName = name || `TestGen_${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 5).replace(':', '-')}`;
    onStart({
      name: defaultName,
      requirementIds: Array.from(selectedReqs),
      flowIds: Array.from(selectedFlows),
      mode,
      providerConfigName: selectedProvider,
      model: selectedModel || undefined,
      includeFlowCases,
      useCache,
    });
  };

  const canStart = (includeFlowCases ? selectedFlows.size > 0 : selectedReqs.size > 0) && selectedProvider !== '' && !disabled;

  return (
    <div className="w-80 border-r border-slate-200 flex flex-col h-full bg-white shrink-0">
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Test Gen Config</h3>
          <HelpTooltip content="Select requirements and business flows as input for AI test case generation. Choose Auto mode to run all stages automatically, or Interactive mode to pause at each checkpoint for manual review." />
          <div className="ml-auto">
            <button
              onClick={handleRefresh}
              className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <label className="block text-xs text-slate-500 mb-1">Test Gen Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. User Management Test"
          className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Requirements</h4>
            <span className="text-xs text-blue-600">{selectedReqs.size} selected</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                value={reqSearch}
                onChange={e => setReqSearch(e.target.value)}
                placeholder="Filter..."
                className="w-full border border-slate-200 rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="text-xs text-slate-400 hover:text-blue-600 whitespace-nowrap"
              title={expandAll ? 'Collapse all' : 'Expand all'}
            >
              {expandAll ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredTree.map(node => (
              <RequirementTreeNode
                key={node.req.id}
                node={node}
                selectedIds={selectedReqs}
                onToggle={handleReqToggle}
                forceExpanded={expandAll}
              />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                const allIds = requirements.map(r => r.id);
                setSelectedReqs(new Set(allIds));
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedReqs(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Business Flows</h4>
            <span className="text-xs text-blue-600">{selectedFlows.size} selected</span>
          </div>
          <label className="flex items-center gap-1 mb-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showApprovedOnly}
              onChange={e => setShowApprovedOnly(e.target.checked)}
              className="rounded"
            />
            Show approved flows only
          </label>
          <div className="max-h-48 overflow-y-auto">
            {flows.map(flow => (
              <label key={flow.id} className="flex items-center gap-2 py-1 px-1 hover:bg-slate-50 rounded cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedFlows.has(flow.id)}
                  onChange={() => handleFlowToggle(flow.id)}
                  className="rounded shrink-0"
                />
                <span className="truncate" title={flow.name + ' (' + flow.type + ')'}>{flow.name}</span>
                <span className="text-xs text-slate-400 ml-auto shrink-0">
                  {flow.type} {flow.status === 'APPROVED' ? '\u2713' : ''}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Run Mode</label>
          <div className="flex rounded border border-slate-200 overflow-hidden">
            <button
              onClick={() => setMode('auto')}
              className={`flex-1 py-1.5 text-xs ${mode === 'auto' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode('interactive')}
              className={`flex-1 py-1.5 text-xs border-l border-slate-200 ${mode === 'interactive' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Interactive
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'auto' ? 'Automatically complete all stages' : 'Pause at each checkpoint for review'}
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Model</label>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
          >
            {modelOptions.map((o, i) => (
              <option key={`${o.providerName}-${o.model}-${i}`} value={o.model}>
                {o.model} ({o.providerName})
              </option>
            ))}
          </select>
          {modelOptions.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No models configured. Go to Settings &gt; AI Provider.</p>
          )}
        </div>
        <div className="border-t border-slate-200 pt-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={includeFlowCases}
              onChange={e => setIncludeFlowCases(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-600">Generate flow-level test cases (Flow Batch)</span>
            <HelpTooltip content="When enabled, only end-to-end flow test cases are generated based on selected Business Flows. Atomic per-requirement cases are skipped. Requires at least one Business Flow to be selected." />
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={!useCache}
              onChange={e => setUseCache(!e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-600">Disable cache</span>
            <HelpTooltip content="When checked, each AI agent run bypasses the cache for fresh LLM responses. Useful for debugging or evaluating prompt changes." />
          </label>
        </div>
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full flex items-center justify-center gap-2 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={16} />
          Start Test Gen
        </button>
      </div>
    </div>
  );
}

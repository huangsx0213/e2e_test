import { useState, useEffect, useCallback, useMemo } from 'react';
import { RotateCcw, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { useProviderConfigs } from '../../shared/hooks/useQueryHooks';
import { api } from '@/shared/services/api';

interface AgentPromptsPanelProps {
  projectId: string;
}

const AGENTS = [
  { name: 'test_analyst', label: 'Test Analyst' },
  { name: 'test_designer', label: 'Test Designer' },
  { name: 'quality_manager', label: 'Quality Reviewer' },
] as const;

type AgentName = typeof AGENTS[number]['name'];

const AGENT_TOOLS: Record<AgentName, string[]> = {
  test_analyst: ['requirement_detail_query', 'requirement_graph_query', 'flow_detail_query', 'istqb_equivalence_partitioning', 'istqb_boundary_value_analysis', 'istqb_decision_table', 'istqb_state_transition', 'istqb_use_case_testing', 'knowledge_base'],
  test_designer: ['requirement_detail_query', 'requirement_graph_query', 'flow_detail_query', 'istqb_equivalence_partitioning', 'istqb_boundary_value_analysis', 'istqb_decision_table', 'istqb_state_transition', 'istqb_use_case_testing', 'knowledge_base'],
  quality_manager: ['requirement_detail_query', 'knowledge_base'],
};

export function AgentPromptsPanel({ projectId }: AgentPromptsPanelProps) {
  const [activeAgent, setActiveAgent] = useState<AgentName>('test_analyst');
  const [overrides, setOverrides] = useState<Record<string, { custom_prompt: string | null; model_override: string | null }>>({});
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedModel, setEditedModel] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTools, setShowTools] = useState(false);
  const { data: providerConfigs = [] } = useProviderConfigs();

  const modelOptions = useMemo(() => {
    const opts: { model: string; providerName: string }[] = [];
    for (const p of providerConfigs) {
      const models: string[] = p.models || [];
      for (const m of models) {
        opts.push({ model: m, providerName: p.name });
      }
    }
    return opts;
  }, [providerConfigs]);

  // Load overrides on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.testGen.promptOverrides(projectId).then(data => {
      if (cancelled) return;
      const map: Record<string, any> = {};
      for (const item of data) {
        map[item.agent_name] = { custom_prompt: item.custom_prompt, model_override: item.model_override };
      }
      setOverrides(map);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // When activeAgent changes, load its prompt
  useEffect(() => {
    const override = overrides[activeAgent];
    setEditedPrompt(override?.custom_prompt ?? '');
    setEditedModel(override?.model_override ?? '');
    setIsDirty(false);
  }, [activeAgent, overrides]);

  const handlePromptChange = useCallback((value: string) => {
    setEditedPrompt(value);
    setIsDirty(true);
  }, []);

  const handleModelChange = useCallback((value: string) => {
    setEditedModel(value);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.testGen.savePromptOverride(projectId, activeAgent, {
        customPrompt: editedPrompt || null,
        modelOverride: editedModel || null,
      });
      setOverrides(prev => ({
        ...prev,
        [activeAgent]: { custom_prompt: editedPrompt || null, model_override: editedModel || null },
      }));
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to save prompt override:', err);
    } finally {
      setSaving(false);
    }
  }, [projectId, activeAgent, editedPrompt, editedModel]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      await api.testGen.deletePromptOverride(projectId, activeAgent);
      setOverrides(prev => {
        const next = { ...prev };
        delete next[activeAgent];
        return next;
      });
      setEditedPrompt('');
      setEditedModel('');
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to reset prompt override:', err);
    } finally {
      setSaving(false);
    }
  }, [projectId, activeAgent]);

  const hasOverride = overrides[activeAgent]?.custom_prompt != null || overrides[activeAgent]?.model_override != null;
  const tools = AGENT_TOOLS[activeAgent];

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Agent sub-tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 shrink-0">
        {AGENTS.map(agent => (
          <button
            key={agent.name}
            onClick={() => setActiveAgent(agent.name)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeAgent === agent.name
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {agent.label}
            {overrides[agent.name]?.custom_prompt != null && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Model Override */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Model Override</label>
            <select
              value={editedModel}
              onChange={e => handleModelChange(e.target.value)}
              className="w-full max-w-md border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="">Use default model</option>
              {modelOptions.map((o, i) => (
                <option key={`${o.providerName}-${o.model}-${i}`} value={o.model}>
                  {o.model} ({o.providerName})
                </option>
              ))}
            </select>
          </div>

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-600">System Prompt</label>
              {hasOverride && (
                <span className="text-xs text-blue-600 font-medium">Customized</span>
              )}
            </div>
            <textarea
              value={editedPrompt}
              onChange={e => handlePromptChange(e.target.value)}
              placeholder="Leave empty to use the default system prompt..."
              className="w-full h-96 border border-slate-200 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-400 resize-y"
              spellCheck={false}
            />
          </div>

          {/* Available Tools */}
          <div className="border border-slate-200 rounded">
            <button
              onClick={() => setShowTools(!showTools)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <span>Available Tools ({tools.length})</span>
              {showTools ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showTools && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {tools.map(tool => (
                  <span key={tool} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                    {tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-white shrink-0">
        <button
          onClick={handleReset}
          disabled={!hasOverride || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw size={14} />
          Reset to Default
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Prompt'}
        </button>
      </div>
    </div>
  );
}

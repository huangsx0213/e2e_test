/**
 * RecorderConfigPanel — AI 录制启动配置
 *
 * 选择 NlCase + ProviderConfig + options（headless 等）
 * 参考 docs/05-AIDrivenRecordingEngine.md §8.4.1
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import type { StartConfig } from '@/shared/ai-driven-recorder-run';

interface RecorderConfigPanelProps {
  nlCases: any[];
  providerConfigs: any[];
  preselectNlCaseId?: string | null;
  onStart: (config: StartConfig, nlCaseSteps: Array<{ sequence: number; action: string; expected?: string }>) => void;
  disabled: boolean;
}

// Provider 认证矩阵（与 server/modules/ai-driven-recorder/provider-matrix.ts 对齐）
const PROVIDER_LABELS: Record<string, { level: 'certified' | 'experimental' | 'unverified'; canTrigger: boolean; label: string }> = {
  'azure-openai': { level: 'certified', canTrigger: true, label: 'Certified' },
  'openai-compatible': { level: 'unverified', canTrigger: false, label: 'Unverified' },
  anthropic: { level: 'experimental', canTrigger: true, label: 'Beta' },
  google: { level: 'experimental', canTrigger: true, label: 'Beta' },
};

export function RecorderConfigPanel({
  nlCases,
  providerConfigs,
  preselectNlCaseId,
  onStart,
  disabled,
}: RecorderConfigPanelProps) {
  const [nlCaseId, setNlCaseId] = useState<string>(preselectNlCaseId ?? '');
  const [providerConfigId, setProviderConfigId] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [modelName, setModelName] = useState<string>('');
  const [headless, setHeadless] = useState(false);
  const [maxRetries, setMaxRetries] = useState(2);
  const [timeoutPerStep, setTimeoutPerStep] = useState(30);
  const [error, setError] = useState<string | null>(null);
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

  // Build model options from selected provider's models array
  const selectedProvider = useMemo(
    () => providerConfigs.find((p) => p.id === providerConfigId),
    [providerConfigs, providerConfigId],
  );
  const modelOptions = useMemo(
    () => (selectedProvider?.models ?? []).map((m) => ({ model: m, providerName: selectedProvider.name })),
    [selectedProvider],
  );
  // Auto-select first model when provider changes
  useEffect(() => {
    if (modelOptions.length > 0 && !model) {
      setModel(modelOptions[0].model);
      setModelName(`${modelOptions[0].model} (${modelOptions[0].providerName})`);
    } else if (modelOptions.length === 0) {
      setModel('');
      setModelName('');
    }
  }, [modelOptions, model]);

  const approvedCases = useMemo(
    () => nlCases.filter((c) => c.status === 'APPROVED' && !c.generatedSuiteId),
    [nlCases],
  );

  const triggerableProviders = useMemo(
    () => providerConfigs.filter((p) => PROVIDER_LABELS[p.type]?.canTrigger),
    [providerConfigs],
  );

  const selectedCase = useMemo(
    () => nlCases.find((c) => c.id === nlCaseId),
    [nlCases, nlCaseId],
  );

  const handleStart = useCallback(() => {
    setError(null);
    if (!nlCaseId) {
      setError('Please select an approved NL test case');
      return;
    }
    if (!providerConfigId) {
      setError('Please select a provider configuration');
      return;
    }
    if (!model) {
      setError('Please select a model');
      return;
    }
    const config: StartConfig = {
      nlCaseId,
      providerConfigId,
      model,
      options: { headless, maxRetriesPerStep: maxRetries, timeoutPerStep: timeoutPerStep * 1000 },
    };
    const nlCaseSteps = (selectedCase?.steps ?? []).map((s: any) => ({
      sequence: s.sequence,
      action: s.action,
      expected: s.expected,
    }));
    onStart(config, nlCaseSteps);
  }, [nlCaseId, providerConfigId, model, headless, maxRetries, timeoutPerStep, selectedCase, onStart]);

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={18} className="text-blue-500" />
            <h2 className="text-lg font-bold text-slate-800">AI-Driven Recording</h2>
          </div>
          <p className="text-sm text-slate-500">
            Select an approved NL test case and a certified provider. Stagehand will drive the browser,
            capture actions, and generate a draft test suite.
          </p>
        </div>

        {/* NL Case Selection */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            NL Test Case
          </label>
          {approvedCases.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-700">
              <AlertCircle size={14} className="shrink-0" />
              No approved NL test cases available. Approve cases in the NL Test Cases page first.
            </div>
          ) : (
            <select
              value={nlCaseId}
              onChange={(e) => setNlCaseId(e.target.value)}
              disabled={disabled}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 disabled:opacity-50"
            >
              <option value="">— Select a test case —</option>
              {approvedCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.steps?.length ?? 0} steps)
                </option>
              ))}
            </select>
          )}
          {selectedCase && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs font-semibold text-slate-600 mb-2">Steps Preview</div>
              <ol className="space-y-1">
                {selectedCase.steps?.map((s: any, i: number) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-500">
                    <span className="font-mono text-slate-400 shrink-0">{i + 1}.</span>
                    <span>{s.action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Provider Selection */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Provider Configuration
          </label>
          {triggerableProviders.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-700">
              <AlertCircle size={14} className="shrink-0" />
              No certified provider configurations available. Configure an Azure OpenAI, Anthropic, or Google provider in Settings.
            </div>
          ) : (
            <div className="space-y-2">
              {triggerableProviders.map((p) => {
                const meta = PROVIDER_LABELS[p.type] ?? { level: 'unverified' as const, label: 'Unknown', canTrigger: false };
                const isSelected = providerConfigId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => !disabled && setProviderConfigId(p.id)}
                    disabled={disabled}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-700">{p.name}</div>
                        <div className="text-xs text-slate-400">{p.type} · {p.model || 'default model'}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      meta.level === 'certified'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

    {/* Model Selection */}
    <div className="mb-6">
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        Model
      </label>
      {modelOptions.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-700">
          <AlertCircle size={14} className="shrink-0" />
          Selected provider has no models configured. Add models in Settings.
        </div>
      ) : (
        <div className="relative" ref={modelDropdownRef}>
          <button
            onClick={() => !disabled && setModelOpen(!modelOpen)}
            disabled={disabled}
            className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white hover:border-slate-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:opacity-50"
          >
            <span className="text-slate-700">{model || 'Select a model'}</span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
          </button>
          {modelOpen && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {modelOptions.map((o, i) => (
                <button
                  key={`${o.providerName}-${o.model}-${i}`}
                  onClick={() => { setModel(o.model); setModelName(`${o.model} (${o.providerName})`); setModelOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors ${
                    model === o.model ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  {o.model}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Options */}
    <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Recording Options
          </label>
          <div className="space-y-3 p-4 rounded-lg border border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">Headless Mode</div>
                <div className="text-xs text-slate-400">Run browser without UI (faster, no takeover)</div>
              </div>
              <button
                onClick={() => !disabled && setHeadless(!headless)}
                disabled={disabled}
                className={`relative w-10 h-5 rounded-full transition-colors ${headless ? 'bg-blue-500' : 'bg-slate-300'} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${headless ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Max Retries per Step</label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  disabled={disabled}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Timeout per Step (s)</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={timeoutPerStep}
                  onChange={(e) => setTimeoutPerStep(Number(e.target.value))}
                  disabled={disabled}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-sm disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={disabled || !nlCaseId || !providerConfigId}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disabled ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {disabled ? 'Starting...' : 'Start AI Recording'}
        </button>
      </div>
    </div>
  );
}

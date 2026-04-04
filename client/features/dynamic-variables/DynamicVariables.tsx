import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Play, RefreshCw, Search, Variable, Info, Check, X, Copy } from 'lucide-react';
import { api } from '@/shared/services/api';
import { DynamicVariable } from '@/shared/types';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

interface DynamicVariablesProps {
  currentProjectId: string;
}

const SYSTEM_VARIABLES = [
  { name: 'Timestamp', syntax: '{{$timestamp()}}', desc: 'Current timestamp in ms' },
  { name: 'UUID', syntax: '{{$uuid()}}', desc: 'Random UUID v4' },
  { name: 'Random String', syntax: '{{$randomString(8)}}', desc: 'Random alphanumeric string' },
  { name: 'Random Int', syntax: '{{$randomInt(1, 100)}}', desc: 'Random integer between min and max' },
  { name: 'Date', syntax: '{{$date("YYYY-MM-DD", 0, "days", "UTC")}}', desc: 'Formatted date with offset and timezone' },
  { name: 'Random Email', syntax: '{{$randomEmail()}}', desc: 'Randomly generated email address' },
  { name: 'Random Name', syntax: '{{$randomName()}}', desc: 'Random full name' },
  { name: 'Random Phone', syntax: '{{$randomPhone()}}', desc: 'Random phone number' },
  { name: 'Uppercase', syntax: '{{$randomUpper(3)}}', desc: 'Random uppercase letters' },
];

export function DynamicVariables({ currentProjectId }: DynamicVariablesProps) {
  const [variables, setVariables] = useState<DynamicVariable[]>([]);
  const [selectedVarId, setSelectedVarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [previewSamples, setPreviewSamples] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (currentProjectId) {
      loadVariables();
    }
  }, [currentProjectId]);

  const loadVariables = async () => {
    if (!currentProjectId) return;
    setLoading(true);
    try {
      const data = await api.dynamicVariables.list(currentProjectId);
      setVariables(data);
      if (data.length > 0 && !selectedVarId) {
        selectVariable(data[0]);
      } else if (data.length === 0) {
        handleCreateNew();
      }
    } catch (error) {
      console.error('Failed to load dynamic variables', error);
    } finally {
      setLoading(false);
    }
  };

  const selectVariable = (v: DynamicVariable) => {
    setSelectedVarId(v.id);
    setName(v.name);
    setExpression(v.expression);
    setDescription(v.description || '');
    setPreviewSamples([]);
    setSaveStatus('idle');
  };

  const handleCreateNew = () => {
    setSelectedVarId(null);
    setName('');
    setExpression('');
    setDescription('');
    setPreviewSamples([]);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    if (!currentProjectId || !name || !expression) return;
    setSaveStatus('saving');
    try {
      if (selectedVarId) {
        await api.dynamicVariables.update(selectedVarId, { name, expression, description });
      } else {
        const newVar = await api.dynamicVariables.create(currentProjectId, { name, expression, description });
        setSelectedVarId(newVar.id);
      }
      await loadVariables();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save dynamic variable', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.dynamicVariables.delete(id);
      if (selectedVarId === id) {
        handleCreateNew();
      }
      await loadVariables();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete dynamic variable', error);
    }
  };

  const handlePreview = async () => {
    if (!expression) return;
    setPreviewLoading(true);
    try {
      const res = await api.dynamicVariables.preview(expression);
      setPreviewSamples(res.samples);
    } catch (error) {
      console.error('Preview failed', error);
      setPreviewSamples(['Error evaluating expression. Check syntax.']);
    } finally {
      setPreviewLoading(false);
    }
  };

  const insertSystemVar = (syntax: string) => {
    setExpression(prev => prev + syntax);
  };

  const filteredVariables = variables.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!currentProjectId) {
    return <div className="p-8 text-gray-400">Please select a project first.</div>;
  }

  return (
    <div className="flex h-full bg-white">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Dynamic Variable"
        message="Are you sure you want to delete this dynamic variable? Any tests using this variable will fail to resolve it."
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
      />

      {/* Sidebar List */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              Dynamic Variables
              <HelpTooltip content="Define reusable dynamic variables that can be used across your tests using {{variable_name}} syntax." />
            </h2>
            <button
              onClick={handleCreateNew}
              className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
              title="New Variable"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search variables..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="animate-spin text-gray-400" size={20} />
            </div>
          ) : filteredVariables.length === 0 ? (
            <div className="text-center p-8 text-gray-400 text-sm italic">
              {searchQuery ? 'No matches found' : 'No variables defined yet'}
            </div>
          ) : (
            filteredVariables.map((v) => (
              <div
                key={v.id}
                onClick={() => selectVariable(v)}
                className={`group flex items-center justify-between p-3 rounded-md cursor-pointer text-sm transition-all ${
                  selectedVarId === v.id
                    ? "bg-white shadow-sm border border-blue-100 ring-1 ring-blue-500/20"
                    : "hover:bg-gray-100 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                      selectedVarId === v.id
                        ? "bg-blue-50 text-blue-600"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    <Variable size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className={`font-mono truncate ${selectedVarId === v.id ? "text-blue-900" : "text-gray-700"}`}>
                      {v.name}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate font-mono">
                      {v.expression}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(v.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        <div className="h-16 border-b border-gray-200 px-8 flex items-center justify-between shrink-0 bg-white">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-lg font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full font-mono"
              placeholder="Variable Name (e.g. order_id)"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full mt-0.5"
              placeholder="Add a description for this variable..."
            />
          </div>
          <div className="flex items-center gap-4">
            {saveStatus === "saving" && (
              <span className="text-xs text-gray-500 animate-pulse">Saving...</span>
            )}
            {saveStatus === "success" && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <Check size={14} /> Saved successfully
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <X size={14} /> Save failed
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!name || !expression || saveStatus === "saving"}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md transition-colors shadow-sm ${
                !name || !expression || saveStatus === "saving"
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Save size={16} />
              <span>{selectedVarId ? "Save" : "Create Variable"}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Editor Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  Expression Template
                  <HelpTooltip content="Compose your variable using static text and dynamic generators. Generators are wrapped in {{$name()}}." />
                </h3>
                <span className="text-xs text-gray-400 font-mono">
                  Usage: {"{{"}{name || 'var_name'}{"}}"}
                </span>
              </div>
              <div className="relative">
                <textarea
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="e.g. ORDER-{{$randomUpper(3)}}-{{$timestamp()}}"
                  rows={5}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm resize-none"
                />
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Play size={12} className="text-green-600" />
                  Live Preview
                </h3>
                <button
                  onClick={handlePreview}
                  disabled={!expression || previewLoading}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} className={previewLoading ? 'animate-spin' : ''} />
                  Refresh Preview
                </button>
              </div>
              <div className="p-6 bg-slate-50/50 min-h-[140px]">
                {previewSamples.length > 0 ? (
                  <div className="space-y-2">
                    {previewSamples.map((sample, i) => (
                      <div key={i} className="flex items-center gap-3 group">
                        <div className="flex-1 font-mono text-sm text-green-700 bg-green-50/50 border border-green-100 p-2.5 rounded-md break-all">
                          {sample}
                        </div>
                        <button 
                          onClick={() => navigator.clipboard.writeText(sample)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                          title="Copy to clipboard"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400 italic text-sm">
                    <Play size={24} className="mb-2 opacity-20" />
                    Enter an expression above and click refresh to see samples
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Add Sidebar */}
          <div className="w-80 border-l border-gray-200 bg-gray-50 flex flex-col shrink-0 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Info size={12} />
                System Generators
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Click a generator to insert it into your expression template at the end.
              </p>
              <div className="space-y-2">
                {SYSTEM_VARIABLES.map((sysVar) => (
                  <button
                    key={sysVar.name}
                    onClick={() => insertSystemVar(sysVar.syntax)}
                    className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-700 group-hover:text-blue-700">
                        {sysVar.name}
                      </span>
                      <Plus size={12} className="text-gray-300 group-hover:text-blue-400" />
                    </div>
                    <div className="text-[10px] font-mono text-blue-600 mb-1 truncate">
                      {sysVar.syntax}
                    </div>
                    <div className="text-[10px] text-gray-400 line-clamp-2">
                      {sysVar.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


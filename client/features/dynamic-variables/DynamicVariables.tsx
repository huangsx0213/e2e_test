import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Play, RefreshCw, Search, Variable, Info, Check, X, Copy, ChevronDown, ChevronRight, Wand2, Zap, Braces } from 'lucide-react';
import { api } from '@/shared/services/api';
import { DynamicVariable } from '@/shared/types';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

interface DynamicVariablesProps {
  currentProjectId: string;
}

const SYSTEM_GENERATORS = [
  {
    category: 'Common',
    items: [
      { name: 'Timestamp', syntax: '{{$timestamp()}}', desc: 'Current Unix timestamp in milliseconds.', example: '1712234567890' },
      { name: 'Timestamp (Sec)', syntax: '{{$timestampSec()}}', desc: 'Current Unix timestamp in seconds.', example: '1712234567' },
      { name: 'UUID', syntax: '{{$uuid()}}', desc: 'Generates a random UUID v4.', example: '550e8400-e29b-41d4-a716-446655440000' },
      { name: 'Now', syntax: '{{$now("YYYY-MM-DD HH:mm:ss", "UTC")}}', desc: 'Current date/time with optional format and timezone.', example: '{{$now("YYYY-MM-DD")}} → 2024-04-04', params: [
        { name: 'format', desc: 'Dayjs format string (e.g., "YYYY-MM-DD HH:mm:ss"). Default: ISO 8601.' },
        { name: 'timezone', desc: 'IANA timezone string (e.g., "Asia/Shanghai", "Asia/Hong_Kong", "Europe/London", "UTC").' }
      ]},
      { name: 'Date Offset', syntax: '{{$date("YYYY-MM-DD", 1, "days", "UTC")}}', desc: 'Date with offset from now.', example: '{{$date("YYYY-MM-DD", 1, "days")}} → 2024-04-05', params: [
        { name: 'format', desc: 'Dayjs format string.' },
        { name: 'offset', desc: 'Number of units to add (positive) or subtract (negative).' },
        { name: 'unit', desc: 'Time unit: "days", "weeks", "months", "years", "hours", "minutes", "seconds".' },
        { name: 'timezone', desc: 'IANA timezone string (e.g., "Asia/Shanghai", "Asia/Hong_Kong", "Europe/London").' }
      ]},
      { name: 'Random Int', syntax: '{{$randomInt(1, 100)}}', desc: 'Random integer between min and max.', example: '{{$randomInt(1, 100)}} → 42', params: [
        { name: 'min', desc: 'Minimum value (default: 0).' },
        { name: 'max', desc: 'Maximum value (default: 100).' }
      ]},
      { name: 'Random Float', syntax: '{{$randomFloat(0, 1, 2)}}', desc: 'Random float with specified precision.', example: '{{$randomFloat(0, 1, 4)}} → 0.7341', params: [
        { name: 'min', desc: 'Minimum value (default: 0).' },
        { name: 'max', desc: 'Maximum value (default: 100).' },
        { name: 'decimals', desc: 'Number of decimal places (default: 2).' }
      ]},
    ]
  },
  {
    category: 'Text',
    items: [
      { name: 'Random String', syntax: '{{$randomString(8)}}', desc: 'Random alphanumeric string.', example: '{{$randomString(8)}} → aB3k9P1m', params: [
        { name: 'length', desc: 'Number of characters (default: 8).' }
      ]},
      { name: 'Random Upper', syntax: '{{$randomUpper(8)}}', desc: 'Random uppercase letters.', example: '{{$randomUpper(3)}} → XYZ', params: [
        { name: 'length', desc: 'Number of characters (default: 8).' }
      ]},
      { name: 'Random Lower', syntax: '{{$randomLower(8)}}', desc: 'Random lowercase letters.', example: '{{$randomLower(3)}} → abc', params: [
        { name: 'length', desc: 'Number of characters (default: 8).' }
      ]},
      { name: 'Random Alpha', syntax: '{{$randomAlpha(8)}}', desc: 'Random alphabetic characters.', example: '{{$randomAlpha(5)}} → AbCdE', params: [
        { name: 'length', desc: 'Number of characters (default: 8).' }
      ]},
      { name: 'Random Words', syntax: '{{$randomWords(3)}}', desc: 'Generates random words.', example: '{{$randomWords(3)}} → apple banana cherry', params: [
        { name: 'count', desc: 'Number of words (default: 3).' }
      ]},
    ]
  },
  {
    category: 'User Data',
    items: [
      { name: 'Random Name', syntax: '{{$randomName()}}', desc: 'Generates a random full name with suffix.', example: 'Alice123' },
      { name: 'Random Email', syntax: '{{$randomEmail()}}', desc: 'Generates a random test email address.', example: 'test_a1b2c3d4@example.com' },
      { name: 'Random Phone', syntax: '{{$randomPhone()}}', desc: 'Generates a random 11-digit phone number.', example: '15550109999' },
      { name: 'Random Address', syntax: '{{$randomAddress()}}', desc: 'Generates a random street address.', example: '123 Maple St, Springfield' },
    ]
  }
];

const SYSTEM_TRANSFORMATIONS = [
  {
    category: 'String',
    items: [
      { name: 'Uppercase', syntax: '| uppercase', desc: 'Converts to uppercase.', example: '{{var | uppercase}}' },
      { name: 'Lowercase', syntax: '| lowercase', desc: 'Converts to lowercase.', example: '{{var | lowercase}}' },
      { name: 'Trim', syntax: '| trim', desc: 'Removes whitespace.', example: '{{var | trim}}' },
      { name: 'Substring', syntax: '| substring(start, end)', desc: 'Extracts part of a string.', example: '{{var | substring(0, 5)}}', params: [
        { name: 'start', desc: 'Starting index (default: 0).' },
        { name: 'end', desc: 'Ending index (optional).' }
      ]},
      { name: 'Replace', syntax: '| replace(search, replace)', desc: 'Replaces occurrences of a string.', example: '{{var | replace("old", "new")}}', params: [
        { name: 'search', desc: 'String to search for.' },
        { name: 'replace', desc: 'String to replace with (default: empty).' }
      ]},
      { name: 'Split', syntax: '| split(sep, index)', desc: 'Splits string and gets item at index.', example: '{{var | split(",", 0)}}', params: [
        { name: 'sep', desc: 'Separator string (default: ",").' },
        { name: 'index', desc: 'Index of item to return (default: 0).' }
      ]},
    ]
  },
  {
    category: 'Encoding & Hashing',
    items: [
      { name: 'Base64 Encode', syntax: '| base64', desc: 'Encodes to Base64.', example: '{{var | base64}}' },
      { name: 'Base64 Decode', syntax: '| base64Decode', desc: 'Decodes from Base64.', example: '{{var | base64Decode}}' },
      { name: 'MD5', syntax: '| md5', desc: 'Generates MD5 hash.', example: '{{var | md5}}' },
      { name: 'SHA256', syntax: '| sha256', desc: 'Generates SHA256 hash.', example: '{{var | sha256}}' },
      { name: 'HMAC', syntax: '| hmac(secret, algo)', desc: 'Generates HMAC hash.', example: '{{var | hmac("key", "sha256")}}', params: [
        { name: 'secret', desc: 'Secret key for hashing.' },
        { name: 'algo', desc: 'Hashing algorithm (default: "sha256").' }
      ]},
    ]
  },
  {
    category: 'Math & Logic',
    items: [
      { name: 'Round', syntax: '| round', desc: 'Rounds to nearest integer.', example: '{{var | round}}' },
      { name: 'Floor', syntax: '| floor', desc: 'Rounds down.', example: '{{var | floor}}' },
      { name: 'Ceil', syntax: '| ceil', desc: 'Rounds up.', example: '{{var | ceil}}' },
      { name: 'Default', syntax: '| default(value)', desc: 'Sets default value if empty.', example: '{{var | default("N/A")}}', params: [
        { name: 'value', desc: 'Fallback value.' }
      ]},
      { name: 'Length', syntax: '| length', desc: 'Returns string length.', example: '{{var | length}}' },
    ]
  },
  {
    category: 'JSON',
    items: [
      { name: 'JSON Path', syntax: '| jsonPath(path)', desc: 'Extracts value using JSONPath.', example: '{{var | jsonPath("$.user.id")}}', params: [
        { name: 'path', desc: 'JSONPath expression (default: "$").' }
      ]},
      { name: 'To JSON', syntax: '| toJson', desc: 'Formats value as JSON string.', example: '{{var | toJson}}' },
    ]
  }
];

// Outside the component
let variablesCache: { projectId: string, data: DynamicVariable[] } | null = null;

export function DynamicVariables({ currentProjectId }: DynamicVariablesProps) {
  const [variables, setVariables] = useState<DynamicVariable[]>([]);
  const [selectedVarId, setSelectedVarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!variablesCache || variablesCache.projectId !== currentProjectId);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'manage' | 'reference'>('manage');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Common': true,
    'User Data': true,
    'Text': true,
    'Crypto': false,
    'Math': false
  });
  
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

  const loadVariables = async (forceRefresh = false) => {
    if (!currentProjectId) return;
    
    if (!forceRefresh && variablesCache && variablesCache.projectId === currentProjectId) {
      setVariables(variablesCache.data);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const data = await api.dynamicVariables.list(currentProjectId);
      variablesCache = { projectId: currentProjectId, data };
      setVariables(data);
    } catch (error) {
      console.error('Failed to load dynamic variables', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
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
      await loadVariables(true);
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
      await loadVariables(true);
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
        <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Filter variables..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              Dynamic Variables
              <HelpTooltip content="Define reusable dynamic variables that can be used across your tests using {{variable_name}} syntax." />
            </span>
            <button
              onClick={handleCreateNew}
              className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
              title="Add Variable"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-0.5">
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
                  className={`group px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center justify-between transition-all duration-200 ${
                    selectedVarId === v.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden w-full">
                    <Braces
                      size={14}
                      className={`shrink-0 ${selectedVarId === v.id ? "text-blue-500" : "text-gray-400"}`}
                    />
                    <span className="truncate font-mono">{v.name}</span>
                  </div>

                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(v.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {/* Tab Header */}
        <div className="h-14 border-b border-gray-200 px-8 flex items-center gap-8 bg-white shrink-0">
          <button
            onClick={() => setActiveTab('manage')}
            className={`h-full px-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'manage'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Manage Variables
          </button>
          <button
            onClick={() => setActiveTab('reference')}
            className={`h-full px-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'reference'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Generators & Transformations
          </button>
        </div>

        {activeTab === 'manage' ? (
          <>
            <div className="h-16 border-b border-gray-200 px-8 flex items-center justify-between shrink-0 bg-white">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold text-gray-900 font-mono bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full"
                  placeholder="Variable Name"
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
                  <span>Save</span>
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
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
                        <span className="text-[10px] text-gray-400 font-mono">
                          Usage: {"{{"}{name || 'var_name'}{"}}"}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(`{{${name || 'var_name'}}}`)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Copy usage syntax"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                      <button
                        onClick={() => setExpression('')}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all uppercase tracking-wider"
                        title="Clear expression"
                      >
                        <Trash2 size={12} />
                        Clear
                      </button>
                    </div>
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
                    System Helpers
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {/* Generators Section */}
                  <div className="p-4 border-b border-gray-100 bg-white/50">
                    <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Wand2 size={10} />
                      Generators
                    </h4>
                    <div className="space-y-1">
                      {SYSTEM_GENERATORS.map((cat) => (
                        <div key={cat.category} className="space-y-1">
                          <button
                            onClick={() => toggleCategory(cat.category)}
                            className="w-full flex items-center justify-between p-1.5 hover:bg-gray-100 rounded text-[11px] font-semibold text-gray-600 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              {expandedCategories[cat.category] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              {cat.category}
                            </span>
                            <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 rounded-full">
                              {cat.items.length}
                            </span>
                          </button>
                          {expandedCategories[cat.category] && (
                            <div className="pl-4 space-y-1 mt-1">
                              {cat.items.map((item) => (
                                <button
                                  key={item.name}
                                  onClick={() => insertSystemVar(item.syntax)}
                                  className="w-full text-left p-2 rounded border border-transparent hover:border-blue-100 hover:bg-blue-50/50 transition-all group"
                                  title={`Click to insert: ${item.syntax}`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[11px] font-medium text-gray-700 group-hover:text-blue-700">
                                      {item.name}
                                    </span>
                                    <Plus size={10} className="text-gray-300 group-hover:text-blue-400" />
                                  </div>
                                  <div className="text-[9px] font-mono text-blue-500 truncate">
                                    {item.syntax}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transformations Section */}
                  <div className="p-4 bg-white/50">
                    <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Zap size={10} />
                      Transformations
                    </h4>
                    <div className="space-y-1">
                      {SYSTEM_TRANSFORMATIONS.map((cat) => (
                        <div key={cat.category} className="space-y-1">
                          <button
                            onClick={() => toggleCategory(cat.category)}
                            className="w-full flex items-center justify-between p-1.5 hover:bg-gray-100 rounded text-[11px] font-semibold text-gray-600 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              {expandedCategories[cat.category] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              {cat.category}
                            </span>
                            <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 rounded-full">
                              {cat.items.length}
                            </span>
                          </button>
                          {expandedCategories[cat.category] && (
                            <div className="pl-4 space-y-1 mt-1">
                              {cat.items.map((item) => (
                                <button
                                  key={item.name}
                                  onClick={() => navigator.clipboard.writeText(item.syntax)}
                                  className="w-full text-left p-2 rounded border border-transparent hover:border-blue-100 hover:bg-purple-50/50 transition-all group"
                                  title={`Click to copy: ${item.syntax}`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[11px] font-medium text-gray-700 group-hover:text-purple-700">
                                      {item.name}
                                    </span>
                                    <Copy size={10} className="text-gray-300 group-hover:text-purple-400" />
                                  </div>
                                  <div className="text-[9px] font-mono text-purple-500 truncate">
                                    {item.syntax}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="max-w-[1600px] mx-auto p-8 lg:p-12 space-y-16 pb-32">
              <header className="space-y-4 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider">
                  <Info size={14} />
                  Documentation
                </div>
                <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">Generators and Transformations Helper</h2>
                <p className="text-lg text-gray-500 leading-relaxed">
                  A comprehensive guide to all built-in generators and transformation methods. Use these to create dynamic, realistic test data for your API calls.
                </p>
              </header>

              {/* Generators Section */}
              <section className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-100">
                    <Wand2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Generators</h3>
                    <p className="text-sm text-gray-500">Functions that generate new data values from scratch.</p>
                  </div>
                </div>

                <div className="space-y-12">
                  {SYSTEM_GENERATORS.map((category) => (
                    <div key={category.category} className="space-y-4">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-4">
                        {category.category}
                      </h4>
                      <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm bg-white">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                          <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-200">
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-48">Helper</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-64">Syntax</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Description & Parameters</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-72">Example Output</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {category.items.map((item) => (
                              <tr key={item.name} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="px-6 py-5 align-top">
                                  <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                </td>
                                <td className="px-6 py-5 align-top">
                                  <div className="flex items-center gap-2">
                                    <code className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100/50">
                                      {item.syntax}
                                    </code>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(item.syntax)}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-all opacity-0 group-hover:opacity-100"
                                      title="Copy Syntax"
                                    >
                                      <Copy size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-6 py-5 align-top">
                                  <div className="space-y-3">
                                    <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                                    {item.params && (
                                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {item.params.map(p => (
                                          <div key={p.name} className="flex items-baseline gap-2">
                                            <code className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{p.name}</code>
                                            <span className="text-[11px] text-gray-400">{p.desc}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-5 align-top">
                                  <div className="font-mono text-xs text-green-700 bg-green-50/50 border border-green-100 px-3 py-2 rounded-lg break-all">
                                    {item.example}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Transformations Section */}
              <section className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-100">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Transformations</h3>
                    <p className="text-sm text-gray-500">Methods used to modify or format existing variable values.</p>
                  </div>
                </div>

                <div className="space-y-12">
                  {SYSTEM_TRANSFORMATIONS.map((category) => (
                    <div key={category.category} className="space-y-4">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-4">
                        {category.category}
                      </h4>
                      <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm bg-white">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                          <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-200">
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-48">Helper</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-64">Syntax</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Description & Parameters</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-72">Example Usage</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {category.items.map((item) => (
                              <tr key={item.name} className="hover:bg-purple-50/30 transition-colors group">
                                <td className="px-6 py-5 align-top">
                                  <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                </td>
                                <td className="px-6 py-5 align-top">
                                  <div className="flex items-center gap-2">
                                    <code className="text-xs font-mono text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100/50">
                                      {item.syntax}
                                    </code>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(item.syntax)}
                                      className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded transition-all opacity-0 group-hover:opacity-100"
                                      title="Copy Syntax"
                                    >
                                      <Copy size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-6 py-5 align-top">
                                  <div className="space-y-3">
                                    <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                                    {item.params && (
                                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {item.params.map(p => (
                                          <div key={p.name} className="flex items-baseline gap-2">
                                            <code className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">{p.name}</code>
                                            <span className="text-[11px] text-gray-400">{p.desc}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-5 align-top">
                                  <div className="font-mono text-xs text-purple-700 bg-purple-50/50 border border-purple-100 px-3 py-2 rounded-lg break-all">
                                    {item.example}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Search, FileText, Check, X } from 'lucide-react';
import { HeaderProfile } from '../types';
import { HelpTooltip } from './HelpTooltip';

interface HeadersManagerProps {
  headers: HeaderProfile[];
  headersApi: any;
  currentProjectId: string;
}

export function HeadersManager({ headers, headersApi, currentProjectId }: HeadersManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editHeaders, setEditHeaders] = useState<{ key: string; value: string; enabled: boolean }[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const selectedProfile = headers.find(p => p.id === selectedId);

  useEffect(() => {
    if (selectedId && !headers.find(h => h.id === selectedId)) {
      setSelectedId(null);
    }
  }, [headers, selectedId]);

  const handleSelect = (profile: HeaderProfile) => {
    setSelectedId(profile.id);
    setEditName(profile.name);
    setEditDesc(profile.description || '');
    setEditHeaders([...profile.headers]);
    setSaveStatus('idle');
  };

  const handleCreate = async () => {
    if (!currentProjectId) return;
    const newProfile: HeaderProfile = {
      id: `h_${Date.now()}`,
      projectId: currentProjectId,
      name: 'New Header Set',
      description: '',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }]
    };
    await headersApi.create(newProfile);
    handleSelect(newProfile);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaveStatus('saving');
    try {
      await headersApi.update(selectedId, { name: editName, description: editDesc, headers: editHeaders });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    await headersApi.remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const addHeaderRow = () => {
    setEditHeaders([...editHeaders, { key: '', value: '', enabled: true }]);
  };

  const updateHeaderRow = (index: number, field: 'key' | 'value' | 'enabled', value: any) => {
    const newHeaders = [...editHeaders];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setEditHeaders(newHeaders);
  };

  const removeHeaderRow = (index: number) => {
    setEditHeaders(editHeaders.filter((_, i) => i !== index));
  };

  const filteredProfiles = headers.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar List */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              Header Profiles
              <HelpTooltip content="Define reusable sets of HTTP headers to apply to your API requests." />
            </h2>
            <button 
              onClick={handleCreate}
              className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" 
              placeholder="Search headers..." 
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredProfiles.map(profile => (
            <div 
              key={profile.id}
              onClick={() => handleSelect(profile)}
              className={`group flex items-center justify-between p-3 rounded-md cursor-pointer text-sm transition-all ${
                selectedId === profile.id 
                  ? 'bg-white shadow-sm border border-blue-100 ring-1 ring-blue-500/20' 
                  : 'hover:bg-gray-100 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                  selectedId === profile.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  <FileText size={16} />
                </div>
                <div className="min-w-0">
                  <div className={`font-medium truncate ${selectedId === profile.id ? 'text-blue-900' : 'text-gray-700'}`}>
                    {profile.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {profile.headers.length} headers
                  </div>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedId ? (
          <>
            <div className="h-16 border-b border-gray-200 px-8 flex items-center justify-between shrink-0 bg-white">
              <div>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-lg font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full"
                  placeholder="Profile Name"
                />
                <input 
                  type="text" 
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full mt-1"
                  placeholder="Add a description..."
                />
              </div>
              <div className="flex items-center gap-4">
                {saveStatus === 'saving' && <span className="text-xs text-gray-500 animate-pulse">Saving...</span>}
                {saveStatus === 'success' && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Check size={14} /> Saved successfully</span>}
                {saveStatus === 'error' && <span className="text-xs text-red-600 font-medium flex items-center gap-1"><X size={14} /> Save failed</span>}
                <button 
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                  className={`flex items-center gap-2 px-4 py-2 text-white rounded-md text-sm font-medium transition-colors shadow-sm ${
                    saveStatus === 'saving' ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  <Save size={16} />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
              <div className="w-full">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Key-Value Pairs</h3>
                    <span className="text-xs text-gray-500">Supports variables like {'{{token}}'}</span>
                  </div>
                  
                  <div className="divide-y divide-gray-100">
                    {editHeaders.map((header, index) => (
                      <div key={index} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors group">
                        <div className="pt-1.5">
                          <input 
                            type="checkbox" 
                            checked={header.enabled}
                            onChange={(e) => updateHeaderRow(index, 'enabled', e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-4">
                          <input 
                            type="text" 
                            value={header.key}
                            onChange={(e) => updateHeaderRow(index, 'key', e.target.value)}
                            placeholder="Key (e.g. Content-Type)"
                            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${!header.enabled ? 'text-gray-400 bg-gray-50' : 'text-gray-900 border-gray-200'}`}
                          />
                          <input 
                            type="text" 
                            value={header.value}
                            onChange={(e) => updateHeaderRow(index, 'value', e.target.value)}
                            placeholder="Value"
                            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono ${!header.enabled ? 'text-gray-400 bg-gray-50' : 'text-slate-700 border-gray-200'}`}
                          />
                        </div>
                        <button 
                          onClick={() => removeHeaderRow(index)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    
                    {editHeaders.length === 0 && (
                      <div className="p-8 text-center text-gray-400 text-sm">
                        No headers defined. Add one below.
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 bg-gray-50 border-t border-gray-200">
                    <button 
                      onClick={addHeaderRow}
                      className="flex items-center gap-2 text-blue-600 text-sm font-medium hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors w-fit"
                    >
                      <Plus size={16} />
                      <span>Add Header</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search size={32} className="text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-900">Select a profile</p>
            <p className="text-sm mt-1">Select a header profile from the sidebar or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Search, FileCode } from 'lucide-react';
import { BodyTemplate } from '../types';

interface BodyManagerProps {
  bodies: BodyTemplate[];
  bodiesApi: any;
}

export function BodyManager({ bodies, bodiesApi }: BodyManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState<BodyTemplate['contentType']>('application/json');
  const [editContent, setEditContent] = useState('');

  const selectedTemplate = bodies.find(t => t.id === selectedId);

  useEffect(() => {
    if (selectedTemplate) {
      setEditName(selectedTemplate.name);
      setEditDesc(selectedTemplate.description || '');
      setEditType(selectedTemplate.contentType);
      setEditContent(selectedTemplate.content);
    }
  }, [selectedId, bodies]); // Re-run when selection changes

  const handleCreate = async () => {
    const newTemplate: BodyTemplate = {
      id: `b_${Date.now()}`,
      name: 'New Body Template',
      description: '',
      contentType: 'application/json',
      content: '{\n  "key": "{{value}}"\n}'
    };
    await bodiesApi.create(newTemplate);
    setSelectedId(newTemplate.id);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    await bodiesApi.update(selectedId, { name: editName, description: editDesc, contentType: editType, content: editContent });
  };

  const handleDelete = async (id: string) => {
    await bodiesApi.remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const filteredTemplates = bodies.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar List */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Body Templates</h2>
            <button 
              onClick={handleCreate}
              className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" 
              placeholder="Search templates..." 
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTemplates.map(template => (
            <div 
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              className={`group flex items-center justify-between p-3 rounded-md cursor-pointer text-sm transition-all ${
                selectedId === template.id 
                  ? 'bg-white shadow-sm border border-indigo-100 ring-1 ring-indigo-500/20' 
                  : 'hover:bg-gray-100 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                  selectedId === template.id ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  <FileCode size={16} />
                </div>
                <div className="min-w-0">
                  <div className={`font-medium truncate ${selectedId === template.id ? 'text-indigo-900' : 'text-gray-700'}`}>
                    {template.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {template.contentType}
                  </div>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
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
                  placeholder="Template Name"
                />
                <input 
                  type="text" 
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full mt-1"
                  placeholder="Add a description..."
                />
              </div>
              <div className="flex items-center gap-3">
                 <select 
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                 >
                    <option value="application/json">JSON</option>
                    <option value="application/xml">XML</option>
                    <option value="text/plain">Text</option>
                    <option value="application/x-www-form-urlencoded">Form URL Encoded</option>
                 </select>
                 <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                 >
                    <Save size={16} />
                    <span>Save</span>
                 </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Template Editor */}
                <div className="flex-1 flex flex-col border-r border-gray-200 bg-gray-50">
                    <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Template Definition</span>
                        <span className="text-xs text-gray-400">Use {'{{variable}}'} for dynamic values</span>
                    </div>
                    <textarea 
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="flex-1 w-full p-4 font-mono text-sm bg-white resize-none focus:outline-none focus:ring-0 text-slate-800"
                        placeholder={`{\n  "key": "{{variable}}"\n}`}
                        spellCheck={false}
                    />
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <FileCode size={32} className="text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-900">Select a template</p>
            <p className="text-sm mt-1">Select a body template from the sidebar or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

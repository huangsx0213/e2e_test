
import React, { useState, useMemo } from 'react';
import { Project, TestModule, TestStep, ActionType, ModuleParameter, HeaderProfile, BodyTemplate, ApiEndpoint } from '../types';
import { Plus, ChevronDown, ChevronRight, Trash2, Edit2, Check, Search, Database, Workflow, GripVertical, TextQuote, Braces, Layers, Variable, FileText, FileCode, Globe } from 'lucide-react';

interface ModuleBuilderProps {
  projects: Project[];
  projectsApi: any;
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  currentProjectId: string;
}

const ACTION_TYPES: ActionType[] = ['OPEN', 'CLICK', 'TYPE', 'ASSERT_VISIBLE', 'ASSERT_TEXT', 'WAIT', 'API_GET', 'API_POST', 'API_PUT', 'API_DELETE'];

export const ModuleBuilder: React.FC<ModuleBuilderProps> = ({ projects, projectsApi, headers, bodies, endpoints, currentProjectId }) => {
  const [activeModuleId, setActiveModuleId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Module Editing State
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editModuleName, setEditModuleName] = useState('');

  // Dropdown States
  const [elementMenuOpen, setElementMenuOpen] = useState<string | null>(null);
  const [variableMenuOpen, setVariableMenuOpen] = useState<{ stepId: string, field: 'target' | 'data', paramName?: string } | null>(null);

  // Drag and Drop State
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);

  const activeProject = projects.find(p => p.id === currentProjectId);
  const activeModule = activeProject?.modules.find(m => m.id === activeModuleId);

  // Filter Logic
  const filteredModules = useMemo(() => {
    if (!activeProject) return [];
    if (!searchTerm) return activeProject.modules;
    const lower = searchTerm.toLowerCase();
    return activeProject.modules.filter(m => m.name.toLowerCase().includes(lower));
  }, [activeProject, searchTerm]);

  // --- Module Actions ---
  const addModule = async () => {
    if (!activeProject) return;
    const newModule: TestModule = {
        id: `mod-${Date.now()}`,
        name: 'New Module',
        description: '',
        params: [],
        steps: []
    };
    
    await projectsApi.update(activeProject.id, { modules: [...activeProject.modules, newModule] });
    
    setActiveModuleId(newModule.id);
    setEditingModuleId(newModule.id);
    setEditModuleName('New Module');
  };

  const updateModule = async (updates: Partial<TestModule>) => {
    if (!activeProject || !activeModuleId) return;
    const newModules = activeProject.modules.map(m => m.id === activeModuleId ? { ...m, ...updates } : m);
    await projectsApi.update(activeProject.id, { modules: newModules });
  };

  const saveModuleName = async () => {
    if (editingModuleId && activeProject) {
        const newModules = activeProject.modules.map(m => m.id === editingModuleId ? { ...m, name: editModuleName } : m);
        await projectsApi.update(activeProject.id, { modules: newModules });
        setEditingModuleId(null);
    }
  };

  const deleteModule = async (moduleId: string) => {
    if (!activeProject) return;
    const newModules = activeProject.modules.filter(m => m.id !== moduleId);
    await projectsApi.update(activeProject.id, { modules: newModules });
    if (activeModuleId === moduleId) setActiveModuleId('');
  };

  // --- Parameter Actions ---
  const addParam = () => {
      if (!activeModule) return;
      const newParam: ModuleParameter = {
          id: `mp-${Date.now()}`,
          name: 'PARAM_NAME',
          defaultValue: '',
          description: ''
      };
      updateModule({ params: [...(activeModule.params || []), newParam] });
  };

  const updateParam = (paramId: string, updates: Partial<ModuleParameter>) => {
      if (!activeModule) return;
      updateModule({
          params: (activeModule.params || []).map(p => p.id === paramId ? { ...p, ...updates } : p)
      });
  };

  const deleteParam = (paramId: string) => {
      if (!activeModule) return;
      updateModule({
          params: (activeModule.params || []).filter(p => p.id !== paramId)
      });
  };

  // --- Step Actions ---
  const addStep = () => {
    if (!activeModule) return;
    const newStep: TestStep = {
      id: `ms-${Date.now()}`,
      action: 'CLICK',
      target: '',
      data: '',
      description: ''
    };
    updateModule({ steps: [...activeModule.steps, newStep] });
  };

  const updateStep = (stepId: string, updates: Partial<TestStep>) => {
    if (!activeModule) return;
    updateModule({
      steps: activeModule.steps.map(s => s.id === stepId ? { ...s, ...updates } : s)
    });
  };

  const deleteStep = (stepId: string) => {
    if (!activeModule) return;
    updateModule({
      steps: activeModule.steps.filter(s => s.id !== stepId)
    });
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (!activeModule) return;
    if (toIndex < 0 || toIndex >= activeModule.steps.length) return;
    const newSteps = [...activeModule.steps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);
    updateModule({ steps: newSteps });
  };

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.drag-handle')) return;
    setDraggedStepIndex(index);
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedStepIndex === null) return;
    moveStep(draggedStepIndex, dropIndex);
    setDraggedStepIndex(null);
  };

  const getActionColorClass = (action: ActionType) => {
     if (action.startsWith('ASSERT')) return 'bg-orange-50 text-orange-700 border-orange-200';
     if (action.startsWith('API')) return 'bg-sky-50 text-sky-700 border-sky-200';
     if (action === 'WAIT') return 'bg-gray-100 text-gray-700 border-gray-200';
     return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  return (
    <div className="h-full flex overflow-hidden bg-gray-50 relative">
      {elementMenuOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setElementMenuOpen(null)}></div>
      )}

      {/* Sidebar */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col z-10">
         <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
            <div className="relative">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
                    <span className="text-sm font-semibold text-gray-900 truncate">
                        {activeProject?.name || 'No Project Selected'}
                    </span>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input 
                    type="text"
                    placeholder="Filter modules..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
         </div>

         <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Shared Modules</span>
                <button 
                    onClick={addModule}
                    disabled={!activeProject}
                    className="text-gray-400 hover:text-purple-600 p-1 rounded-md hover:bg-purple-50 transition-colors disabled:opacity-50"
                    title="Add Module"
                >
                    <Plus size={14} />
                </button>
            </div>
            
            {!activeProject && (
                 <div className="text-center py-8 px-4 text-gray-400 text-xs italic">
                     Select a project in Settings to start.
                 </div>
             )}

            <div className="space-y-0.5">
                {filteredModules.map(mod => (
                    <div 
                        key={mod.id}
                        className={`group px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center justify-between transition-all duration-200 ${
                            activeModuleId === mod.id
                            ? 'bg-purple-50 text-purple-700' 
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                        onClick={() => setActiveModuleId(mod.id)}
                    >
                        <div className="flex items-center gap-2 overflow-hidden w-full">
                            <Workflow size={14} className={`shrink-0 ${activeModuleId === mod.id ? 'text-purple-500' : 'text-gray-400'}`} />
                            {editingModuleId === mod.id ? (
                                <input 
                                    className="w-full px-1 py-0.5 text-xs bg-white border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    value={editModuleName}
                                    onChange={e => setEditModuleName(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={e => e.key === 'Enter' && saveModuleName()}
                                    onBlur={saveModuleName}
                                    autoFocus
                                />
                            ) : (
                                <span className="truncate">{mod.name}</span>
                            )}
                        </div>

                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {editingModuleId === mod.id ? (
                                <button onClick={(e) => { e.stopPropagation(); saveModuleName(); }} className="p-1 text-green-600"><Check size={12}/></button>
                            ) : (
                                <div className="flex gap-0.5 relative z-20">
                                    <button onClick={(e) => { e.stopPropagation(); setEditingModuleId(mod.id); setEditModuleName(mod.name); }} className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded"><Edit2 size={12}/></button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); deleteModule(mod.id); }} 
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                    >
                                        <Trash2 size={12}/>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        {activeModule ? (
            <>
                <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5 font-medium">
                            <span className="text-purple-600">Module Editor</span>
                            <ChevronRight size={12} className="text-gray-300" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">{activeModule.name}</h2>
                    </div>
                    <div className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded-full border border-purple-100">
                        {activeModule.steps.length} Steps
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className="flex flex-col min-h-full">
                        <div className="px-6 py-6 border-b border-gray-100">
                             <div className="mb-4">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Description</label>
                                <input 
                                    className="w-full mt-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder-gray-400 shadow-sm transition-all"
                                    value={activeModule.description || ''}
                                    onChange={(e) => updateModule({ description: e.target.value })}
                                    placeholder="Module description (e.g. 'Standard login flow for reuse')..."
                                />
                             </div>

                             {/* Parameters Section */}
                             <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                        <Variable size={12} /> Input Parameters
                                    </label>
                                    <button onClick={addParam} className="text-xs text-purple-600 hover:bg-purple-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">
                                        <Plus size={12} /> Add Parameter
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 grid grid-cols-12 gap-2">
                                            <div className="col-span-5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider pl-1">Name</div>
                                            <div className="col-span-7 text-[10px] font-semibold text-gray-500 uppercase tracking-wider pl-1">Default Value</div>
                                        </div>
                                        <div className="w-[26px]"></div>
                                    </div>
                                    {(activeModule.params || []).map(param => (
                                        <div key={param.id} className="flex items-center gap-2 group">
                                            <div className="flex-1 grid grid-cols-12 gap-2">
                                                <div className="col-span-5">
                                                    <input 
                                                        className="w-full bg-purple-50 border border-purple-100 rounded px-2 py-1.5 text-xs font-mono font-medium text-purple-900 placeholder-purple-300 focus:border-purple-500 outline-none"
                                                        value={param.name}
                                                        onChange={(e) => updateParam(param.id, { name: e.target.value })}
                                                        placeholder="PARAM_NAME"
                                                    />
                                                </div>
                                                <div className="col-span-7">
                                                    <input 
                                                        className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:border-purple-500 outline-none placeholder-gray-300"
                                                        value={param.defaultValue || ''}
                                                        onChange={(e) => updateParam(param.id, { defaultValue: e.target.value })}
                                                        placeholder="Default Value"
                                                    />
                                                </div>
                                            </div>
                                            <button onClick={() => deleteParam(param.id)} className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {(activeModule.params || []).length === 0 && (
                                        <div className="text-xs text-gray-400 italic py-2 bg-gray-50/50 rounded border border-dashed border-gray-200 text-center">
                                            No parameters defined. Steps will use global variables or hardcoded values.
                                        </div>
                                    )}
                                </div>
                             </div>
                        </div>

                        <div className="px-6 pb-6 pt-6 flex-1 space-y-3 bg-gray-50">
                             <div className="flex items-center gap-2 mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Execution Steps</label>
                             </div>
                             {/* Steps Loop (simplified reuse of TestBuilder logic) */}
                             {activeModule.steps.map((step, index) => (
                                <div 
                                    key={step.id} 
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    className={`group bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-purple-300 hover:shadow-md transition-all relative ${elementMenuOpen === step.id ? 'z-50 border-purple-300 ring-2 ring-purple-500/20' : 'z-auto'} ${draggedStepIndex === index ? 'opacity-50 ring-2 ring-purple-300 border-purple-400' : ''}`}
                                >
                                    <div className="grid grid-cols-12 gap-4 items-center">
                                        {/* Drag Handle */}
                                        <div className="col-span-1 flex justify-center text-gray-300 cursor-grab active:cursor-grabbing group-hover:text-gray-400 drag-handle hover:bg-gray-50 rounded-md py-1">
                                            <GripVertical size={16} />
                                        </div>
                                        
                                        {/* Action */}
                                        <div className="col-span-2">
                                            <select 
                                                className={`w-full text-[11px] font-bold rounded-md border px-2 py-1.5 focus:ring-2 focus:ring-opacity-50 outline-none uppercase cursor-pointer transition-colors ${getActionColorClass(step.action)}`}
                                                value={step.action}
                                                onChange={(e) => updateStep(step.id, { action: e.target.value as ActionType })}
                                            >
                                                {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>

                                        {/* Target */}
                                        <div className="col-span-4 relative">
                                             {step.action.startsWith('API_') ? (
                                                <div className="space-y-2">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Endpoint</label>
                                                        <div className="relative">
                                                            <Globe className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={10} />
                                                            <select 
                                                                className="w-full bg-white text-[10px] border border-gray-200 rounded pl-6 pr-6 py-1.5 focus:ring-1 focus:ring-purple-500 outline-none appearance-none cursor-pointer text-gray-700 font-medium"
                                                                value={step.endpointId || ''}
                                                                onChange={(e) => updateStep(step.id, { endpointId: e.target.value })}
                                                            >
                                                                <option value="">Direct URL</option>
                                                                {endpoints.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                                            </select>
                                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={10} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                                            {step.endpointId ? 'Resource Path' : 'Full URL'}
                                                        </label>
                                                        <div className="relative">
                                                            <input 
                                                                className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-1.5 font-mono focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder-gray-300 pr-8"
                                                                value={step.target}
                                                                onChange={(e) => updateStep(step.id, { target: e.target.value })}
                                                                placeholder={step.endpointId ? '/v1/users' : 'https://api.example.com/v1/users'}
                                                            />
                                                            <button 
                                                                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600 p-1 rounded"
                                                                onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'target' ? null : { stepId: step.id, field: 'target' }); }}
                                                                title="Insert Parameter"
                                                            >
                                                                <Braces size={12} />
                                                            </button>
                                                            
                                                            {/* Parameter Dropdown - Target */}
                                                            {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'target' && (
                                                                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Parameter</div>
                                                                    {(activeModule.params || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No parameters defined</div>}
                                                                    {(activeModule.params || []).map(p => (
                                                                        <button 
                                                                            key={p.id}
                                                                            className="w-full text-left px-3 py-1.5 hover:bg-purple-50 hover:text-purple-700 font-mono flex items-center justify-between group"
                                                                            onClick={() => {
                                                                                updateStep(step.id, { target: `${step.target}\${${p.name}}` });
                                                                                setVariableMenuOpen(null);
                                                                            }}
                                                                        >
                                                                            <span>{p.name}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                             ) : (
                                                 <div className="relative">
                                                    <input 
                                                        className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-1.5 font-mono focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder-gray-300 pr-8"
                                                        value={step.target}
                                                        onChange={(e) => updateStep(step.id, { target: e.target.value })}
                                                        onFocus={() => setElementMenuOpen(step.id)}
                                                        placeholder="Target / Selector"
                                                    />
                                                    {/* Element Dropdown reuse */}
                                                    {elementMenuOpen === step.id && (
                                                        <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-xl z-50 animate-in fade-in zoom-in-95 duration-75" onMouseDown={(e) => e.stopPropagation()}>
                                                            {activeProject?.pages.map(page => (
                                                                <div key={page.id}>
                                                                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 bg-gray-50 border-y border-gray-100 uppercase tracking-wider sticky top-0 z-10 flex items-center gap-1"><Layers size={10} />{page.name}</div>
                                                                    {page.elements.map(el => (
                                                                        <div key={el.id} className="px-4 py-2 text-xs text-gray-700 hover:bg-purple-50 hover:text-purple-700 cursor-pointer flex items-center gap-2"
                                                                            onMouseDown={(e) => { e.preventDefault(); updateStep(step.id, { target: `${page.name}/${el.name}` }); setElementMenuOpen(null); }}>
                                                                            <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${el.selectorType === 'XPath' ? 'bg-purple-400' : 'bg-indigo-400'}`}></div>
                                                                            <span className="font-medium">{el.name}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                 </div>
                                             )}
                                        </div>

                                        {/* Data */}
                                        <div className="col-span-4 relative">
                                            {step.action.startsWith('API_') ? (
                                                <div className="space-y-2">
                                                    {/* Configuration Row */}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Headers</label>
                                                            <div className="relative">
                                                                <select 
                                                                    className="w-full bg-white text-[10px] border border-gray-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-purple-500 outline-none appearance-none cursor-pointer text-gray-700 font-medium"
                                                                    value={step.headerProfileId || ''}
                                                                    onChange={(e) => updateStep(step.id, { headerProfileId: e.target.value })}
                                                                >
                                                                    <option value="">(None)</option>
                                                                    {headers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                                                                </select>
                                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={10} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Body Template</label>
                                                            <div className="relative">
                                                                <select 
                                                                    className="w-full bg-white text-[10px] border border-gray-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-purple-500 outline-none appearance-none cursor-pointer text-gray-700 font-medium"
                                                                    value={step.bodyTemplateId || ''}
                                                                    onChange={(e) => updateStep(step.id, { bodyTemplateId: e.target.value })}
                                                                >
                                                                    <option value="">(Raw)</option>
                                                                    {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                                </select>
                                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={10} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Dynamic Variable Inputs */}
                                                    {(step.headerProfileId || step.bodyTemplateId) ? (
                                                        <div className="bg-gray-50 rounded-md border border-gray-200 p-2 space-y-3">
                                                            {/* Header Variables */}
                                                            {(() => {
                                                                const profile = headers.find(h => h.id === step.headerProfileId);
                                                                if (!profile) return null;
                                                                
                                                                const headerVars = new Set<string>();
                                                                profile.headers.forEach(h => {
                                                                    const matches = h.value.match(/\{\{([^}]+)\}\}/g);
                                                                    if (matches) matches.forEach(m => headerVars.add(m.replace(/\{\{|\}\}/g, '')));
                                                                });

                                                                if (headerVars.size === 0) return null;

                                                                let currentValues: Record<string, string> = {};
                                                                try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                                                return (
                                                                    <div>
                                                                        <div className="text-[9px] font-bold text-purple-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileText size={10}/> Header Variables</div>
                                                                        <div className="space-y-1.5">
                                                                            {Array.from(headerVars).map(varName => (
                                                                                <div key={`header-${varName}`} className="flex items-center gap-2">
                                                                                    <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                                    <div className="relative flex-1">
                                                                                        <input 
                                                                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none"
                                                                                            placeholder="Value"
                                                                                            value={currentValues[varName] || ''}
                                                                                            onChange={(e) => {
                                                                                                const newData = { ...currentValues, [varName]: e.target.value };
                                                                                                updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                            }}
                                                                                        />
                                                                                        <button 
                                                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-purple-600 p-0.5 rounded"
                                                                                            onClick={(e) => { 
                                                                                                e.stopPropagation(); 
                                                                                                setVariableMenuOpen(
                                                                                                    variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === varName 
                                                                                                    ? null 
                                                                                                    : { stepId: step.id, field: 'data', paramName: varName }
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            <Braces size={10} />
                                                                                        </button>
                                                                                        {variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === varName && (
                                                                                            <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                                                <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Parameter</div>
                                                                                                {(activeModule.params || []).map(p => (
                                                                                                    <button 
                                                                                                        key={p.id}
                                                                                                        className="w-full text-left px-3 py-1.5 hover:bg-purple-50 hover:text-purple-700 font-mono flex items-center justify-between group"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const newData = { ...currentValues, [varName]: `\${${p.name}}` };
                                                                                                            updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                                            setVariableMenuOpen(null);
                                                                                                        }}
                                                                                                    >
                                                                                                        <span>{p.name}</span>
                                                                                                    </button>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Body Variables */}
                                                            {(() => {
                                                                const template = bodies.find(b => b.id === step.bodyTemplateId);
                                                                if (!template) return null;
                                                                
                                                                const bodyVars = new Set<string>();
                                                                const matches = template.content.match(/\{\{([^}]+)\}\}/g);
                                                                if (matches) matches.forEach(m => bodyVars.add(m.replace(/\{\{|\}\}/g, '')));

                                                                if (bodyVars.size === 0) return null;

                                                                let currentValues: Record<string, string> = {};
                                                                try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                                                return (
                                                                    <div>
                                                                        <div className="text-[9px] font-bold text-purple-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileCode size={10}/> Body Variables</div>
                                                                        <div className="space-y-1.5">
                                                                            {Array.from(bodyVars).map(varName => (
                                                                                <div key={`body-${varName}`} className="flex items-center gap-2">
                                                                                    <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                                    <div className="relative flex-1">
                                                                                        <input 
                                                                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none"
                                                                                            placeholder="Value"
                                                                                            value={currentValues[varName] || ''}
                                                                                            onChange={(e) => {
                                                                                                const newData = { ...currentValues, [varName]: e.target.value };
                                                                                                updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                            }}
                                                                                        />
                                                                                        <button 
                                                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-purple-600 p-0.5 rounded"
                                                                                            onClick={(e) => { 
                                                                                                e.stopPropagation(); 
                                                                                                setVariableMenuOpen(
                                                                                                    variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === varName 
                                                                                                    ? null 
                                                                                                    : { stepId: step.id, field: 'data', paramName: varName }
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            <Braces size={10} />
                                                                                        </button>
                                                                                        {variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === varName && (
                                                                                            <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                                                <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Parameter</div>
                                                                                                {(activeModule.params || []).map(p => (
                                                                                                    <button 
                                                                                                        key={p.id}
                                                                                                        className="w-full text-left px-3 py-1.5 hover:bg-purple-50 hover:text-purple-700 font-mono flex items-center justify-between group"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const newData = { ...currentValues, [varName]: `\${${p.name}}` };
                                                                                                            updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                                            setVariableMenuOpen(null);
                                                                                                        }}
                                                                                                    >
                                                                                                        <span>{p.name}</span>
                                                                                                    </button>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <div className="relative">
                                                            <textarea 
                                                                className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-2 font-mono focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder-gray-300 min-h-[60px] resize-y"
                                                                value={step.data}
                                                                onChange={(e) => updateStep(step.id, { data: e.target.value })}
                                                                placeholder="Request Body (JSON)"
                                                            />
                                                            <button 
                                                                className="absolute right-1 top-2 text-gray-400 hover:text-purple-600 p-1 rounded"
                                                                onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' ? null : { stepId: step.id, field: 'data' }); }}
                                                                title="Insert Parameter"
                                                            >
                                                                <Braces size={12} />
                                                            </button>
                                                            {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && !variableMenuOpen.paramName && (
                                                                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Parameter</div>
                                                                    {(activeModule.params || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No parameters defined</div>}
                                                                    {(activeModule.params || []).map(p => (
                                                                        <button 
                                                                            key={p.id}
                                                                            className="w-full text-left px-3 py-1.5 hover:bg-purple-50 hover:text-purple-700 font-mono flex items-center justify-between group"
                                                                            onClick={() => {
                                                                                updateStep(step.id, { data: `${step.data}\${${p.name}}` });
                                                                                setVariableMenuOpen(null);
                                                                            }}
                                                                        >
                                                                            <span>{p.name}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <input 
                                                    className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-1.5 font-mono focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder-gray-300"
                                                    value={step.data}
                                                    onChange={(e) => updateStep(step.id, { data: e.target.value })}
                                                    placeholder="Data / Param: ${VAR}"
                                                />
                                            )}
                                        </div>

                                        {/* Delete */}
                                        <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => deleteStep(step.id)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                    <div className="mt-2 pl-9 pr-8">
                                        <div className="relative">
                                            <input 
                                                className="w-full bg-transparent border-b border-dashed border-gray-200 focus:border-purple-300 text-[11px] text-gray-500 placeholder-gray-300 focus:bg-gray-50/50 outline-none transition-all py-1 px-1"
                                                value={step.description || ''}
                                                onChange={(e) => updateStep(step.id, { description: e.target.value })}
                                                placeholder="Step description..."
                                            />
                                            <TextQuote size={10} className="absolute -left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                                        </div>
                                    </div>
                                </div>
                             ))}
                             
                             <button onClick={addStep} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50/50 transition-all flex items-center justify-center gap-2 text-sm font-medium mt-6 group">
                                <Plus size={16} className="group-hover:scale-110 transition-transform" /> Add Step
                             </button>
                        </div>
                    </div>
                </div>
            </>
        ) : (
             <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-4 bg-gray-50/50 animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                    <Workflow size={32} className="text-gray-300" />
                </div>
                <p className="font-medium text-gray-500">Select a module to edit or create a new one</p>
                <button onClick={addModule} className="text-xs text-purple-600 hover:underline">Create Shared Module</button>
            </div>
        )}
      </div>
    </div>
  );
};

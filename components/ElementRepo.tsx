
import React, { useState, useMemo, useEffect } from 'react';
import { Project, Page, UIElement, SelectorType } from '../types';
import { Trash2, Plus, Sparkles, Database, File, Edit2, Check, Layout, Code, ChevronRight, ChevronDown, MousePointer2, Save, MoreHorizontal, Search, Filter, FolderPlus, Settings } from 'lucide-react';
import { suggestSelector } from '../services/geminiService';

interface ElementRepoProps {
  projects: Project[];
  projectsApi: {
    create: (item: Project) => Promise<void>;
    update: (id: string, item: Partial<Project>) => Promise<void>;
    remove: (id: string) => Promise<void>;
  };
  currentProjectId: string;
}

export const ElementRepo: React.FC<ElementRepoProps> = ({ projects, projectsApi, currentProjectId }) => {
  const [activePageId, setActivePageId] = useState<string>('');
  const [activeElementId, setActiveElementId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [htmlInput, setHtmlInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  
  // Edit States
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editPageName, setEditPageName] = useState('');
  
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editElementName, setEditElementName] = useState('');

  const activeProject = projects.find(p => p.id === currentProjectId);
  const activePage = activeProject?.pages.find(p => p.id === activePageId);
  const activeElement = activePage?.elements.find(e => e.id === activeElementId);

  // Auto-select first page if none selected
  useEffect(() => {
    if (activeProject && activeProject.pages.length > 0 && !activePageId) {
        setActivePageId(activeProject.pages[0].id);
    }
  }, [activeProject, activePageId]);

  // Handle Project Selection Reset on Delete
  useEffect(() => {
      if (!activeProject) {
          setActivePageId('');
          setActiveElementId('');
      }
  }, [activeProject]);

  // Filter Logic
  const filteredPages = useMemo(() => {
    if (!activeProject) return [];
    if (!searchTerm) return activeProject.pages;
    const lower = searchTerm.toLowerCase();
    return activeProject.pages.map(p => ({
        ...p,
        elements: p.elements.filter(e => e.name.toLowerCase().includes(lower) || e.value.toLowerCase().includes(lower))
    })).filter(p => p.name.toLowerCase().includes(lower) || p.elements.length > 0 || activeProject.pages.find(orig => orig.id === p.id)?.name.toLowerCase().includes(lower));
  }, [activeProject, searchTerm]);

  // --- Page Actions ---

  const updateProject = (fn: (p: Project) => Project) => {
    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
      projectsApi.update(currentProjectId, fn(project));
    }
  };

  const addPage = () => {
    if (!activeProject) return;
    const newPage: Page = { 
        id: `pg-${Date.now()}`, 
        name: 'New Page', 
        description: '',
        elements: [] 
    };
    updateProject(p => ({ ...p, pages: [...p.pages, newPage] }));
    setActivePageId(newPage.id);
    setActiveElementId('');
    // Auto Enter Edit Mode
    setEditingPageId(newPage.id);
    setEditPageName('New Page');
  };

  const savePageName = () => {
    if (editingPageId) {
        updateProject(p => ({
            ...p,
            pages: p.pages.map(pg => pg.id === editingPageId ? { ...pg, name: editPageName } : pg)
        }));
        setEditingPageId(null);
    }
  };

  const updatePage = (pageId: string, updates: Partial<Page>) => {
    updateProject(p => ({
        ...p,
        pages: p.pages.map(pg => pg.id === pageId ? { ...pg, ...updates } : pg)
    }));
  };

  const deletePage = (pageId: string) => {
    // Immediate deletion without confirmation
    updateProject(p => ({ ...p, pages: p.pages.filter(pg => pg.id !== pageId) }));
    if (activePageId === pageId) {
        setActivePageId('');
        setActiveElementId('');
    }
  };

  // --- Element Actions ---

  const addElement = (pageId: string) => {
    const newElement: UIElement = {
      id: `el-${Date.now()}`,
      name: 'New Element',
      selectorType: 'CSS',
      value: '',
      description: ''
    };
    updateProject(p => ({
        ...p,
        pages: p.pages.map(pg => {
            if (pg.id !== pageId) return pg;
            return { ...pg, elements: [...pg.elements, newElement] };
        })
    }));
    setActivePageId(pageId);
    setActiveElementId(newElement.id);
    // Auto Enter Edit Mode
    setEditingElementId(newElement.id);
    setEditElementName('New Element');
  };

  const updateElement = (pageId: string, elementId: string, updates: Partial<UIElement>) => {
    updateProject(p => ({
        ...p,
        pages: p.pages.map(pg => {
            if (pg.id !== pageId) return pg;
            return {
                ...pg,
                elements: pg.elements.map(el => el.id === elementId ? { ...el, ...updates } : el)
            };
        })
    }));
  };

  const saveElementName = (pageId: string) => {
      if (editingElementId) {
          updateElement(pageId, editingElementId, { name: editElementName });
          setEditingElementId(null);
      }
  };

  const deleteElement = (pageId: string, elementId: string) => {
    // Immediate deletion without confirmation
    updateProject(p => ({
        ...p,
        pages: p.pages.map(pg => {
            if (pg.id !== pageId) return pg;
            return {
                ...pg,
                elements: pg.elements.filter(el => el.id !== elementId)
            };
        })
    }));
    if (activeElementId === elementId) setActiveElementId('');
  };

  const handleAiSuggest = async () => {
    if (!htmlInput.trim()) return;
    setAiLoading(true);
    const suggestion = await suggestSelector(htmlInput);
    setAiLoading(false);
    
    // If we are in element edit mode, apply to that element
    if (activeElementId && activePageId) {
        updateElement(activePageId, activeElementId, {
            selectorType: (suggestion.selectorType as SelectorType) || 'CSS',
            value: suggestion.value,
            name: suggestion.name || activeElement?.name
        });
        setIsAiModalOpen(false);
        setHtmlInput('');
        return;
    }

    // If we are in page mode, add new element
    if (suggestion.value && activePageId) {
       const newElement: UIElement = {
        id: `el-${Date.now()}`,
        name: suggestion.name || 'AI Generated Element',
        selectorType: (suggestion.selectorType as SelectorType) || 'CSS',
        value: suggestion.value
      };
      
      updateProject(p => ({
          ...p,
          pages: p.pages.map(pg => {
            if (pg.id !== activePageId) return pg;
            return { ...pg, elements: [...pg.elements, newElement] };
          })
      }));
      setHtmlInput('');
      setIsAiModalOpen(false);
    }
  };

  return (
    <div className="h-full flex bg-gray-50 overflow-hidden">
      {/* Sidebar Explorer - Light Theme Panel */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col z-10">
         {/* Project Selector Header */}
         <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
                        <span className="text-sm font-semibold text-gray-900 truncate">
                            {activeProject?.name || 'No Project Selected'}
                        </span>
                    </div>
                </div>
            </div>
            
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input 
                    type="text"
                    placeholder="Filter pages..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
         </div>

         {/* Page Tree */}
         <div className="flex-1 overflow-y-auto px-2 py-3">
             <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Object Repository</span>
                <button 
                    onClick={addPage}
                    disabled={!activeProject}
                    className="text-gray-400 hover:text-indigo-600 p-1 rounded-md hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    title="Add Page"
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
                {filteredPages.map(page => (
                    <div key={page.id} className="select-none">
                        {/* Page Header */}
                        <div 
                            className={`group px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center justify-between transition-all duration-200 ${
                                activePageId === page.id && !activeElementId
                                ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                            onClick={() => { setActivePageId(page.id); setActiveElementId(''); }}
                        >
                            <div className="flex items-center gap-2 overflow-hidden w-full">
                                <Layout size={14} className={activePageId === page.id ? 'text-indigo-500' : 'text-gray-400'} />
                                {editingPageId === page.id ? (
                                    <input 
                                        className="w-full px-1 py-0.5 text-xs bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        value={editPageName}
                                        onChange={e => setEditPageName(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        onKeyDown={e => e.key === 'Enter' && savePageName()}
                                        onBlur={savePageName}
                                        autoFocus
                                    />
                                ) : (
                                    <span className="truncate">{page.name}</span>
                                )}
                            </div>
                            
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {editingPageId === page.id ? (
                                    <button onClick={(e) => { e.stopPropagation(); savePageName(); }} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check size={12}/></button>
                                ) : (
                                    <div className="flex gap-0.5 relative z-20">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingPageId(page.id); setEditPageName(page.name); }} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 size={12}/></button>
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                deletePage(page.id); 
                                            }} 
                                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                            title="Delete Page"
                                        >
                                            <Trash2 size={12}/>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Element Children */}
                        {(activePageId === page.id || searchTerm) && (
                            <div className="ml-3 pl-3 border-l border-gray-100 my-1 space-y-0.5">
                                {page.elements.map(el => (
                                    <div 
                                        key={el.id}
                                        className={`group text-xs py-1.5 px-2 rounded-md cursor-pointer truncate transition-colors flex items-center justify-between ${
                                            activeElementId === el.id 
                                            ? 'bg-indigo-50 text-indigo-700 font-medium' 
                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                        onClick={(e) => { e.stopPropagation(); setActivePageId(page.id); setActiveElementId(el.id); }}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden w-full">
                                            <Code size={12} className={activeElementId === el.id ? 'text-indigo-500' : 'text-gray-300'} />
                                            {editingElementId === el.id ? (
                                                 <input 
                                                    className="w-full px-1 py-0.5 text-xs bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                    value={editElementName}
                                                    onChange={e => setEditElementName(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                    onKeyDown={e => e.key === 'Enter' && saveElementName(page.id)}
                                                    onBlur={() => saveElementName(page.id)}
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="truncate">{el.name}</span>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {editingElementId === el.id ? (
                                                <button onClick={(e) => { e.stopPropagation(); saveElementName(page.id); }} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check size={12}/></button>
                                            ) : (
                                                <div className="flex gap-0.5 relative z-20">
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingElementId(el.id); setEditElementName(el.name); }} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 size={12}/></button>
                                                    <button 
                                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            deleteElement(page.id, el.id); 
                                                        }}
                                                        title="Delete Element"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); addElement(page.id); }}
                                    className="text-[11px] text-gray-400 hover:text-indigo-600 px-2 py-1.5 flex items-center gap-1.5 w-full hover:bg-gray-50 rounded transition-colors font-medium group"
                                >
                                    <Plus size={10} className="group-hover:scale-110 transition-transform" /> New Element
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                
                {activeProject && filteredPages.length === 0 && (
                    <div className="text-center py-8 px-4">
                        <p className="text-xs text-gray-400">No pages found.</p>
                        <button onClick={addPage} className="text-xs text-indigo-600 hover:underline mt-1">Create Page</button>
                    </div>
                )}
             </div>
         </div>
      </div>

      {/* Main Content Area - Form/Detail View */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {activeElement && activePage ? (
            /* Single Element Editor View */
            <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
                <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                    <div>
                         <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5 font-medium">
                            <span className="hover:text-indigo-600 cursor-pointer transition-colors" onClick={() => setActiveElementId('')}>{activePage.name}</span>
                            <ChevronRight size={12} className="text-gray-300" />
                            <span>Edit Element</span>
                         </div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                           {activeElement.name}
                        </h2>
                    </div>
                    <div className="flex gap-2">
                         <button 
                            onClick={() => setIsAiModalOpen(true)}
                            className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md flex items-center gap-2 transition-colors"
                        >
                            <Sparkles size={14} /> AI Improve
                        </button>
                    </div>
                </div>

                <div className="flex-1 p-6 bg-gray-50 overflow-hidden flex flex-col">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-8 flex-1 overflow-y-auto">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Element Name</label>
                            <input 
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder-gray-400" 
                                value={activeElement.name}
                                onChange={(e) => updateElement(activePage.id, activeElement.id, { name: e.target.value })}
                            />
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                            <textarea 
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 resize-none h-20" 
                                value={activeElement.description || ''}
                                onChange={(e) => updateElement(activePage.id, activeElement.id, { description: e.target.value })}
                                placeholder="Describe the element's purpose..."
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Locator Strategy</label>
                                <div className="relative">
                                    <select 
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none"
                                        value={activeElement.selectorType}
                                        onChange={(e) => updateElement(activePage.id, activeElement.id, { selectorType: e.target.value as SelectorType })}
                                    >
                                        <option value="CSS">CSS Selector</option>
                                        <option value="XPath">XPath</option>
                                        <option value="getByRole">getByRole (Playwright)</option>
                                        <option value="getByText">getByText (Playwright)</option>
                                        <option value="getByTestId">getByTestId (Playwright)</option>
                                        <option value="getByLabel">getByLabel (Playwright)</option>
                                        <option value="getByPlaceholder">getByPlaceholder (Playwright)</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                                </div>
                            </div>
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex justify-between">
                                <span>Locator Value</span>
                                <span className="text-xs text-gray-500 font-normal">Supports standard Playwright selector syntax</span>
                            </label>
                            <div className="relative">
                                <textarea 
                                    className="w-full h-32 bg-slate-50 border border-gray-300 rounded-lg px-3 py-3 text-sm font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                                    value={activeElement.value}
                                    onChange={(e) => updateElement(activePage.id, activeElement.id, { value: e.target.value })}
                                />
                                <div className="absolute top-3 right-3 text-gray-400 bg-white p-1 rounded border border-gray-200">
                                    <MousePointer2 size={14} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ) : activePage ? (
            /* Page Bulk Editor View */
          <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
             <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-3">
                    <Layout className="text-indigo-600" size={20} />
                    <h2 className="text-lg font-semibold text-gray-900">{activePage.name}</h2>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold uppercase tracking-wide">Page Object</span>
                </div>
                <div className="flex gap-3 items-center">
                    <span className="text-xs text-gray-400 font-medium mr-2">{activePage.elements.length} Elements</span>
                    <button 
                        onClick={() => setIsAiModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md flex items-center gap-2 transition-colors"
                    >
                        <Sparkles size={14} /> AI Import
                    </button>
                </div>
             </div>

             <div className="px-6 pt-4 pb-0 bg-gray-50 shrink-0">
                 <input 
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder-gray-400"
                    placeholder="Page Description (optional)"
                    value={activePage.description || ''}
                    onChange={(e) => updatePage(activePage.id, { description: e.target.value })}
                 />
             </div>

             <div className="flex-1 p-6 bg-gray-50 overflow-hidden flex flex-col">
                 <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col flex-1">
                    <div className="grid grid-cols-12 gap-6 px-6 py-3 bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider shrink-0">
                        <div className="col-span-3">Element Name</div>
                        <div className="col-span-2">Locator Type</div>
                        <div className="col-span-6">Locator Value</div>
                        <div className="col-span-1"></div>
                    </div>
                    
                    <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
                        {activePage.elements.map(el => (
                            <div key={el.id} className="grid grid-cols-12 gap-6 items-center px-6 py-3 hover:bg-gray-50/50 transition-colors group">
                                <div className="col-span-3">
                                    <input 
                                        className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 rounded-md px-2 py-1.5 text-sm text-gray-900 transition-all font-medium placeholder-gray-400" 
                                        value={el.name}
                                        onChange={(e) => updateElement(activePage.id, el.id, { name: e.target.value })}
                                        placeholder="Element Name"
                                    />
                                    <input 
                                        className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 rounded-md px-2 py-1 text-xs text-gray-500 transition-all placeholder-gray-300 mt-1" 
                                        value={el.description || ''}
                                        onChange={(e) => updateElement(activePage.id, el.id, { description: e.target.value })}
                                        placeholder="Description..."
                                    />
                                </div>
                                <div className="col-span-2">
                                    <select 
                                        className="w-full bg-transparent text-xs rounded-md border border-transparent hover:border-gray-300 p-1.5 text-gray-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-colors"
                                        value={el.selectorType}
                                        onChange={(e) => updateElement(activePage.id, el.id, { selectorType: e.target.value as SelectorType })}
                                    >
                                        <option value="CSS">CSS Selector</option>
                                        <option value="XPath">XPath</option>
                                        <option value="getByRole">getByRole</option>
                                        <option value="getByText">getByText</option>
                                        <option value="getByTestId">getByTestId</option>
                                        <option value="getByLabel">getByLabel</option>
                                        <option value="getByPlaceholder">getByPlaceholder</option>
                                    </select>
                                </div>
                                <div className="col-span-6">
                                    <div className="relative">
                                        <input 
                                            className="w-full bg-gray-50/50 text-xs font-mono text-gray-600 rounded-md border border-gray-200 px-3 py-1.5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all placeholder-gray-400" 
                                            value={el.value}
                                            onChange={(e) => updateElement(activePage.id, el.id, { value: e.target.value })}
                                            placeholder="Selector value"
                                        />
                                    </div>
                                </div>
                                <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => deleteElement(activePage.id, el.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {activePage.elements.length === 0 && (
                        <div className="text-center py-16 bg-gray-50/50">
                             <Database className="mx-auto text-gray-300 mb-3" size={32} />
                             <p className="text-gray-500 text-sm font-medium">No elements defined for this page yet.</p>
                             <p className="text-gray-400 text-xs mt-1">Use the sidebar (+) to add new elements.</p>
                        </div>
                    )}
                 </div>
             </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
             <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-4">
                 <Layout size={32} className="text-gray-300" />
             </div>
             <p className="font-medium text-gray-500">Select a page or element from the explorer</p>
             <button disabled={!activeProject} onClick={addPage} className="mt-4 px-4 py-2 bg-white border border-gray-200 shadow-sm rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-all font-medium disabled:opacity-50">Create a new page</button>
          </div>
        )}
      </div>

      {isAiModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-0 rounded-xl w-[600px] shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900">
                <Sparkles className="text-purple-600" size={20}/> 
                {activeElementId ? 'AI Selector Improver' : 'AI Element Extractor'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                    {activeElementId 
                        ? 'Paste the HTML of this element to generate a more robust selector.'
                        : 'Paste an HTML snippet to automatically generate a Playwright selector.'
                    }
                </p>
            </div>
            
            <div className="p-6">
                <textarea 
                className="w-full h-48 bg-slate-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-slate-800 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none resize-none shadow-inner"
                placeholder='<button class="submit-btn" data-testid="login">Login</button>'
                value={htmlInput}
                onChange={(e) => setHtmlInput(e.target.value)}
                />

                <div className="flex justify-end gap-3 mt-6">
                <button 
                    onClick={() => setIsAiModalOpen(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleAiSuggest}
                    disabled={aiLoading}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 font-medium shadow-sm transition-all hover:shadow-purple-500/20"
                >
                    {aiLoading ? 'Analyzing...' : activeElementId ? 'Update Selector' : 'Generate Element'}
                </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

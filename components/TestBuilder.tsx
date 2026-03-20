
import React, { useState, useMemo } from 'react';
import { TestSuite, TestCase, TestStep, Project, ActionType, SuiteVariable, HeaderProfile, BodyTemplate, ApiEndpoint } from '../types';
import { Plus, Play, ChevronDown, ChevronRight, Wand2, Trash2, FileText, FlaskConical, Edit2, Check, X, Database, Search, Sparkles, Layers, TextQuote, Variable, Table2, Braces, MousePointer2, GripVertical, Workflow, FileCode, Globe } from 'lucide-react';
import { generateStepsFromDescription } from '../services/geminiService';

interface TestBuilderProps {
  suites: TestSuite[];
  setSuites: React.Dispatch<React.SetStateAction<TestSuite[]>>;
  projects: Project[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  onRunCase: (suiteId: string, caseId: string) => void;
  currentProjectId: string;
}

const ACTION_TYPES: ActionType[] = ['OPEN', 'CLICK', 'TYPE', 'ASSERT_VISIBLE', 'ASSERT_TEXT', 'WAIT', 'API_GET', 'API_POST', 'API_PUT', 'API_DELETE', 'RUN_MODULE'];

export const TestBuilder: React.FC<TestBuilderProps> = ({ suites, setSuites, projects, headers, bodies, endpoints, onRunCase, currentProjectId }) => {
  const [activeSuiteId, setActiveSuiteId] = useState<string>(suites[0]?.id || '');
  // Default to empty to show Suite Overview first
  const [activeCaseId, setActiveCaseId] = useState<string>(''); 
  const [searchTerm, setSearchTerm] = useState('');
  const [generating, setGenerating] = useState(false);
  
  // Suite Editing State
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);
  const [editSuiteName, setEditSuiteName] = useState('');

  // Case Editing State
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editCaseName, setEditCaseName] = useState('');

  // Dropdown States
  const [variableMenuOpen, setVariableMenuOpen] = useState<{ stepId: string, field: 'target' | 'data', paramName?: string } | null>(null);
  const [elementMenuOpen, setElementMenuOpen] = useState<string | null>(null);

  // Drag and Drop State
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);

  const activeSuite = suites.find(s => s.id === activeSuiteId);
  const activeCase = activeSuite?.cases.find(c => c.id === activeCaseId);

  const activeProject = projects.find(p => p.id === currentProjectId);

  // Filter Logic
  const filteredSuites = useMemo(() => {
    if (!searchTerm) return suites;
    const lower = searchTerm.toLowerCase();
    return suites.map(s => ({
        ...s,
        cases: s.cases.filter(c => c.name.toLowerCase().includes(lower))
    })).filter(s => s.name.toLowerCase().includes(lower) || s.cases.length > 0);
  }, [suites, searchTerm]);

  // --- Suite Actions ---
  const addSuite = () => {
    const newSuite: TestSuite = { 
        id: `suite-${Date.now()}`, 
        name: 'New Test Suite', 
        description: '', 
        cases: [],
        variables: [],
        dataRows: []
    };
    setSuites(prev => [...prev, newSuite]);
    setActiveSuiteId(newSuite.id);
    setActiveCaseId(''); // Show suite details
    // Auto Enter Edit Mode
    setEditingSuiteId(newSuite.id);
    setEditSuiteName('New Test Suite');
  };

  const saveSuiteName = () => {
    if (editingSuiteId) {
        setSuites(prev => prev.map(s => s.id === editingSuiteId ? { ...s, name: editSuiteName } : s));
        setEditingSuiteId(null);
    }
  };

  const updateSuite = (suiteId: string, updates: Partial<TestSuite>) => {
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, ...updates } : s));
  };

  const deleteSuite = (suiteId: string) => {
      // Immediate deletion without confirmation
      setSuites(prev => prev.filter(s => s.id !== suiteId));
      if (activeSuiteId === suiteId) {
         setActiveSuiteId('');
         setActiveCaseId('');
      }
  };

  // --- Suite Variable & Data Row Actions ---
  const addSuiteVariable = () => {
    if (!activeSuite) return;
    const newVar: SuiteVariable = {
        id: `var-${Date.now()}`,
        key: `VAR_${(activeSuite.variables?.length || 0) + 1}`,
        value: ''
    };
    updateSuite(activeSuite.id, { variables: [...(activeSuite.variables || []), newVar] });
  };

  const updateSuiteVariableKey = (id: string, newKey: string) => {
    if (!activeSuite || !activeSuite.variables) return;
    
    // Find variable to get old key for updating dataRows
    const v = activeSuite.variables.find(v => v.id === id);
    if (!v) return;
    const oldKey = v.key;

    // Update variable list
    const newVars = activeSuite.variables.map(v => v.id === id ? { ...v, key: newKey } : v);

    // Update dataRows keys to match new variable name
    const currentRows = activeSuite.dataRows || [];
    const newRows = currentRows.map(row => {
        const newRow = { ...row };
        if (newRow[oldKey] !== undefined) {
            newRow[newKey] = newRow[oldKey];
            delete newRow[oldKey];
        }
        return newRow;
    });

    updateSuite(activeSuite.id, { variables: newVars, dataRows: newRows });
  };

  const updateSuiteVariableValue = (id: string, newValue: string) => {
    if (!activeSuite || !activeSuite.variables) return;
    const newVars = activeSuite.variables.map(v => v.id === id ? { ...v, value: newValue } : v);
    updateSuite(activeSuite.id, { variables: newVars });
  };

  const deleteSuiteVariable = (id: string) => {
    if (!activeSuite || !activeSuite.variables) return;
    const v = activeSuite.variables.find(v => v.id === id);
    if (!v) return;
    const keyToDelete = v.key;

    const newVars = activeSuite.variables.filter(v => v.id !== id);
    
    // Cleanup dataRows
    const currentRows = activeSuite.dataRows || [];
    const newRows = currentRows.map(row => {
        const newRow = { ...row };
        delete newRow[keyToDelete];
        return newRow;
    });
    updateSuite(activeSuite.id, { variables: newVars, dataRows: newRows });
  };

  const addDataRow = () => {
    if (!activeSuite) return;
    const currentRows = activeSuite.dataRows || [];
    // Initialize with current variable keys and empty values
    const newRow: Record<string, string> = {};
    (activeSuite.variables || []).forEach(v => newRow[v.key] = '');
    updateSuite(activeSuite.id, { dataRows: [...currentRows, newRow] });
  };

  const updateDataRow = (rowIndex: number, key: string, value: string) => {
    if (!activeSuite || !activeSuite.dataRows) return;
    const newRows = [...activeSuite.dataRows];
    newRows[rowIndex] = { ...newRows[rowIndex], [key]: value };
    updateSuite(activeSuite.id, { dataRows: newRows });
  };

  const deleteDataRow = (rowIndex: number) => {
    if (!activeSuite || !activeSuite.dataRows) return;
    const newRows = activeSuite.dataRows.filter((_, i) => i !== rowIndex);
    updateSuite(activeSuite.id, { dataRows: newRows });
  };

  // --- Case Actions ---
  const addCase = (suiteId: string) => {
    const newCase: TestCase = {
        id: `case-${Date.now()}`,
        name: 'New Test Case',
        description: '',
        steps: [],
    };
    setSuites(prev => prev.map(s => {
        if (s.id !== suiteId) return s;
        return { ...s, cases: [...s.cases, newCase] };
    }));
    setActiveSuiteId(suiteId);
    setActiveCaseId(newCase.id);
    // Auto Enter Edit Mode
    setEditingCaseId(newCase.id);
    setEditCaseName('New Test Case');
  };

  const updateCase = (updates: Partial<TestCase>) => {
    if (!activeSuiteId || !activeCaseId) return;
    setSuites(prev => prev.map(s => {
      if (s.id !== activeSuiteId) return s;
      return {
        ...s,
        cases: s.cases.map(c => c.id === activeCaseId ? { ...c, ...updates } : c)
      };
    }));
  };

  const updateCaseSpecific = (suiteId: string, caseId: string, updates: Partial<TestCase>) => {
    setSuites(prev => prev.map(s => {
        if (s.id !== suiteId) return s;
        return {
            ...s,
            cases: s.cases.map(c => c.id === caseId ? { ...c, ...updates } : c)
        };
    }));
  };

  const saveCaseName = (suiteId: string) => {
      if (editingCaseId) {
          updateCaseSpecific(suiteId, editingCaseId, { name: editCaseName });
          setEditingCaseId(null);
      }
  };

  const deleteCase = (suiteId: string, caseId: string) => {
    // Immediate deletion without confirmation
    setSuites(prev => prev.map(s => {
        if (s.id !== suiteId) return s;
        return { ...s, cases: s.cases.filter(c => c.id !== caseId) };
    }));
    if (activeCaseId === caseId) setActiveCaseId('');
  };

  // --- Step Actions ---
  const addStep = () => {
    if (!activeCase) return;
    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      action: 'CLICK',
      target: '',
      data: '',
      description: ''
    };
    updateCase({ steps: [...activeCase.steps, newStep] });
  };

  const updateStep = (stepId: string, updates: Partial<TestStep>) => {
    if (!activeCase) return;
    updateCase({
      steps: activeCase.steps.map(s => s.id === stepId ? { ...s, ...updates } : s)
    });
  };

  const deleteStep = (stepId: string) => {
    if (!activeCase) return;
    updateCase({
      steps: activeCase.steps.filter(s => s.id !== stepId)
    });
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (!activeCase) return;
    if (toIndex < 0 || toIndex >= activeCase.steps.length) return;
    
    const newSteps = [...activeCase.steps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);
    
    updateCase({ steps: newSteps });
  };

  const insertVariable = (stepId: string, field: 'target' | 'data', variableKey: string, paramName?: string) => {
    if (!activeCase) return;
    const step = activeCase.steps.find(s => s.id === stepId);
    if (!step) return;
    
    if (paramName && field === 'data') {
         // Handle JSON structure update for Module Params
         let dataObj: Record<string, string> = {};
         try {
             dataObj = JSON.parse(step.data || '{}');
         } catch (e) {}
         
         const currentVal = dataObj[paramName] || '';
         const newVal = `${currentVal}\${${variableKey}}`;
         
         dataObj[paramName] = newVal;
         updateStep(stepId, { data: JSON.stringify(dataObj) });
    } else {
        // Standard field update
        const currentValue = field === 'target' ? step.target : step.data;
        const newValue = `${currentValue}\${${variableKey}}`;
        updateStep(stepId, { [field]: newValue });
    }
    setVariableMenuOpen(null);
  };

  const updateModuleParam = (stepId: string, currentDataJSON: string, paramKey: string, newValue: string) => {
     let dataObj = {};
     try {
         dataObj = JSON.parse(currentDataJSON || '{}');
     } catch (e) {
         // ignore
     }
     dataObj = { ...dataObj, [paramKey]: newValue };
     updateStep(stepId, { data: JSON.stringify(dataObj) });
  };

  const handleAiGeneration = async () => {
    if (!activeCase || !activeProject) {
        alert("Please ensure a project is selected and elements are defined.");
        return;
    }
    setGenerating(true);
    const steps = await generateStepsFromDescription(activeCase.description, activeProject);
    if (steps.length > 0) {
      updateCase({ steps: [...activeCase.steps, ...steps] });
    }
    setGenerating(false);
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.drag-handle')) {
        return;
    }
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

  const closeAllMenus = () => {
      setVariableMenuOpen(null);
      setElementMenuOpen(null);
  };

  // Helper for Action Styling
  const getActionColorClass = (action: ActionType) => {
     if (action === 'RUN_MODULE') return 'bg-purple-100 text-purple-800 border-purple-300';
     if (action.startsWith('ASSERT')) return 'bg-orange-50 text-orange-700 border-orange-200';
     if (action.startsWith('API')) return 'bg-sky-50 text-sky-700 border-sky-200';
     if (action === 'WAIT') return 'bg-gray-100 text-gray-700 border-gray-200';
     return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  return (
    <div className="h-full flex overflow-hidden bg-gray-50 relative">
      {(elementMenuOpen || variableMenuOpen) && (
          <div className="fixed inset-0 z-40" onClick={closeAllMenus}></div>
      )}

      {/* Sidebar: Suites Explorer */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col z-10">
        {/* Project Context Selector */}
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
                    placeholder="Filter test cases..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
         </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Test Explorer</span>
                <button 
                    onClick={addSuite}
                    className="text-gray-400 hover:text-indigo-600 p-1 rounded-md hover:bg-indigo-50 transition-colors"
                    title="Add Suite"
                >
                    <Plus size={14} />
                </button>
            </div>

            <div className="space-y-0.5">
                {filteredSuites.map(suite => (
                    <div key={suite.id} className="select-none">
                        <div 
                            className={`group px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center justify-between transition-all duration-200 ${
                                activeSuiteId === suite.id && !activeCaseId
                                ? 'bg-indigo-50 text-indigo-700' 
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                            onClick={() => { setActiveSuiteId(suite.id); setActiveCaseId(''); }}
                        >
                            <div className="flex items-center gap-2 overflow-hidden w-full">
                                {activeSuiteId === suite.id ? <ChevronDown size={14} className="shrink-0 text-indigo-500" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
                                <Layers size={14} className={`shrink-0 ${activeSuiteId === suite.id ? 'text-indigo-500' : 'text-gray-400'}`} />
                                {editingSuiteId === suite.id ? (
                                    <input 
                                        className="w-full px-1 py-0.5 text-xs bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        value={editSuiteName}
                                        onChange={e => setEditSuiteName(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        onKeyDown={e => e.key === 'Enter' && saveSuiteName()}
                                        onBlur={saveSuiteName}
                                        autoFocus
                                    />
                                ) : (
                                    <span className="truncate">{suite.name}</span>
                                )}
                            </div>

                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {editingSuiteId === suite.id ? (
                                    <button onClick={(e) => { e.stopPropagation(); saveSuiteName(); }} className="p-1 text-green-600"><Check size={12}/></button>
                                ) : (
                                    <div className="flex gap-0.5 relative z-20">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingSuiteId(suite.id); setEditSuiteName(suite.name); }} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 size={12}/></button>
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                deleteSuite(suite.id); 
                                            }} 
                                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                            title="Delete Suite"
                                        >
                                            <Trash2 size={12}/>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {(activeSuiteId === suite.id || searchTerm) && (
                            <div className="ml-3 pl-3 border-l border-gray-100 my-1 space-y-0.5">
                                {suite.cases.map(tc => (
                                    <div 
                                    key={tc.id}
                                    className={`group text-xs py-1.5 px-2 rounded-md cursor-pointer truncate transition-colors flex items-center justify-between ${activeCaseId === tc.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                                    onClick={(e) => { e.stopPropagation(); setActiveCaseId(tc.id); }}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden w-full">
                                            <FlaskConical size={12} className={activeCaseId === tc.id ? 'text-indigo-500' : 'text-gray-300'} />
                                            {editingCaseId === tc.id ? (
                                                <input 
                                                    className="w-full px-1 py-0.5 text-xs bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                    value={editCaseName}
                                                    onChange={e => setEditCaseName(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                    onKeyDown={e => e.key === 'Enter' && saveCaseName(suite.id)}
                                                    onBlur={() => saveCaseName(suite.id)}
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="truncate">{tc.name}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                             {editingCaseId === tc.id ? (
                                                <button onClick={(e) => { e.stopPropagation(); saveCaseName(suite.id); }} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check size={12}/></button>
                                            ) : (
                                                <div className="flex gap-0.5 relative z-20">
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingCaseId(tc.id); setEditCaseName(tc.name); }} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 size={12}/></button>
                                                    <button 
                                                        className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            deleteCase(suite.id, tc.id); 
                                                        }}
                                                        title="Delete Case"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <button 
                                    onClick={() => addCase(suite.id)}
                                    className="text-[11px] text-gray-400 hover:text-indigo-600 px-2 py-1.5 flex items-center gap-1.5 w-full hover:bg-gray-50 rounded transition-colors font-medium group"
                                >
                                    <Plus size={10} className="group-hover:scale-110 transition-transform" /> New Case
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                
                {filteredSuites.length === 0 && (
                    <div className="text-center py-8 px-4">
                        <p className="text-xs text-gray-400">No test suites found matching "{searchTerm}"</p>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Main: Step Editor */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        {activeCase ? (
          <>
            <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                <div>
                     <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5 font-medium">
                        <span className="hover:text-indigo-600 cursor-pointer transition-colors" onClick={() => setActiveCaseId('')}>{activeSuite.name}</span>
                        <ChevronRight size={12} className="text-gray-300" />
                        <span>Edit Case</span>
                     </div>
                     <input 
                        className="text-lg font-semibold text-gray-900 border-none p-0 focus:ring-0 bg-transparent placeholder-gray-400 w-full max-w-lg"
                        value={activeCase.name}
                        onChange={(e) => updateCase({ name: e.target.value })}
                        placeholder="Untitled Test Case"
                    />
                </div>
                <div className="flex gap-2">
                     <button 
                         onClick={() => onRunCase(activeSuite.id, activeCase.id)}
                         className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md flex items-center gap-2 transition-colors"
                     >
                         <Play size={14} /> Run
                     </button>
                     <button 
                         onClick={() => deleteCase(activeSuite.id, activeCase.id)}
                         className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-md flex items-center gap-2 transition-colors shadow-sm"
                     >
                         <Trash2 size={14} /> Delete
                     </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50">
                <div className="flex flex-col min-h-full">
                    
                    {/* Top Controls: Description */}
                    <div className="px-6 py-6 space-y-4">
                         {/* Description & AI */}
                         <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Sparkles size={14} className="text-purple-500" />
                            </div>
                            <input 
                                className="w-full pl-9 pr-24 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder-gray-400 shadow-sm transition-all"
                                value={activeCase.description}
                                onChange={(e) => updateCase({ description: e.target.value })}
                                placeholder="Describe the test flow to generate steps (e.g., 'Login with valid user')..."
                            />
                            <div className="absolute right-1.5 top-1.5 bottom-1.5">
                                <button 
                                    onClick={handleAiGeneration}
                                    disabled={generating || !activeCase.description || !currentProjectId}
                                    className="h-full px-3 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-medium rounded-md flex items-center gap-1.5 disabled:opacity-50 transition-colors border border-purple-200"
                                    title={!currentProjectId ? "Select a project first" : ""}
                                >
                                    <Wand2 size={12} className={generating ? 'animate-spin' : ''} />
                                    {generating ? 'Generating...' : 'Generate Steps'}
                                </button>
                            </div>
                         </div>
                    </div>

                    {/* Steps List */}
                    <div className="px-6 pb-6 flex-1 space-y-3">
                         <div className="grid grid-cols-12 gap-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4">
                            <div className="col-span-1 text-center">Step</div>
                            <div className="col-span-2">Action</div>
                            <div className="col-span-4">Target / Module</div>
                            <div className="col-span-4">Value / Data</div>
                            <div className="col-span-1"></div>
                         </div>
                         
                         {activeCase.steps.map((step, index) => (
                           <div 
                                key={step.id} 
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                className={`group bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-indigo-300 hover:shadow-md transition-all relative ${elementMenuOpen === step.id ? 'z-50 border-indigo-300 ring-2 ring-indigo-500/20' : 'z-auto'} ${draggedStepIndex === index ? 'opacity-50 ring-2 ring-indigo-300 border-indigo-400' : ''}`}
                           >
                              <div className="grid grid-cols-12 gap-4 items-center">
                                  {/* Drag Handle & Index */}
                                  <div className="col-span-1 flex justify-center text-gray-300 cursor-grab active:cursor-grabbing group-hover:text-gray-400 flex items-center justify-center drag-handle hover:bg-gray-50 rounded-md py-1 transition-colors relative">
                                     <GripVertical size={16} className="mr-1 text-gray-400" />
                                     
                                     {/* Manual Step Reordering via Dropdown */}
                                     <div className="relative">
                                        <select 
                                            className="appearance-none w-5 h-5 bg-gray-50 rounded-full text-xs font-mono font-medium text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-indigo-600 hover:bg-indigo-100 transition-colors"
                                            value={index}
                                            onChange={(e) => moveStep(index, parseInt(e.target.value))}
                                            onMouseDown={(e) => e.stopPropagation()} 
                                        >
                                            {activeCase.steps.map((_, i) => (
                                                <option key={i} value={i}>{i + 1}</option>
                                            ))}
                                        </select>
                                     </div>
                                  </div>
                                  <div className="col-span-2">
                                    <select 
                                      className={`w-full text-[11px] font-bold rounded-md border px-2 py-1.5 focus:ring-2 focus:ring-opacity-50 outline-none uppercase cursor-pointer transition-colors ${getActionColorClass(step.action)}`}
                                      value={step.action}
                                      onChange={(e) => updateStep(step.id, { action: e.target.value as ActionType, target: '', data: '' })}
                                    >
                                      {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                  
                                  <div className="col-span-4 relative">
                                    {step.action === 'RUN_MODULE' ? (
                                        <div className="relative">
                                            <Workflow className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500" size={14} />
                                            <select
                                                className="w-full bg-purple-50 text-xs text-purple-900 rounded-md border border-purple-200 pl-8 pr-3 py-1.5 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all cursor-pointer appearance-none"
                                                value={step.target}
                                                onChange={(e) => updateStep(step.id, { target: e.target.value })}
                                            >
                                                <option value="">Select a Module...</option>
                                                {activeProject?.modules.map(mod => (
                                                    <option key={mod.id} value={mod.id}>{mod.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none" size={12} />
                                        </div>
                                    ) : step.action.startsWith('API_') ? (
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Endpoint</label>
                                                <div className="relative">
                                                    <Globe className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={10} />
                                                    <select 
                                                        className="w-full bg-white text-[10px] border border-gray-200 rounded pl-6 pr-6 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none appearance-none cursor-pointer text-gray-700 font-medium"
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
                                                        className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-1.5 font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder-gray-300 pr-8"
                                                        value={step.target}
                                                        onChange={(e) => updateStep(step.id, { target: e.target.value })}
                                                        placeholder={step.endpointId ? '/v1/users' : 'https://api.example.com/v1/users'}
                                                    />
                                                    <button 
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 p-1 rounded"
                                                        onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'target' ? null : { stepId: step.id, field: 'target' }); }}
                                                        title="Insert Variable"
                                                    >
                                                        <Braces size={12} />
                                                    </button>
                                                    
                                                    {/* Variable Autocomplete Dropdown - Target */}
                                                    {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'target' && (
                                                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Variable</div>
                                                            {(activeSuite.variables || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No variables defined in suite</div>}
                                                            {(activeSuite.variables || []).map(v => (
                                                                <button 
                                                                    key={v.id}
                                                                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 font-mono flex items-center justify-between group"
                                                                    onClick={() => insertVariable(step.id, 'target', v.key)}
                                                                >
                                                                    <span>{v.key}</span>
                                                                    <span className="text-gray-400 text-[10px] truncate max-w-[100px] group-hover:text-indigo-400">{v.value}</span>
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
                                              className="w-full bg-white text-xs text-indigo-700 font-medium rounded-md border border-gray-200 px-3 py-1.5 font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none placeholder-gray-300 transition-all pr-8"
                                              value={step.target}
                                              onChange={(e) => updateStep(step.id, { target: e.target.value })}
                                              onFocus={() => { setElementMenuOpen(step.id); setVariableMenuOpen(null); }}
                                              placeholder={activeProject ? "Select Element..." : "Select Project First"}
                                              disabled={!activeProject}
                                            />
                                            
                                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                                                {!step.target && <Search size={12} className="text-gray-300 pointer-events-none mr-1" />}
                                                <button 
                                                    className="text-gray-400 hover:text-indigo-600 p-1 rounded"
                                                    onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'target' ? null : { stepId: step.id, field: 'target' }); setElementMenuOpen(null); }}
                                                    title="Insert Variable"
                                                >
                                                    <Braces size={12} />
                                                </button>
                                            </div>

                                            {/* Grouped Element Dropdown */}
                                            {elementMenuOpen === step.id && (
                                                <div 
                                                    className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-xl z-50 animate-in fade-in zoom-in-95 duration-75"
                                                    onMouseDown={(e) => e.stopPropagation()} 
                                                >
                                                     {activeProject?.pages.map(page => {
                                                         const matchingElements = page.elements.filter(el => {
                                                             const query = step.target.toLowerCase();
                                                             const full = `${page.name}/${el.name}`.toLowerCase();
                                                             if (!query) return true;
                                                             return full.includes(query) || page.name.toLowerCase().includes(query) || el.name.toLowerCase().includes(query);
                                                         });

                                                         if (matchingElements.length === 0) return null;

                                                         return (
                                                             <div key={page.id}>
                                                                 <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 bg-gray-50 border-y border-gray-100 uppercase tracking-wider sticky top-0 z-10 flex items-center gap-1">
                                                                    <Layers size={10} />
                                                                    {page.name}
                                                                 </div>
                                                                 {matchingElements.map(el => (
                                                                     <div
                                                                        key={el.id}
                                                                        className="px-4 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center gap-2 group/item transition-colors"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            updateStep(step.id, { target: `${page.name}/${el.name}` });
                                                                            setElementMenuOpen(null);
                                                                        }}
                                                                     >
                                                                        <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${el.selectorType === 'XPath' ? 'bg-purple-400' : 'bg-indigo-400'}`}></div>
                                                                        <span className="font-medium">{el.name}</span>
                                                                        <span className="ml-auto text-[10px] text-gray-400 group-hover/item:text-indigo-400 font-mono truncate max-w-[80px]">{el.selectorType}</span>
                                                                     </div>
                                                                 ))}
                                                             </div>
                                                         )
                                                     })}
                                                     {activeProject?.pages.length === 0 && (
                                                         <div className="p-4 text-center text-gray-400 text-xs">No pages in project.</div>
                                                     )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {/* Variable Autocomplete Dropdown - Target */}
                                    {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'target' && (
                                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Variable</div>
                                            {(activeSuite.variables || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No variables defined in suite</div>}
                                            {(activeSuite.variables || []).map(v => (
                                                <button 
                                                    key={v.id}
                                                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 font-mono flex items-center justify-between group"
                                                    onClick={() => insertVariable(step.id, 'target', v.key)}
                                                >
                                                    <span>{v.key}</span>
                                                    <span className="text-gray-400 text-[10px] truncate max-w-[100px] group-hover:text-indigo-400">{v.value}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                  </div>
                                  <div className="col-span-4 relative">
                                    {step.action === 'RUN_MODULE' ? (
                                        <div className="bg-purple-50 rounded-md border border-purple-100 p-2 space-y-2">
                                            {(() => {
                                                const selectedModule = activeProject?.modules.find(m => m.id === step.target);
                                                if (!selectedModule) return <div className="text-[10px] text-gray-400 italic">Select a module to configure parameters</div>;
                                                
                                                if (!selectedModule.params || selectedModule.params.length === 0) {
                                                    return <div className="text-[10px] text-gray-400 italic flex items-center gap-1"><Check size={10}/> No input parameters required</div>
                                                }

                                                let currentValues: Record<string, string> = {};
                                                try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                                return selectedModule.params.map(param => (
                                                    <div key={param.id} className="flex items-center gap-2">
                                                        <label className="text-[10px] font-mono font-medium text-purple-700 w-16 truncate text-right shrink-0" title={param.name}>{param.name}</label>
                                                        <div className="relative flex-1">
                                                            <input 
                                                                className="w-full bg-white border border-purple-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none"
                                                                placeholder={param.defaultValue || '(Optional)'}
                                                                value={currentValues[param.name] || ''}
                                                                onChange={(e) => updateModuleParam(step.id, step.data, param.name, e.target.value)}
                                                            />
                                                            <button 
                                                                className="absolute right-1 top-1/2 -translate-y-1/2 text-purple-300 hover:text-purple-600 p-0.5 rounded"
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    setVariableMenuOpen(
                                                                        variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === param.name 
                                                                        ? null 
                                                                        : { stepId: step.id, field: 'data', paramName: param.name }
                                                                    );
                                                                }}
                                                            >
                                                                <Braces size={10} />
                                                            </button>

                                                            {/* Dropdown for Module Params */}
                                                            {variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === param.name && (
                                                                <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Variable</div>
                                                                    {(activeSuite.variables || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No variables defined</div>}
                                                                    {(activeSuite.variables || []).map(v => (
                                                                        <button 
                                                                            key={v.id}
                                                                            className="w-full text-left px-3 py-1.5 hover:bg-purple-50 hover:text-purple-700 font-mono flex items-center justify-between group"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                insertVariable(step.id, 'data', v.key, param.name);
                                                                            }}
                                                                        >
                                                                            <span>{v.key}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    ) : step.action.startsWith('API_') ? (
                                        <div className="space-y-2">
                                            {/* Configuration Row */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Headers</label>
                                                    <div className="relative">
                                                        <select 
                                                            className="w-full bg-white text-[10px] border border-gray-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none appearance-none cursor-pointer text-gray-700 font-medium"
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
                                                            className="w-full bg-white text-[10px] border border-gray-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none appearance-none cursor-pointer text-gray-700 font-medium"
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
                                            
                                            {/* Dynamic Variable Inputs for Header & Body */}
                                            {(step.headerProfileId || step.bodyTemplateId) ? (
                                                <div className="bg-gray-50 rounded-md border border-gray-200 p-2 space-y-3">
                                                    {/* Header Variables */}
                                                    {(() => {
                                                        const profile = headers.find(h => h.id === step.headerProfileId);
                                                        if (!profile) return null;
                                                        
                                                        // Extract variables from header values: {{VAR_NAME}}
                                                        const headerVars = new Set<string>();
                                                        profile.headers.forEach(h => {
                                                            const matches = h.value.match(/\{\{([^}]+)\}\}/g);
                                                            if (matches) {
                                                                matches.forEach(m => headerVars.add(m.replace(/\{\{|\}\}/g, '')));
                                                            }
                                                        });

                                                        if (headerVars.size === 0) return null;

                                                        let currentValues: Record<string, string> = {};
                                                        try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                                        return (
                                                            <div>
                                                                <div className="text-[9px] font-bold text-indigo-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileText size={10}/> Header Variables</div>
                                                                <div className="space-y-1.5">
                                                                    {Array.from(headerVars).map(varName => (
                                                                        <div key={`header-${varName}`} className="flex items-center gap-2">
                                                                            <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                            <div className="relative flex-1">
                                                                                <input 
                                                                                    className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 outline-none"
                                                                                    placeholder="Value"
                                                                                    value={currentValues[varName] || ''}
                                                                                    onChange={(e) => {
                                                                                        const newData = { ...currentValues, [varName]: e.target.value };
                                                                                        updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                    }}
                                                                                />
                                                                                <button 
                                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-indigo-600 p-0.5 rounded"
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
                                                                                {/* Variable Dropdown */}
                                                                                {variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === varName && (
                                                                                    <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                                        <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                                                                        {(activeSuite.variables || []).map(v => (
                                                                                            <button 
                                                                                                key={v.id}
                                                                                                className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 font-mono flex items-center justify-between group"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const newData = { ...currentValues, [varName]: `\${${v.key}}` };
                                                                                                    updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                                    setVariableMenuOpen(null);
                                                                                                }}
                                                                                            >
                                                                                                <span>{v.key}</span>
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
                                                        
                                                        // Extract variables from body content: {{VAR_NAME}}
                                                        const bodyVars = new Set<string>();
                                                        const matches = template.content.match(/\{\{([^}]+)\}\}/g);
                                                        if (matches) {
                                                            matches.forEach(m => bodyVars.add(m.replace(/\{\{|\}\}/g, '')));
                                                        }

                                                        if (bodyVars.size === 0) return null;

                                                        let currentValues: Record<string, string> = {};
                                                        try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                                        return (
                                                            <div>
                                                                <div className="text-[9px] font-bold text-indigo-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileCode size={10}/> Body Variables</div>
                                                                <div className="space-y-1.5">
                                                                    {Array.from(bodyVars).map(varName => (
                                                                        <div key={`body-${varName}`} className="flex items-center gap-2">
                                                                            <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                            <div className="relative flex-1">
                                                                                <input 
                                                                                    className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 outline-none"
                                                                                    placeholder="Value"
                                                                                    value={currentValues[varName] || ''}
                                                                                    onChange={(e) => {
                                                                                        const newData = { ...currentValues, [varName]: e.target.value };
                                                                                        updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                    }}
                                                                                />
                                                                                <button 
                                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-indigo-600 p-0.5 rounded"
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
                                                                                {/* Variable Dropdown */}
                                                                                {variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === varName && (
                                                                                    <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                                        <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                                                                        {(activeSuite.variables || []).map(v => (
                                                                                            <button 
                                                                                                key={v.id}
                                                                                                className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 font-mono flex items-center justify-between group"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const newData = { ...currentValues, [varName]: `\${${v.key}}` };
                                                                                                    updateStep(step.id, { data: JSON.stringify(newData) });
                                                                                                    setVariableMenuOpen(null);
                                                                                                }}
                                                                                            >
                                                                                                <span>{v.key}</span>
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
                                                    className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-2 font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder-gray-300 min-h-[60px] resize-y"
                                                    value={step.data}
                                                    onChange={(e) => updateStep(step.id, { data: e.target.value })}
                                                    placeholder="Request Body (JSON)"
                                                    />
                                                    <button 
                                                        className="absolute right-1 top-2 text-gray-400 hover:text-indigo-600 p-1 rounded"
                                                        onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' ? null : { stepId: step.id, field: 'data' }); setElementMenuOpen(null); }}
                                                        title="Insert Variable"
                                                    >
                                                        <Braces size={12} />
                                                    </button>

                                                    {/* Variable Autocomplete Dropdown - Data */}
                                                    {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && !variableMenuOpen.paramName && (
                                                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Variable</div>
                                                            {(activeSuite.variables || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No variables defined in suite</div>}
                                                            {(activeSuite.variables || []).map(v => (
                                                                <button 
                                                                    key={v.id}
                                                                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 font-mono flex items-center justify-between group"
                                                                    onClick={() => insertVariable(step.id, 'data', v.key)}
                                                                >
                                                                    <span>{v.key}</span>
                                                                    <span className="text-gray-400 text-[10px] truncate max-w-[100px] group-hover:text-indigo-400">{v.value}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <input 
                                              className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-1.5 font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder-gray-300 pr-8"
                                              value={step.data}
                                              onChange={(e) => updateStep(step.id, { data: e.target.value })}
                                              placeholder={step.action.includes('ASSERT') ? 'Expected Value' : 'Input Data'}
                                            />
                                            <button 
                                                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 p-1 rounded"
                                                onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' ? null : { stepId: step.id, field: 'data' }); setElementMenuOpen(null); }}
                                                title="Insert Variable"
                                            >
                                                <Braces size={12} />
                                            </button>

                                            {/* Variable Autocomplete Dropdown - Data */}
                                            {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && (
                                                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Variable</div>
                                                    {(activeSuite.variables || []).length === 0 && <div className="px-2 py-2 text-gray-400 italic">No variables defined in suite</div>}
                                                    {(activeSuite.variables || []).map(v => (
                                                        <button 
                                                            key={v.id}
                                                            className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 font-mono flex items-center justify-between group"
                                                            onClick={() => insertVariable(step.id, 'data', v.key)}
                                                        >
                                                            <span>{v.key}</span>
                                                            <span className="text-gray-400 text-[10px] truncate max-w-[100px] group-hover:text-indigo-400">{v.value}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                  </div>
                                  <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                     <button onClick={() => deleteStep(step.id)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                       <Trash2 size={14} />
                                     </button>
                                  </div>
                              </div>
                              
                              {/* Step Description Row */}
                              <div className="mt-2 pl-9 pr-8">
                                 <div className="relative">
                                    <input 
                                        className="w-full bg-transparent border-b border-dashed border-gray-200 focus:border-indigo-300 text-[11px] text-gray-500 placeholder-gray-300 focus:bg-gray-50/50 outline-none transition-all py-1 px-1"
                                        value={step.description || ''}
                                        onChange={(e) => updateStep(step.id, { description: e.target.value })}
                                        placeholder="Add step description (optional)..."
                                    />
                                    <TextQuote size={10} className="absolute -left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                                 </div>
                              </div>
                           </div>
                         ))}

                         <button 
                          onClick={addStep}
                          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-2 text-sm font-medium mt-6 group"
                         >
                           <Plus size={16} className="group-hover:scale-110 transition-transform" /> Add New Step
                         </button>
                    </div>
                </div>
            </div>
          </>
        ) : activeSuite ? (
          /* Suite Overview Panel */
          <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
             <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                 <div className="flex items-center gap-3">
                     <Layers className="text-indigo-600" size={20} />
                     <h2 className="text-lg font-semibold text-gray-900">{activeSuite.name}</h2>
                     <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold uppercase tracking-wide">Test Suite</span>
                 </div>
                 <div className="text-xs text-gray-400 font-medium">
                     {activeSuite.cases.length} Test Cases
                 </div>
             </div>

             <div className="flex-1 p-6 bg-gray-50 overflow-hidden flex flex-col">
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6 flex-1 overflow-y-auto">
                     {/* 1. Basic Info */}
                     <div className="space-y-6">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">
                            <FileText size={16} className="text-gray-400" />
                            Suite Information
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Suite Name</label>
                                <input 
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder-gray-400"
                                    value={activeSuite.name}
                                    onChange={(e) => updateSuite(activeSuite.id, { name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                                <textarea 
                                    className="w-full h-24 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 resize-none"
                                    placeholder="Describe the scope and purpose of this test suite..."
                                    value={activeSuite.description || ''}
                                    onChange={(e) => updateSuite(activeSuite.id, { description: e.target.value })}
                                />
                            </div>
                        </div>
                     </div>

                     {/* 2. Global Variables */}
                     <div className="pt-6 border-t border-gray-100">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                <Variable size={16} className="text-gray-400" />
                                Suite Variables (Schema & Defaults)
                            </div>
                            <button onClick={addSuiteVariable} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium">
                                <Plus size={14} /> Add Variable
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                             {(activeSuite.variables || []).length === 0 && (
                                 <div className="text-center py-6 text-gray-400 text-xs italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                     No variables defined. Add variables to parameterize your test cases.
                                 </div>
                             )}
                             {(activeSuite.variables || []).map((variable) => (
                                 <div key={variable.id} className="flex items-center gap-3 group">
                                     <div className="flex-1 relative">
                                        <input 
                                            className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-mono font-medium text-indigo-700 focus:bg-white focus:border-indigo-500 outline-none"
                                            value={variable.key}
                                            onChange={(e) => updateSuiteVariableKey(variable.id, e.target.value)}
                                            placeholder="VAR_NAME"
                                        />
                                     </div>
                                     <span className="text-gray-300 font-mono">=</span>
                                     <div className="flex-[2] relative">
                                         <input 
                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-500 outline-none"
                                            value={variable.value}
                                            onChange={(e) => updateSuiteVariableValue(variable.id, e.target.value)}
                                            placeholder="Default Value"
                                        />
                                     </div>
                                     <button onClick={() => deleteSuiteVariable(variable.id)} className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <Trash2 size={14} />
                                     </button>
                                 </div>
                             ))}
                        </div>
                     </div>

                     {/* 3. Data Driven Execution */}
                     <div className="pt-6 border-t border-gray-100">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                <Table2 size={16} className="text-gray-400" />
                                Data Driven Execution
                            </div>
                            <button onClick={addDataRow} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium">
                                <Plus size={14} /> Add Row
                            </button>
                        </div>

                        {(activeSuite.variables || []).length === 0 ? (
                            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <p className="text-gray-500 text-xs">Define variables above to configure data-driven execution rows.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-2 w-12 text-center">#</th>
                                            {(activeSuite.variables || []).map(v => (
                                                <th key={v.id} className="px-4 py-2 border-l border-gray-200 font-mono text-indigo-600">{v.key}</th>
                                            ))}
                                            <th className="px-2 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(activeSuite.dataRows || []).map((row, rowIndex) => (
                                            <tr key={rowIndex} className="group hover:bg-gray-50/50">
                                                <td className="px-4 py-2 text-center text-gray-400 font-mono">{rowIndex + 1}</td>
                                                {(activeSuite.variables || []).map(v => (
                                                    <td key={v.id} className="px-2 py-1 border-l border-gray-100">
                                                        <input 
                                                            className="w-full bg-transparent border-none focus:ring-0 text-xs text-gray-800 placeholder-gray-300 py-1"
                                                            value={row[v.key] || ''}
                                                            onChange={(e) => updateDataRow(rowIndex, v.key, e.target.value)}
                                                            placeholder="(default)"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-2 py-1 text-center">
                                                    <button onClick={() => deleteDataRow(rowIndex)} className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <X size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {(activeSuite.dataRows || []).length === 0 && (
                                            <tr>
                                                <td colSpan={(activeSuite.variables || []).length + 2} className="px-4 py-8 text-center text-gray-400 italic">
                                                    No data rows defined. Click "Add Row" to create iterations.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                     </div>
                 </div>
             </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-4 bg-gray-50/50 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center">
               <FlaskConical size={32} className="text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">Select a test case or suite to start editing</p>
            <button onClick={() => addSuite()} className="text-xs text-indigo-600 hover:underline">Or create a new suite</button>
          </div>
        )}
      </div>
    </div>
  );
};

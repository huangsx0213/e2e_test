
import React, { useState, useMemo } from 'react';
import { TestSuite, TestCase, TestStep, Project, ActionType, SuiteVariable, HeaderProfile, BodyTemplate, ApiEndpoint } from '../types';
import { Plus, Play, ChevronDown, ChevronRight, Wand2, Trash2, FileText, FlaskConical, Edit2, Check, X, Database, Search, Sparkles, Layers, TextQuote, Variable, Table2, Braces, MousePointer2, GripVertical, Workflow, FileCode, Globe } from 'lucide-react';
import { generateStepsFromDescription } from '../services/geminiService';
import { StepList } from './StepList';
import { HelpTooltip } from './HelpTooltip';

interface TestBuilderProps {
  suites: TestSuite[];
  suitesApi: any;
  projects: Project[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  onRunCase: (suiteId: string, caseId: string) => void;
  currentProjectId: string;
}

const ACTION_TYPES: ActionType[] = [
  'OPEN', 'CLICK', 'TYPE', 'HOVER', 'SCROLL_TO', 'SELECT_OPTION', 'CHECK', 'UNCHECK', 'DRAG_AND_DROP', 'UPLOAD_FILE',
  'ASSERT_VISIBLE', 'ASSERT_HIDDEN', 'ASSERT_TEXT', 'ASSERT_VALUE',
  'EXTRACT_VAR', 'EVALUATE_JS', 'PRESS_KEY',
  'WAIT', 'API_GET', 'API_POST', 'API_PUT', 'API_DELETE', 'RUN_MODULE'
];

export const TestBuilder: React.FC<TestBuilderProps> = ({ suites, suitesApi, projects, headers, bodies, endpoints, onRunCase, currentProjectId }) => {
  const [activeSuiteId, setActiveSuiteId] = useState<string>('');
  // Default to empty to show Suite Overview first
  const [activeCaseId, setActiveCaseId] = useState<string>(''); 
  const [searchTerm, setSearchTerm] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  
  // Suite Editing State
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);
  const [editSuiteName, setEditSuiteName] = useState('');

  // Case Editing State
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editCaseName, setEditCaseName] = useState('');

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
  const addSuite = async () => {
    if (!currentProjectId) return;
    const newSuite: TestSuite = { 
        id: `suite-${Date.now()}`, 
        projectId: currentProjectId,
        name: 'New Test Suite', 
        description: '', 
        cases: [],
        variables: [],
        dataRows: []
    };
    await suitesApi.create(newSuite);
    setActiveSuiteId(newSuite.id);
    setActiveCaseId(''); // Show suite details
    // Auto Enter Edit Mode
    setEditingSuiteId(newSuite.id);
    setEditSuiteName('New Test Suite');
  };

  const saveSuiteName = async () => {
    if (editingSuiteId) {
        await suitesApi.update(editingSuiteId, { name: editSuiteName });
        setEditingSuiteId(null);
    }
  };

  const updateSuite = async (suiteId: string, updates: Partial<TestSuite>) => {
    await suitesApi.update(suiteId, updates);
  };

  const deleteSuite = async (suiteId: string) => {
      // Immediate deletion without confirmation
      await suitesApi.remove(suiteId);
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
  const addCase = async (suiteId: string) => {
    const newCase: TestCase = {
        id: `case-${Date.now()}`,
        name: 'New Test Case',
        description: '',
        steps: [],
    };
    const suite = suites.find(s => s.id === suiteId);
    if (suite) {
        await suitesApi.update(suiteId, { cases: [...suite.cases, newCase] });
    }
    setActiveSuiteId(suiteId);
    setActiveCaseId(newCase.id);
    // Auto Enter Edit Mode
    setEditingCaseId(newCase.id);
    setEditCaseName('New Test Case');
  };

  const updateCase = async (updates: Partial<TestCase>) => {
    if (!activeSuiteId || !activeCaseId) return;
    const suite = suites.find(s => s.id === activeSuiteId);
    if (suite) {
        const newCases = suite.cases.map(c => c.id === activeCaseId ? { ...c, ...updates } : c);
        await suitesApi.update(activeSuiteId, { cases: newCases });
    }
  };

  const updateCaseSpecific = async (suiteId: string, caseId: string, updates: Partial<TestCase>) => {
    const suite = suites.find(s => s.id === suiteId);
    if (suite) {
        const newCases = suite.cases.map(c => c.id === caseId ? { ...c, ...updates } : c);
        await suitesApi.update(suiteId, { cases: newCases });
    }
  };

  const saveCaseName = async (suiteId: string) => {
      if (editingCaseId) {
          await updateCaseSpecific(suiteId, editingCaseId, { name: editCaseName });
          setEditingCaseId(null);
      }
  };

  const deleteCase = async (suiteId: string, caseId: string) => {
    // Immediate deletion without confirmation
    const suite = suites.find(s => s.id === suiteId);
    if (suite) {
        const newCases = suite.cases.filter(c => c.id !== caseId);
        await suitesApi.update(suiteId, { cases: newCases });
    }
    if (activeCaseId === caseId) setActiveCaseId('');
  };

  const createStepHandler = (
    getItems: () => TestStep[] | undefined,
    updateItems: (items: TestStep[]) => void
  ) => {
    return {
      add: (action: ActionType = 'CLICK') => {
        const newStep: TestStep = {
          id: `step-${Date.now()}`,
          action,
          target: '',
          data: '',
          description: ''
        };
        updateItems([...(getItems() || []), newStep]);
      },
      update: (stepId: string, updates: Partial<TestStep>) => {
        updateItems((getItems() || []).map(s => s.id === stepId ? { ...s, ...updates } : s));
      },
      delete: (stepId: string) => {
        updateItems((getItems() || []).filter(s => s.id !== stepId));
      },
      duplicate: (step: TestStep) => {
        const items = getItems() || [];
        const index = items.findIndex(s => s.id === step.id);
        if (index === -1) return;
        const newStep: TestStep = {
          ...step,
          id: `step-${Date.now()}`
        };
        const newSteps = [...items];
        newSteps.splice(index + 1, 0, newStep);
        updateItems(newSteps);
      },
      move: (fromIndex: number, toIndex: number) => {
        const items = getItems() || [];
        if (toIndex < 0 || toIndex >= items.length) return;
        const newSteps = [...items];
        const [movedStep] = newSteps.splice(fromIndex, 1);
        newSteps.splice(toIndex, 0, movedStep);
        updateItems(newSteps);
      }
    };
  };

  const caseSteps = createStepHandler(() => activeCase?.steps, steps => updateCase({ steps }));
  const caseSetupSteps = createStepHandler(() => activeCase?.setupSteps, setupSteps => updateCase({ setupSteps }));
  const caseTeardownSteps = createStepHandler(() => activeCase?.teardownSteps, teardownSteps => updateCase({ teardownSteps }));
  
  const suiteSetupSteps = createStepHandler(() => activeSuite?.setupSteps, setupSteps => suitesApi.update(activeSuiteId, { setupSteps }));
  const suiteTeardownSteps = createStepHandler(() => activeSuite?.teardownSteps, teardownSteps => suitesApi.update(activeSuiteId, { teardownSteps }));

  const handleAiGeneration = async () => {
    if (!activeCase || !activeProject) {
        setGenError("Please ensure a project is selected and elements are defined.");
        setTimeout(() => setGenError(null), 3000);
        return;
    }
    setGenerating(true);
    const steps = await generateStepsFromDescription(activeCase.description, activeProject);
    if (steps.length > 0) {
      updateCase({ steps: [...activeCase.steps, ...steps] });
    }
    setGenerating(false);
  };

  return (
    <div className="h-full flex overflow-hidden bg-gray-50 relative">
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
         </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center">
                  Test Explorer
                  <HelpTooltip content="Organize your tests into suites and cases. Generate steps using AI or build them manually." />
                </span>
                <button 
                    onClick={addSuite}
                    className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
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
                                ? 'bg-blue-50 text-blue-700' 
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                            onClick={() => { 
                                if (activeSuiteId === suite.id && !activeCaseId) {
                                    setActiveSuiteId('');
                                } else {
                                    setActiveSuiteId(suite.id); 
                                    setActiveCaseId(''); 
                                }
                            }}
                        >
                            <div className="flex items-center gap-2 overflow-hidden w-full">
                                {activeSuiteId === suite.id ? <ChevronDown size={14} className="shrink-0 text-blue-500" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
                                <Layers size={14} className={`shrink-0 ${activeSuiteId === suite.id ? 'text-blue-500' : 'text-gray-400'}`} />
                                {editingSuiteId === suite.id ? (
                                    <input 
                                        className="w-full px-1 py-0.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                        <button onClick={(e) => { e.stopPropagation(); addCase(suite.id); }} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Add Test Case"><Plus size={12}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); setEditingSuiteId(suite.id); setEditSuiteName(suite.name); }} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={12}/></button>
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
                                    className={`group text-xs py-1.5 px-2 rounded-md cursor-pointer truncate transition-colors flex items-center justify-between ${activeCaseId === tc.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                                    onClick={(e) => { e.stopPropagation(); setActiveCaseId(tc.id); }}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden w-full">
                                            <FlaskConical size={12} className={activeCaseId === tc.id ? 'text-blue-500' : 'text-gray-300'} />
                                            {editingCaseId === tc.id ? (
                                                <input 
                                                    className="w-full px-1 py-0.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingCaseId(tc.id); setEditCaseName(tc.name); }} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={12}/></button>
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
                                    className="text-[11px] text-gray-400 hover:text-blue-600 px-2 py-1.5 flex items-center gap-1.5 w-full hover:bg-gray-50 rounded transition-colors font-medium group"
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
                        <span className="hover:text-blue-600 cursor-pointer transition-colors" onClick={() => setActiveCaseId('')}>{activeSuite.name}</span>
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
                                <Sparkles size={14} className="text-blue-500" />
                            </div>
                            <input 
                                className="w-full pl-9 pr-24 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-400 shadow-sm transition-all"
                                value={activeCase.description}
                                onChange={(e) => updateCase({ description: e.target.value })}
                                placeholder="Describe the test flow to generate steps (e.g., 'Login with valid user')..."
                            />
                            <div className="absolute right-1.5 top-1.5 bottom-1.5">
                                <button 
                                    onClick={handleAiGeneration}
                                    disabled={generating || !activeCase.description || !currentProjectId}
                                    className="h-full px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-md flex items-center gap-1.5 disabled:opacity-50 transition-colors border border-blue-200"
                                    title={!currentProjectId ? "Select a project first" : ""}
                                >
                                    <Wand2 size={12} className={generating ? 'animate-spin' : ''} />
                                    {generating ? 'Generating...' : 'Generate Steps'}
                                </button>
                            </div>
                         </div>
                         {genError && (
                             <div className="text-xs text-red-500 mt-1">{genError}</div>
                         )}
                    </div>

                    {/* Steps Container */}
                    <div className="px-6 pb-6 flex-1 flex flex-col gap-4">
                        {/* Setup Steps */}
                        <StepList
                            title="Setup Steps"
                            defaultExpanded={(activeCase.setupSteps?.length || 0) > 0}
                            steps={activeCase.setupSteps || []}
                            onUpdateStep={caseSetupSteps.update}
                            onDeleteStep={caseSetupSteps.delete}
                            onDuplicateStep={caseSetupSteps.duplicate}
                            onMoveStep={caseSetupSteps.move}
                            onAddStep={caseSetupSteps.add}
                            activeProject={activeProject}
                            variables={activeSuite.variables}
                            endpoints={endpoints}
                            headers={headers}
                            bodies={bodies}
                        />

                        {/* Steps List */}
                        <StepList
                            title="Test Steps"
                            defaultExpanded={true}
                            steps={activeCase.steps}
                            onUpdateStep={caseSteps.update}
                            onDeleteStep={caseSteps.delete}
                            onDuplicateStep={caseSteps.duplicate}
                            onMoveStep={caseSteps.move}
                            onAddStep={caseSteps.add}
                            activeProject={activeProject}
                            variables={activeSuite.variables}
                            endpoints={endpoints}
                            headers={headers}
                            bodies={bodies}
                        />

                        {/* Teardown Steps */}
                        <StepList
                            title="Teardown Steps"
                            defaultExpanded={(activeCase.teardownSteps?.length || 0) > 0}
                            steps={activeCase.teardownSteps || []}
                            onUpdateStep={caseTeardownSteps.update}
                            onDeleteStep={caseTeardownSteps.delete}
                            onDuplicateStep={caseTeardownSteps.duplicate}
                            onMoveStep={caseTeardownSteps.move}
                            onAddStep={caseTeardownSteps.add}
                            activeProject={activeProject}
                            variables={activeSuite.variables}
                            endpoints={endpoints}
                            headers={headers}
                            bodies={bodies}
                        />
                    </div>
                </div>
            </div>
          </>
        ) : activeSuite ? (
          /* Suite Overview Panel */
          <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
             <div className="h-14 px-6 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                 <div className="flex items-center gap-3">
                     <Layers className="text-blue-600" size={20} />
                     <h2 className="text-lg font-semibold text-gray-900">{activeSuite.name}</h2>
                     <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold uppercase tracking-wide">Test Suite</span>
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
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                    value={activeSuite.name}
                                    onChange={(e) => updateSuite(activeSuite.id, { name: e.target.value })}
                                />
                            </div>
                        </div>
                     </div>

                     {/* Suite Setup Steps */}
                     <div className="pt-6 border-t border-gray-100">
                        <StepList
                            title="Suite Setup Steps"
                            defaultExpanded={(activeSuite.setupSteps?.length || 0) > 0}
                            steps={activeSuite.setupSteps || []}
                            onUpdateStep={suiteSetupSteps.update}
                            onDeleteStep={suiteSetupSteps.delete}
                            onDuplicateStep={suiteSetupSteps.duplicate}
                            onMoveStep={suiteSetupSteps.move}
                            onAddStep={suiteSetupSteps.add}
                            activeProject={activeProject}
                            variables={activeSuite.variables}
                            endpoints={endpoints}
                            headers={headers}
                            bodies={bodies}
                        />
                     </div>

                     {/* Suite Teardown Steps */}
                     <div className="pt-6 border-t border-gray-100">
                        <StepList
                            title="Suite Teardown Steps"
                            defaultExpanded={(activeSuite.teardownSteps?.length || 0) > 0}
                            steps={activeSuite.teardownSteps || []}
                            onUpdateStep={suiteTeardownSteps.update}
                            onDeleteStep={suiteTeardownSteps.delete}
                            onDuplicateStep={suiteTeardownSteps.duplicate}
                            onMoveStep={suiteTeardownSteps.move}
                            onAddStep={suiteTeardownSteps.add}
                            activeProject={activeProject}
                            variables={activeSuite.variables}
                            endpoints={endpoints}
                            headers={headers}
                            bodies={bodies}
                        />
                     </div>

                     {/* 2. Global Variables */}
                     <div className="pt-6 border-t border-gray-100">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                <Variable size={16} className="text-gray-400" />
                                Suite Variables (Schema & Defaults)
                            </div>
                            <button onClick={addSuiteVariable} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium">
                                <Plus size={14} /> Add Variable
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                             <div className="flex items-center gap-3">
                                 <div className="flex-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider pl-1">Name</div>
                                 <span className="text-transparent font-mono">=</span>
                                 <div className="flex-[2] text-[10px] font-semibold text-gray-500 uppercase tracking-wider pl-1">Default Value</div>
                                 <div className="w-[22px]"></div>
                             </div>
                             {(activeSuite.variables || []).length === 0 && (
                                 <div className="text-center py-6 text-gray-400 text-xs italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                     No variables defined. Add variables to parameterize your test cases.
                                 </div>
                             )}
                             {(activeSuite.variables || []).map((variable) => (
                                 <div key={variable.id} className="flex items-center gap-3 group">
                                     <div className="flex-1 relative">
                                        <input 
                                            className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-mono font-medium text-blue-700 focus:bg-white focus:border-blue-500 outline-none"
                                            value={variable.key}
                                            onChange={(e) => updateSuiteVariableKey(variable.id, e.target.value)}
                                            placeholder="VAR_NAME"
                                        />
                                     </div>
                                     <span className="text-gray-300 font-mono">=</span>
                                     <div className="flex-[2] relative">
                                         <input 
                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 outline-none"
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
                            <button onClick={addDataRow} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium">
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
                                                <th key={v.id} className="px-4 py-2 border-l border-gray-200 font-mono text-blue-600">{v.key}</th>
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
            <button onClick={() => addSuite()} className="text-xs text-blue-600 hover:underline">Or create a new suite</button>
          </div>
        )}
      </div>
    </div>
  );
};

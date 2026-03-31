import React, { useState } from 'react';
import { TestStep, Project, ActionType, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint } from '@/shared/types';
import { GripVertical, Trash2, FileText, FileCode, Braces, MousePointer2, Workflow, Globe, ChevronDown, ChevronRight, Plus, Copy, Camera, Power, PowerOff } from 'lucide-react';

interface StepListProps {
    title?: string;
    steps: TestStep[];
    onUpdateStep: (id: string, updates: Partial<TestStep>) => void;
    onDeleteStep: (id: string) => void;
    onDuplicateStep?: (step: TestStep) => void;
    onMoveStep: (fromIndex: number, toIndex: number) => void;
    onAddStep?: (action?: ActionType) => void;
    defaultExpanded?: boolean;
    activeProject: Project;
    variables?: { id: string, key: string, value?: string }[];
    endpoints: ApiEndpoint[];
    headers: HeaderProfile[];
    bodies: BodyTemplate[];
}

const ACTION_TYPES: ActionType[] = [
    'OPEN', 'CLICK', 'TYPE', 'HOVER', 'HIGHLIGHT', 'SCROLL_TO', 'SELECT_OPTION', 'CHECK', 'UNCHECK', 'DRAG_AND_DROP', 'UPLOAD_FILE',
    'ASSERT_VISIBLE', 'ASSERT_INVISIBLE', 'ASSERT_TEXT', 'ASSERT_VALUE', 'ASSERT_URL', 'ASSERT_TITLE', 'ASSERT_DISABLED',
    'EXTRACT_VAR', 'EVALUATE_JS', 'PRESS_KEY', 'CLEAR',
    'WAIT', 'WAIT_FOR_VISIBLE', 'WAIT_FOR_INVISIBLE', 'API_GET', 'API_POST', 'API_PUT', 'API_DELETE', 'RUN_MODULE',
    'DOUBLE_CLICK', 'RIGHT_CLICK',
    'SWITCH_TO_WINDOW', 'SWITCH_TO_FRAME', 'ACCEPT_ALERT', 'DISMISS_ALERT',
    'ATTACH_FILE', 'TOGGLE'
];

export const StepList: React.FC<StepListProps> = ({
    title,
    steps,
    onUpdateStep,
    onDeleteStep,
    onDuplicateStep,
    onMoveStep,
    onAddStep,
    defaultExpanded = true,
    activeProject,
    variables = [],
    endpoints,
    headers,
    bodies
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
    const [elementMenuOpen, setElementMenuOpen] = useState<string | null>(null);
    const [variableMenuOpen, setVariableMenuOpen] = useState<{ stepId: string; field: 'target' | 'data'; paramName?: string } | null>(null);

    const handleDragStart = (e: React.DragEvent, index: number) => {
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
        const draggedIndexStr = e.dataTransfer.getData("text/plain");
        if (!draggedIndexStr) return;
        const draggedIndex = parseInt(draggedIndexStr, 10);
        if (isNaN(draggedIndex) || draggedIndex === dropIndex) return;
        onMoveStep(draggedIndex, dropIndex);
        setDraggedStepIndex(null);
    };

    const closeAllMenus = () => {
        setVariableMenuOpen(null);
        setElementMenuOpen(null);
    };

    const getActionColorClass = (action: ActionType) => {
        if (action === 'RUN_MODULE') return 'bg-blue-100 text-blue-800 border-blue-300';
        if (action.startsWith('API_')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
        if (action.startsWith('ASSERT_')) return 'bg-slate-100 text-slate-800 border-slate-300';
        if (action === 'WAIT') return 'bg-gray-100 text-gray-800 border-gray-300';
        return 'bg-blue-100 text-blue-800 border-blue-300';
    };

    const insertVariable = (stepId: string, field: 'target' | 'data', variableKey: string, paramName?: string) => {
        const step = steps.find(s => s.id === stepId);
        if (!step) return;

        if (paramName && field === 'data') {
            let dataObj: Record<string, string> = {};
            try { dataObj = JSON.parse(step.data || '{}'); } catch (e) { }
            const currentVal = dataObj[paramName] || '';
            const newVal = `${currentVal}{{${variableKey}}}`;
            dataObj[paramName] = newVal;
            onUpdateStep(stepId, { data: JSON.stringify(dataObj) });
        } else {
            const currentValue = (field === 'target' ? step.target : step.data) || '';
            const newValue = `${currentValue}{{${variableKey}}}`;
            onUpdateStep(stepId, { [field]: newValue });
        }
        setVariableMenuOpen(null);
    };

    const updateModuleParam = (stepId: string, currentDataJSON: string, paramKey: string, newValue: string) => {
        let dataObj = {};
        try { dataObj = JSON.parse(currentDataJSON || '{}'); } catch (e) { }
        dataObj = { ...dataObj, [paramKey]: newValue };
        onUpdateStep(stepId, { data: JSON.stringify(dataObj) });
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            {title && (
                <div
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
                        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-xs font-medium">
                            {steps.length}
                        </span>
                    </div>
                    {onAddStep && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddStep(); if (!isExpanded) setIsExpanded(true); }}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                        >
                            <Plus size={14} /> Add Step
                        </button>
                    )}
                </div>
            )}

            {isExpanded && (
                <div className="p-4" onClick={closeAllMenus}>
                    {steps.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-xs italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            No steps defined. Add steps manually or generate them using AI.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-[30px_240px_minmax(0,1fr)_minmax(0,1.2fr)_70px] gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4">
                                <div className="text-center">Step</div>
                                <div>Action</div>
                                <div>Target / Module</div>
                                <div>Value / Data</div>
                                <div></div>
                            </div>

                            {steps.map((step, index) => (
                                <div
                                    key={step.id}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    onDragEnd={(e) => {
                                        setDraggedStepIndex(null);
                                        e.currentTarget.removeAttribute('draggable');
                                    }}
                                    className={`group bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-blue-300 hover:shadow-md transition-all relative ${elementMenuOpen === step.id ? 'z-50 border-blue-300 ring-2 ring-blue-500/20' : 'z-auto'} ${draggedStepIndex === index ? 'opacity-50 ring-2 ring-blue-300 border-blue-400' : ''} ${step.enabled === false ? 'opacity-60 bg-gray-50' : ''}`}
                                >
                                    <div className="grid grid-cols-[30px_240px_minmax(0,1fr)_minmax(0,1.2fr)_70px] gap-2 items-center">
                                        {/* Drag Handle & Index */}
                                        <div
                                            className="flex items-center justify-center text-gray-300 cursor-grab active:cursor-grabbing group-hover:text-gray-400 drag-handle hover:bg-gray-50 rounded-md py-1 transition-colors relative"
                                            onMouseEnter={(e) => {
                                                const row = e.currentTarget.closest('.group');
                                                if (row) row.setAttribute('draggable', 'true');
                                            }}
                                            onMouseLeave={(e) => {
                                                const row = e.currentTarget.closest('.group');
                                                if (row) row.removeAttribute('draggable');
                                            }}
                                        >
                                            <GripVertical size={16} className="mr-1 text-gray-400" />
                                            <div className="relative">
                                                <select
                                                    className="appearance-none w-5 h-5 bg-gray-50 rounded-full text-xs font-mono font-medium text-center focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-blue-600 hover:bg-blue-100 transition-colors"
                                                    value={index}
                                                    onChange={(e) => onMoveStep(index, parseInt(e.target.value))}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {steps.map((_, i) => (
                                                        <option key={i} value={i}>{i + 1}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Action Dropdown */}
                                        <div>
                                            <select
                                                className={`w-full text-xs font-bold rounded-md border px-2 py-2 focus:ring-2 focus:ring-opacity-50 outline-none uppercase cursor-pointer transition-colors ${getActionColorClass(step.action)}`}
                                                value={step.action}
                                                onChange={(e) => onUpdateStep(step.id, { action: e.target.value as ActionType, target: '', data: '', headerProfileId: undefined, bodyTemplateId: undefined, endpointId: undefined })}
                                                disabled={step.enabled === false}
                                            >
                                                <optgroup label="Web Actions">
                                                    <option value="OPEN">Open URL</option>
                                                    <option value="CLICK">Click Element</option>
                                                    <option value="DOUBLE_CLICK">Double Click</option>
                                                    <option value="RIGHT_CLICK">Right Click</option>
                                                    <option value="TYPE">Type Text</option>
                                                    <option value="CLEAR">Clear Input</option>
                                                    <option value="HOVER">Hover Element</option>
                                                    <option value="HIGHLIGHT">Highlight Element</option>
                                                    <option value="SCROLL_TO">Scroll To</option>
                                                    <option value="SELECT_OPTION">Select Option</option>
                                                    <option value="CHECK">Check Box</option>
                                                    <option value="UNCHECK">Uncheck Box</option>
                                                    <option value="TOGGLE">Toggle Element</option>
                                                    <option value="DRAG_AND_DROP">Drag & Drop</option>
                                                    <option value="UPLOAD_FILE">Upload File</option>
                                                    <option value="ATTACH_FILE">Attach File</option>
                                                    <option value="PRESS_KEY">Press Key</option>
                                                </optgroup>
                                                <optgroup label="Assertions">
                                                    <option value="ASSERT_VISIBLE">Assert Visible</option>
                                                    <option value="ASSERT_INVISIBLE">Assert Invisible</option>
                                                    <option value="ASSERT_TEXT">Assert Text</option>
                                                    <option value="ASSERT_VALUE">Assert Value</option>
                                                    <option value="ASSERT_URL">Assert URL</option>
                                                    <option value="ASSERT_TITLE">Assert Title</option>
                                                    <option value="ASSERT_DISABLED">Assert Disabled</option>
                                                </optgroup>
                                                <optgroup label="Browser & Alert Actions">
                                                    <option value="SWITCH_TO_WINDOW">Switch to Window</option>
                                                    <option value="SWITCH_TO_FRAME">Switch to Frame</option>
                                                    <option value="ACCEPT_ALERT">Accept Alert</option>
                                                    <option value="DISMISS_ALERT">Dismiss Alert</option>
                                                </optgroup>
                                                <optgroup label="Logic & Modules">
                                                    <option value="WAIT">Wait (ms)</option>
                                                    <option value="WAIT_FOR_VISIBLE">Wait for Visible</option>
                                                    <option value="WAIT_FOR_INVISIBLE">Wait for Invisible</option>
                                                    <option value="EXTRACT_VAR">Extract Variable</option>
                                                    <option value="EVALUATE_JS">Evaluate JS</option>
                                                    <option value="RUN_MODULE">Run Module</option>
                                                </optgroup>
                                                <optgroup label="API Actions">
                                                    <option value="API_GET">API GET</option>
                                                    <option value="API_POST">API POST</option>
                                                    <option value="API_PUT">API PUT</option>
                                                    <option value="API_DELETE">API DELETE</option>
                                                </optgroup>
                                            </select>
                                        </div>

                                        {/* Target / Module */}
                                        <div className="relative">
                                            {step.action === 'RUN_MODULE' ? (
                                                <select
                                                    className="w-full bg-blue-50 text-blue-900 rounded-md border border-blue-200 px-3 py-2 text-xs font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                    value={step.target}
                                                    onChange={(e) => onUpdateStep(step.id, { target: e.target.value, data: '{}' })}
                                                    disabled={step.enabled === false}
                                                >
                                                    <option value="">Select Module...</option>
                                                    {(activeProject.modules || []).map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            ) : step.action.startsWith('API_') ? (
                                                <select
                                                    className="w-full bg-emerald-50 text-emerald-900 rounded-md border border-emerald-200 px-3 py-2 text-xs font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none cursor-pointer disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                    value={step.endpointId || ''}
                                                    disabled={step.enabled === false}
                                                    onChange={(e) => {
                                                        const newEndpointId = e.target.value || undefined;
                                                        let currentValues: Record<string, string> = {};
                                                        try { currentValues = JSON.parse(step.data || '{}'); } catch (err) { }

                                                        let newValues: Record<string, string> = {};

                                                        // Preserve header variables
                                                        if (step.headerProfileId) {
                                                            const profile = headers.find(h => h.id === step.headerProfileId);
                                                            if (profile) {
                                                                profile.headers.forEach(h => {
                                                                    const matches = h.value.match(/\{\{([^}]+)\}\}/g);
                                                                    if (matches) {
                                                                        matches.forEach(m => {
                                                                            const varName = m.replace(/\{\{|\}\}/g, '');
                                                                            if (currentValues[varName] !== undefined) {
                                                                                newValues[varName] = currentValues[varName];
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        }

                                                        // Preserve body variables
                                                        if (step.bodyTemplateId) {
                                                            const template = bodies.find(b => b.id === step.bodyTemplateId);
                                                            if (template) {
                                                                const matches = template.content.match(/\{\{([^}]+)\}\}/g);
                                                                if (matches) {
                                                                    matches.forEach(m => {
                                                                        const varName = m.replace(/\{\{|\}\}/g, '');
                                                                        if (currentValues[varName] !== undefined) {
                                                                            newValues[varName] = currentValues[varName];
                                                                        }
                                                                    });
                                                                }
                                                            }
                                                        }

                                                        // Add new endpoint variables
                                                        if (newEndpointId) {
                                                            const endpoint = endpoints.find(ep => ep.id === newEndpointId);
                                                            if (endpoint && endpoint.parameters) {
                                                                endpoint.parameters.forEach(p => {
                                                                    if (!p.enabled) return;
                                                                    const matches = p.value.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                    if (matches) {
                                                                        matches.forEach(m => {
                                                                            const varName = m.replace(/\{\{|\}\}|\{|\}/g, '');
                                                                            if (currentValues[varName] !== undefined) {
                                                                                newValues[varName] = currentValues[varName];
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        }

                                                        onUpdateStep(step.id, {
                                                            endpointId: newEndpointId,
                                                            data: Object.keys(newValues).length > 0 ? JSON.stringify(newValues) : ''
                                                        });
                                                    }}
                                                >
                                                    <option value="">Select Endpoint...</option>
                                                    {endpoints.map(ep => (
                                                        <option key={ep.id} value={ep.id}>{ep.method} {ep.name}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div className="relative flex items-center">
                                                    <input
                                                        className="w-full bg-gray-50 text-gray-700 rounded-md border border-gray-200 pl-3 pr-14 py-2 text-xs font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-400 disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                        value={step.target}
                                                        onChange={(e) => onUpdateStep(step.id, { target: e.target.value })}
                                                        placeholder={['OPEN', 'WAIT', 'WAIT_FOR_VISIBLE', 'WAIT_FOR_INVISIBLE', 'EVALUATE_JS', 'SWITCH_TO_WINDOW', 'SWITCH_TO_FRAME', 'ACCEPT_ALERT', 'DISMISS_ALERT'].includes(step.action) ? 'Not required' : 'PageName.ElementName or Selector'}
                                                        disabled={step.enabled === false || ['OPEN', 'WAIT', 'WAIT_FOR_VISIBLE', 'WAIT_FOR_INVISIBLE', 'EVALUATE_JS', 'SWITCH_TO_WINDOW', 'SWITCH_TO_FRAME', 'ACCEPT_ALERT', 'DISMISS_ALERT'].includes(step.action)}
                                                    />
                                                    <div className="absolute right-1 flex items-center gap-0.5">
                                                        {!['OPEN', 'WAIT', 'EVALUATE_JS'].includes(step.action) && (
                                                            <button
                                                                className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"
                                                                onClick={(e) => { e.stopPropagation(); setElementMenuOpen(elementMenuOpen === step.id ? null : step.id); setVariableMenuOpen(null); }}
                                                                title="Select Element from Repo"
                                                            >
                                                                <MousePointer2 size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"
                                                            onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'target' ? null : { stepId: step.id, field: 'target' }); setElementMenuOpen(null); }}
                                                            title="Insert Variable"
                                                        >
                                                            <Braces size={14} />
                                                        </button>
                                                    </div>

                                                    {/* Element Repo Dropdown */}
                                                    {elementMenuOpen === step.id && (
                                                        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-2 max-h-80 overflow-y-auto">
                                                            <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100 flex items-center gap-2 sticky top-0"><Workflow size={14} /> Element Repository</div>
                                                            {activeProject.pages.length === 0 && (
                                                                <div className="px-4 py-6 text-sm text-gray-400 text-center italic">No pages defined in repository.</div>
                                                            )}
                                                            {activeProject.pages.map(page => (
                                                                <div key={page.id} className="mb-3 last:mb-0">
                                                                    <div className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-50/80 flex items-center gap-2 sticky top-8 backdrop-blur-sm"><Globe size={14} className="text-gray-400" /> {page.name}</div>
                                                                    {page.elements.length === 0 && <div className="px-5 py-2 text-xs text-gray-400 italic">No elements</div>}
                                                                    {page.elements.map(el => (
                                                                        <button
                                                                            key={el.id}
                                                                            className="w-full text-left px-5 py-2 hover:bg-blue-50 hover:text-blue-700 text-sm flex flex-col group transition-colors border-l-2 border-transparent hover:border-blue-500"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                onUpdateStep(step.id, { target: `${page.name}.${el.name}` });
                                                                                setElementMenuOpen(null);
                                                                            }}
                                                                        >
                                                                            <span className="font-medium text-gray-800 group-hover:text-blue-700">{el.name}</span>
                                                                            <span className="text-xs font-mono text-gray-400 group-hover:text-blue-500 truncate w-full mt-0.5">{el.value}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Variable Dropdown (Target) */}
                                                    {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'target' && (
                                                        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                                            {variables.map(v => (
                                                                <button
                                                                    key={v.id}
                                                                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        insertVariable(step.id, 'target', v.key);
                                                                    }}
                                                                >
                                                                    <span>{v.key}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Value / Data */}
                                        <div>
                                            {step.action === 'RUN_MODULE' ? (
                                                <div className="bg-blue-50/50 rounded-md border border-blue-100 p-2 space-y-2">
                                                    {(() => {
                                                        const module = activeProject.modules?.find(m => m.id === step.target);
                                                        if (!module || !module.params || module.params.length === 0) {
                                                            return <div className="text-[10px] text-blue-400 italic text-center">No parameters required</div>;
                                                        }

                                                        let currentData: Record<string, string> = {};
                                                        try { currentData = JSON.parse(step.data || '{}'); } catch (e) { }

                                                        return module.params.map(param => (
                                                            <div key={param.id} className="flex items-center gap-2">
                                                                <label className="text-[10px] font-mono font-medium text-blue-700 w-20 truncate text-right shrink-0" title={param.name}>{param.name}</label>
                                                                <div className="relative flex-1">
                                                                    <input
                                                                        className="w-full bg-white border border-blue-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                                        placeholder={param.defaultValue || 'Value'}
                                                                        value={currentData[param.name] || ''}
                                                                        onChange={(e) => updateModuleParam(step.id, step.data, param.name, e.target.value)}
                                                                        disabled={step.enabled === false}
                                                                    />
                                                                    <button
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-blue-600 p-0.5 rounded"
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

                                                                    {/* Variable Dropdown (Module Param) */}
                                                                    {variableMenuOpen?.stepId === step.id && variableMenuOpen?.paramName === param.name && (
                                                                        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                                                            {(variables || []).map(v => (
                                                                                <button
                                                                                    key={v.id}
                                                                                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
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
                                                    <div className="flex gap-2">
                                                        <select
                                                            className="flex-1 bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-2 py-1.5 focus:border-emerald-500 outline-none disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                            value={step.headerProfileId || ''}
                                                            disabled={step.enabled === false}
                                                            onChange={(e) => {
                                                                const newHeaderId = e.target.value || undefined;
                                                                let currentValues: Record<string, string> = {};
                                                                try { currentValues = JSON.parse(step.data || '{}'); } catch (err) { }

                                                                let newValues: Record<string, string> = {};

                                                                // Preserve URL variables
                                                                const urlVars = new Set<string>();
                                                                if (step.target) {
                                                                    const matches = step.target.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                    if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                }
                                                                if (step.endpointId) {
                                                                    const endpoint = endpoints.find(ep => ep.id === step.endpointId);
                                                                    if (endpoint) {
                                                                        Object.values(endpoint.baseUrls).forEach(url => {
                                                                            if (typeof url === 'string') {
                                                                                const matches = url.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                                if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                            }
                                                                        });
                                                                        if (endpoint.parameters) {
                                                                            endpoint.parameters.forEach(p => {
                                                                                if (!p.enabled) return;
                                                                                const matches = p.value.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                                if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                            });
                                                                        }
                                                                    }
                                                                }
                                                                urlVars.forEach(varName => {
                                                                    if (currentValues[varName] !== undefined) {
                                                                        newValues[varName] = currentValues[varName];
                                                                    }
                                                                });

                                                                // Preserve body variables
                                                                if (step.bodyTemplateId) {
                                                                    const template = bodies.find(b => b.id === step.bodyTemplateId);
                                                                    if (template) {
                                                                        const matches = template.content.match(/\{\{([^}]+)\}\}/g);
                                                                        if (matches) {
                                                                            matches.forEach(m => {
                                                                                const varName = m.replace(/\{\{|\}\}/g, '');
                                                                                if (currentValues[varName] !== undefined) {
                                                                                    newValues[varName] = currentValues[varName];
                                                                                }
                                                                            });
                                                                        }
                                                                    }
                                                                }

                                                                // Keep relevant header variables
                                                                if (newHeaderId) {
                                                                    const profile = headers.find(h => h.id === newHeaderId);
                                                                    if (profile) {
                                                                        profile.headers.forEach(h => {
                                                                            const matches = h.value.match(/\{\{([^}]+)\}\}/g);
                                                                            if (matches) {
                                                                                matches.forEach(m => {
                                                                                    const varName = m.replace(/\{\{|\}\}/g, '');
                                                                                    if (currentValues[varName] !== undefined) {
                                                                                        newValues[varName] = currentValues[varName];
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                }

                                                                onUpdateStep(step.id, {
                                                                    headerProfileId: newHeaderId,
                                                                    data: Object.keys(newValues).length > 0 ? JSON.stringify(newValues) : ''
                                                                });
                                                            }}
                                                        >
                                                            <option value="">No Headers</option>
                                                            {headers.map(h => (
                                                                <option key={h.id} value={h.id}>{h.name}</option>
                                                            ))}
                                                        </select>
                                                        {(step.action === 'API_POST' || step.action === 'API_PUT') && (
                                                            <select
                                                                className="flex-1 bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-2 py-1.5 focus:border-emerald-500 outline-none disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                                value={step.bodyTemplateId || ''}
                                                                disabled={step.enabled === false}
                                                                onChange={(e) => {
                                                                    const newTemplateId = e.target.value || undefined;
                                                                    let currentValues: Record<string, string> = {};
                                                                    try { currentValues = JSON.parse(step.data || '{}'); } catch (err) { }

                                                                    let newValues: Record<string, string> = {};

                                                                    // Preserve URL variables
                                                                    const urlVars = new Set<string>();
                                                                    if (step.target) {
                                                                        const matches = step.target.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                        if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                    }
                                                                    if (step.endpointId) {
                                                                        const endpoint = endpoints.find(ep => ep.id === step.endpointId);
                                                                        if (endpoint) {
                                                                            Object.values(endpoint.baseUrls).forEach(url => {
                                                                                if (typeof url === 'string') {
                                                                                    const matches = url.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                                    if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                                }
                                                                            });
                                                                            if (endpoint.parameters) {
                                                                                endpoint.parameters.forEach(p => {
                                                                                    if (!p.enabled) return;
                                                                                    const matches = p.value.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                                    if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                                });
                                                                            }
                                                                        }
                                                                    }
                                                                    urlVars.forEach(varName => {
                                                                        if (currentValues[varName] !== undefined) {
                                                                            newValues[varName] = currentValues[varName];
                                                                        }
                                                                    });

                                                                    // Preserve header variables
                                                                    if (step.headerProfileId) {
                                                                        const profile = headers.find(h => h.id === step.headerProfileId);
                                                                        if (profile) {
                                                                            profile.headers.forEach(h => {
                                                                                const matches = h.value.match(/\{\{([^}]+)\}\}/g);
                                                                                if (matches) {
                                                                                    matches.forEach(m => {
                                                                                        const varName = m.replace(/\{\{|\}\}/g, '');
                                                                                        if (currentValues[varName] !== undefined) {
                                                                                            newValues[varName] = currentValues[varName];
                                                                                        }
                                                                                    });
                                                                                }
                                                                            });
                                                                        }
                                                                    }

                                                                    if (newTemplateId) {
                                                                        const template = bodies.find(b => b.id === newTemplateId);
                                                                        if (template) {
                                                                            const bodyVars = new Set<string>();
                                                                            const matches = template.content.match(/\{\{([^}]+)\}\}/g);
                                                                            if (matches) {
                                                                                matches.forEach(m => bodyVars.add(m.replace(/\{\{|\}\}/g, '')));
                                                                            }

                                                                            bodyVars.forEach(varName => {
                                                                                if (currentValues[varName] !== undefined) {
                                                                                    newValues[varName] = currentValues[varName];
                                                                                } else if (template.defaultValues?.[varName]) {
                                                                                    newValues[varName] = template.defaultValues[varName];
                                                                                }
                                                                            });
                                                                        }
                                                                    }

                                                                    onUpdateStep(step.id, {
                                                                        bodyTemplateId: newTemplateId,
                                                                        data: Object.keys(newValues).length > 0 ? JSON.stringify(newValues) : ''
                                                                    });
                                                                }}
                                                            >
                                                                <option value="">No Body</option>
                                                                {bodies.map(b => (
                                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>

                                                    {/* Dynamic Variable Inputs for URL, Header & Body */}
                                                    {(step.headerProfileId || step.bodyTemplateId || step.endpointId || step.target?.includes('{{') || step.target?.includes('{')) ? (
                                                        <div className="bg-gray-50 rounded-md border border-gray-200 p-2 space-y-3">
                                                            {/* URL Variables */}
                                                            {(() => {
                                                                const urlVars = new Set<string>();
                                                                if (step.target) {
                                                                    const matches = step.target.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                    if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                }
                                                                if (step.endpointId) {
                                                                    const endpoint = endpoints.find(e => e.id === step.endpointId);
                                                                    if (endpoint) {
                                                                        Object.values(endpoint.baseUrls).forEach(url => {
                                                                            if (typeof url === 'string') {
                                                                                const matches = url.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                                if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                            }
                                                                        });
                                                                        if (endpoint.parameters) {
                                                                            endpoint.parameters.forEach(p => {
                                                                                if (!p.enabled) return;
                                                                                const matches = p.value.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                                                                                if (matches) matches.forEach(m => urlVars.add(m.replace(/\{\{|\}\}|\{|\}/g, '')));
                                                                            });
                                                                        }
                                                                    }
                                                                }

                                                                if (urlVars.size === 0) return null;

                                                                let currentValues: Record<string, string> = {};
                                                                try { currentValues = JSON.parse(step.data || '{}'); } catch (e) { }

                                                                return (
                                                                    <div>
                                                                        <div className="text-[9px] font-bold text-blue-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><Globe size={10} /> URL Variables</div>
                                                                        <div className="space-y-1.5">
                                                                            {Array.from(urlVars).map(varName => (
                                                                                <div key={`url-${varName}`} className="flex items-center gap-2">
                                                                                    <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                                    <div className="relative flex-1">
                                                                                        <input
                                                                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                                                            placeholder="Value"
                                                                                            value={currentValues[varName] || ''}
                                                                                            onChange={(e) => {
                                                                                                const newData = { ...currentValues, [varName]: e.target.value };
                                                                                                onUpdateStep(step.id, { data: JSON.stringify(newData) });
                                                                                            }}
                                                                                            disabled={step.enabled === false}
                                                                                        />
                                                                                        <button
                                                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-blue-600 p-0.5 rounded"
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
                                                                                                {(variables || []).map(v => (
                                                                                                    <button
                                                                                                        key={v.id}
                                                                                                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const currentVal = currentValues[varName] || '';
                                                                                                            const newData = { ...currentValues, [varName]: `${currentVal}{{${v.key}}}` };
                                                                                                            onUpdateStep(step.id, { data: JSON.stringify(newData) });
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

                                                            {/* Header Variables */}
                                                            {(() => {
                                                                const profile = headers.find(h => h.id === step.headerProfileId);
                                                                if (!profile) return null;

                                                                const headerVars = new Set<string>();
                                                                profile.headers.forEach(h => {
                                                                    const matches = h.value.match(/\{\{([^}]+)\}\}/g);
                                                                    if (matches) {
                                                                        matches.forEach(m => headerVars.add(m.replace(/\{\{|\}\}/g, '')));
                                                                    }
                                                                });

                                                                if (headerVars.size === 0) return null;

                                                                let currentValues: Record<string, string> = {};
                                                                try { currentValues = JSON.parse(step.data || '{}'); } catch (e) { }

                                                                return (
                                                                    <div>
                                                                        <div className="text-[9px] font-bold text-blue-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileText size={10} /> Header Variables</div>
                                                                        <div className="space-y-1.5">
                                                                            {Array.from(headerVars).map(varName => (
                                                                                <div key={`header-${varName}`} className="flex items-center gap-2">
                                                                                    <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                                    <div className="relative flex-1">
                                                                                        <input
                                                                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                                                            placeholder="Value"
                                                                                            value={currentValues[varName] || ''}
                                                                                            onChange={(e) => {
                                                                                                const newData = { ...currentValues, [varName]: e.target.value };
                                                                                                onUpdateStep(step.id, { data: JSON.stringify(newData) });
                                                                                            }}
                                                                                            disabled={step.enabled === false}
                                                                                        />
                                                                                        <button
                                                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-blue-600 p-0.5 rounded"
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
                                                                                                {(variables || []).map(v => (
                                                                                                    <button
                                                                                                        key={v.id}
                                                                                                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const currentVal = currentValues[varName] || '';
                                                                                                            const newData = { ...currentValues, [varName]: `${currentVal}{{${v.key}}}` };
                                                                                                            onUpdateStep(step.id, { data: JSON.stringify(newData) });
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

                                                                const bodyVars = new Set<string>();
                                                                const matches = template.content.match(/\{\{([^}]+)\}\}/g);
                                                                if (matches) {
                                                                    matches.forEach(m => bodyVars.add(m.replace(/\{\{|\}\}/g, '')));
                                                                }

                                                                if (bodyVars.size === 0) return null;

                                                                let currentValues: Record<string, string> = {};
                                                                try { currentValues = JSON.parse(step.data || '{}'); } catch (e) { }

                                                                return (
                                                                    <div>
                                                                        <div className="text-[9px] font-bold text-blue-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileCode size={10} /> Body Variables</div>
                                                                        <div className="space-y-1.5">
                                                                            {Array.from(bodyVars).map(varName => (
                                                                                <div key={`body-${varName}`} className="flex items-center gap-2">
                                                                                    <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                                                    <div className="relative flex-1">
                                                                                        <input
                                                                                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                                                            placeholder={template.defaultValues?.[varName] || "Value"}
                                                                                            value={currentValues[varName] || ''}
                                                                                            onChange={(e) => {
                                                                                                const newData = { ...currentValues, [varName]: e.target.value };
                                                                                                onUpdateStep(step.id, { data: JSON.stringify(newData) });
                                                                                            }}
                                                                                            disabled={step.enabled === false}
                                                                                        />
                                                                                        <button
                                                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-blue-600 p-0.5 rounded"
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
                                                                                                {(variables || []).map(v => (
                                                                                                    <button
                                                                                                        key={v.id}
                                                                                                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const currentVal = currentValues[varName] || '';
                                                                                                            const newData = { ...currentValues, [varName]: `${currentVal}{{${v.key}}}` };
                                                                                                            onUpdateStep(step.id, { data: JSON.stringify(newData) });
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
                                                                className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-2 font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-400 min-h-[60px] resize-y disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                                value={step.data}
                                                                onChange={(e) => onUpdateStep(step.id, { data: e.target.value })}
                                                                placeholder="Request Body (JSON)"
                                                                disabled={step.enabled === false}
                                                            />
                                                            <button
                                                                className="absolute right-1 top-2 text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"
                                                                onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' && !variableMenuOpen.paramName ? null : { stepId: step.id, field: 'data' }); setElementMenuOpen(null); }}
                                                                title="Insert Variable"
                                                            >
                                                                <Braces size={14} />
                                                            </button>
                                                            {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && !variableMenuOpen?.paramName && (
                                                                <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                                                    {(variables || []).map(v => (
                                                                        <button
                                                                            key={v.id}
                                                                            className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                insertVariable(step.id, 'data', v.key);
                                                                            }}
                                                                        >
                                                                            <span>{v.key}</span>
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
                                                        className="w-full bg-gray-50 text-gray-700 rounded-md border border-gray-200 pl-3 pr-8 py-2 text-xs font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-400 disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                        value={step.data}
                                                        onChange={(e) => onUpdateStep(step.id, { data: e.target.value })}
                                                        placeholder={
                                                            step.action === 'OPEN' ? 'URL (e.g., https://google.com)' :
                                                                step.action === 'WAIT' ? 'Duration in ms (e.g., 2000)' :
                                                                    step.action === 'WAIT_FOR_VISIBLE' ? 'Element selector...' :
                                                                        step.action === 'WAIT_FOR_INVISIBLE' ? 'Element selector...' :
                                                                            step.action === 'EVALUATE_JS' ? 'JS Expression' :
                                                                                step.action === 'TYPE' ? 'Text to type...' :
                                                                                    step.action === 'ASSERT_TEXT' ? 'Expected text...' :
                                                                                        step.action === 'ASSERT_VALUE' ? 'Expected value...' :
                                                                                            step.action === 'ASSERT_URL' ? 'Expected URL...' :
                                                                                                step.action === 'ASSERT_TITLE' ? 'Expected title...' :
                                                                                                    step.action === 'ASSERT_DISABLED' ? 'Element selector...' :
                                                                                                        step.action === 'SELECT_OPTION' ? 'Option value...' :
                                                                                                            step.action === 'DRAG_AND_DROP' ? 'Target selector...' :
                                                                                                                step.action === 'ATTACH_FILE' ? 'File path...' :
                                                                                                                    step.action === 'SWITCH_TO_WINDOW' ? 'URL or title to match...' :
                                                                                                                        step.action === 'SWITCH_TO_FRAME' ? 'Frame selector...' :
                                                                                                                            ['CLICK', 'ASSERT_VISIBLE', 'ASSERT_INVISIBLE', 'HOVER', 'HIGHLIGHT', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'SCROLL_TO', 'CHECK', 'UNCHECK', 'ACCEPT_ALERT', 'DISMISS_ALERT'].includes(step.action) ? 'Not required' : 'Value / Data'
                                                        }
                                                        disabled={step.enabled === false || ['CLICK', 'HOVER', 'HIGHLIGHT', 'SCROLL_TO', 'CHECK', 'UNCHECK', 'ASSERT_VISIBLE', 'ASSERT_INVISIBLE', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'SWITCH_TO_WINDOW', 'SWITCH_TO_FRAME', 'ACCEPT_ALERT', 'DISMISS_ALERT'].includes(step.action)}
                                                    />
                                                    {!['CLICK', 'HOVER', 'HIGHLIGHT', 'SCROLL_TO', 'CHECK', 'UNCHECK', 'ASSERT_VISIBLE', 'ASSERT_INVISIBLE', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'SWITCH_TO_WINDOW', 'SWITCH_TO_FRAME', 'ACCEPT_ALERT', 'DISMISS_ALERT'].includes(step.action) && (
                                                        <button
                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"
                                                            onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' && !variableMenuOpen.paramName ? null : { stepId: step.id, field: 'data' }); setElementMenuOpen(null); }}
                                                            title="Insert Variable"
                                                        >
                                                            <Braces size={14} />
                                                        </button>
                                                    )}

                                                    {/* Variable Dropdown (Data) */}
                                                    {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && !variableMenuOpen?.paramName && (
                                                        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                                            {(variables || []).map(v => (
                                                                <button
                                                                    key={v.id}
                                                                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        insertVariable(step.id, 'data', v.key);
                                                                    }}
                                                                >
                                                                    <span>{v.key}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-2 gap-0.5 w-[70px]">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdateStep(step.id, { enabled: step.enabled === false ? true : false });
                                                }}
                                                className={`p-1 rounded-md transition-colors ${step.enabled === false ? 'text-gray-400 bg-gray-100 hover:bg-green-50 hover:text-green-600' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}
                                                title={step.enabled === false ? "Step Disabled (Click to Enable)" : "Step Enabled (Click to Disable)"}
                                            >
                                                {step.enabled === false ? <PowerOff size={14} /> : <Power size={14} />}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdateStep(step.id, { screenshot: !step.screenshot });
                                                }}
                                                className={`p-1 rounded-md transition-colors ${step.screenshot ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100'}`}
                                                title={step.screenshot ? "Screenshot Enabled" : "Enable Screenshot"}
                                            >
                                                <Camera size={14} />
                                            </button>
                                            {onDuplicateStep && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDuplicateStep(step);
                                                    }}
                                                    className="text-gray-300 hover:text-blue-500 p-1 rounded-md hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Duplicate Step"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteStep(step.id);
                                                }}
                                                className="text-gray-300 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                                title="Delete Step"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {onAddStep && (
                        <div className="mt-4 flex flex-col gap-2 pb-48">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onAddStep('CLICK')}
                                    className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center gap-1.5 text-xs font-medium group shadow-sm"
                                >
                                    <MousePointer2 size={14} className="group-hover:scale-110 transition-transform" /> Add Web Step
                                </button>
                                <button
                                    onClick={() => onAddStep('API_GET')}
                                    className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-center gap-1.5 text-xs font-medium group shadow-sm"
                                >
                                    <Globe size={14} className="group-hover:scale-110 transition-transform" /> Add API Step
                                </button>
                                <button
                                    onClick={() => onAddStep('RUN_MODULE')}
                                    className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center justify-center gap-1.5 text-xs font-medium group shadow-sm"
                                >
                                    <Workflow size={14} className="group-hover:scale-110 transition-transform" /> Add Module
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

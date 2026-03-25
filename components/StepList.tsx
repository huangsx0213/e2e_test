import React, { useState } from 'react';
import { TestStep, Project, ActionType, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint } from '../types';
import { GripVertical, Trash2, FileText, FileCode, Braces, MousePointer2, Workflow, Globe, ChevronDown, ChevronRight, Plus } from 'lucide-react';

interface StepListProps {
  title?: string;
  steps: TestStep[];
  onUpdateStep: (id: string, updates: Partial<TestStep>) => void;
  onDeleteStep: (id: string) => void;
  onMoveStep: (fromIndex: number, toIndex: number) => void;
  onAddStep?: () => void;
  defaultExpanded?: boolean;
  activeProject: Project;
  activeSuite: TestSuite;
  endpoints: ApiEndpoint[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
}

const ACTION_TYPES: ActionType[] = ['OPEN', 'CLICK', 'TYPE', 'ASSERT_VISIBLE', 'ASSERT_TEXT', 'WAIT', 'API_GET', 'API_POST', 'API_PUT', 'API_DELETE', 'RUN_MODULE'];

export const StepList: React.FC<StepListProps> = ({
  title,
  steps,
  onUpdateStep,
  onDeleteStep,
  onMoveStep,
  onAddStep,
  defaultExpanded = true,
  activeProject,
  activeSuite,
  endpoints,
  headers,
  bodies
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [elementMenuOpen, setElementMenuOpen] = useState<string | null>(null);
  const [variableMenuOpen, setVariableMenuOpen] = useState<{ stepId: string; field: 'target' | 'data'; paramName?: string } | null>(null);

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
    onMoveStep(draggedStepIndex, dropIndex);
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
         try { dataObj = JSON.parse(step.data || '{}'); } catch (e) {}
         const currentVal = dataObj[paramName] || '';
         const newVal = `${currentVal}\${${variableKey}}`;
         dataObj[paramName] = newVal;
         onUpdateStep(stepId, { data: JSON.stringify(dataObj) });
    } else {
        const currentValue = field === 'target' ? step.target : step.data;
        const newValue = `${currentValue}\${${variableKey}}`;
        onUpdateStep(stepId, { [field]: newValue });
    }
    setVariableMenuOpen(null);
  };

  const updateModuleParam = (stepId: string, currentDataJSON: string, paramKey: string, newValue: string) => {
     let dataObj = {};
     try { dataObj = JSON.parse(currentDataJSON || '{}'); } catch (e) {}
     dataObj = { ...dataObj, [paramKey]: newValue };
     onUpdateStep(stepId, { data: JSON.stringify(dataObj) });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
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
              <div className="grid grid-cols-12 gap-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4">
                 <div className="col-span-1 text-center">Step</div>
                 <div className="col-span-2">Action</div>
                 <div className="col-span-4">Target / Module</div>
                 <div className="col-span-4">Value / Data</div>
                 <div className="col-span-1"></div>
              </div>
              
              {steps.map((step, index) => (
                <div 
                     key={step.id} 
                     draggable={true}
                     onDragStart={(e) => handleDragStart(e, index)}
                     onDragOver={(e) => handleDragOver(e, index)}
                     onDrop={(e) => handleDrop(e, index)}
                     className={`group bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-blue-300 hover:shadow-md transition-all relative ${elementMenuOpen === step.id ? 'z-50 border-blue-300 ring-2 ring-blue-500/20' : 'z-auto'} ${draggedStepIndex === index ? 'opacity-50 ring-2 ring-blue-300 border-blue-400' : ''}`}
                >
           <div className="grid grid-cols-12 gap-4 items-center">
               {/* Drag Handle & Index */}
               <div className="col-span-1 flex justify-center text-gray-300 cursor-grab active:cursor-grabbing group-hover:text-gray-400 flex items-center justify-center drag-handle hover:bg-gray-50 rounded-md py-1 transition-colors relative">
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
               <div className="col-span-2">
                 <select 
                   className={`w-full text-[11px] font-bold rounded-md border px-2 py-1.5 focus:ring-2 focus:ring-opacity-50 outline-none uppercase cursor-pointer transition-colors ${getActionColorClass(step.action)}`}
                   value={step.action}
                   onChange={(e) => onUpdateStep(step.id, { action: e.target.value as ActionType, target: '', data: '', headerProfileId: undefined, bodyTemplateId: undefined, endpointId: undefined })}
                 >
                   {ACTION_TYPES.map(action => (
                     <option key={action} value={action}>{action.replace('_', ' ')}</option>
                   ))}
                 </select>
               </div>

               {/* Target / Module */}
               <div className="col-span-4 relative">
                   {step.action === 'RUN_MODULE' ? (
                       <select 
                           className="w-full bg-blue-50 text-blue-900 rounded-md border border-blue-200 px-3 py-1.5 text-xs font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
                           value={step.target}
                           onChange={(e) => onUpdateStep(step.id, { target: e.target.value, data: '{}' })}
                       >
                           <option value="">Select Module...</option>
                           {(activeProject.modules || []).map(m => (
                               <option key={m.id} value={m.id}>{m.name}</option>
                           ))}
                       </select>
                   ) : step.action.startsWith('API_') ? (
                       <select 
                           className="w-full bg-emerald-50 text-emerald-900 rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none cursor-pointer"
                           value={step.endpointId || ''}
                           onChange={(e) => onUpdateStep(step.id, { endpointId: e.target.value })}
                       >
                           <option value="">Select Endpoint...</option>
                           {endpoints.map(ep => (
                               <option key={ep.id} value={ep.id}>{ep.method} {ep.name}</option>
                           ))}
                       </select>
                   ) : (
                       <div className="relative flex items-center">
                           <input 
                               className="w-full bg-gray-50 text-gray-700 rounded-md border border-gray-200 pl-3 pr-14 py-1.5 text-xs font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-300"
                               value={step.target}
                               onChange={(e) => onUpdateStep(step.id, { target: e.target.value })}
                               placeholder="Selector or URL"
                           />
                           <div className="absolute right-1 flex items-center gap-0.5">
                               <button 
                                   className="text-gray-400 hover:text-blue-600 p-1 rounded"
                                   onClick={(e) => { e.stopPropagation(); setElementMenuOpen(elementMenuOpen === step.id ? null : step.id); setVariableMenuOpen(null); }}
                                   title="Select Element from Repo"
                               >
                                   <MousePointer2 size={12} />
                               </button>
                               <button 
                                   className="text-gray-400 hover:text-blue-600 p-1 rounded"
                                   onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'target' ? null : { stepId: step.id, field: 'target' }); setElementMenuOpen(null); }}
                                   title="Insert Variable"
                               >
                                   <Braces size={12} />
                               </button>
                           </div>
                           
                           {/* Element Repo Dropdown */}
                           {elementMenuOpen === step.id && (
                               <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                                   <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 flex items-center gap-1"><Workflow size={10}/> Element Repository</div>
                                   {activeProject.pages.length === 0 && (
                                       <div className="px-3 py-4 text-xs text-gray-400 text-center italic">No pages defined in repository.</div>
                                   )}
                                   {activeProject.pages.map(page => (
                                       <div key={page.id} className="mb-2 last:mb-0">
                                           <div className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50/50 flex items-center gap-1"><Globe size={12} className="text-gray-400"/> {page.name}</div>
                                           {page.elements.length === 0 && <div className="px-4 py-1 text-[10px] text-gray-400 italic">No elements</div>}
                                           {page.elements.map(el => (
                                               <button 
                                                   key={el.id}
                                                   className="w-full text-left px-4 py-1.5 hover:bg-blue-50 hover:text-blue-700 text-xs flex flex-col group"
                                                   onClick={(e) => {
                                                       e.stopPropagation();
                                                       onUpdateStep(step.id, { target: el.selector });
                                                       setElementMenuOpen(null);
                                                   }}
                                               >
                                                   <span className="font-medium">{el.name}</span>
                                                   <span className="text-[10px] font-mono text-gray-400 group-hover:text-blue-400 truncate w-full">{el.selector}</span>
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
                                   {(activeSuite.variables || []).map(v => (
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
               <div className="col-span-4">
                   {step.action === 'RUN_MODULE' ? (
                       <div className="bg-blue-50/50 rounded-md border border-blue-100 p-2 space-y-2">
                           {(() => {
                               const module = activeProject.modules?.find(m => m.id === step.target);
                               if (!module || !module.params || module.params.length === 0) {
                                   return <div className="text-[10px] text-blue-400 italic text-center">No parameters required</div>;
                               }
                               
                               let currentData: Record<string, string> = {};
                               try { currentData = JSON.parse(step.data || '{}'); } catch(e) {}

                               return module.params.map(param => (
                                   <div key={param.id} className="flex items-center gap-2">
                                       <label className="text-[10px] font-mono font-medium text-blue-700 w-20 truncate text-right shrink-0" title={param.name}>{param.name}</label>
                                       <div className="relative flex-1">
                                           <input 
                                               className="w-full bg-white border border-blue-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                               placeholder={param.defaultValue || 'Value'}
                                               value={currentData[param.name] || ''}
                                               onChange={(e) => updateModuleParam(step.id, step.data, param.name, e.target.value)}
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
                                                   {(activeSuite.variables || []).map(v => (
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
                                   className="flex-1 bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-2 py-1.5 focus:border-emerald-500 outline-none"
                                   value={step.headerProfileId || ''}
                                   onChange={(e) => onUpdateStep(step.id, { headerProfileId: e.target.value || undefined })}
                               >
                                   <option value="">No Headers</option>
                                   {headers.map(h => (
                                       <option key={h.id} value={h.id}>{h.name}</option>
                                   ))}
                               </select>
                               {(step.action === 'API_POST' || step.action === 'API_PUT') && (
                                   <select
                                       className="flex-1 bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-2 py-1.5 focus:border-emerald-500 outline-none"
                                       value={step.bodyTemplateId || ''}
                                       onChange={(e) => onUpdateStep(step.id, { bodyTemplateId: e.target.value || undefined })}
                                   >
                                       <option value="">No Body</option>
                                       {bodies.map(b => (
                                           <option key={b.id} value={b.id}>{b.name}</option>
                                       ))}
                                   </select>
                               )}
                           </div>
                           
                           {/* Dynamic Variable Inputs for Header & Body */}
                           {(step.headerProfileId || step.bodyTemplateId) ? (
                               <div className="bg-gray-50 rounded-md border border-gray-200 p-2 space-y-3">
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
                                       try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                       return (
                                           <div>
                                               <div className="text-[9px] font-bold text-blue-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileText size={10}/> Header Variables</div>
                                               <div className="space-y-1.5">
                                                   {Array.from(headerVars).map(varName => (
                                                       <div key={`header-${varName}`} className="flex items-center gap-2">
                                                           <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                           <div className="relative flex-1">
                                                               <input 
                                                                   className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                                                   placeholder="Value"
                                                                   value={currentValues[varName] || ''}
                                                                   onChange={(e) => {
                                                                       const newData = { ...currentValues, [varName]: e.target.value };
                                                                       onUpdateStep(step.id, { data: JSON.stringify(newData) });
                                                                   }}
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
                                                                       {(activeSuite.variables || []).map(v => (
                                                                           <button 
                                                                               key={v.id}
                                                                               className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                               onClick={(e) => {
                                                                                   e.stopPropagation();
                                                                                   const newData = { ...currentValues, [varName]: `\${${v.key}}` };
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
                                       try { currentValues = JSON.parse(step.data || '{}'); } catch(e) {}

                                       return (
                                           <div>
                                               <div className="text-[9px] font-bold text-blue-400 mb-1.5 flex items-center gap-1 uppercase tracking-wider"><FileCode size={10}/> Body Variables</div>
                                               <div className="space-y-1.5">
                                                   {Array.from(bodyVars).map(varName => (
                                                       <div key={`body-${varName}`} className="flex items-center gap-2">
                                                           <label className="text-[10px] font-mono font-medium text-gray-500 w-24 truncate text-right shrink-0" title={varName}>{varName}</label>
                                                           <div className="relative flex-1">
                                                               <input 
                                                                   className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                                                   placeholder="Value"
                                                                   value={currentValues[varName] || ''}
                                                                   onChange={(e) => {
                                                                       const newData = { ...currentValues, [varName]: e.target.value };
                                                                       onUpdateStep(step.id, { data: JSON.stringify(newData) });
                                                                   }}
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
                                                                       {(activeSuite.variables || []).map(v => (
                                                                           <button 
                                                                               key={v.id}
                                                                               className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-mono flex items-center justify-between group"
                                                                               onClick={(e) => {
                                                                                   e.stopPropagation();
                                                                                   const newData = { ...currentValues, [varName]: `\${${v.key}}` };
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
                                   className="w-full bg-white text-xs text-gray-700 rounded-md border border-gray-200 px-3 py-2 font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-300 min-h-[60px] resize-y"
                                   value={step.data}
                                   onChange={(e) => onUpdateStep(step.id, { data: e.target.value })}
                                   placeholder="Request Body (JSON)"
                                   />
                                   <button 
                                       className="absolute right-1 top-2 text-gray-400 hover:text-blue-600 p-1 rounded"
                                       onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' ? null : { stepId: step.id, field: 'data' }); setElementMenuOpen(null); }}
                                       title="Insert Variable"
                                   >
                                       <Braces size={12} />
                                   </button>
                                   {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && (
                                       <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                           <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                           {(activeSuite.variables || []).map(v => (
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
                               className="w-full bg-gray-50 text-gray-700 rounded-md border border-gray-200 pl-3 pr-8 py-1.5 text-xs font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-300"
                               value={step.data}
                               onChange={(e) => onUpdateStep(step.id, { data: e.target.value })}
                               placeholder="Input value or expected text"
                           />
                           <button 
                               className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 p-1 rounded"
                               onClick={(e) => { e.stopPropagation(); setVariableMenuOpen(variableMenuOpen?.stepId === step.id && variableMenuOpen.field === 'data' ? null : { stepId: step.id, field: 'data' }); setElementMenuOpen(null); }}
                               title="Insert Variable"
                           >
                               <Braces size={12} />
                           </button>
                           
                           {/* Variable Dropdown (Data) */}
                           {variableMenuOpen?.stepId === step.id && variableMenuOpen?.field === 'data' && (
                               <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                                   <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Insert Suite Variable</div>
                                   {(activeSuite.variables || []).map(v => (
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

               {/* Delete */}
               <div className="col-span-1 flex justify-end">
                   <button 
                       onClick={() => onDeleteStep(step.id)}
                       className="text-gray-300 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                       title="Delete Step"
                   >
                       <Trash2 size={16} />
                   </button>
               </div>
           </div>
        </div>
      ))}
            </div>
          )}
          
          {onAddStep && (
            <button 
              onClick={onAddStep} 
              className="w-full mt-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2 text-sm font-medium group"
            >
              <Plus size={16} className="group-hover:scale-110 transition-transform" /> Add Step
            </button>
          )}
        </div>
      )}
    </div>
  );
};

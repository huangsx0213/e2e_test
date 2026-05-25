import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Brain, 
  PenTool, 
  Star, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  Zap, 
  AlertCircle,
  Copy,
  Terminal,
  Activity,
  History,
  Check,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NodeDetailProps {
  node: {
    id: string; 
    label: string; 
    kind?: 'preparation' | 'agent' | 'checkpoint' | 'complete';
    type?: 'preparation' | 'agent' | 'checkpoint' | 'complete';
    agentName?: string; 
    status: string; 
    meta?: any; 
    subSteps?: { label: string; done: boolean; running?: boolean }[];
  } | null;
  agentLog: any | null; 
  checkpointData: any | null; 
  thinkingText: string | null;
  runSummary: { totalCases: number; totalTokens: number; totalLatencyMs: number; totalBatches: number } | null;
  onClose: () => void; 
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}

function formatMs(ms: number) { 
  if (ms < 1000) return `${ms}ms`; 
  return `${(ms / 1000).toFixed(1)}s`; 
}

function formatTokens(n: number) { 
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`; 
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`; 
  return n.toLocaleString(); 
}

// Category design mapping helper
const getCategoryBadgeClass = (category?: string) => {
  const normCat = (category || 'functional').toLowerCase();
  if (normCat.includes('api') || normCat.includes('interface')) {
    return 'bg-cyan-500/10 text-cyan-600 border-cyan-200/50';
  }
  if (normCat.includes('ui') || normCat.includes('frontend')) {
    return 'bg-purple-500/10 text-purple-600 border-purple-200/50';
  }
  if (normCat.includes('boundary') || normCat.includes('edge')) {
    return 'bg-pink-500/10 text-pink-600 border-pink-200/50';
  }
  if (normCat.includes('error') || normCat.includes('validation')) {
    return 'bg-rose-500/10 text-rose-600 border-rose-200/50';
  }
  return 'bg-slate-500/10 text-slate-600 border-slate-200/50';
};

function AgentSummaryView({ agentLog, agentName }: { agentLog: any; agentName?: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const output = agentLog?.output_data;
  
  if (!output) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl m-3">
        <Loader2 className="animate-spin text-slate-300 mb-2" size={20} />
        <div className="text-[11px] text-slate-450 italic">Processing pipeline logs... Please wait.</div>
      </div>
    );
  }

  if (agentName === 'test_analyst') {
    const conditions = output.testConditions || [];
    const filteredConditions = conditions.filter((c: any) => 
      String(c.condition || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(c.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="p-3 space-y-3 text-xs">
        {/* Analyst Approach Header Area - Compact */}
        {output.analysis?.overallApproach && (
          <div className="bg-gradient-to-br from-cyan-50/70 to-blue-50/35 rounded-lg p-2.5 border border-cyan-100/60 shadow-sm">
            <div className="flex items-center gap-1 text-[9px] font-bold text-cyan-800 uppercase tracking-wider mb-1">
              <Brain size={11} className="text-cyan-600" />
              Strategic Approach
            </div>
            <p className="text-[11px] text-slate-600 leading-snug font-sans">{output.analysis.overallApproach}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 flex items-center gap-1">
              <Terminal size={9} className="text-slate-400" />
              Conditions ({conditions.length})
            </span>
            
            {conditions.length > 4 && (
              <div className="relative w-36">
                <input 
                  type="text" 
                  placeholder="Filter conditions..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full text-[10px] pl-5 pr-2 py-0.5 border border-slate-200 rounded bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                <Search size={9} className="absolute left-1.5 top-2 text-slate-400" />
              </div>
            )}
          </div>

          <div className="space-y-1 max-h-[20rem] overflow-y-auto pr-0.5">
            {filteredConditions.map((c: any, i: number) => (
              <div 
                key={i} 
                className="text-[11px] bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 flex items-start justify-between gap-2.5 shadow-sm hover:border-slate-300 transition-colors"
               >
                <div className="flex items-start gap-1.5 min-w-0">
                  <span className="shrink-0 text-[9px] font-mono text-slate-450 bg-slate-50 border border-slate-100 px-1 py-0.2 rounded">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-slate-700 leading-tight font-medium">{c.condition}</p>
                    {c.description && <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">{c.description}</p>}
                  </div>
                </div>
                {c.category && (
                  <span className={`shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${getCategoryBadgeClass(c.category)}`}>
                    {c.category}
                  </span>
                )}
              </div>
            ))}
            {filteredConditions.length === 0 && (
              <div className="text-center text-xs text-slate-400 py-4">No matching conditions found</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (agentName === 'test_designer') {
    const cases = output.draftTestCases || [];
    const filteredCases = cases.filter((tc: any) => 
      String(tc.title || tc.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(tc.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="p-3 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="p-1 px-1.5 bg-indigo-50/50 border border-indigo-100/65 rounded text-indigo-600 flex items-center gap-1 text-[10px] font-bold uppercase">
            <PenTool size={11} />
            {cases.length} Scenarios Created
          </div>
          
          {cases.length > 4 && (
            <div className="relative w-36">
              <input 
                type="text" 
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-[10px] pl-5 pr-2 py-0.5 border border-slate-200 rounded bg-white text-slate-700 focus:outline-none"
              />
              <Search size={9} className="absolute left-1.5 top-2 text-slate-400" />
            </div>
          )}
        </div>

        <div className="space-y-1.5 max-h-[22rem] overflow-y-auto pr-0.5">
          {filteredCases.map((tc: any, i: number) => (
            <div 
              key={i} 
              className="text-[11px] bg-white border border-slate-100 rounded-lg p-2.5 shadow-sm space-y-1.5 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800 text-xs truncate">{tc.title || tc.id}</span>
                {tc.category && (
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded border ${getCategoryBadgeClass(tc.category)}`}>
                    {tc.category}
                  </span>
                )}
              </div>

              {/* Preconditions collapsed info in designer */}
              {tc.preconditions && tc.preconditions.length > 0 && (
                <div className="bg-slate-50 border border-slate-100 p-1.5 rounded text-[10px] text-slate-500">
                  <span className="font-bold text-slate-450 text-[8px] uppercase tracking-wider block mb-0.5">Precondition:</span>
                  <p className="truncate leading-tight">{tc.preconditions[0]}</p>
                </div>
              )}

              {/* Steps detailed lists */}
              {tc.steps && tc.steps.length > 0 && (
                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">Steps</span>
                  <div className="space-y-0.5">
                    {tc.steps.slice(0, 2).map((st: any, sIdx: number) => (
                      <div key={sIdx} className="flex gap-1 text-[10px] text-slate-500 leading-snug">
                        <span className="text-slate-300 font-bold">{sIdx + 1}.</span>
                        <p className="truncate">{st.action || st.description || st}</p>
                      </div>
                    ))}
                    {tc.steps.length > 2 && (
                      <span className="text-[9px] text-indigo-500 font-semibold block mt-0.5">+ {tc.steps.length - 2} more steps</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredCases.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-4">No matching drafts found</div>
          )}
        </div>
      </div>
    );
  }

  if (agentName === 'quality_manager') {
    const cases = output.finalTestCases || [];
    const matrix = output.coverageMatrix;
    const matrixRows = matrix?.rows || [];

    return (
      <div className="p-3 space-y-3 text-xs">
        {/* Coverage matrix - Elegant & compact */}
        {matrixRows.length > 0 && (
          <div className="bg-slate-50 text-slate-800 rounded-lg p-2.5 border border-slate-150 shadow-sm">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              <Star size={10} className="text-amber-500 fill-amber-300" />
              Coverage Matrix ({matrixRows.length} requirements)
            </div>
            
            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-0.5">
              {matrixRows.map((r: any, i: number) => (
                <div key={i} className="flex flex-col gap-1 bg-white rounded border border-slate-100 px-2 py-1 shadow-sm">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 truncate font-medium max-w-[13rem]">{r.requirementTitle}</span>
                    <span className="shrink-0 flex items-center gap-2">
                      <span className="text-slate-455 font-mono text-[9px]">{r.testCaseCount} cases</span>
                      <span className={`font-mono font-bold ${r.coveragePercentage >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {r.coveragePercentage}%
                      </span>
                    </span>
                  </div>
                  {/* Progress bar - Thinner */}
                  <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        r.coveragePercentage >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, r.coveragePercentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 flex items-center gap-1">
            <CheckCircle2 size={10} className="text-emerald-500" />
            Approved Final Test Cases ({cases.length})
          </span>

          <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
            {cases.map((tc: any, i: number) => (
              <div key={i} className="text-[11px] bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 shadow-sm flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="h-3.5 w-3.5 rounded-full bg-emerald-50 text-[9px] text-emerald-600 font-bold border border-emerald-100 flex items-center justify-center shrink-0">
                    ✓
                  </span>
                  <span className="font-medium text-slate-700 truncate">{tc.title || tc.id}</span>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {tc.priority && (
                    <span className={`text-[8px] font-bold uppercase px-1.5 rounded border ${
                      tc.priority.toLowerCase() === 'high' || tc.priority.toLowerCase() === 'p0'
                        ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}>
                      {tc.priority}
                    </span>
                  )}
                  {tc.category && (
                    <span className={`text-[8px] font-bold uppercase px-1.5 rounded border ${getCategoryBadgeClass(tc.category)}`}>
                      {tc.category}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl font-mono whitespace-pre-wrap max-h-90 overflow-y-auto m-2.5 border border-slate-800">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

type TabId = 'summary' | 'thinking' | 'input' | 'output' | 'trace' | 'errors';

function AgentDetailTabs({ agentLog, node, thinkingText }: { agentLog: any; node: any; thinkingText: string | null }) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [copied, setCopied] = useState(false);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const isRunning = node?.status === 'running';

  useEffect(() => {
    if (thinkingText && activeTab === 'thinking' && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText, activeTab]);

  useEffect(() => {
    if (node?.status === 'running') setActiveTab('thinking');
    if (node?.status === 'completed' || node?.status === 'done') setActiveTab('summary');
  }, [node?.status]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'thinking', label: 'Streaming Thinking' },
    { id: 'input', label: 'Prompts' },
    { id: 'output', label: 'Raw Output' },
    { id: 'trace', label: 'Trace Logs' },
    { id: 'errors', label: 'Errors' },
  ];

  const handleCopyRawJson = useCallback(() => {
    if (agentLog?.output_data) {
      navigator.clipboard.writeText(JSON.stringify(agentLog.output_data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [agentLog]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sleek Sub-tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50/70 overflow-x-auto scrollbar-none sticky top-0 z-20 px-2 shrink-0">
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all relative shrink-0 -mb-px text-[10px] ${
              activeTab === tab.id 
                ? 'border-blue-600 text-blue-700 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.id === 'thinking' && isRunning && thinkingText && (
              <span className="absolute top-2.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === 'summary' && <AgentSummaryView agentLog={agentLog} agentName={node.agentName} />}
            
            {activeTab === 'thinking' && (
              <div className="p-4 h-full">
                {/* Developer Terminal Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-inner text-slate-300 font-mono text-[11px] leading-relaxed max-height-96 min-h-[22rem] flex flex-col relative justify-between overflow-hidden">
                  <div className="absolute top-1.5 right-2 flex items-center gap-1.5 text-[9px] text-slate-600 font-bold select-none uppercase">
                    <Terminal size={10} /> AI Agent CLI Stdout
                  </div>

                  <div ref={thinkingRef} className="flex-1 overflow-y-auto whitespace-pre-wrap pr-1">
                    {thinkingText ? (
                      <div className="text-slate-300">
                        {thinkingText}
                        {isRunning && (
                          <span className="inline-block w-1.5 h-3.5 bg-blue-500 animate-pulse ml-0.5 align-middle" />
                        )}
                      </div>
                    ) : (
                      <div className="text-slate-500 italic py-10 text-center flex flex-col items-center justify-center gap-2">
                        {isRunning ? (
                          <>
                            <Loader2 size={24} className="animate-spin text-blue-500" />
                            <span>Listening to agent prompt streams...</span>
                          </>
                        ) : 'No system thinking logs available for this batch.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'input' && (
              <div className="p-4 space-y-4">
                {Array.isArray(agentLog?.input_prompt) ? (
                  agentLog.input_prompt.map((msg: any, i: number) => (
                    <div key={i} className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{msg.role} Prompt Context</div>
                      <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-800 font-mono">
                        {msg.content || 'N/A'}
                      </pre>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">System Instructions</div>
                      <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-800 font-mono">
                        {agentLog?.input_prompt?.systemPrompt || 'N/A'}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">User Request Variables</div>
                      <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl max-h-45 overflow-y-auto whitespace-pre-wrap border border-slate-800 font-mono">
                        {agentLog?.input_prompt?.userMessage || 'N/A'}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'output' && (
              <div className="p-4 space-y-3">
                {agentLog?.output_data ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-xl">
                      <span className="text-xs text-slate-600 font-medium">Click to duplicate compiled raw JSON telemetry data structure.</span>
                      <button 
                        onClick={handleCopyRawJson}
                        className="flex items-center gap-1 text-[10px] uppercase font-bold py-1 px-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors rounded-lg"
                      >
                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        {copied ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>

                    <pre className="text-xs bg-slate-950 text-slate-300 p-3.5 rounded-xl whitespace-pre-wrap max-h-96 overflow-y-auto border border-slate-800 font-mono">
                      {JSON.stringify(agentLog.output_data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-400 py-10">No compilation output yet</div>
                )}
              </div>
            )}

            {activeTab === 'trace' && (
              <div className="p-4">
                <div className="border-l-2 border-slate-150 pl-4 py-1 space-y-4">
                  {agentLog?.raw_trace?.map((entry: any, i: number) => (
                    <div key={i} className="relative group flex items-start gap-3">
                      {/* Timeline Node dot */}
                      <div className="absolute -left-[21px] mt-1.5 h-2 w-2 rounded-full border border-blue-500 bg-white shadow-sm ring-4 ring-blue-50 group-hover:bg-blue-500 transition-colors" />
                      
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          {entry.timestamp ? new Date(entry.timestamp).toISOString().slice(11, 19) : `Step ${i + 1}`}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 mt-0.5">
                          {entry.message || entry.name || `Invoked Step: [${entry.step}]`}
                        </span>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center text-xs text-slate-400 italic py-10">No low-level trace stack output recorded.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'errors' && (
              <div className="p-4">
                {agentLog?.status === 'FAILED' ? (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-700">
                    <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-bold text-sm">Execution Interrupted</h5>
                      <p className="text-xs text-red-600 mt-1 leading-normal">
                        The agent encountered a configuration or token limits boundary exception. You can review prompt settings or click "Retry Agent" in the Review section.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-xs text-emerald-600 py-10 flex flex-col items-center gap-1">
                    <CheckCircle2 size={24} className="text-emerald-500 animate-pulse" />
                    <span className="font-bold">No errors detected. Perfect health.</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

interface CheckpointEditItem {
  id: number; 
  original: string; 
  current: string; 
  status: 'unchanged' | 'modified' | 'added' | 'removed'; 
  originalData: any;
}

const getPreconditionsString = (preconditions: any): string => {
  if (!preconditions) return '';
  if (Array.isArray(preconditions)) {
    return preconditions.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
  }
  return String(preconditions);
};

const getStepsString = (steps: any): string => {
  if (!steps) return '';
  if (Array.isArray(steps)) {
    return steps.map(s => {
      if (typeof s === 'string') return s;
      return s.action || s.description || JSON.stringify(s);
    }).join('\n');
  }
  return String(steps);
};

function CheckpointEditView({ checkpointData, onAction }: {
  checkpointData: any; 
  onAction: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [items, setItems] = useState<CheckpointEditItem[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nextId, setNextId] = useState(1);
  const rawItems = checkpointData?.conditions || checkpointData?.cases || [];

  useEffect(() => {
    setItems(rawItems.map((item: any, i: number) => ({
      id: i, 
      original: item.condition || item.title || `Item ${i + 1}`,
      current: item.condition || item.title || `Item ${i + 1}`,
      status: 'unchanged' as const, 
      originalData: item,
    })));
    setNextId(rawItems.length);
  }, [rawItems]);

  const handleEdit = useCallback((id: number, value: string) =>
    setItems(prev => prev.map(item => 
      item.id === id 
        ? { 
            ...item, 
            current: value, 
            status: value !== item.original 
              ? (item.status === 'added' ? 'added' : 'modified') 
              : (item.status === 'added' ? 'added' : 'unchanged')
          } 
        : item
    )), []);

  const handleFieldEdit = useCallback((id: number, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const origData = item.originalData ? { ...item.originalData } : {};
      
      let updatedValue = value;
      if (field === 'preconditions') {
        updatedValue = typeof value === 'string' ? value.split('\n').map(l => l.trim()).filter(Boolean) : value;
      } else if (field === 'steps') {
        if (typeof value === 'string') {
          const lines = value.split('\n').map(l => l.trim()).filter(Boolean);
          const origSteps = origData.steps || [];
          const isObjectStructure = origSteps.length > 0 && typeof origSteps[0] === 'object';
          if (isObjectStructure) {
            updatedValue = lines.map((line, idx) => {
              const orig = origSteps[idx] || {};
              return { ...orig, action: line };
            });
          } else {
            updatedValue = lines;
          }
        }
      }

      origData[field] = updatedValue;

      const mainText = origData.condition || origData.title || '';

      const isModified = JSON.stringify(origData) !== JSON.stringify(item.originalData);

      return {
        ...item,
        current: mainText,
        originalData: origData,
        status: isModified
          ? (item.status === 'added' ? 'added' : 'modified')
          : (item.status === 'added' ? 'added' : 'unchanged')
      };
    }));
  }, []);

  const handleRemove = useCallback((id: number) =>
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        if (item.status === 'added') {
          return null as any;
        }
        return { ...item, status: 'removed' as const };
      }
      return item;
    }).filter(Boolean)), []);

  const handleAdd = useCallback(() => {
    const isConditions = !!checkpointData?.conditions;
    const defaultData = isConditions
      ? { condition: 'New Test Condition', category: 'Functional', riskLevel: 'Medium', primaryTechnique: 'Boundary Value Analysis' }
      : { title: 'New Test Scenario', category: 'Functional', priority: 'Medium', preconditions: [], steps: [] };

    setItems(prev => [...prev, { 
      id: nextId, 
      original: '', 
      current: isConditions ? defaultData.condition : defaultData.title, 
      status: 'added' as const, 
      originalData: defaultData 
    }]);
    setNextId(n => n + 1);
    setEditingId(nextId);
  }, [nextId, checkpointData]);

  const handleRestore = useCallback((id: number) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, status: item.current !== item.original ? 'modified' as const : 'unchanged' as const } : item)), []);

  const handleSubmit = useCallback((action: 'approve' | 'edit') => {
    const active = items.filter(i => i.status !== 'removed');
    const editedData = checkpointData?.conditions
      ? { conditions: active.map(i => ({ ...i.originalData, condition: i.current })), analysis: checkpointData.analysis }
      : { cases: active.map(i => ({ ...i.originalData, title: i.current })) };
    onAction(action, { feedback, editedData });
  }, [items, feedback, checkpointData, onAction]);

  const stats = { 
    total: items.length, 
    modified: items.filter(i => i.status === 'modified').length, 
    added: items.filter(i => i.status === 'added').length, 
    removed: items.filter(i => i.status === 'removed').length 
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Review list segment */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between bg-white px-3 py-2 border border-slate-150 rounded-xl shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            {stats.total} Review Items
            {stats.modified > 0 && <span className="text-amber-600 ml-2">· {stats.modified} modified</span>}
            {stats.added > 0 && <span className="text-emerald-600 ml-2">· {stats.added} added</span>}
            {stats.removed > 0 && <span className="text-red-500 ml-2">· {stats.removed} deleted</span>}
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => setShowDiff(!showDiff)}
              className={`text-[10px] font-bold uppercase py-1 px-2.5 rounded-lg border transition-colors ${
                showDiff 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showDiff ? '👁 Show All' : '👁 Filter Changed'}
            </button>
            <button 
              onClick={handleAdd}
              className="text-[10px] font-bold uppercase py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus size={11} /> New {checkpointData?.conditions ? 'Condition' : 'Scenario'}
            </button>
          </div>
        </div>

        {/* Item Cards container */}
        <div className="space-y-25">
          <AnimatePresence initial={false}>
            {items.map(item => {
              if (item.status === 'removed') {
                return (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 0.6, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-dashed border-red-200 bg-red-50/30 text-[11px] shadow-sm"
                  >
                    <span className="text-red-500 line-through truncate max-w-[16rem]">
                      {item.current || item.original}
                    </span>
                    <button 
                      onClick={() => handleRestore(item.id)}
                      className="text-[10px] font-bold uppercase text-slate-400 hover:text-blue-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md"
                    >
                      Undo Delete
                    </button>
                  </motion.div>
                );
              }
              
              if (showDiff && item.status === 'unchanged') return null;

              const isEditing = editingId === item.id;
              const isNew = item.status === 'added';
              const isModified = item.status === 'modified';
              
              let cardStyle = 'border-slate-200/80 bg-white';
              if (isNew) cardStyle = 'border-emerald-300 bg-emerald-50/20 shadow-[0_0_8px_rgba(16,185,129,0.06)]';
              else if (isModified) cardStyle = 'border-amber-300 bg-amber-50/20 shadow-[0_0_8px_rgba(245,158,11,0.06)]';

              return (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex flex-col px-3.5 py-2.5 rounded-xl border leading-relaxed shadow-sm transition-all ${cardStyle}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isNew && (
                        <span className="shrink-0 text-[8px] font-black tracking-widest text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded border border-emerald-200">
                          ADDED
                        </span>
                      )}
                      {isModified && (
                        <span className="shrink-0 text-[8px] font-black tracking-widest text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200">
                          EDITED
                        </span>
                      )}

                      {!isEditing && (
                        <span className="text-[11px] text-slate-700 truncate flex-1 min-w-0 font-semibold leading-tight">
                          {item.current || item.original}
                        </span>
                      )}
                      {isEditing && (
                        <span className="text-[11px] text-blue-600 font-extrabold flex items-center gap-1">
                          <Edit3 size={11} /> Editing {checkpointData?.conditions ? 'Condition' : 'Scenario'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      {isEditing ? (
                        <button 
                          onClick={() => setEditingId(null)}
                          className="px-2 py-0.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 bg-blue-50/20 font-bold text-[10px] flex items-center gap-1"
                          title="Finish Editing"
                        >
                          <Save size={10} /> Done
                        </button>
                      ) : (
                        <button 
                          onClick={() => setEditingId(item.id)}
                          className="p-1 px-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors border border-transparent hover:border-slate-200 bg-transparent text-[10px] font-bold uppercase flex items-center gap-1"
                          title="Edit Item"
                        >
                          <Edit3 size={11} /> Edit
                        </button>
                      )}
                      
                      <button 
                        onClick={() => handleRemove(item.id)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Badges row for preview mode when NOT editing */}
                  {!isEditing && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9px]">
                      {checkpointData?.conditions ? (
                        <>
                          {item.originalData?.category && (
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                              {item.originalData.category}
                            </span>
                          )}
                          {item.originalData?.riskLevel && (
                            <span className={`px-1.5 py-0.2 rounded font-semibold ${
                              item.originalData.riskLevel.toLowerCase() === 'high' 
                                ? 'bg-red-50 text-red-600 border border-red-100' 
                                : item.originalData.riskLevel.toLowerCase() === 'medium'
                                  ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                  : 'bg-slate-50 text-slate-500 border border-slate-100'
                            }`}>
                              Risk: {item.originalData.riskLevel}
                            </span>
                          )}
                          {item.originalData?.primaryTechnique && (
                            <span className="text-slate-400 italic">
                              {item.originalData.primaryTechnique}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {item.originalData?.category && (
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                              {item.originalData.category}
                            </span>
                          )}
                          {item.originalData?.priority && (
                            <span className={`px-1.5 py-0.2 rounded font-semibold ${
                              item.originalData.priority.toLowerCase() === 'high' || item.originalData.priority.toLowerCase() === 'p0'
                                ? 'bg-red-50 text-red-600 border border-red-100' 
                                : item.originalData.priority.toLowerCase() === 'medium' || item.originalData.priority.toLowerCase() === 'p1'
                                  ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                  : 'bg-slate-50 text-slate-500 border border-slate-100'
                            }`}>
                              Prio: {item.originalData.priority}
                            </span>
                          )}
                          {item.originalData?.preconditions?.length > 0 && (
                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded">
                              Pre: {item.originalData.preconditions.length}
                            </span>
                          )}
                          {item.originalData?.steps?.length > 0 && (
                            <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.2 rounded">
                              Steps: {item.originalData.steps.length}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Fully Editable form when editing */}
                  {isEditing && (
                    <div className="mt-2.5 pt-2 border-t border-slate-150 w-full">
                      {checkpointData?.conditions ? (
                        <div className="space-y-2 text-[11px]">
                          <div>
                            <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Condition Statement</label>
                            <textarea
                              value={item.originalData?.condition || ''}
                              onChange={e => handleFieldEdit(item.id, 'condition', e.target.value)}
                              className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Category</label>
                              <input
                                type="text"
                                value={item.originalData?.category || ''}
                                onChange={e => handleFieldEdit(item.id, 'category', e.target.value)}
                                className="w-full text-xs bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Risk Level</label>
                              <select
                                value={item.originalData?.riskLevel || 'Medium'}
                                onChange={e => handleFieldEdit(item.id, 'riskLevel', e.target.value)}
                                className="w-full text-xs bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Primary Technique</label>
                            <input
                              type="text"
                              value={item.originalData?.primaryTechnique || ''}
                              onChange={e => handleFieldEdit(item.id, 'primaryTechnique', e.target.value)}
                              className="w-full text-xs bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-[11px]">
                          <div>
                            <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Scenario Title</label>
                            <textarea
                              value={item.originalData?.title || ''}
                              onChange={e => handleFieldEdit(item.id, 'title', e.target.value)}
                              className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Category</label>
                              <input
                                type="text"
                                value={item.originalData?.category || ''}
                                onChange={e => handleFieldEdit(item.id, 'category', e.target.value)}
                                className="w-full text-xs bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Priority</label>
                              <select
                                value={item.originalData?.priority || 'Medium'}
                                onChange={e => handleFieldEdit(item.id, 'priority', e.target.value)}
                                className="w-full text-xs bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                                <option value="P0">P0</option>
                                <option value="P1">P1</option>
                                <option value="P2">P2</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Preconditions (one per line)</label>
                            <textarea
                              value={getPreconditionsString(item.originalData?.preconditions)}
                              onChange={e => handleFieldEdit(item.id, 'preconditions', e.target.value)}
                              placeholder="Enter preconditions..."
                              className="w-full text-[10px] font-mono bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-450 block mb-0.5 uppercase tracking-wider text-[8px]">Steps / Actions (one per line)</label>
                            <textarea
                              value={getStepsString(item.originalData?.steps)}
                              onChange={e => handleFieldEdit(item.id, 'steps', e.target.value)}
                              placeholder="Enter step actions..."
                              className="w-full text-[10px] font-mono bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[3rem]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {showDiff && (stats.modified + stats.added) === 0 && (
            <div className="text-center text-xs text-slate-400 py-8 italic bg-white border border-slate-200 border-dashed rounded-xl">
              No modifications recorded yet. Clean checklist.
            </div>
          )}
        </div>

        {/* Feedback Block */}
        <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-sm space-y-1.5">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1">
            <Activity size={10} className="text-blue-500" />
            Strategic Corrections / Feedback
          </label>
          <textarea 
            value={feedback} 
            onChange={e => setFeedback(e.target.value)}
            placeholder="Instruct the AI model how to correct conditions, prioritize cases, or add specific test coverage contexts..."
            className="w-full border border-slate-200 rounded-lg p-3 text-xs resize-none h-16 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-normal" 
          />
        </div>
      </div>

      {/* Action Decision Row */}
      <div className="border-t border-slate-200 bg-white p-3.5 flex gap-2.5 shrink-0 z-10 sticky bottom-0">
        <button 
          onClick={() => handleSubmit('approve')}
          className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] transition-all text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 text-center"
        >
          Approve Flow
        </button>
        <button 
          onClick={() => handleSubmit('edit')}
          className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 text-center"
        >
          Edit &amp; Submit
        </button>
        <button 
          onClick={() => onAction('retry', { feedback })}
          className="flex-1 py-2.5 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all text-center flex items-center justify-center gap-1.5"
        >
          <RefreshCw size={12} className="text-slate-500" /> Retry AI
        </button>
      </div>
    </div>
  );
}

function CheckpointPassedView({ node, agentLog, checkpointData }: { node: any; agentLog: any; checkpointData?: any }) {
  // Try to get data from checkpointData first, then fall back to agentLog
  const items = checkpointData?.conditions || checkpointData?.cases || 
                agentLog?.output_data?.testConditions || agentLog?.output_data?.draftTestCases || agentLog?.output_data?.finalTestCases || [];
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-100 rounded-xl p-3">
        <CheckCircle2 size={16} className="text-emerald-500 fill-emerald-50" />
        <div>
          <span>Verification Complete</span>
          <p className="text-[10px] text-emerald-600 font-normal leading-normal mt-0.5">{items.length} items logged and auto-approved during active stream.</p>
        </div>
      </div>
      
      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {items.slice(0, 30).map((item: any, i: number) => (
          <div 
            key={i} 
            className="text-xs bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-slate-700 shadow-sm flex items-center gap-2"
          >
            <Check size={11} className="text-emerald-500 shrink-0" />
            <p className="truncate">{item.title || item.condition || `Statement ${i + 1}`}</p>
          </div>
        ))}
        {items.length > 30 && (
          <div className="text-xs text-slate-400 text-center py-2">+ {items.length - 30} additional items recorded</div>
        )}
        {items.length === 0 && (
          <div className="text-center text-xs text-slate-400 py-8 italic">No checkpoint data available</div>
        )}
      </div>
    </div>
  );
}

function CompleteNodeView({ runSummary }: { runSummary: any }) {
  const cases = runSummary?.totalCases ?? 0; 
  const tokens = runSummary?.totalTokens ?? 0;
  const latency = runSummary?.totalLatencyMs ?? 0; 
  const batches = runSummary?.totalBatches ?? 0;
  
  return (
    <div className="p-6 space-y-6 text-center">
      {/* Radiant Sparkle Success check */}
      <div className="relative inline-flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-emerald-100/50 scale-125 animate-pulse" />
        <div className="relative h-16 w-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-lg flex items-center justify-center shadow-emerald-500/25">
          <CheckCircle2 size={32} className="text-white" />
        </div>
      </div>

      <div className="space-y-1.5 max-w-sm mx-auto">
        <h4 className="text-md font-bold text-slate-800">Pipeline Generation Complete</h4>
        <p className="text-xs text-slate-500 leading-normal">
          The autonomous system has concluded the execution cycle. All draft conditions have been synthesized, optimized, and reviewed under target quality constraints.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        {/* KPI Grid Item */}
        <div className="bg-white rounded-xl p-3 border border-slate-150 shadow-sm">
          <div className="text-3xl font-black text-slate-800 tracking-tight">{cases}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Test Cases Generated</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-150 shadow-sm">
          <div className="text-3xl font-black text-slate-800 tracking-tight">{batches}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Batch Batons</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-150 shadow-sm">
          <div className="text-xl font-bold text-slate-800 tracking-tight">{formatTokens(tokens)}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Tokens Saved</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-150 shadow-sm">
          <div className="text-xl font-bold text-slate-800 tracking-tight">{latency > 0 ? formatMs(latency) : 'N/A'}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Time Elapsed</div>
        </div>
      </div>

      {cases > 0 && (
        <div className="bg-emerald-50 rounded-xl p-4 text-xs text-emerald-800 leading-relaxed border border-emerald-150 text-left max-w-md mx-auto flex items-start gap-2.5">
          <Sparkles size={14} className="text-emerald-500 mt-0.5 shrink-0" />
          <p>
            Successfully generated <b>{cases} comprehensive end-to-end test scenarios</b>. You can view these directly in the <b>Test Matrix</b> panel to execute, assert, or debug them.
          </p>
        </div>
      )}
    </div>
  );
}

function getNodeIcon(nodeId: string) {
  switch (nodeId) {
    case 'preparation': return <Zap size={14} className="text-indigo-500" />;
    case 'agent_test_analyst': return <Brain size={14} className="text-cyan-600" />;
    case 'checkpoint_1': 
    case 'checkpoint_2': 
    case 'checkpoint_3': return <FileText size={14} className="text-amber-500" />;
    case 'agent_test_designer': return <PenTool size={14} className="text-violet-500" />;
    case 'agent_quality_manager': return <Star size={14} className="text-amber-500" />;
    case 'complete': return <CheckCircle2 size={14} className="text-emerald-500" />;
    default: return null;
  }
}

const statusColors: Record<string, { badge: string; label: string }> = {
  running: { badge: 'text-blue-700 bg-blue-50 border-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.1)]', label: 'In Progress' },
  waiting: { badge: 'text-amber-700 bg-amber-50 border-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.1)] animate-pulse', label: 'Action Required' },
  completed: { badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Done' },
  'auto-passed': { badge: 'text-slate-600 bg-slate-50 border-slate-200', label: 'Auto-Passed' },
  error: { badge: 'text-red-700 bg-red-50 border-red-200', label: 'Error' },
};

export function PipelineDetailPanel({ 
  node, 
  agentLog, 
  checkpointData, 
  thinkingText, 
  runSummary, 
  onClose, 
  onCheckpointAction 
}: NodeDetailProps) {
  
  if (!node) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50/50">
        <div className="text-center p-6 space-y-2">
          {/* Ambient empty state illustration */}
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
              <Sparkles size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-slate-650 uppercase tracking-widest">Select Node</h5>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              Please click any stage or agent on the flow timeline above to inspect real-time outputs, reviews, and detailed telemetry context.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeStatus = statusColors[node.status] || { badge: 'text-slate-600 bg-slate-50 border-slate-200', label: node.status };

  const nodeType = node.kind || node.type || '';

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden shadow-inner">
      {/* Top Header Row with Metadata panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/85 bg-slate-50/70 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1 px-1.5 bg-white border border-slate-200/50 rounded-lg shadow-sm">
            {getNodeIcon(node.id)}
          </div>
          
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider truncate">{node.label}</h4>
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${activeStatus.badge}`}>
                {activeStatus.label}
              </span>
            </div>
            
            {/* Real-time metrics badges inside detail panel header */}
            {(node.meta?.latencyMs || node.meta?.tokenUsage || node.meta?.outputCount) ? (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium mt-0.5">
                {node.meta?.latencyMs && (
                  <span className="flex items-center">
                    ⏱ {formatMs(node.meta.latencyMs)}
                  </span>
                )}
                {node.meta?.tokenUsage && (
                  <span className="flex items-center">
                    🔑 {formatTokens(node.meta.tokenUsage)} tokens
                  </span>
                )}
                {node.meta?.outputCount && (
                  <span className="flex items-center">
                    📦 {node.meta.outputCount} {node.meta.outputLabel || 'items'}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 select-none">No immediate telemetry metrics generated yet.</p>
            )}
          </div>
        </div>

        <button 
          onClick={onClose} 
          className="p-1.5 hover:bg-slate-200/60 rounded-lg transition-colors shrink-0 ml-2"
          title="Fold Inspection Panel"
        >
          <X size={15} className="text-slate-400 hover:text-slate-700" />
        </button>
      </div>

      {/* Main Panel Content Body */}
      <div className="flex-1 overflow-y-auto">
        {nodeType === 'agent' ? (
          <AgentDetailTabs agentLog={agentLog} node={node} thinkingText={thinkingText} />
        ) : nodeType === 'checkpoint' && (node.status === 'waiting' || node.status === 'running') ? (
          <CheckpointEditView checkpointData={checkpointData} onAction={(action, data) => onCheckpointAction?.(action, data)} />
        ) : nodeType === 'checkpoint' ? (
          // Show checkpoint data from agent logs if available (for completed runs)
          <CheckpointPassedView node={node} agentLog={agentLog} checkpointData={checkpointData} />
        ) : nodeType === 'complete' ? (
          <CompleteNodeView runSummary={runSummary} />
        ) : (
          <div className="p-4">
            {nodeType === 'preparation' && node.subSteps && (
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm space-y-3.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <Terminal size={10} />
                  Initialization Checklist Trace
                </span>
                
                <div className="space-y-2.5">
                  {node.subSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {step.done ? (
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      ) : step.running ? (
                        <Loader2 size={15} className="animate-spin text-blue-500 shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0 bg-slate-50" />
                      )}
                      <span className={`text-[11px] font-medium leading-normal ${
                        step.done 
                          ? 'text-emerald-700 font-bold' 
                          : step.running 
                            ? 'text-blue-700' 
                            : 'text-slate-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

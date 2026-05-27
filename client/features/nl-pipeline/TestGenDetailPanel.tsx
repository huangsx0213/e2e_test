import { useState, useEffect, useCallback } from 'react';
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
  Filter,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NodeDetailProps {
  node: {
    id: string;
    kind?: string;
    type?: string;
    label?: string;
    status: string;
    meta?: any;
    runId?: string;
    subSteps?: { label: string; done: boolean; running?: boolean }[];
  } | null;
  agentLog: any | null;
  checkpointData: any | null;
  thinkingText: string | null;
  runSummary: { totalCases: number; totalTokens: number; totalLatencyMs: number; totalBatches: number } | null;
  agentLogs?: any[];
  onClose: () => void;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry' | 'continue', data?: any) => void;
  onCheckpointDataChange?: (data: any) => void;
  reviewMode?: boolean;
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

function PreparationSummaryView({ node, agentLog, thinkingText, allAgentLogs }: { node: any; agentLog: any; thinkingText: string | null; allAgentLogs: any[] }) {
  const meta = node?.meta;
  const output = agentLog?.output_data;

  // Use logs from agentLog output_data (persisted after completion)
  const initLogs = output?.initLogs || output?.initializationLogs || [];

  // Format log entry to human-readable message
  const formatLogEntry = (log: any): string => {
    if (log.data?.message) return log.data.message;
    if (log.message || log.text) return log.message || log.text;
    if (log.type === 'pipeline:context') {
      const d = log.data || {};
      const parts = [];
      if (d.indexEntries != null) parts.push(`${d.indexEntries} requirements`);
      if (d.flows != null) parts.push(`${d.flows} business flows`);
      return parts.length > 0 ? `Loaded ${parts.join(' across ')}` : 'Test gen context initialized';
    }
    if (log.type === 'pipeline:budget') {
      const d = log.data || {};
      const est = d.estimated != null ? `${(d.estimated / 1000).toFixed(0)},000 tokens` : 'unknown';
      const limit = d.limit != null ? `limit: ${(d.limit / 1000).toFixed(0)},000 tokens` : 'no limit configured';
      return `Estimated token usage: ${est} (${limit})`;
    }
    if (log.type === 'phase:start' && log.data?.phase === 'preparation') {
      const d = log.data;
      return d.message || 'Starting preparation phase';
    }
    if (log.type && log.data) return `${log.type}: ${JSON.stringify(log.data)}`;
    if (log.type) return log.type;
    return JSON.stringify(log);
  };

  return (
    <div className="p-3 space-y-3 text-sm">
      {/* Initialization Header */}
      <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/35 rounded-lg p-2.5 border border-indigo-100/60 shadow-sm">
        <div className="flex items-center gap-1 text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1">
          <Zap size={12} className="text-indigo-600" />
          Environment Initialized
        </div>
        <p className="text-sm text-slate-600 leading-snug font-medium">
          Pipeline environment ready for test generation
        </p>
      </div>

      {/* AI Flow Initialization Info - Only show if we have logs */}
      {initLogs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider text-slate-450 mb-2">
            <Activity size={12} className="text-blue-500" />
            AI Flow Initialization Logs
          </div>

          <div className="space-y-1 pr-1">
            {initLogs.map((log: any, i: number) => {
              const logStr = formatLogEntry(log);

              let iconColor = 'text-slate-400';
              let Icon = Activity;
              if (log.type === 'pipeline:context') { iconColor = 'text-blue-600'; Icon = FileText; }
              else if (log.type === 'pipeline:budget') { iconColor = 'text-amber-600'; Icon = Activity; }
              else if (log.type === 'phase:start') { iconColor = 'text-emerald-600'; Icon = Zap; }

              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Icon size={12} className={`${iconColor} shrink-0 mt-0.5`} />
                  <span className="text-slate-600 leading-relaxed">{logStr}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preparation Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Requirements Count */}
        <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
          <div className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">
            <FileText size={12} className="text-slate-400" />
            Requirements
          </div>
          <div className="text-lg font-bold text-slate-700">
            {output?.requirementCount || meta?.requirementCount || output?.initLogs?.length || 0}
          </div>
        </div>

        {/* Batch Info */}
        <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
          <div className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">
            <Copy size={12} className="text-slate-400" />
            Batches
          </div>
          <div className="text-lg font-bold text-slate-700">
            {output?.totalBatches || meta?.totalBatches || '-'}
          </div>
        </div>

        {/* Token Budget */}
        <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
          <div className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">
            <Activity size={12} className="text-slate-400" />
            Token Budget
          </div>
          <div className="text-sm font-bold text-slate-700 truncate">
            {output?.estimatedTokens ? `${formatTokens(output.estimatedTokens)} est.` : meta?.estimatedTokens ? `${formatTokens(meta.estimatedTokens)} est.` : '-'}
          </div>
        </div>

        {/* Flow Cases */}
        <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
          <div className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">
            <History size={12} className="text-slate-400" />
            Flow Cases
          </div>
          <div className="text-lg font-bold text-slate-700">
            {output?.flowCases ? `${output.flowCases}` : meta?.flowCases ? `${meta.flowCases}` : '-'}
          </div>
        </div>
      </div>

      {/* Environment Details */}
      {(output?.environment || meta?.environment) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 shadow-sm">
          <div className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-450 mb-1.5">
            <Terminal size={12} className="text-slate-400" />
            Environment
          </div>
          <pre className="text-sm text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(output?.environment || meta?.environment, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function AgentSummaryView({ agentLog, agentName }: { agentLog: any; agentName?: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCond, setExpandedCond] = useState<Set<number>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const toggleCond = (i: number) => setExpandedCond(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleSteps = (i: number) => setExpandedSteps(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleField = (k: string) => setExpandedFields(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const output = agentLog?.output_data;

  if (!output) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl m-3">
        <Loader2 className="animate-spin text-slate-300 mb-2" size={20} />
        <div className="text-sm text-slate-450 italic">Processing pipeline logs... Please wait.</div>
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
      <div className="p-3 space-y-3 text-sm">
        {output.analysis?.overallApproach && (
          <div className="bg-gradient-to-br from-cyan-50/70 to-blue-50/35 rounded-lg p-2.5 border border-cyan-100/60 shadow-sm">
            <div className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-cyan-800 mb-1">
              <Brain size={12} className="text-cyan-600" />
              Strategic Approach
            </div>
            <p className="text-sm text-slate-600 leading-snug">{output.analysis.overallApproach}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-450 flex items-center gap-1">
              <Terminal size={10} className="text-slate-400" />
              Conditions ({conditions.length})
            </span>
            {conditions.length > 4 && (
              <div className="relative w-36">
                <input type="text" placeholder="Filter..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full text-xs pl-5 pr-2 py-0.5 border border-slate-200 rounded bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <Search size={10} className="absolute left-1.5 top-1.5 text-slate-400" />
              </div>
            )}
          </div>

          <div className="space-y-1.5 pr-0.5">
            {filteredConditions.map((c: any, i: number) => {
              const exp = expandedCond.has(i);
              return (
              <div key={i} className="text-sm bg-white border border-slate-100 rounded-lg p-2.5 shadow-sm space-y-1.5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <span className="shrink-0 text-xs font-mono text-slate-450 bg-slate-50 border border-slate-100 px-1 py-0.2 rounded">{String(i + 1).padStart(2, '0')}</span>
                    <p className="text-slate-700 leading-tight font-medium">{c.condition}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    {c.priority && <span className={`text-[10px] font-bold uppercase px-1.5 rounded border ${c.priority === 'critical' || c.priority === 'high' ? 'bg-rose-50 text-rose-600 border-rose-100' : c.priority === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{c.priority}</span>}
                    {c.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 rounded border ${getCategoryBadgeClass(c.category)}`}>{c.category}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  {c.riskLevel && <span className={`px-1.5 py-0.2 rounded font-bold uppercase border ${c.riskLevel === 'high' ? 'bg-red-50 text-red-600 border-red-100' : c.riskLevel === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>Risk: {c.riskLevel}</span>}
                  {c.primaryTechnique && <span className="px-1.5 py-0.2 rounded font-bold uppercase border bg-indigo-50 text-indigo-600 border-indigo-100">{c.primaryTechnique}</span>}
                  {c.requirementLevel && <span className="px-1.5 py-0.2 rounded font-bold uppercase border bg-cyan-50 text-cyan-600 border-cyan-100">{c.requirementLevel}</span>}
                </div>

                {exp && (
                  <div className="text-xs text-slate-500 space-y-1.5 border-t border-slate-100 pt-1.5">
                    {c.secondaryTechniques?.length > 0 && <p><span className="font-medium text-slate-600">Secondary:</span> {c.secondaryTechniques.join(', ')}</p>}
                    {c.techniqueRationale && <p className="italic">{c.techniqueRationale}</p>}
                    {c.coverageDimensions?.length > 0 && c.coverageDimensions.map((cd: any, j: number) => (
                      <p key={j}><span className="font-medium text-slate-600">{cd.dimension}:</span> {cd.variants?.join(', ')}</p>
                    ))}
                    {c.dataRequirements && <p><span className="font-medium text-slate-600">Data:</span> {c.dataRequirements}</p>}
                    {c.dependencies?.length > 0 && <p><span className="font-medium text-slate-600">Depends on:</span> {c.dependencies.join(', ')}</p>}
                    <p className="text-slate-400 font-mono text-[10px]">ID: {c.id} | Req: {c.requirementId}</p>
                  </div>
                )}

                <button onClick={() => toggleCond(i)} className="text-xs text-blue-500 font-semibold hover:text-blue-600 w-full text-center">
                  {exp ? 'Show less' : 'Show more details'}
                </button>
              </div>
              );
            })}
            {filteredConditions.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-4">No matching conditions found</div>
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
      <div className="p-3 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="p-1 px-1.5 bg-indigo-50/50 border border-indigo-100/65 rounded text-indigo-600 flex items-center gap-1 text-xs uppercase font-bold tracking-wider">
            <PenTool size={12} />
            {cases.length} Scenarios Created
          </div>
          {cases.length > 4 && (
            <div className="relative w-36">
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-5 pr-2 py-0.5 border border-slate-200 rounded bg-white text-slate-700 focus:outline-none" />
              <Search size={10} className="absolute left-1.5 top-1.5 text-slate-400" />
            </div>
          )}
        </div>

        <div className="space-y-1.5 pr-0.5">
          {filteredCases.map((tc: any, i: number) => {
            const stepsExp = expandedSteps.has(i);
            const preExp = expandedFields.has(`pre_${i}`);
            const tagsExp = expandedFields.has(`tags_${i}`);
            const reviewExp = expandedFields.has(`review_${i}`);
            const dataExp = expandedFields.has(`data_${i}`);
            return (
            <div key={i} className="text-sm bg-white border border-slate-100 rounded-lg p-2.5 shadow-sm space-y-1.5 hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800 text-sm truncate">{tc.title || tc.id}</span>
                <div className="flex flex-wrap items-center gap-1 shrink-0">
                  {tc.priority && <span className={`text-[10px] font-bold uppercase px-1.5 rounded border ${tc.priority === 'high' || tc.priority === 'p0' ? 'bg-rose-50 text-rose-600 border-rose-100' : tc.priority === 'medium' || tc.priority === 'p1' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{tc.priority}</span>}
                  {tc.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 rounded border ${getCategoryBadgeClass(tc.category)}`}>{tc.category}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {tc.techniqueApplied && <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase border bg-indigo-50 text-indigo-600 border-indigo-100">{tc.techniqueApplied}</span>}
                {tc.selfReview?.score !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase border ${tc.selfReview.score >= 8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.selfReview.score >= 5 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    Score: {tc.selfReview.score}/10
                  </span>
                )}
              </div>

              {tc.preconditions && tc.preconditions.length > 0 && (
                <div>
                  <button onClick={() => toggleField(`pre_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600 w-full text-left">
                    Preconditions ({tc.preconditions.length})
                    {preExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                  {preExp && <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-slate-100">{tc.preconditions.map((p: string, j: number) => <p key={j} className="text-sm text-slate-500 leading-snug">{j + 1}. {p}</p>)}</div>}
                </div>
              )}

              {tc.steps && tc.steps.length > 0 && (
                <div className="space-y-0.5">
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Steps ({tc.steps.length})</span>
                  <div className="space-y-0.5">
                    {(stepsExp ? tc.steps : tc.steps.slice(0, 3)).map((st: any, sIdx: number) => (
                      <div key={sIdx} className="flex gap-1 text-sm text-slate-500 leading-snug">
                        <span className="text-slate-300 font-bold shrink-0">{sIdx + 1}.</span>
                        <div>
                          <p className="leading-tight">{st.action || st.description || st}</p>
                          {st.expected && <p className="text-xs text-slate-400 italic">→ {st.expected}</p>}
                        </div>
                      </div>
                    ))}
                    {tc.steps.length > 3 && <button onClick={() => toggleSteps(i)} className="text-xs text-blue-500 font-semibold hover:text-blue-600">{stepsExp ? 'Show fewer' : `+ ${tc.steps.length - 3} more steps`}</button>}
                  </div>
                </div>
              )}

              {(tc.tags?.length > 0 || tc.testData || tc.selfReview?.issues) && (
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-1.5 space-y-1">
                  {tc.tags?.length > 0 && (
                    <div>
                      <button onClick={() => toggleField(`tags_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                        Tags ({tc.tags.length}) {tagsExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                      {tagsExp && <div className="flex flex-wrap gap-1 mt-1">{tc.tags.map((tag: string, j: number) => <span key={j} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-50 text-slate-500 border-slate-100">{tag}</span>)}</div>}
                    </div>
                  )}
                  {tc.testData && (
                    <div>
                      <button onClick={() => toggleField(`data_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                        Test Data {dataExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                      {dataExp && <p className="mt-1 text-sm text-slate-500">{typeof tc.testData === 'string' ? tc.testData : JSON.stringify(tc.testData)}</p>}
                    </div>
                  )}
                  {tc.selfReview && (
                    <div>
                      <button onClick={() => toggleField(`review_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                        Self Review ({tc.selfReview.score}/10) {reviewExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                      {reviewExp && <div className="mt-1 space-y-1">{tc.selfReview.issues?.map((iss: any, j: number) => (
                        <div key={j} className="text-sm bg-slate-50 border border-slate-100 rounded p-1.5 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-bold uppercase px-1 rounded border ${iss.severity === 'blocker' ? 'bg-rose-50 text-rose-600 border-rose-100' : iss.severity === 'major' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{iss.severity}</span>
                            <span className="text-[10px] font-bold uppercase text-slate-400">{iss.category}</span>
                          </div>
                          <p className="text-sm text-slate-600">{iss.description}</p>
                          <p className="text-xs text-slate-400 italic">Suggestion: {iss.suggestion}</p>
                        </div>
                      ))}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
          {filteredCases.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-4">No matching drafts found</div>
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
      <div className="p-3 space-y-3 text-sm">
        {matrixRows.length > 0 && (
          <div className="bg-slate-50 text-slate-800 rounded-lg p-2.5 border border-slate-150 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider text-slate-500 mb-1.5">
              <Star size={12} className="text-amber-500 fill-amber-300" />
              Coverage Matrix ({matrixRows.length} requirements)
            </div>
            <div className="space-y-1.5 pr-0.5">
              {matrixRows.map((r: any, i: number) => {
                const matrixExp = expandedFields.has(`matrix_${i}`);
                return (
                <div key={i} className="flex flex-col gap-1 bg-white rounded border border-slate-100 px-2 py-1 shadow-sm">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 truncate">
                      <button onClick={() => toggleField(`matrix_${i}`)} className="shrink-0 text-slate-300 hover:text-slate-500">
                        {matrixExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <span className="text-slate-700 truncate font-medium max-w-[13rem]">{r.requirementTitle}</span>
                      {r.level && <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 rounded border bg-cyan-50 text-cyan-600 border-cyan-100">{r.level}</span>}
                    </div>
                    <span className="shrink-0 flex items-center gap-2">
                      <span className="text-slate-450 font-mono text-xs">{r.totalConditions} cond</span>
                      <span className="text-slate-450 font-mono text-xs">{r.testCaseCount} cases</span>
                      <span className={`font-mono font-bold ${r.coveragePercentage >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{r.coveragePercentage}%</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${r.coveragePercentage >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, r.coveragePercentage)}%` }} />
                  </div>

                  {matrixExp && (
                    <div className="text-xs text-slate-500 border-t border-slate-100 pt-1.5 space-y-1.5">
                      {r.techniqueBreakdown && Object.keys(r.techniqueBreakdown).length > 0 && (
                        <div>
                          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Techniques</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {Object.entries(r.techniqueBreakdown).map(([tech, count]: [string, any]) => (
                              <span key={tech} className="text-[10px] px-1.5 py-0.2 rounded border bg-indigo-50 text-indigo-600 border-indigo-100">{tech} ({count})</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.categoryBreakdown && Object.keys(r.categoryBreakdown).length > 0 && (
                        <div>
                          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Categories</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {Object.entries(r.categoryBreakdown).map(([cat, count]: [string, any]) => (
                              <span key={cat} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-50 text-slate-500 border-slate-100">{cat} ({count})</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.uncoveredRisks?.length > 0 && (
                        <div>
                          <span className="text-xs uppercase font-bold tracking-wider text-rose-500">Uncovered Risks ({r.uncoveredRisks.length})</span>
                          <ul className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-rose-100">
                            {r.uncoveredRisks.map((risk: string, j: number) => (
                              <li key={j} className="text-sm text-rose-500 leading-snug">• {risk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-xs uppercase font-bold tracking-wider text-slate-450 flex items-center gap-1 mb-2">
            <CheckCircle2 size={12} className="text-emerald-500" />
            Approved Final Test Cases ({cases.length})
          </span>

          <div className="space-y-1.5 pr-0.5">
            {cases.map((tc: any, i: number) => {
              const stepsExp = expandedSteps.has(i);
              const preExp = expandedFields.has(`pre_${i}`);
              const tagsExp = expandedFields.has(`tags_${i}`);
              const reviewExp = expandedFields.has(`review_${i}`);
              const issuesExp = expandedFields.has(`issues_${i}`);
              const dataExp = expandedFields.has(`data_${i}`);
              const changelogExp = expandedFields.has(`changelog_${i}`);
              return (
              <div key={i} className="text-sm bg-white border border-slate-100 rounded-lg p-2.5 shadow-sm space-y-1.5 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="h-3.5 w-3.5 rounded-full bg-emerald-50 text-[10px] text-emerald-600 font-bold border border-emerald-100 flex items-center justify-center shrink-0">✓</span>
                    <span className="font-medium text-slate-700 truncate">{tc.title || tc.id}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    {tc.priority && <span className={`text-[10px] font-bold uppercase px-1.5 rounded border ${tc.priority === 'high' || tc.priority === 'p0' ? 'bg-rose-50 text-rose-600 border-rose-100' : tc.priority === 'medium' || tc.priority === 'p1' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{tc.priority}</span>}
                    {tc.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 rounded border ${getCategoryBadgeClass(tc.category)}`}>{tc.category}</span>}
                    {tc.status && <span className={`text-[10px] font-bold uppercase px-1.5 rounded border ${tc.status === 'approved' || tc.status === 'final' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{tc.status}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {tc.techniqueApplied && <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase border bg-indigo-50 text-indigo-600 border-indigo-100">{tc.techniqueApplied}</span>}
                  {tc.selfReview?.score !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase border ${tc.selfReview.score >= 8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.selfReview.score >= 5 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                      Score: {tc.selfReview.score}/10
                    </span>
                  )}
                  {tc.selfReview?.pass !== undefined && <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase border ${tc.selfReview.pass ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{tc.selfReview.pass ? 'PASS' : 'REVIEW'}</span>}
                </div>

                {tc.preconditions && tc.preconditions.length > 0 && (
                  <div>
                    <button onClick={() => toggleField(`pre_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600 w-full text-left">
                      Preconditions ({tc.preconditions.length}) {preExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </button>
                    {preExp && <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-slate-100">{tc.preconditions.map((p: string, j: number) => <p key={j} className="text-sm text-slate-500 leading-snug">{j + 1}. {p}</p>)}</div>}
                  </div>
                )}

                {tc.steps && tc.steps.length > 0 && (
                  <div className="space-y-0.5">
                    <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Steps ({tc.steps.length})</span>
                    <div className="space-y-0.5">
                      {(stepsExp ? tc.steps : tc.steps.slice(0, 3)).map((st: any, sIdx: number) => (
                        <div key={sIdx} className="flex gap-1 text-sm text-slate-500 leading-snug">
                          <span className="text-slate-300 font-bold shrink-0">{sIdx + 1}.</span>
                          <div>
                            <p className="leading-tight">{st.action || st.description || st}</p>
                            {st.expected && <p className="text-xs text-slate-400 italic">→ {st.expected}</p>}
                          </div>
                        </div>
                      ))}
                      {tc.steps.length > 3 && <button onClick={() => toggleSteps(i)} className="text-xs text-blue-500 font-semibold hover:text-blue-600">{stepsExp ? 'Show fewer' : `+ ${tc.steps.length - 3} more steps`}</button>}
                    </div>
                  </div>
                )}

                {(tc.tags?.length > 0 || tc.testData || tc.selfReview?.issues || tc.reviewSummary || tc.changeLog) && (
                  <div className="text-xs text-slate-500 border-t border-slate-100 pt-1.5 space-y-1">
                    {tc.tags?.length > 0 && (
                      <div>
                        <button onClick={() => toggleField(`tags_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                          Tags ({tc.tags.length}) {tagsExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </button>
                        {tagsExp && <div className="flex flex-wrap gap-1 mt-1">{tc.tags.map((tag: string, j: number) => <span key={j} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-50 text-slate-500 border-slate-100">{tag}</span>)}</div>}
                      </div>
                    )}
                    {tc.testData && (
                      <div>
                        <button onClick={() => toggleField(`data_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                          Test Data {dataExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </button>
                        {dataExp && <p className="mt-1 text-sm text-slate-500">{typeof tc.testData === 'string' ? tc.testData : JSON.stringify(tc.testData)}</p>}
                      </div>
                    )}
                    {tc.reviewSummary && (
                      <div>
                        <button onClick={() => toggleField(`review_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                          Review Summary {reviewExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </button>
                        {reviewExp && <p className="mt-1 text-sm italic text-slate-400">{tc.reviewSummary}</p>}
                      </div>
                    )}
                    {tc.selfReview?.issues?.length > 0 && (
                      <div>
                        <button onClick={() => toggleField(`issues_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                          Issues ({tc.selfReview.issues.length}) {issuesExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </button>
                        {issuesExp && <div className="mt-1 space-y-1">{tc.selfReview.issues.map((iss: any, j: number) => (
                          <div key={j} className="text-sm bg-slate-50 border border-slate-100 rounded p-1.5 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className={`text-[10px] font-bold uppercase px-1 rounded border ${iss.severity === 'blocker' ? 'bg-rose-50 text-rose-600 border-rose-100' : iss.severity === 'major' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{iss.severity}</span>
                              <span className="text-[10px] font-bold uppercase text-slate-400">{iss.category}</span>
                            </div>
                            <p className="text-sm text-slate-600">{iss.description}</p>
                            <p className="text-xs text-slate-400 italic">Suggestion: {iss.suggestion}</p>
                          </div>
                        ))}</div>}
                      </div>
                    )}
                    {tc.changeLog && (
                      <div>
                        <button onClick={() => toggleField(`changelog_${i}`)} className="flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-slate-400 hover:text-slate-600">
                          Change Log {changelogExp ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </button>
                        {changelogExp && <p className="mt-1 text-sm text-slate-500">{typeof tc.changeLog === 'string' ? tc.changeLog : JSON.stringify(tc.changeLog)}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 h-full flex flex-col">
      <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl font-mono whitespace-pre-wrap overflow-y-auto min-h-0 flex-1 border border-slate-800">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}

type TabId = 'summary' | 'thinking' | 'input' | 'output' | 'trace' | 'errors';

function AgentDetailTabs({ agentLog, node, thinkingText, agentLogs }: { agentLog: any; node: any; thinkingText: string | null; agentLogs?: any[] }) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [copied, setCopied] = useState(false);
  const isRunning = node?.status === 'running';
  const autoScroll = isRunning;

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
    <div className="flex flex-col flex-1 overflow-hidden">
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

      <div className="flex-1 overflow-hidden bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="h-full overflow-y-auto"
          >
            {activeTab === 'summary' && (
  node.kind === 'preparation' || node.agentName === 'preparation' ? (
    <PreparationSummaryView node={node} agentLog={agentLog} thinkingText={thinkingText} allAgentLogs={agentLogs || []} />
  ) : (
    <AgentSummaryView agentLog={agentLog} agentName={node.agentName} />
  )
)}
            
            {activeTab === 'thinking' && (
              <div className="p-4 h-full flex flex-col">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-inner text-slate-300 font-mono text-[11px] leading-relaxed flex-1 flex flex-col relative overflow-hidden min-h-0">
                  <div className="absolute top-1.5 right-2 flex items-center gap-1.5 text-[9px] text-slate-600 font-bold select-none uppercase">
                    <Terminal size={10} /> AI Agent CLI Stdout
                  </div>

                  <div className="flex-1 overflow-y-auto whitespace-pre-wrap pr-1 min-h-0">
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
                    <div ref={(el) => { if (el && autoScroll) el.scrollIntoView({ behavior: 'instant' }); }} />
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'input' && (
              <div className="p-4 h-full flex flex-col overflow-hidden">
                {Array.isArray(agentLog?.input_prompt) ? (
                  <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
                    {agentLog.input_prompt.map((msg: any, i: number) => (
                      <div key={i} className="flex-1 flex flex-col min-h-0 space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{msg.role} Prompt Context</div>
                        <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl flex-1 overflow-y-auto whitespace-pre-wrap border border-slate-800 font-mono min-h-0">
                          {msg.content || 'N/A'}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
                    <div className="flex-1 flex flex-col min-h-0 space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase shrink-0">System Instructions</div>
                      <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl flex-1 overflow-y-auto whitespace-pre-wrap border border-slate-800 font-mono min-h-0">
                        {agentLog?.input_prompt?.systemPrompt || 'N/A'}
                      </pre>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0 space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase shrink-0">User Request Variables</div>
                      <pre className="text-xs bg-slate-950 text-slate-300 p-3 rounded-xl flex-1 overflow-y-auto whitespace-pre-wrap border border-slate-800 font-mono min-h-0">
                        {agentLog?.input_prompt?.userMessage || 'N/A'}
                      </pre>
                    </div>
                  </div>
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

function CheckpointStepEditor({ steps, onChange }: { steps: any[]; onChange: (steps: any[]) => void }) {
  const handleStepChange = (index: number, field: string, value: string) => {
    const newSteps = [...steps];
    if (typeof newSteps[index] === 'string') {
      newSteps[index] = { action: newSteps[index], expected: '' };
    }
    newSteps[index] = { ...newSteps[index], [field]: value };
    onChange(newSteps);
  };

  const addStep = () => onChange([...steps, { action: '', expected: '' }]);
  const removeStep = (index: number) => onChange(steps.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-2 items-start bg-slate-50 p-2 rounded border border-slate-150 relative group">
          <div className="font-bold text-slate-400 mt-1.5 w-4 text-right text-sm">{i + 1}.</div>
          <div className="flex-1 space-y-1.5">
            <textarea
              value={s.action || s.description || (typeof s === 'string' ? s : '')}
              onChange={e => handleStepChange(i, 'action', e.target.value)}
              placeholder="Action..."
              className="w-full text-sm font-mono bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2rem] resize-y"
            />
            <textarea
              value={s.expected || ''}
              onChange={e => handleStepChange(i, 'expected', e.target.value)}
              placeholder="Expected Result..."
              className="w-full text-sm font-mono bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2rem] resize-y"
            />
          </div>
          <button 
            onClick={() => removeStep(i)}
            className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1 bg-white rounded shadow-sm border border-slate-100"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button 
        onClick={addStep}
        className="text-xs text-blue-600 font-bold uppercase py-1 px-2 hover:bg-blue-50 rounded border border-blue-200 border-dashed w-full flex items-center justify-center gap-1"
      >
        <Plus size={12} /> Add Step
      </button>
    </div>
  );
}

function CheckpointStringListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const handleChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
  };

  const addItem = () => onChange([...items, '']);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5 items-center relative group">
          <input
            type="text"
            value={item || ''}
            onChange={e => handleChange(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-sm font-mono bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button 
            onClick={() => removeItem(i)}
            className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button 
        onClick={addItem}
        className="text-xs text-blue-600 font-bold uppercase py-1 px-2 hover:bg-blue-50 rounded border border-blue-200 border-dashed w-full flex items-center justify-center gap-1"
      >
        <Plus size={12} /> Add {placeholder}
      </button>
    </div>
  );
}

function CheckpointEditView({ checkpointData, onDataChange, readOnly }: {
  checkpointData: any;
  onDataChange?: (data: any) => void;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<CheckpointEditItem[]>([]);
  const [showDiff, setShowDiff] = useState(false);
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

  useEffect(() => {
    const active = items.filter(i => i.status !== 'removed');
    if (active.length === 0) return;
    const editedData = checkpointData?.conditions
      ? { conditions: active.map(i => ({ ...i.originalData, condition: i.current })), analysis: checkpointData.analysis }
      : { cases: active.map(i => ({ ...i.originalData, title: i.current })) };
    onDataChange?.(editedData);
  }, [items, checkpointData, onDataChange]);

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
  }, [nextId, checkpointData]);

  const handleRestore = useCallback((id: number) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, status: item.current !== item.original ? 'modified' as const : 'unchanged' as const } : item)), []);

  const stats = { 
    total: items.length, 
    modified: items.filter(i => i.status === 'modified').length, 
    added: items.filter(i => i.status === 'added').length, 
    removed: items.filter(i => i.status === 'removed').length 
  };

  const isConditions = !!checkpointData?.conditions;
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const toggleExpand = (i: number) => setExpandedItems(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  if (readOnly) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 pr-1">
          {items.map((item, i) => {
            const data = item.originalData || item;
            const expanded = expandedItems.has(i);
            return (
              <div key={item.id} className="text-sm bg-white border border-slate-100 rounded-xl p-3 text-slate-700 shadow-sm flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Check size={11} className="text-emerald-500 shrink-0 mt-0.5 self-start" />
                    <p className="font-semibold text-slate-800">{data.title || data.condition || `Item ${i + 1}`}</p>
                  </div>
                  {data.priority && (
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 rounded border ${
                      ['critical', 'high', 'p0'].includes((data.priority || '').toLowerCase())
                        ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : ['medium', 'p1'].includes((data.priority || '').toLowerCase())
                          ? 'bg-amber-50 text-amber-600 border-amber-100'
                          : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}>{data.priority}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  {data.category && <span className={`px-1.5 py-0.2 rounded font-bold uppercase border ${getCategoryBadgeClass(data.category)}`}>{data.category}</span>}
                  {data.riskLevel && (
                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase border ${
                      (data.riskLevel || '').toLowerCase() === 'high' ? 'bg-red-50 text-red-600 border-red-100'
                        : (data.riskLevel || '').toLowerCase() === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}>Risk: {data.riskLevel}</span>
                  )}
                  {data.primaryTechnique && <span className="px-1.5 py-0.2 rounded font-bold uppercase border bg-indigo-50 text-indigo-600 border-indigo-100">{data.primaryTechnique}</span>}
                </div>

                {data.preconditions?.length > 0 && (
                  <div className="bg-slate-50/50 rounded p-2 border border-slate-100 text-xs">
                    <span className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1 block">Preconditions</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      {data.preconditions.map((p: string, j: number) => <li key={j}>{p}</li>)}
                    </ul>
                  </div>
                )}

                {data.steps?.length > 0 && (
                  <div className="bg-indigo-50/30 rounded p-2 border border-indigo-50/50 text-xs">
                    <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 mb-1 block">Steps</span>
                    <div className="space-y-1">
                      {(expanded ? data.steps : data.steps.slice(0, 3)).map((st: any, j: number) => (
                        <div key={j} className="flex gap-2 bg-white p-1.5 rounded border border-slate-100">
                          <div className="font-bold text-slate-300 shrink-0 w-4 text-right">{j + 1}.</div>
                          <div className="flex-1">
                            <div><span className="font-semibold text-slate-500">Action:</span> <span className="text-slate-700">{st.action || st.description || (typeof st === 'string' ? st : '')}</span></div>
                            {st.expected && <div><span className="font-semibold text-slate-500">Expected:</span> <span className="text-slate-600">{st.expected}</span></div>}
                          </div>
                        </div>
                      ))}
                      {!expanded && data.steps.length > 3 && (
                        <button onClick={() => toggleExpand(i)} className="text-xs text-blue-500 font-semibold hover:text-blue-600 w-full text-center py-1">
                          + {data.steps.length - 3} more steps
                        </button>
                      )}
                      {expanded && data.steps.length > 3 && (
                        <button onClick={() => toggleExpand(i)} className="text-xs text-blue-500 font-semibold hover:text-blue-600 w-full text-center py-1">
                          Show less
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-8 italic">No checkpoint data available</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Review list segment */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between bg-white px-3 py-2 border border-slate-150 rounded-xl shadow-sm">
          <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
            {stats.total} Review Items
            {stats.modified > 0 && <span className="text-amber-600 ml-2">· {stats.modified} modified</span>}
            {stats.added > 0 && <span className="text-emerald-600 ml-2">· {stats.added} added</span>}
            {stats.removed > 0 && <span className="text-red-500 ml-2">· {stats.removed} deleted</span>}
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => setShowDiff(!showDiff)}
              className={`text-xs font-bold uppercase py-1 px-2.5 rounded-lg border transition-colors ${
                showDiff 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showDiff ? '👁 Show All' : '👁 Filter Changed'}
            </button>
            <button 
              onClick={handleAdd}
              className="text-xs font-bold uppercase py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus size={12} /> New {checkpointData?.conditions ? 'Condition' : 'Scenario'}
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
                    className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-dashed border-red-200 bg-red-50/30 text-sm shadow-sm"
                  >
                    <span className="text-red-500 line-through truncate max-w-[16rem]">
                      {item.current || item.original}
                    </span>
                    <button 
                      onClick={() => handleRestore(item.id)}
                      className="text-xs font-bold uppercase text-slate-400 hover:text-blue-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md"
                    >
                      Undo Delete
                    </button>
                  </motion.div>
                );
              }
              
              if (showDiff && item.status === 'unchanged') return null;

              const isNew = item.status === 'added';
              const isModified = item.status === 'modified';
              
              let cardStyle = 'border-slate-200/80 bg-white';
              if (isNew) cardStyle = 'border-emerald-300 bg-emerald-50/20';
              else if (isModified) cardStyle = 'border-amber-300 bg-amber-50/20';

              return (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex flex-col px-3.5 py-2.5 rounded-xl border leading-relaxed shadow-sm transition-all ${cardStyle}`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isNew && <span className="shrink-0 text-[10px] font-black tracking-widest text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded border border-emerald-200">ADDED</span>}
                      {isModified && <span className="shrink-0 text-[10px] font-black tracking-widest text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200">EDITED</span>}
                      <span className="text-sm text-blue-600 font-extrabold flex items-center gap-1"><Edit3 size={14} /> Editing</span>
                    </div>
                    <button onClick={() => handleRemove(item.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0" title="Delete Item">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-2.5 w-full space-y-2 text-sm">
                    {checkpointData?.conditions ? (
                      <>
                        <textarea value={item.originalData?.condition || ''} onChange={e => handleFieldEdit(item.id, 'condition', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                        <div className="grid grid-cols-3 gap-2">
                          <select value={item.originalData?.category || 'happy-path'} onChange={e => handleFieldEdit(item.id, 'category', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="happy-path">Happy Path</option>
                            <option value="alternate">Alternate</option>
                            <option value="error">Error</option>
                            <option value="boundary">Boundary</option>
                          </select>
                          <select value={item.originalData?.riskLevel || 'Medium'} onChange={e => handleFieldEdit(item.id, 'riskLevel', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                          <select value={item.originalData?.priority || 'Medium'} onChange={e => handleFieldEdit(item.id, 'priority', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="Critical">Critical</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        </div>
                        <input value={item.originalData?.primaryTechnique || ''} onChange={e => handleFieldEdit(item.id, 'primaryTechnique', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Primary Technique" />
                      </>
                    ) : (
                      <>
                        <textarea value={item.originalData?.title || ''} onChange={e => handleFieldEdit(item.id, 'title', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                        <div className="grid grid-cols-2 gap-2">
                          <select value={item.originalData?.category || 'happy-path'} onChange={e => handleFieldEdit(item.id, 'category', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="happy-path">Happy Path</option>
                            <option value="alternate">Alternate</option>
                            <option value="error">Error</option>
                            <option value="boundary">Boundary</option>
                          </select>
                          <select value={item.originalData?.priority || 'Medium'} onChange={e => handleFieldEdit(item.id, 'priority', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="Critical">Critical</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                            <option value="P0">P0</option>
                            <option value="P1">P1</option>
                            <option value="P2">P2</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Preconditions</label>
                          <CheckpointStringListEditor items={item.originalData?.preconditions || []} onChange={newPre => handleFieldEdit(item.id, 'preconditions', newPre)} placeholder="Precondition" />
                        </div>
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Steps &amp; Actions</label>
                          <CheckpointStepEditor steps={item.originalData?.steps || []} onChange={newSteps => handleFieldEdit(item.id, 'steps', newSteps)} />
                        </div>
                      </>
                    )}
                  </div>
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

  </div>
  </div>
  );
}



function CompleteNodeView({ runSummary, node }: { runSummary: any; node: any }) {
  const meta = node?.meta || {};
  const cases = runSummary?.totalCases ?? meta.totalCases ?? meta.outputCount ?? 0;
  const tokens = runSummary?.totalTokens ?? meta.totalTokens ?? meta.tokenUsage ?? 0;
  const latency = runSummary?.totalLatencyMs ?? meta.totalLatencyMs ?? meta.latencyMs ?? 0;
  const batches = runSummary?.totalBatches ?? meta.totalBatches ?? 0;
  
  return (
    <div className="p-6 space-y-6 text-center h-full flex flex-col items-center justify-center overflow-y-auto">
      {/* Radiant Sparkle Success check */}
      <div className="relative inline-flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-emerald-100/50 scale-125 animate-pulse" />
        <div className="relative h-16 w-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-lg flex items-center justify-center shadow-emerald-500/25">
          <CheckCircle2 size={32} className="text-white" />
        </div>
      </div>

      <div className="space-y-1.5 max-w-sm mx-auto">
        <h4 className="text-md font-bold text-slate-800">Test Gen Complete</h4>
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
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Batches</div>
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

export function TestGenDetailPanel({
  node,
  agentLog,
  checkpointData,
  thinkingText,
  runSummary,
  agentLogs,
  onClose,
  onCheckpointAction,
  onCheckpointDataChange,
  reviewMode
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
            <h5 className="text-sm font-bold text-slate-650 uppercase tracking-widest">Select Node</h5>
            <p className="text-sm text-slate-400 max-w-xs mx-auto">
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
              <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider truncate">{node.label}</h4>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${activeStatus.badge}`}>
                {activeStatus.label}
              </span>
            </div>
            
            {(node.meta?.latencyMs || node.meta?.tokenUsage || node.meta?.outputCount) ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 font-medium mt-0.5">
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
              <p className="text-sm text-slate-400 select-none">No immediate telemetry metrics generated yet.</p>
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {nodeType === 'agent' ? (
          <AgentDetailTabs agentLog={agentLog} node={node} thinkingText={thinkingText} agentLogs={agentLogs} />
        ) : nodeType === 'preparation' ? (
          <PreparationSummaryView node={node} agentLog={agentLog} thinkingText={thinkingText} allAgentLogs={agentLogs || []} />
        ) : nodeType === 'checkpoint' ? (
          <CheckpointEditView checkpointData={checkpointData} onDataChange={onCheckpointDataChange} readOnly={!reviewMode} />
        ) : nodeType === 'complete' ? (
          <CompleteNodeView runSummary={runSummary} node={node} />
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

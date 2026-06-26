import { useState, useEffect, useCallback, useMemo } from 'react';
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
  ChevronDown,
  ChevronRight,
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface NodeDetailProps {
  runId?: string;
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
  thinkingText: import('../../shared/test-gen-run/types').ThinkingEntry[] | null;
  runSummary: { totalCases: number; totalTokens: number; totalLatencyMs: number; totalBatches: number } | null;
  agentLogs?: any[];
  startConfig?: {
    mode?: string;
    requirementIds?: string[];
    flowIds?: string[];
    useCache?: boolean;
    providerConfigName?: string;
  } | null;
  requirements?: any[];
  businessFlows?: any[];
  modelName?: string | null;
  selectedBatch?: number | null;
  batchProgress?: { current: number; total: number; generatedCases: number } | null;
  onSelectBatch?: (batch: number | null) => void;
  onClose: () => void;
  onApprove?: () => void;
  onRetry?: () => void;
  onToggleReview?: () => void;
  onDoneReviewing?: () => void;
  onCheckpointDataChange?: (data: any) => void;
  isEditing?: boolean;
  retrying?: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatMs(ms: number) { 
  if (ms < 1000) return `${ms}ms`; 
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTokens(n: number) { 
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`; 
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`; 
  return n.toLocaleString(); 
}

function getPriorityBadgeClass(priority?: string) {
  const p = (priority || '').toLowerCase();
  if (['critical', 'high', 'p0'].includes(p)) return 'bg-rose-50 text-rose-600 border-rose-100';
  if (['medium', 'p1'].includes(p)) return 'bg-amber-50 text-amber-600 border-amber-100';
  return 'bg-slate-50 text-slate-500 border-slate-100';
}

function normalizeTechnique(technique?: string): string {
  if (!technique) return '';
  const t = technique.toLowerCase().trim();
  if (t.includes('equivalence')) return 'Equivalence Partitioning';
  if (t.includes('boundary')) return 'Boundary Value Analysis';
  if (t.includes('decision')) return 'Decision Table';
  if (t.includes('state') || t.includes('transition')) return 'State Transition';
  if (t.includes('use case') || t.includes('use_case') || t.includes('usecase')) return 'Use Case';
  return technique;
}

function SelfReviewIssuesList({ issues }: { issues: any[] }) {
  if (!issues?.length) return null;
  return <div className="mt-1 space-y-1">{issues.map((iss: any, j: number) => (
    <div key={j} className="text-sm bg-slate-50 border border-slate-100 rounded p-1.5 space-y-0.5">
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-bold uppercase px-1 rounded border ${iss.severity === 'blocker' ? 'bg-rose-50 text-rose-600 border-rose-100' : iss.severity === 'major' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{iss.severity}</span>
        <span className="text-[10px] font-bold uppercase text-slate-400">{iss.category}</span>
      </div>
      <p className="text-sm text-slate-600">{iss.description}</p>
      <p className="text-xs text-slate-400 italic">Suggestion: {iss.suggestion}</p>
    </div>
  ))}</div>;
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


function AgentSummaryView({ agentLog, agentName, isRunning }: { agentLog: any; agentName?: string; isRunning?: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const toggleField = (k: string) => setExpandedFields(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const output = agentLog?.output_data;

  if (!output) {
    if (isRunning) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl m-3">
          <Loader2 className="animate-spin text-slate-300 mb-2" size={20} />
          <div className="text-sm text-slate-450 italic">Processing pipeline logs... Please wait.</div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl m-3">
        <div className="text-sm text-slate-400">No output data available for this selection.</div>
      </div>
    );
  }

  if (agentName === 'test_analyst' || agentName === 'test-analyst') {
    const conditions = output.testConditions || [];
    const filteredConditions = conditions.filter((c: any) => 
      String(c.condition || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(c.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    return (
      <div className="p-4 space-y-4">
        {output.analysis?.overallApproach && (
          <div className="bg-gradient-to-r from-cyan-50/80 to-blue-50/50 rounded-2xl p-5 border border-cyan-100/60">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-400 shadow flex items-center justify-center shadow-cyan-500/25">
                <Brain size={16} className="text-white" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Strategic Approach</h4>
                <p className="text-[10px] text-slate-500">{conditions.length} conditions identified</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{output.analysis.overallApproach}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 px-2 bg-cyan-50/50 border border-cyan-100/65 rounded-lg text-cyan-600 flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider">
              <Terminal size={12} />
              {conditions.length} Conditions
            </div>
          </div>
          {conditions.length > 4 && (
            <div className="relative w-40">
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-100" />
              <Search size={12} className="absolute left-2 top-1.5 text-slate-400" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {filteredConditions.map((c: any, i: number) => {
            return (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              {/* Header */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h4 className="text-sm font-semibold text-slate-800 truncate min-w-0">{c.condition}</h4>
                {c.priority && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getPriorityBadgeClass(c.priority)}`}>{c.priority}</span>}
                {c.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getCategoryBadgeClass(c.category)}`}>{c.category}</span>}
              </div>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-1.5">
                {c.riskLevel && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${c.riskLevel === 'high' ? 'bg-red-50 text-red-600 border-red-100' : c.riskLevel === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>Risk: {c.riskLevel}</span>}
                {c.primaryTechnique && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 bg-indigo-50 text-indigo-600 border-indigo-100">{c.primaryTechnique}</span>}
                {c.requirementLevel && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 bg-cyan-50 text-cyan-600 border-cyan-100">{c.requirementLevel}</span>}
              </div>

              {/* Details */}
              <div className="text-xs text-slate-500 space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                {c.secondaryTechniques?.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Secondary Techniques</span>
                    <p className="mt-0.5">{c.secondaryTechniques.join(', ')}</p>
                  </div>
                )}
                {c.techniqueRationale && (
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Rationale</span>
                    <p className="mt-0.5 italic">{c.techniqueRationale}</p>
                  </div>
                )}
                {c.coverageDimensions?.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Coverage Dimensions</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.coverageDimensions.map((cd: any, j: number) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-100 text-slate-600 border-slate-200">
                          {typeof cd === 'string' ? cd : (
                            <>
                              <span className="font-medium">{cd.dimension}:</span> {cd.variants?.join(', ')}
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {c.dataRequirements && (
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Data Requirements</span>
                    <p className="mt-0.5">{c.dataRequirements}</p>
                  </div>
                )}
                {c.dependencies?.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Dependencies</span>
                    <p className="mt-0.5">{c.dependencies.join(', ')}</p>
                  </div>
                )}
                <div className="pt-1 border-t border-slate-100">
                  <p className="text-slate-400 font-mono text-[10px]">ID: {c.id} | Req: {c.requirementId}</p>
                </div>
              </div>
            </div>
            );
          })}
          {filteredConditions.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-4">No matching conditions found</div>
          )}
        </div>
      </div>
    );
  }

  if (agentName === 'test_designer' || agentName === 'test-designer') {
    const cases = output.draftTestCases || [];
    const filteredCases = cases.filter((tc: any) => 
      String(tc.title || tc.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(tc.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 px-2 bg-indigo-50/50 border border-indigo-100/65 rounded-lg text-indigo-600 flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider">
              <PenTool size={12} />
              {cases.length} Scenarios Created
            </div>
          </div>
          {cases.length > 4 && (
            <div className="relative w-40">
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              <Search size={12} className="absolute left-2 top-1.5 text-slate-400" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {filteredCases.map((tc: any, i: number) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              {/* Header */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded shrink-0">
                  TC-{String(i + 1).padStart(2, '0')}
                </span>
                <h4 className="text-sm font-semibold text-slate-800 truncate min-w-0">{tc.title || tc.id}</h4>
                {tc.priority && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getPriorityBadgeClass(tc.priority)}`}>{tc.priority}</span>}
                {tc.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getCategoryBadgeClass(tc.category)}`}>{tc.category}</span>}
                {tc.status && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${tc.status === 'approved' || tc.status === 'approved_with_changes' || tc.status === 'final' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{tc.status}</span>}
                {tc.techniqueApplied && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 bg-indigo-50 text-indigo-600 border-indigo-100">{tc.techniqueApplied}</span>}
                {tc.selfReview?.score !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${tc.selfReview.score >= 8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.selfReview.score >= 5 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    Score: {tc.selfReview.score}/10
                  </span>
                )}
                {tc.selfReview?.pass !== undefined && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${tc.selfReview.pass ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{tc.selfReview.pass ? 'PASS' : 'REVIEW'}</span>}
              </div>

              {/* Tags */}
              {tc.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tc.tags.map((tag: string, j: number) => (
                    <span key={j} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-50 text-slate-500 border-slate-100">{tag}</span>
                  ))}
                </div>
              )}

              {/* Preconditions */}
              {tc.preconditions?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Preconditions</span>
                  <ul className="space-y-0.5 pl-3 border-l-2 border-slate-100">
                    {tc.preconditions.map((p: string, j: number) => (
                      <li key={j} className="text-xs text-slate-600 leading-snug">{j + 1}. {p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps */}
              {tc.steps?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Steps ({tc.steps.length})</span>
                  <div className="space-y-1">
                    {tc.steps.map((st: any, sIdx: number) => (
                      <div key={sIdx} className="flex gap-2 text-xs text-slate-600 leading-snug">
                        <span className="text-slate-300 font-bold shrink-0">{sIdx + 1}.</span>
                        <div>
                          <p className="leading-tight">{st.action || st.description || st}</p>
                          {st.expected && <p className="text-xs text-slate-400 italic mt-0.5">→ Expected: {st.expected}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Test Data */}
              {tc.testData && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Test Data</span>
                  <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    {typeof tc.testData === 'string' ? (
                      <p className="text-xs text-slate-600">{tc.testData}</p>
                    ) : Array.isArray(tc.testData) ? (
                      tc.testData.map((d: any, j: number) => {
                        if (typeof d === 'string') {
                          const sep = d.indexOf(':');
                          return (
                            <div key={j} className="flex items-start gap-2 text-xs">
                              {sep > 0 ? (
                                <>
                                  <span className="font-mono font-medium text-slate-700 shrink-0">{d.slice(0, sep)}:</span>
                                  <span className="text-slate-500">{d.slice(sep + 1).trim() || '(empty)'}</span>
                                </>
                              ) : (
                                <span className="text-slate-500">{d}</span>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-medium text-slate-700">{d.key}:</span>
                            <span className="text-slate-500">{d.value ?? '(empty)'}</span>
                          </div>
                        );
                      })
                    ) : (
                      <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap">{JSON.stringify(tc.testData, null, 2)}</pre>
                    )}
                  </div>
                </div>
              )}

              {/* Review Summary */}
              {tc.reviewSummary && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Review Summary</span>
                  <p className="text-xs text-slate-500 italic bg-slate-50 rounded-lg p-2.5 border border-slate-100">{tc.reviewSummary}</p>
                </div>
              )}

              {/* Issues */}
              {tc.selfReview?.issues?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Issues ({tc.selfReview.issues.length})</span>
                  <SelfReviewIssuesList issues={tc.selfReview.issues} />
                </div>
              )}

              {/* Change Log */}
              {tc.changeLog && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Change Log</span>
                  <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    {typeof tc.changeLog === 'string' ? (
                      <p>{tc.changeLog}</p>
                    ) : Array.isArray(tc.changeLog) ? (
                      <ul className="space-y-0.5">
                        {tc.changeLog.map((cl: any, j: number) => (
                          <li key={j}>
                            <span className="font-medium text-slate-600">{cl.field}</span>
                            {cl.from && <span className="text-slate-400"> from "{cl.from}"</span>}
                            {cl.to && <span className="text-slate-400"> to "{cl.to}"</span>}
                            {cl.reason && <span className="text-slate-400 italic"> ({cl.reason})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <pre className="whitespace-pre-wrap">{JSON.stringify(tc.changeLog, null, 2)}</pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredCases.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-4">No matching drafts found</div>
          )}
        </div>
      </div>
    );
  }

  if (agentName === 'test_architect' || agentName === 'test-architect' || agentName === 'architect') {
    const strategicGuidance = output?.strategicGuidance;
    const riskEpicTree = output?.riskEpicTree || [];
    const anomalousFlowProposals = output?.anomalousFlowProposals || [];
    const sharedStateInferences = output?.sharedStateInferences || [];
    const totalBatches = output?.totalBatches;
    const estimatedTokens = output?.estimatedTokens;

    const riskBadge = (level: string) => {
      if (level === 'high') return 'bg-rose-50 text-rose-600 border-rose-200';
      if (level === 'medium') return 'bg-amber-50 text-amber-600 border-amber-200';
      return 'bg-slate-50 text-slate-500 border-slate-200';
    };

    return (
      <div className="p-4 space-y-5 overflow-y-auto h-full">
        {/* Stats */}
        {(totalBatches || estimatedTokens) && (
          <div className="flex items-center gap-2">
            {totalBatches && (
              <div className="bg-indigo-50/50 border border-indigo-100/65 rounded-lg px-3 py-1.5 text-indigo-600 flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider">
                <Zap size={12} />
                {totalBatches} Batches
              </div>
            )}
            {estimatedTokens && (
              <div className="bg-slate-50 border border-slate-150 rounded-lg px-3 py-1.5 text-slate-600 flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider">
                <Terminal size={12} />
                ~{formatTokens(estimatedTokens)} Tokens
              </div>
            )}
          </div>
        )}

        {/* Strategic Guidance */}
        {strategicGuidance && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={12} className="text-indigo-500" />
              Strategic Guidance
            </label>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{strategicGuidance}</p>
            </div>
          </div>
        )}

        {/* Risk Epic Tree */}
        {riskEpicTree.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-500" />
              Risk Epic Tree
              <span className="text-slate-300 font-normal normal-case tracking-normal">({riskEpicTree.length})</span>
            </label>
            <div className="space-y-2">
              {riskEpicTree.map((epic: any, idx: number) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{epic.epicId}</span>
                    <span className="text-sm font-semibold text-slate-700">{epic.epicTitle}</span>
                    <span className={`text-[10px] font-bold uppercase border rounded px-1.5 py-0.5 ${riskBadge(epic.riskLevel)}`}>{epic.riskLevel}</span>
                  </div>
                  {epic.notes && <p className="text-xs text-slate-500 leading-relaxed">{epic.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anomalous Flow Proposals */}
        {anomalousFlowProposals.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={12} className="text-rose-500" />
              Anomalous Flow Proposals
              <span className="text-slate-300 font-normal normal-case tracking-normal">({anomalousFlowProposals.length})</span>
            </label>
            <div className="space-y-2">
              {anomalousFlowProposals.map((a: any, idx: number) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{a.title}</span>
                    <span className={`text-[10px] font-bold uppercase border rounded px-1.5 py-0.5 ${riskBadge(a.riskLevel)}`}>{a.riskLevel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-400 uppercase tracking-wider">Trigger</span>
                      <p className="text-slate-600 mt-0.5">{a.trigger}</p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-400 uppercase tracking-wider">Expected</span>
                      <p className="text-slate-600 mt-0.5">{a.expectedBehavior}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shared State Inferences */}
        {sharedStateInferences.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Check size={12} className="text-emerald-500" />
              Shared State Inferences
              <span className="text-slate-300 font-normal normal-case tracking-normal">({sharedStateInferences.length})</span>
            </label>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <ul className="space-y-1.5">
                {sharedStateInferences.map((s: string, idx: number) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {!strategicGuidance && riskEpicTree.length === 0 && anomalousFlowProposals.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">No architect output data available.</div>
        )}
      </div>
    );
  }

  if (agentName === 'quality_manager' || agentName === 'quality-manager') {
    const cases = output.finalTestCases || [];
    const matrix = output.coverageMatrix;
    const matrixRows = matrix?.rows || [];

    return (
      <div className="p-4 space-y-4">
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
                      <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1 rounded">{String(i + 1).padStart(2, '0')}</span>
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

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-700">Final Test Cases</h3>
            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{cases.length} total</span>
          </div>

          <div className="space-y-3">
            {cases.map((tc: any, i: number) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                {/* Header */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    TC-{String(i + 1).padStart(2, '0')}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-800 truncate min-w-0">{tc.title || tc.id}</h4>
                  {tc.priority && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getPriorityBadgeClass(tc.priority)}`}>{tc.priority}</span>}
                  {tc.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getCategoryBadgeClass(tc.category)}`}>{tc.category}</span>}
                  {tc.status && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${tc.status === 'approved' || tc.status === 'approved_with_changes' || tc.status === 'final' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{tc.status}</span>}
                  {tc.techniqueApplied && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 bg-indigo-50 text-indigo-600 border-indigo-100">{tc.techniqueApplied}</span>}
                  {tc.selfReview?.score !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${tc.selfReview.score >= 8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.selfReview.score >= 5 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                      Score: {tc.selfReview.score}/10
                    </span>
                  )}
                  {tc.selfReview?.pass !== undefined && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${tc.selfReview.pass ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{tc.selfReview.pass ? 'PASS' : 'REVIEW'}</span>}
                </div>

                {/* Tags */}
                {tc.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tc.tags.map((tag: string, j: number) => (
                      <span key={j} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-50 text-slate-500 border-slate-100">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Preconditions */}
                {tc.preconditions?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Preconditions</span>
                    <ul className="space-y-0.5 pl-3 border-l-2 border-slate-100">
                      {tc.preconditions.map((p: string, j: number) => (
                        <li key={j} className="text-xs text-slate-600 leading-snug">{j + 1}. {p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Steps */}
                {tc.steps?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Steps ({tc.steps.length})</span>
                    <div className="space-y-1">
                      {tc.steps.map((st: any, sIdx: number) => (
                        <div key={sIdx} className="flex gap-2 text-xs text-slate-600 leading-snug">
                          <span className="text-slate-300 font-bold shrink-0">{sIdx + 1}.</span>
                          <div>
                            <p className="leading-tight">{st.action || st.description || st}</p>
                            {st.expected && <p className="text-xs text-slate-400 italic mt-0.5">→ Expected: {st.expected}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Test Data */}
                {tc.testData && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Test Data</span>
                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                      {typeof tc.testData === 'string' ? (
                        <p className="text-xs text-slate-600">{tc.testData}</p>
                      ) : Array.isArray(tc.testData) ? (
                        tc.testData.map((d: any, j: number) => {
                          if (typeof d === 'string') {
                            const sep = d.indexOf(':');
                            return (
                              <div key={j} className="flex items-start gap-2 text-xs">
                                {sep > 0 ? (
                                  <>
                                    <span className="font-mono font-medium text-slate-700 shrink-0">{d.slice(0, sep)}:</span>
                                    <span className="text-slate-500">{d.slice(sep + 1).trim() || '(empty)'}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-500">{d}</span>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={j} className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-medium text-slate-700">{d.key}:</span>
                              <span className="text-slate-500">{d.value ?? '(empty)'}</span>
                            </div>
                          );
                        })
                      ) : (
                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap">{JSON.stringify(tc.testData, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                )}

                {/* Review Summary */}
                {tc.reviewSummary && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Review Summary</span>
                    <p className="text-xs text-slate-500 italic bg-slate-50 rounded-lg p-2.5 border border-slate-100">{tc.reviewSummary}</p>
                  </div>
                )}

                {/* Issues */}
                {tc.selfReview?.issues?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Issues ({tc.selfReview.issues.length})</span>
                    <SelfReviewIssuesList issues={tc.selfReview.issues} />
                  </div>
                )}

                {/* Change Log */}
                {tc.changeLog && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Change Log</span>
                    <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                      {typeof tc.changeLog === 'string' ? (
                        <p>{tc.changeLog}</p>
                      ) : Array.isArray(tc.changeLog) ? (
                        <ul className="space-y-0.5">
                          {tc.changeLog.map((cl: any, j: number) => (
                            <li key={j}>
                              <span className="font-medium text-slate-600">{cl.field}</span>
                              {cl.from && <span className="text-slate-400"> from "{cl.from}"</span>}
                              {cl.to && <span className="text-slate-400"> to "{cl.to}"</span>}
                              {cl.reason && <span className="text-slate-400 italic"> ({cl.reason})</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <pre className="whitespace-pre-wrap">{JSON.stringify(tc.changeLog, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
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

/**
 * Normalize agent text into markdown that is easier to read.
 * - Preserves code fences and JSON blocks
 * - Promotes short title-like lines into markdown headings
 * - Keeps blank lines as paragraph breaks
 */
function formatThinkingText(text: string): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // fall through
  }

  const lines = trimmed.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const content = line.trim();

    if (!content) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }

    if (content.startsWith('```')) {
      inFence = !inFence;
      out.push(content);
      continue;
    }

    const headingLike = !inFence
      && !/^([#>*-]|\d+\.)\s/.test(content)
      && content.length <= 64
      && !/[.!?。！？:]$/.test(content)
      && /^[A-Z][A-Za-z0-9\s&/()\-]+$/.test(content)
      && content.split(/\s+/).length <= 8;

    if (headingLike) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(`### ${content}`);
      out.push('');
      continue;
    }

    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function normalizeReasoningHeading(text: string): string {
  return text
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^__(.*?)__$/, '$1')
    .trim();
}

function isReasoningHeading(text: string): boolean {
  const content = normalizeReasoningHeading(text);
  return !!content
    && content.length <= 72
    && !/[.!?。！？:]$/.test(content)
    && /^[A-Z][A-Za-z0-9\s&/()\-]+$/.test(content)
    && content.split(/\s+/).length <= 8;
}

type ReasoningLogBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'entry'; text: string }
  | { kind: 'code'; text: string };

function buildReasoningLogBlocks(text: string): ReasoningLogBlock[] {
  let normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  normalized = normalized.replace(
    /([.!?。！？])(\*\*[^\n*]{2,72}\*\*)/g,
    '$1\n\n$2',
  );
  normalized = normalized.replace(
    /([.!?。！？])([A-Z][A-Za-z][A-Za-z0-9&/()\-]*(?: [A-Za-z][A-Za-z0-9&/()\-]*){0,6})(?=\n|[A-Z][a-z])/g,
    '$1\n\n$2',
  );

  const blocks: ReasoningLogBlock[] = [];
  const lines = normalized.split('\n');
  let inFence = false;
  let codeLines: string[] = [];
  let textLines: string[] = [];

  const pushEntry = (entryText: string) => {
    const clean = entryText.trim().replace(/^\*\*(.*?)\*\*$/, '$1').trim();
    if (!clean) return;
    const last = blocks[blocks.length - 1];
    if (last && last.kind === 'entry') {
      last.text = `${last.text}\n\n${clean}`;
      return;
    }
    blocks.push({ kind: 'entry', text: clean });
  };

  const flushText = () => {
    const joined = textLines.join('\n').trim();
    textLines = [];
    if (!joined) return;
    const paragraphs = joined.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const parts = paragraph.split(/(\*\*[^\n*]{2,72}\*\*)/g).map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (isReasoningHeading(part)) {
          blocks.push({ kind: 'heading', text: normalizeReasoningHeading(part) });
        } else {
          pushEntry(part);
        }
      }
    }
  };

  const flushCode = () => {
    const joined = codeLines.join('\n').trim();
    codeLines = [];
    if (joined) blocks.push({ kind: 'code', text: joined });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const content = line.trim();

    if (content.startsWith('```')) {
      if (!inFence) {
        flushText();
        inFence = true;
        continue;
      }
      inFence = false;
      flushCode();
      continue;
    }

    if (inFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (!content) {
      textLines.push('');
      continue;
    }

    textLines.push(rawLine);
  }

  flushText();
  flushCode();
  return blocks;
}

/** Collapsible reasoning block — ChatGPT "Thought for Xs" style */
function ThinkingBlock({ text, isRunning, startTime, endTime: endTimeProp }: { text: string; isRunning: boolean; startTime?: number; endTime?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const lineCount = text.split('\n').length;
  // Default collapsed when not streaming and content is long
  const [userToggled, setUserToggled] = useState(false);
  const isCollapsed = userToggled ? collapsed : (!isRunning && lineCount > 20);

  // Capture end time once when streaming stops (only if not provided externally)
  const [capturedEndTime, setCapturedEndTime] = useState<number | null>(null);
  useEffect(() => {
    if (isRunning) {
      setCapturedEndTime(null);
    } else if (!endTimeProp && !capturedEndTime) {
      setCapturedEndTime(Date.now());
    }
  }, [isRunning, endTimeProp]);

  // Compute duration label like ChatGPT's "Thought for 12s"
  const durationLabel = useMemo(() => {
    if (!startTime) return null;
    const end = endTimeProp ?? capturedEndTime ?? Date.now();
    const elapsed = Math.round((end - startTime) / 1000);
    if (elapsed < 1) return '<1s';
    if (elapsed < 60) return `${elapsed}s`;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}m ${s}s`;
  }, [startTime, endTimeProp, capturedEndTime, text]);

  const logBlocks = useMemo(() => buildReasoningLogBlocks(text), [text]);

  return (
    <div className="rounded-lg bg-slate-100/80 dark:bg-slate-800/40 overflow-hidden">
      <button
        onClick={() => { setUserToggled(true); setCollapsed(!isCollapsed); }}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-700/40 transition-colors text-left group"
      >
        {isCollapsed ? (
          <ChevronRight size={12} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
        ) : (
          <ChevronDown size={12} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
        )}
        {isRunning ? (
          <>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Thinking</span>
            <span className="inline-flex items-center gap-0.5">
              <span className="animate-pulse delay-75 text-slate-400 text-[11px]">.</span>
              <span className="animate-pulse delay-150 text-slate-400 text-[11px]">.</span>
              <span className="animate-pulse delay-300 text-slate-400 text-[11px]">.</span>
            </span>
          </>
        ) : (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Thought{durationLabel ? ` for ${durationLabel}` : ''} <span className="text-slate-400 dark:text-slate-500">({lineCount} lines)</span>
          </span>
        )}
      </button>
      {!isCollapsed && (
        <div className="px-3 pb-2.5 border-t border-slate-200/60 dark:border-slate-700/40 pt-2 space-y-2">
          {logBlocks.map((block, idx) => {
            if (block.kind === 'heading') {
              return (
                <div key={idx} className="pt-1 first:pt-0">
                  <div className="inline-flex items-center gap-2 rounded-md bg-slate-200/60 dark:bg-slate-700/40 px-2 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500 dark:bg-slate-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300 text-left">
                      {block.text}
                    </span>
                  </div>
                </div>
              );
            }

            if (block.kind === 'code') {
              return (
                <pre
                  key={idx}
                  className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-3 py-2 overflow-x-auto text-[11px] font-mono leading-relaxed whitespace-pre-wrap"
                >
                  {block.text}
                </pre>
              );
            }

            return (
              <div
                key={idx}
                className="flex gap-2 rounded-lg border border-slate-200/70 dark:border-slate-700/50 bg-white/65 dark:bg-slate-900/25 px-2.5 py-2"
              >
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                  {block.text}
                </p>
              </div>
            );
          })}
          {isRunning && (
            <span className="inline-block w-1 h-3 bg-slate-400 animate-pulse ml-0.5 align-middle rounded-sm" />
          )}
        </div>
      )}
    </div>
  );
}

/** Detect if text looks like raw JSON (starts with { or [) */
function isLikelyJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

/** Render output content — auto-detects raw JSON and formats it with syntax highlighting */
function OutputBlock({ text, isRunning }: { text: string; isRunning: boolean }) {
  // If the text looks like raw JSON, render with syntax highlighting
  if (isLikelyJson(text)) {
    let formatted = text;
    try { formatted = JSON.stringify(JSON.parse(text.trim()), null, 2); } catch { /* keep original */ }
    return (
      <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/50 overflow-hidden">
        <div className="px-2.5 py-1 border-b border-slate-200/60 dark:border-slate-700/40 flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">JSON Output</span>
          {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language="json"
          PreTag="div"
          customStyle={{ fontSize: '10px', borderRadius: '0', margin: 0, padding: '8px 12px' }}
        >
          {formatted}
        </SyntaxHighlighter>
        {isRunning && (
          <div className="px-3 pb-2">
            <span className="inline-block w-1.5 h-3 bg-slate-400 dark:bg-slate-500 animate-pulse ml-0.5 align-middle rounded-sm" />
          </div>
        )}
      </div>
    );
  }

  // Otherwise render as markdown
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/50 px-3 py-2 thinking-markdown text-[12px] leading-relaxed text-slate-700 dark:text-slate-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');
            if (match) {
              return (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ fontSize: '11px', borderRadius: '6px', margin: '6px 0', padding: '10px 12px' }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              );
            }
            if (className === 'language-') {
              return <pre className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 my-1.5 overflow-x-auto text-[11px] font-mono leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{codeStr}</pre>;
            }
            return <code className="bg-slate-100 dark:bg-slate-700/70 px-1 py-0.5 rounded text-[11px] font-mono text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-600/50" {...props}>{children}</code>;
          },
          pre({ children }) {
            return <div className="my-1.5">{children}</div>;
          },
          p({ children }) { return <p className="mb-1.5 last:mb-0">{children}</p>; },
          ul({ children }) { return <ul className="list-disc pl-4 mb-1.5">{children}</ul>; },
          ol({ children }) { return <ol className="list-decimal pl-4 mb-1.5">{children}</ol>; },
          li({ children }) { return <li className="mb-0.5">{children}</li>; },
          blockquote({ children }) { return <blockquote className="border-l-2 border-slate-300 dark:border-slate-600 pl-2 my-1 text-slate-500 dark:text-slate-400 italic">{children}</blockquote>; },
          h1({ children }) { return <h1 className="text-sm font-bold mb-1 text-slate-800 dark:text-slate-200">{children}</h1>; },
          h2({ children }) { return <h2 className="text-[13px] font-bold mb-1 text-slate-800 dark:text-slate-200">{children}</h2>; },
          h3({ children }) { return <h3 className="text-[12px] font-semibold mb-1 text-slate-800 dark:text-slate-200">{children}</h3>; },
          table({ children }) { return <table className="w-full border-collapse text-[11px] my-1.5">{children}</table>; },
          th({ children }) { return <th className="border border-slate-300 dark:border-slate-600 px-2 py-1 bg-slate-50 dark:bg-slate-800 text-left font-semibold">{children}</th>; },
          td({ children }) { return <td className="border border-slate-300 dark:border-slate-600 px-2 py-1">{children}</td>; },
        }}
      >
        {formatThinkingText(text)}
      </ReactMarkdown>
      {isRunning && (
        <span className="inline-block w-1.5 h-3 bg-slate-400 dark:bg-slate-500 animate-pulse ml-0.5 align-middle rounded-sm" />
      )}
    </div>
  );
}

function AgentDetailTabs({ agentLog, node, thinkingText, agentLogs, selectedBatch }: { agentLog: any; node: any; thinkingText: import('../../shared/test-gen-run/types').ThinkingEntry[] | null; agentLogs?: any[]; selectedBatch?: number | null }) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [activePromptTab, setActivePromptTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const isRunning = node?.status === 'running';
  const autoScroll = isRunning;

  const filteredLogs = useMemo(() => {
    if (!agentLogs?.length) return [];
    if (selectedBatch == null) return agentLogs;
    return agentLogs.filter(l => (l.batch ?? 0) === selectedBatch);
  }, [agentLogs, selectedBatch]);

  const currentAgentLog = useMemo(() => {
    if (selectedBatch == null || isRunning || !agentLogs?.length) return agentLog;
    const normalize = (n: string) => n.replace(/_/g, '-');
    const targetAgent = agentLog?.agent_name ? normalize(agentLog.agent_name) : '';
    const batchLogs = agentLogs.filter(l => normalize(l.agent_name ?? '') === targetAgent && (l.batch ?? 0) === selectedBatch);
    if (!batchLogs.length) return null;
    const merged: Record<string, any> = {};
    let mergedTrace: any[] = [];
    let errorMessage: string | null = null;
    let errorRawResponse: string | null = null;
    let tokens = { input: 0, output: 0, reasoning: 0 };
    for (const l of batchLogs) {
      if (l.output_data) {
        for (const [key, val] of Object.entries(l.output_data)) {
          if (Array.isArray(val)) {
            if (!Array.isArray(merged[key])) merged[key] = [];
            merged[key] = [...merged[key], ...val];
          } else {
            merged[key] = val;
          }
        }
      }
      if (l.raw_trace) mergedTrace.push(...l.raw_trace);
      if (l.error_message) errorMessage = l.error_message;
      if (l.error_raw_response) errorRawResponse = l.error_raw_response;
      if (l.token_usage) {
        tokens.input += l.token_usage.input || 0;
        tokens.output += l.token_usage.output || 0;
        tokens.reasoning += l.token_usage.reasoning || 0;
      }
    }
    mergedTrace.sort((a, b) => a.timestamp - b.timestamp);
    const latest = batchLogs.reduce((a, b) => (((a.batch ?? 0) > (b.batch ?? 0)) ? a : b));
    return {
      ...latest,
      output_data: Object.keys(merged).length ? merged : latest.output_data,
      raw_trace: mergedTrace,
      token_usage: tokens,
      error_message: errorMessage,
      error_raw_response: errorRawResponse,
    };
  }, [agentLogs, agentLog, selectedBatch]);

  const traceGroups = useMemo(() => {
    if (!filteredLogs.length) {
      if (selectedBatch == null) {
        return agentLog ? [agentLog] : [];
      }
      return [];
    }
    const grouped: Record<string, any[]> = {};
    for (const l of filteredLogs) {
      if (!grouped[l.agent_name]) grouped[l.agent_name] = [];
      grouped[l.agent_name].push(l);
    }
    return Object.entries(grouped).map(([, logs]) => {
      const latest = logs.reduce((a, b) => (((a.batch ?? 0) > (b.batch ?? 0)) ? a : b));
      let totalTokens = 0;
      let totalLatency = 0;
      const mergedOutput: Record<string, any> = {};
      const mergedTrace: any[] = [];
      let errorMessage: string | null = null;
      let errorRawResponse: string | null = null;
      for (const l of logs) {
        const tu = l.token_usage;
        if (tu) totalTokens += (tu.input || 0) + (tu.output || 0) + (tu.reasoning || 0);
        totalLatency += l.latency_ms ?? 0;
        if (l.output_data) {
          for (const [key, val] of Object.entries(l.output_data)) {
            if (Array.isArray(val)) {
              if (!Array.isArray(mergedOutput[key])) mergedOutput[key] = [];
              mergedOutput[key] = [...mergedOutput[key], ...val];
            } else {
              mergedOutput[key] = val;
            }
          }
        }
        if (l.raw_trace) mergedTrace.push(...l.raw_trace);
        if (l.error_message) errorMessage = l.error_message;
        if (l.error_raw_response) errorRawResponse = l.error_raw_response;
      }
      mergedTrace.sort((a, b) => a.timestamp - b.timestamp);
      const allCompleted = logs.every(l => l.status === 'COMPLETED');
      const anyFailed = logs.some(l => l.status === 'FAILED');
      return {
        id: latest.id || logs[0].id,
        agent_name: latest.agent_name,
        status: anyFailed ? 'FAILED' : allCompleted ? 'COMPLETED' : latest.status,
        raw_trace: mergedTrace,
        output_data: mergedOutput,
        latency_ms: totalLatency,
        total_tokens: totalTokens,
        error_message: errorMessage,
        error_raw_response: errorRawResponse,
      };
    });
  }, [filteredLogs, agentLog]);

  const filteredThinkingText = useMemo(() => {
    if (!thinkingText?.length) return thinkingText;
    if (selectedBatch == null || isRunning) return thinkingText;
    return thinkingText.filter(e => (e.batch ?? 0) === selectedBatch);
  }, [thinkingText, selectedBatch, isRunning]);

  useEffect(() => {
    if (node?.status === 'running') setActiveTab('thinking');
    if (node?.status === 'completed' || node?.status === 'done') setActiveTab('summary');
  }, [node?.id, node?.status]);

  useEffect(() => {
    setActivePromptTab(0);
  }, [currentAgentLog?.id]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'thinking', label: 'Streaming Thinking' },
    { id: 'input', label: 'Prompts' },
    { id: 'output', label: 'Raw Output' },
    { id: 'trace', label: 'Trace Logs' },
    { id: 'errors', label: 'Errors' },
  ];

  const handleCopyRawJson = useCallback(() => {
    if (currentAgentLog?.output_data) {
      navigator.clipboard.writeText(JSON.stringify(currentAgentLog.output_data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentAgentLog]);

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
            {tab.id === 'thinking' && isRunning && filteredThinkingText && filteredThinkingText.length > 0 && (
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
  <AgentSummaryView agentLog={currentAgentLog} agentName={node.agentName} isRunning={isRunning} />
)}
            
            {activeTab === 'thinking' && (
              <div className="p-4 h-full flex flex-col overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
                  {filteredThinkingText && filteredThinkingText.length > 0 ? (
                    (() => {
                      // Group consecutive entries of same type+phase
                      const groups: { type: 'reasoning' | 'content'; phase: 'react' | 'extraction'; text: string; timestamp: number; lastTimestamp: number }[] = [];
                      for (const entry of filteredThinkingText) {
                        const last = groups[groups.length - 1];
                        if (last && last.type === entry.type && last.phase === entry.phase) {
                          last.text += entry.text;
                          last.lastTimestamp = entry.timestamp;
                        } else {
                          groups.push({ ...entry, lastTimestamp: entry.timestamp });
                        }
                      }
                      let lastPhase: string | null = null;
                      return groups.map((g, i) => {
                        const phaseChanged = g.phase !== lastPhase;
                        lastPhase = g.phase;
                        return (
                          <div key={i}>
                            {phaseChanged && i > 0 && (
                              <div className="flex items-center gap-2 py-1.5">
                                <div className="flex-1 border-t border-slate-200 dark:border-slate-700/50" />
                                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                  {g.phase === 'extraction' ? 'Phase 2 · Extraction' : 'Phase 1 · Reasoning'}
                                </span>
                                <div className="flex-1 border-t border-slate-200 dark:border-slate-700/50" />
                              </div>
                            )}
                            {g.type === 'reasoning' ? (
                              <ThinkingBlock key={`r-${i}`} text={g.text} isRunning={isRunning && i === groups.length - 1} startTime={g.timestamp} endTime={g.lastTimestamp !== g.timestamp ? g.lastTimestamp : undefined} />
                            ) : (
                              <OutputBlock key={`o-${i}`} text={g.text} isRunning={isRunning && i === groups.length - 1} />
                            )}
                          </div>
                        );
                      });
                    })()
                  ) : (
                    <div className="text-slate-400 dark:text-slate-500 italic py-10 text-center flex flex-col items-center justify-center gap-2">
                      {isRunning ? (
                        <>
                          <Loader2 size={20} className="animate-spin text-slate-400" />
                          <span className="text-xs">Waiting for agent output...</span>
                        </>
                      ) : <span className="text-xs">No thinking logs available.</span>}
                    </div>
                  )}
                  <div ref={(el) => { if (el && autoScroll) el.scrollIntoView({ behavior: 'instant' }); }} />
                </div>
              </div>
            )}
            
            {activeTab === 'input' && (() => {
              const messages: { role: string; content: string }[] = Array.isArray(currentAgentLog?.input_prompt)
                ? currentAgentLog.input_prompt
                : currentAgentLog?.input_prompt
                  ? [
                      ...(currentAgentLog.input_prompt.systemPrompt ? [{ role: 'system', content: currentAgentLog.input_prompt.systemPrompt }] : []),
                      ...(currentAgentLog.input_prompt.userMessage ? [{ role: 'user', content: currentAgentLog.input_prompt.userMessage }] : []),
                    ]
                  : [];

              if (messages.length === 0) {
                return (
                  <div className="p-4 text-center text-xs text-slate-400 italic py-10">No prompts available.</div>
                );
              }

              const roleCounts: Record<string, number> = {};
              const labeled = messages.map((m) => {
                roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
                return { ...m, label: m.role };
              });
              const seen: Record<string, number> = {};
              for (const m of labeled) {
                if (roleCounts[m.role] > 1) {
                  seen[m.role] = (seen[m.role] || 0) + 1;
                  m.label = `${m.role} ${seen[m.role]}`;
                } else {
                  m.label = m.role;
                }
              }

              const safeIndex = Math.min(activePromptTab, labeled.length - 1);

              return (
                <div className="h-full flex flex-col">
                  <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 overflow-x-auto scrollbar-none shrink-0">
                    {labeled.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => setActivePromptTab(i)}
                        className={`px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-all shrink-0 -mb-px ${
                          safeIndex === i
                            ? 'border-blue-600 text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-800'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/50 px-3 py-2 thinking-markdown text-[12px] leading-relaxed text-slate-700 dark:text-slate-300">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeStr = String(children).replace(/\n$/, '');
                            if (match) {
                              return (
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ fontSize: '11px', borderRadius: '6px', margin: '6px 0', padding: '10px 12px' }}
                                >
                                  {codeStr}
                                </SyntaxHighlighter>
                              );
                            }
                            if (className === 'language-') {
                              return <pre className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 my-1.5 overflow-x-auto text-[11px] font-mono leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{codeStr}</pre>;
                            }
                            return <code className="bg-slate-100 dark:bg-slate-700/70 px-1 py-0.5 rounded text-[11px] font-mono text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-600/50" {...props}>{children}</code>;
                          },
                          pre({ children }) { return <div className="my-1.5">{children}</div>; },
                          p({ children }) { return <p className="mb-1.5 last:mb-0">{children}</p>; },
                          ul({ children }) { return <ul className="list-disc pl-4 mb-1.5">{children}</ul>; },
                          ol({ children }) { return <ol className="list-decimal pl-4 mb-1.5">{children}</ol>; },
                          li({ children }) { return <li className="mb-0.5">{children}</li>; },
                          blockquote({ children }) { return <blockquote className="border-l-2 border-slate-300 dark:border-slate-600 pl-2 my-1 text-slate-500 italic">{children}</blockquote>; },
                          h1({ children }) { return <h1 className="text-sm font-bold mb-1 text-slate-800 dark:text-slate-200">{children}</h1>; },
                          h2({ children }) { return <h2 className="text-[13px] font-bold mb-1 text-slate-800 dark:text-slate-200">{children}</h2>; },
                          h3({ children }) { return <h3 className="text-[12px] font-semibold mb-1 text-slate-800 dark:text-slate-200">{children}</h3>; },
                          table({ children }) { return <table className="w-full border-collapse text-[11px] my-1.5">{children}</table>; },
                          th({ children }) { return <th className="border border-slate-300 dark:border-slate-600 px-2 py-1 bg-slate-50 dark:bg-slate-800 text-left font-semibold">{children}</th>; },
                          td({ children }) { return <td className="border border-slate-300 dark:border-slate-600 px-2 py-1">{children}</td>; },
                        }}
                      >
                        {labeled[safeIndex]?.content || 'N/A'}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'output' && (
              <div className="p-4 h-full flex flex-col overflow-hidden min-h-0">
                {currentAgentLog?.output_data ? (
                  <div className="flex flex-col flex-1 min-h-0 space-y-2">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 p-3 rounded-xl shrink-0">
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Click to duplicate compiled raw JSON telemetry data structure.</span>
                      <button 
                        onClick={handleCopyRawJson}
                        className="flex items-center gap-1 text-[10px] uppercase font-bold py-1 px-2.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 transition-colors rounded-lg"
                      >
                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        {copied ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0">
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language="json"
                        PreTag="div"
                        customStyle={{ fontSize: '10px', borderRadius: '8px', margin: 0, padding: '12px', height: '100%' }}
                        showLineNumbers
                        lineNumberStyle={{ color: '#4a5568', fontSize: '9px' }}
                      >
                        {JSON.stringify(currentAgentLog.output_data, null, 2)}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-400 py-10">No compilation output yet</div>
                )}
              </div>
            )}

            {activeTab === 'trace' && (
              <div className="h-full flex flex-col">
                {currentAgentLog ? (() => {
                  const steps = currentAgentLog.raw_trace || [];
                  const tokens = currentAgentLog.token_usage;
                  const totalTokens = tokens ? (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0) : 0;
                  const statusBadge = currentAgentLog.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    currentAgentLog.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-amber-50 text-amber-700 border-amber-200';

                  return (
                    <div className="flex flex-col flex-1 min-h-0">
                      {/* Agent header — fixed */}
                      <div className="px-4 py-2.5 shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${currentAgentLog.status === 'COMPLETED' ? 'bg-emerald-500' : currentAgentLog.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            <span className="text-sm font-bold text-slate-700">{currentAgentLog.agent_name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusBadge}`}>
                              {currentAgentLog.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                            {currentAgentLog.latency_ms > 0 && (
                              <span>{currentAgentLog.latency_ms >= 1000 ? `${(currentAgentLog.latency_ms / 1000).toFixed(1)}s` : `${currentAgentLog.latency_ms}ms`}</span>
                            )}
                            {totalTokens > 0 && (
                              <span className="flex items-center gap-1">
                                <Zap size={10} />
                                {totalTokens.toLocaleString()} tk
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Steps — fixed */}
                      {steps.length > 0 && (
                        <div className="px-4 py-3 border-t border-slate-100 shrink-0">
                          <div className="border-l-2 border-slate-200 pl-3 space-y-2">
                            {steps.map((entry: any, i: number) => {
                              const prevTs = i > 0 ? steps[i - 1].timestamp : null;
                              const stepDur = prevTs ? entry.timestamp - prevTs : 0;
                              return (
                                <div key={i} className="relative flex items-start gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ring-2 ring-blue-100 mt-1.5 shrink-0" />
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {entry.timestamp ? new Date(entry.timestamp).toISOString().slice(11, 19) : `Step ${i + 1}`}
                                      {stepDur > 0 && <span className="text-slate-300 ml-1">(+{stepDur}ms)</span>}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700 whitespace-pre-wrap font-mono">{entry.name || `Step ${entry.step}`}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}


                    </div>
                  );
                })() : (
                  <div className="text-center text-xs text-slate-400 italic py-10">Select an agent node to view its execution trace.</div>
                )}
              </div>
            )}

            {activeTab === 'errors' && (
              <div className="p-4">
                {currentAgentLog?.error_message ? (
                  <div className="border border-red-200 rounded-xl overflow-hidden bg-red-50/60">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-100">
                      <AlertTriangle size={14} className="text-red-500 shrink-0" />
                      <span className="text-sm font-bold text-red-700">{currentAgentLog.agent_name}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">FAILED</span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <p className="text-xs text-red-700 font-mono bg-white/80 p-2 rounded border border-red-100">
                        {currentAgentLog.error_message}
                      </p>
                      {currentAgentLog.error_raw_response && (
                        <details className="group">
                          <summary className="text-[10px] font-bold uppercase tracking-wider text-red-400 cursor-pointer hover:text-red-600 select-none flex items-center gap-1.5">
                            <ChevronRight size={12} className="group-open:rotate-90 transition-transform" /> Raw Response
                          </summary>
                          <pre className="text-[10px] font-mono bg-slate-950 text-red-300 p-2 rounded-lg mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap">
                            {currentAgentLog.error_raw_response}
                          </pre>
                        </details>
                      )}
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

/** Warnings & edit console for CP3 — flags steps with atomicity warnings and allows inline editing to resolve. */
function WarningsConsole({ checkpointData, onDataChange, readOnly }: {
  checkpointData: any;
  onDataChange?: (data: any) => void;
  readOnly?: boolean;
}) {
  const warnings: Array<{ caseId: string; warnings: Array<{ stepIndex: number; issue: string; rule: string }> }> =
    checkpointData?.validationWarnings ?? [];
  const cases: any[] = checkpointData?.cases ?? [];

  // Local editable copy of cases (steps only) — initialize from props
  const [editedCases, setEditedCases] = useState<Record<string, any>>({});
  useEffect(() => {
    // Reset local edits when underlying data changes
    setEditedCases({});
  }, [checkpointData]);

  // Build a lookup: caseId -> case (prefer edited, fall back to original)
  const caseById = (caseId: string) => editedCases[caseId] ?? cases.find((c) => c.id === caseId);

  // Propagate edited cases up via onDataChange (preserve other fields like matrix)
  useEffect(() => {
    if (Object.keys(editedCases).length === 0) return;
    const mergedCases = cases.map((c) => editedCases[c.id] ? { ...c, ...editedCases[c.id] } : c);
    onDataChange?.({ ...checkpointData, cases: mergedCases });
  }, [editedCases, cases, checkpointData, onDataChange]);

  const ruleLabel: Record<string, string> = {
    'single-action': 'Single Action',
    'single-assertion': 'Single Assertion',
    'element-identifiable': 'Element Identifiable',
    'concrete-data': 'Concrete Data',
    'no-implicit-state': 'No Implicit State',
  };

  const handleStepEdit = (caseId: string, stepIndex: number, newAction: string) => {
    setEditedCases((prev) => {
      const existing = prev[caseId] ?? caseById(caseId) ?? {};
      const steps = Array.isArray(existing.steps) ? [...existing.steps] : [];
      // Ensure slot exists
      while (steps.length <= stepIndex) steps.push({ action: '' });
      const orig = steps[stepIndex];
      steps[stepIndex] = typeof orig === 'object' ? { ...orig, action: newAction } : newAction;
      return { ...prev, [caseId]: { ...existing, steps } };
    });
  };

  if (warnings.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-emerald-200 bg-emerald-50/50 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-600" />
        <span className="text-xs font-medium text-emerald-700">All steps passed atomicity validation — no warnings.</span>
      </div>
    );
  }

  const totalWarnings = warnings.reduce((sum, w) => sum + w.warnings.length, 0);

  return (
    <div className="border-b border-amber-200 bg-amber-50/40">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-amber-200/70">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Step Atomicity Warnings
          </span>
          <span className="text-[10px] font-mono text-amber-600 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5">
            {totalWarnings} across {warnings.length} case{warnings.length > 1 ? 's' : ''}
          </span>
        </div>
        {!readOnly && (
          <span className="text-[10px] text-amber-600 italic">Edit step text inline to resolve</span>
        )}
      </div>

      {/* Warning list */}
      <div className="max-h-64 overflow-y-auto px-4 py-2 space-y-2">
        {warnings.map((entry) => {
          const tc = caseById(entry.caseId);
          if (!tc) {
            return (
              <div key={entry.caseId} className="text-xs text-red-500 italic">
                Warning references unknown caseId: {entry.caseId}
              </div>
            );
          }
          return (
            <div key={entry.caseId} className="bg-white border border-amber-200 rounded-lg p-2.5 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                  {entry.caseId}
                </span>
                <span className="text-sm font-medium text-slate-700 truncate">
                  {tc.title || tc.scenario || '(untitled)'}
                </span>
              </div>
              <div className="space-y-1.5">
                {entry.warnings.map((w, i) => {
                  const step = Array.isArray(tc.steps) ? tc.steps[w.stepIndex] : undefined;
                  const stepText = typeof step === 'object' ? step?.action ?? '' : step ?? '';
                  const edited = editedCases[entry.caseId]?.steps?.[w.stepIndex];
                  const editedText = typeof edited === 'object' ? edited?.action ?? '' : edited ?? '';
                  const isResolved = editedText && editedText !== stepText;
                  return (
                    <div key={i} className={`rounded border px-2 py-1.5 ${isResolved ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase text-rose-600 bg-rose-100 border border-rose-200 rounded px-1.5 py-0.5">
                          Step {w.stepIndex + 1}
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                          {ruleLabel[w.rule] ?? w.rule}
                        </span>
                        {isResolved && (
                          <span className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-0.5">
                            <Check size={10} /> Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mb-1 italic">{w.issue}</p>
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Original step:</div>
                        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 line-through">
                          {stepText || '(empty)'}
                        </div>
                        {!readOnly && (
                          <>
                            <div className="text-[10px] text-amber-600 uppercase font-bold">Edit to resolve:</div>
                            <textarea
                              value={editedText || stepText}
                              onChange={(e) => handleStepEdit(entry.caseId, w.stepIndex, e.target.value)}
                              rows={2}
                              className="w-full text-xs text-slate-700 border border-amber-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 resize-y bg-white"
                              placeholder="Rewrite as a single atomic step..."
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlueprintReviewView({ checkpointData, onDataChange, readOnly }: {
  checkpointData: any;
  onDataChange?: (data: any) => void;
  readOnly?: boolean;
}) {
  const bp = checkpointData?.blueprint;
  const [riskItems, setRiskItems] = useState<any[]>([]);
  const [anomalyItems, setAnomalyItems] = useState<any[]>([]);
  const [inferences, setInferences] = useState<string[]>([]);
  const [strategicGuidance, setStrategicGuidance] = useState('');
  const [originalRisk, setOriginalRisk] = useState<any[]>([]);
  const [originalAnomaly, setOriginalAnomaly] = useState<any[]>([]);
  const [originalInferences, setOriginalInferences] = useState<string[]>([]);
  const [originalGuidance, setOriginalGuidance] = useState('');
  const [expandedEditRisk, setExpandedEditRisk] = useState<string | null>(null);
  const [expandedEditAnomaly, setExpandedEditAnomaly] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [nextEpicId, setNextEpicId] = useState(0);

  useEffect(() => {
    if (!bp) return;
    const risks = (bp.riskEpicTree ?? []).map((r: any) => ({ ...r, _editStatus: 'unchanged' as const }));
    const anomalies = (bp.anomalousFlowProposals ?? []).map((a: any) => ({ ...a, _editStatus: 'unchanged' as const }));
    setRiskItems(risks);
    setAnomalyItems(anomalies);
    setInferences([...(bp.sharedStateInferences ?? [])]);
    setStrategicGuidance(bp.strategicGuidance ?? '');
    setOriginalRisk(JSON.parse(JSON.stringify(risks)));
    setOriginalAnomaly(JSON.parse(JSON.stringify(anomalies)));
    setOriginalInferences([...(bp.sharedStateInferences ?? [])]);
    setOriginalGuidance(bp.strategicGuidance ?? '');
    setNextEpicId((bp.riskEpicTree ?? []).length + 1);
  }, [bp]);

  const stats = {
    modified: (riskItems.filter((r: any) => r._editStatus === 'modified').length + anomalyItems.filter((a: any) => a._editStatus === 'modified').length
      + (strategicGuidance !== originalGuidance ? 1 : 0)
      + (JSON.stringify(inferences) !== JSON.stringify(originalInferences) ? 1 : 0)),
    added: (riskItems.filter((r: any) => r._editStatus === 'added').length + anomalyItems.filter((a: any) => a._editStatus === 'added').length),
    removed: (riskItems.filter((r: any) => r._editStatus === 'removed').length + anomalyItems.filter((a: any) => a._editStatus === 'removed').length),
  };

  useEffect(() => {
    if (!bp) return;
    const activeRisks = riskItems.filter((r: any) => r._editStatus !== 'removed');
    const activeAnomalies = anomalyItems.filter((a: any) => a._editStatus !== 'removed');
    const hasChanges = stats.modified > 0 || stats.added > 0 || stats.removed > 0
      || strategicGuidance !== originalGuidance
      || JSON.stringify(inferences) !== JSON.stringify(originalInferences);
    if (!hasChanges) return;
    onDataChange?.({ blueprint: {
      strategicGuidance,
      riskEpicTree: activeRisks.map(({ _editStatus, ...r }: any) => r),
      anomalousFlowProposals: activeAnomalies.map(({ _editStatus, ...a }: any) => a),
      sharedStateInferences: inferences,
    }});
  }, [riskItems, anomalyItems, inferences, strategicGuidance, bp, onDataChange]);

  if (!bp) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-sm text-slate-400 italic">No blueprint data available</div>
      </div>
    );
  }

  if (readOnly) {
    const activeRisks = riskItems.filter((r: any) => r._editStatus !== 'removed');
    const activeAnomalies = anomalyItems.filter((a: any) => a._editStatus !== 'removed');
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {strategicGuidance && (
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Strategic Guidance</span>
              </div>
              <div className="px-3.5 py-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{strategicGuidance}</p>
              </div>
            </div>
          )}
          {activeRisks.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                  Risk Epics <span className="text-slate-400 font-normal">({activeRisks.length})</span>
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {activeRisks.map((risk: any, i: number) => {
                  const isExpanded = expandedEditRisk === risk.epicId;
                  return (
                    <div key={risk.epicId || i} className="text-sm">
                      <button
                        onClick={() => setExpandedEditRisk(isExpanded ? null : risk.epicId)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50/60 transition-colors text-left"
                      >
                        <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${risk.riskLevel === 'high' ? 'bg-red-50 text-red-600 border-red-100' : risk.riskLevel === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                          {risk.riskLevel}
                        </span>
                        <span className="flex-1 font-medium text-slate-800 truncate">{risk.epicTitle}</span>
                        {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                      </button>
                      {isExpanded && (
                        <div className="px-3.5 pb-3 ml-8">
                          <div className="bg-slate-50 rounded p-2.5 border border-slate-100">
                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{risk.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeAnomalies.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                  Anomalous Flow Proposals <span className="text-slate-400 font-normal">({activeAnomalies.length})</span>
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {activeAnomalies.map((item: any, i: number) => {
                  const isExpanded = expandedEditAnomaly === String(i);
                  return (
                    <div key={i} className="text-sm">
                      <button
                        onClick={() => setExpandedEditAnomaly(isExpanded ? null : String(i))}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50/60 transition-colors text-left"
                      >
                        <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{String(i + 1).padStart(2, '0')}</span>
                        <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${item.riskLevel === 'high' ? 'bg-red-50 text-red-600 border-red-100' : item.riskLevel === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                          {item.riskLevel}
                        </span>
                        <span className="flex-1 font-medium text-slate-800 truncate">{item.title}</span>
                        {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                      </button>
                      {isExpanded && (
                        <div className="px-3.5 pb-3 ml-8 space-y-1.5">
                          <div className="bg-amber-50/50 rounded p-2 border border-amber-100/50">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 block mb-0.5">Trigger</span>
                            <p className="text-xs text-slate-700">{item.trigger}</p>
                          </div>
                          <div className="bg-emerald-50/50 rounded p-2 border border-emerald-100/50">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block mb-0.5">Expected Behavior</span>
                            <p className="text-xs text-slate-700">{item.expectedBehavior}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {inferences.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                  Shared State Inferences <span className="text-slate-400 font-normal">({inferences.length})</span>
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                {inferences.map((inf: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <span>{inf}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!strategicGuidance && activeRisks.length === 0 && activeAnomalies.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-8 italic">Blueprint is empty</div>
          )}
        </div>
      </div>
    );
  }

  const updateRiskField = (epicId: string, field: string, value: any) => {
    setRiskItems(prev => prev.map(r => {
      if (r.epicId !== epicId) return r;
      const updated = { ...r, [field]: value };
      const orig = originalRisk.find((o: any) => o.epicId === epicId);
      const isModified = orig && (updated.epicTitle !== orig.epicTitle || updated.riskLevel !== orig.riskLevel || updated.notes !== orig.notes);
      return { ...updated, _editStatus: r._editStatus === 'added' ? 'added' as const : isModified ? 'modified' as const : 'unchanged' as const };
    }));
  };

  const removeRisk = (epicId: string) => {
    setRiskItems(prev => prev.map(r => r.epicId === epicId ? { ...r, _editStatus: 'removed' as const } : r));
  };

  const restoreRisk = (epicId: string) => {
    setRiskItems(prev => prev.map(r => {
      if (r.epicId !== epicId) return r;
      const orig = originalRisk.find((o: any) => o.epicId === epicId);
      if (!orig) return { ...r, _editStatus: 'unchanged' as const };
      const isModified = r.epicTitle !== orig.epicTitle || r.riskLevel !== orig.riskLevel || r.notes !== orig.notes;
      return { ...r, _editStatus: isModified ? 'modified' as const : 'unchanged' as const };
    }));
  };

  const addRisk = () => {
    const id = `epic-${nextEpicId}`;
    setRiskItems(prev => [...prev, { epicId: id, epicTitle: 'New Risk Epic', riskLevel: 'medium', notes: '', _editStatus: 'added' as const }]);
    setNextEpicId(n => n + 1);
  };

  const updateAnomaly = (idx: number, field: string, value: any) => {
    setAnomalyItems(prev => prev.map((a, i) => {
      if (i !== idx) return a;
      const updated = { ...a, [field]: value };
      const orig = originalAnomaly[i];
      const isModified = orig && (updated.title !== orig.title || updated.trigger !== orig.trigger || updated.expectedBehavior !== orig.expectedBehavior || updated.riskLevel !== orig.riskLevel);
      return { ...updated, _editStatus: a._editStatus === 'added' ? 'added' as const : isModified ? 'modified' as const : 'unchanged' as const };
    }));
  };

  const removeAnomaly = (idx: number) => {
    setAnomalyItems(prev => prev.map((a, i) => i === idx ? { ...a, _editStatus: 'removed' as const } : a));
  };

  const restoreAnomaly = (idx: number) => {
    setAnomalyItems(prev => prev.map((a, i) => {
      if (i !== idx) return a;
      const orig = originalAnomaly[i];
      if (!orig) return { ...a, _editStatus: 'unchanged' as const };
      const isModified = a.title !== orig.title || a.trigger !== orig.trigger || a.expectedBehavior !== orig.expectedBehavior || a.riskLevel !== orig.riskLevel;
      return { ...a, _editStatus: isModified ? 'modified' as const : 'unchanged' as const };
    }));
  };

  const addAnomaly = () => {
    setAnomalyItems(prev => [...prev, { title: 'New Anomalous Flow', trigger: '', expectedBehavior: '', riskLevel: 'medium', _editStatus: 'added' as const }]);
  };

  const updateInference = (idx: number, value: string) => {
    setInferences(prev => prev.map((s, i) => i === idx ? value : s));
  };

  const removeInference = (idx: number) => {
    setInferences(prev => prev.filter((_, i) => i !== idx));
  };

  const addInference = () => {
    setInferences(prev => [...prev, '']);
  };

  const activeRisks = riskItems.filter((r: any) => r._editStatus !== 'removed');
  const activeAnomalies = anomalyItems.filter((a: any) => a._editStatus !== 'removed');

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Stats bar */}
      <div className="flex items-center justify-between bg-white px-3 py-2 border-b border-slate-150 shadow-sm shrink-0">
        <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
          Blueprint Items
          {stats.modified > 0 && <span className="text-amber-600 ml-2">· {stats.modified} modified</span>}
          {stats.added > 0 && <span className="text-emerald-600 ml-2">· {stats.added} added</span>}
          {stats.removed > 0 && <span className="text-red-500 ml-2">· {stats.removed} deleted</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setShowDiff(!showDiff)}
            className={`text-xs font-bold uppercase py-1 px-2.5 rounded-lg border transition-colors ${showDiff ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {showDiff ? 'Show All' : 'Filter Changed'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Strategic Guidance */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Strategic Guidance</span>
            {strategicGuidance !== originalGuidance && (
              <span className="text-[10px] font-black tracking-widest text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200">EDITED</span>
            )}
          </div>
          <div className="px-3.5 py-2.5">
            <textarea value={strategicGuidance} onChange={e => setStrategicGuidance(e.target.value)}
              className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[4rem]" />
          </div>
        </div>

        {/* Risk Epic Tree */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
              Risk Epics <span className="text-slate-400 font-normal">({activeRisks.length})</span>
            </span>
            <button onClick={addRisk}
              className="text-xs font-bold uppercase py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 shadow-sm">
              <Plus size={12} /> New Epic
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {riskItems.filter(r => r._editStatus !== 'removed' || showDiff).map((risk: any, i: number) => {
              if (risk._editStatus === 'removed' && showDiff) {
                const orig = originalRisk.find((o: any) => o.epicId === risk.epicId);
                return (
                  <div key={risk.epicId} className="flex items-center justify-between px-3.5 py-2 border border-dashed border-red-200 bg-red-50/30 text-sm">
                    <span className="text-red-500 line-through truncate max-w-[16rem]">{orig?.epicTitle || risk.epicTitle}</span>
                    <button onClick={() => restoreRisk(risk.epicId)} className="text-xs font-bold uppercase text-slate-400 hover:text-blue-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">Undo Delete</button>
                  </div>
                );
              }
              if (showDiff && risk._editStatus === 'unchanged') return null;
              const isNew = risk._editStatus === 'added';
              const isModified = risk._editStatus === 'modified';
              const isExpanded = expandedEditRisk === risk.epicId;
              const cardStyle = isNew ? 'border-emerald-300 bg-emerald-50/20' : isModified ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200/80 bg-white';
              return (
                <div key={risk.epicId} className={`text-sm ${cardStyle}`}>
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <button onClick={() => setExpandedEditRisk(isExpanded ? null : risk.epicId)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{String(activeRisks.indexOf(risk) + 1).padStart(2, '0')}</span>
                      {isNew && <span className="shrink-0 text-[10px] font-black tracking-widest text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded border border-emerald-200">ADDED</span>}
                      {isModified && <span className="shrink-0 text-[10px] font-black tracking-widest text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200">EDITED</span>}
                      <span className="flex-1 font-medium text-slate-800 truncate">{risk.epicTitle || 'Untitled'}</span>
                      {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                    </button>
                    <button onClick={() => removeRisk(risk.epicId)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0 ml-2" title="Delete"><Trash2 size={14} /></button>
                  </div>
                  {isExpanded && (
                    <div className="px-3.5 pb-3 space-y-2">
                      <div>
                        <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Title</label>
                        <input value={risk.epicTitle} onChange={e => updateRiskField(risk.epicId, 'epicTitle', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Risk Level</label>
                          <select value={risk.riskLevel} onChange={e => updateRiskField(risk.epicId, 'riskLevel', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Epic ID</label>
                          <input value={risk.epicId} onChange={e => updateRiskField(risk.epicId, 'epicId', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Notes</label>
                        <textarea value={risk.notes} onChange={e => updateRiskField(risk.epicId, 'notes', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {riskItems.filter(r => r._editStatus !== 'removed').length === 0 && (
              <div className="text-center text-xs text-slate-400 py-4 italic">No risk epics</div>
            )}
          </div>
        </div>

        {/* Anomalous Flow Proposals */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
              Anomalous Flow Proposals <span className="text-slate-400 font-normal">({activeAnomalies.length})</span>
            </span>
            <button onClick={addAnomaly}
              className="text-xs font-bold uppercase py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 shadow-sm">
              <Plus size={12} /> New Anomaly
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {anomalyItems.filter(a => a._editStatus !== 'removed' || showDiff).map((item: any, i: number) => {
              if (item._editStatus === 'removed' && showDiff) {
                const orig = originalAnomaly[i];
                return (
                  <div key={i} className="flex items-center justify-between px-3.5 py-2 border border-dashed border-red-200 bg-red-50/30 text-sm">
                    <span className="text-red-500 line-through truncate max-w-[16rem]">{orig?.title || item.title}</span>
                    <button onClick={() => restoreAnomaly(i)} className="text-xs font-bold uppercase text-slate-400 hover:text-blue-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">Undo Delete</button>
                  </div>
                );
              }
              if (showDiff && item._editStatus === 'unchanged') return null;
              const isNew = item._editStatus === 'added';
              const isModified = item._editStatus === 'modified';
              const isExpanded = expandedEditAnomaly === String(i);
              const cardStyle = isNew ? 'border-emerald-300 bg-emerald-50/20' : isModified ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200/80 bg-white';
              return (
                <div key={i} className={`text-sm ${cardStyle}`}>
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <button onClick={() => setExpandedEditAnomaly(isExpanded ? null : String(i))}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{String(activeAnomalies.indexOf(item) + 1).padStart(2, '0')}</span>
                      {isNew && <span className="shrink-0 text-[10px] font-black tracking-widest text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded border border-emerald-200">ADDED</span>}
                      {isModified && <span className="shrink-0 text-[10px] font-black tracking-widest text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200">EDITED</span>}
                      <span className="flex-1 font-medium text-slate-800 truncate">{item.title || 'Untitled'}</span>
                      {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                    </button>
                    <button onClick={() => removeAnomaly(i)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0 ml-2" title="Delete"><Trash2 size={14} /></button>
                  </div>
                  {isExpanded && (
                    <div className="px-3.5 pb-3 space-y-2">
                      <div>
                        <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Title</label>
                        <input value={item.title} onChange={e => updateAnomaly(i, 'title', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Trigger</label>
                        <textarea value={item.trigger} onChange={e => updateAnomaly(i, 'trigger', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                      </div>
                      <div>
                        <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Expected Behavior</label>
                        <textarea value={item.expectedBehavior} onChange={e => updateAnomaly(i, 'expectedBehavior', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Risk Level</label>
                          <select value={item.riskLevel} onChange={e => updateAnomaly(i, 'riskLevel', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {anomalyItems.filter(a => a._editStatus !== 'removed').length === 0 && (
              <div className="text-center text-xs text-slate-400 py-4 italic">No anomalous flows</div>
            )}
          </div>
        </div>

        {/* Shared State Inferences */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
              Shared State Inferences <span className="text-slate-400 font-normal">({inferences.length})</span>
            </span>
            <button onClick={addInference}
              className="text-xs font-bold uppercase py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 shadow-sm">
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="p-3 space-y-2">
            {inferences.map((inf: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded mt-1">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex-1 flex gap-1">
                  <input value={inf} onChange={e => updateInference(i, e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={() => removeInference(i)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0 self-start mt-0.5" title="Remove"><X size={14} /></button>
                </div>
              </div>
            ))}
            {inferences.length === 0 && (
              <div className="text-center text-xs text-slate-400 py-3 italic">No inferences</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Field-by-field form editor for checkpoint items (conditions / test scenarios). */

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
      ? { condition: 'New Test Condition', category: 'happy-path', riskLevel: 'medium', primaryTechnique: '' }
      : { title: 'New Test Scenario', category: 'happy-path', priority: 'medium', preconditions: [], steps: [] };

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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="shrink-0 text-xs font-mono text-slate-450 bg-slate-50 border border-slate-100 px-1 py-0.2 rounded">{String(i + 1).padStart(2, '0')}</span>
                  <Check size={11} className="text-emerald-500 shrink-0" />
                  <p className="font-semibold text-slate-800">{data.title || data.condition || `Item ${i + 1}`}</p>
                  {data.priority && (
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 rounded border ${
                      ['critical', 'high', 'p0'].includes((data.priority || '').toLowerCase())
                        ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : ['medium', 'p1'].includes((data.priority || '').toLowerCase())
                          ? 'bg-amber-50 text-amber-600 border-amber-100'
                          : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}>{data.priority}</span>
                  )}
                  {data.category && <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${getCategoryBadgeClass(data.category)}`}>{data.category}</span>}
                  {data.riskLevel && (
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                      (data.riskLevel || '').toLowerCase() === 'high' ? 'bg-red-50 text-red-600 border-red-100'
                        : (data.riskLevel || '').toLowerCase() === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}>Risk: {data.riskLevel}</span>
                  )}
                  {data.primaryTechnique && <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-600 border-indigo-100">{data.primaryTechnique}</span>}
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
                      <span className="shrink-0 text-[10px] font-mono text-slate-450 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded font-bold">{String(items.indexOf(item) + 1).padStart(2, '0')}</span>
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
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Condition</label>
                          <textarea value={item.originalData?.condition || ''} onChange={e => handleFieldEdit(item.id, 'condition', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Category</label>
                            <select value={item.originalData?.category || 'happy-path'} onChange={e => handleFieldEdit(item.id, 'category', e.target.value)}
                              className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="happy-path">Happy Path</option>
                              <option value="alternate">Alternate</option>
                              <option value="error">Error</option>
                              <option value="boundary">Boundary</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Risk Level</label>
                            <select value={item.originalData?.riskLevel || 'medium'} onChange={e => handleFieldEdit(item.id, 'riskLevel', e.target.value)}
                              className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Priority</label>
                            <select value={item.originalData?.priority || 'medium'} onChange={e => handleFieldEdit(item.id, 'priority', e.target.value)}
                              className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="critical">Critical</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Primary Technique</label>
                          <select value={normalizeTechnique(item.originalData?.primaryTechnique || item.originalData?.techniqueApplied)} onChange={e => {
                            handleFieldEdit(item.id, 'primaryTechnique', e.target.value);
                            handleFieldEdit(item.id, 'techniqueApplied', e.target.value);
                          }}
                            className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">Select technique…</option>
                            <option value="Equivalence Partitioning">Equivalence Partitioning</option>
                            <option value="Boundary Value Analysis">Boundary Value Analysis</option>
                            <option value="Decision Table">Decision Table</option>
                            <option value="State Transition">State Transition</option>
                            <option value="Use Case">Use Case</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Title</label>
                          <textarea value={item.originalData?.title || ''} onChange={e => handleFieldEdit(item.id, 'title', e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem]" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Category</label>
                            <select value={item.originalData?.category || 'happy-path'} onChange={e => handleFieldEdit(item.id, 'category', e.target.value)}
                              className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="happy-path">Happy Path</option>
                              <option value="alternate">Alternate</option>
                              <option value="error">Error</option>
                              <option value="boundary">Boundary</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Priority</label>
                            <select value={item.originalData?.priority || 'medium'} onChange={e => handleFieldEdit(item.id, 'priority', e.target.value)}
                              className="w-full text-sm bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="critical">Critical</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
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



function CompleteNodeView({ runSummary, node, agentLogs, selectedBatch }: { runSummary: any; node: any; agentLogs?: any[]; selectedBatch?: number | null }) {
  const meta = node?.meta || {};
  const cases = runSummary?.totalCases ?? meta.totalCases ?? meta.outputCount ?? 0;
  const tokens = runSummary?.totalTokens ?? meta.totalTokens ?? meta.tokenUsage ?? 0;
  const latency = runSummary?.totalLatencyMs ?? meta.totalLatencyMs ?? meta.latencyMs ?? 0;
  const batches = runSummary?.totalBatches ?? meta.totalBatches ?? 0;

  const finalTestCases = useMemo(() => {
    if (!agentLogs) return [];
    const logs = selectedBatch != null
      ? agentLogs.filter((l: any) => (l.batch ?? 0) === selectedBatch)
      : agentLogs;
    const qmLogs = logs.filter((l: any) => {
      const name = (l.agent_name || '').replace(/_/g, '-');
      return name === 'quality-manager' && l.output_data?.finalTestCases;
    });
    return qmLogs.flatMap((l: any) => l.output_data.finalTestCases);
  }, [agentLogs, selectedBatch]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Summary Section */}
        <div className="bg-gradient-to-r from-emerald-50/80 to-teal-50/50 rounded-2xl p-6 border border-emerald-100/60">
          <div className="flex items-center gap-5">
            <div className="relative inline-flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full bg-emerald-200/40 scale-150 animate-pulse" />
              <div className="relative h-14 w-14 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-lg flex items-center justify-center shadow-emerald-500/30">
                <CheckCircle2 size={28} className="text-white" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-xl font-extrabold text-slate-800 tracking-tight">Test Gen Complete</h4>
              <p className="text-sm text-slate-500 mt-1">All stages completed. <span className="font-semibold text-emerald-600">{finalTestCases.length} test cases</span> generated.</p>
            </div>

            <div className="flex items-center gap-5 shrink-0">
              <div className="text-center">
                <div className="text-2xl font-black text-emerald-600">{cases}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cases</div>
              </div>
              <div className="w-px h-10 bg-emerald-200/60" />
              <div className="text-center">
                <div className="text-2xl font-black text-slate-700">{batches}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Batches</div>
              </div>
              <div className="w-px h-10 bg-emerald-200/60" />
              <div className="text-center">
                <div className="text-lg font-bold text-slate-700">{formatTokens(tokens)}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tokens</div>
              </div>
              <div className="w-px h-10 bg-emerald-200/60" />
              <div className="text-center">
                <div className="text-lg font-bold text-slate-700">{latency > 0 ? formatMs(latency) : 'N/A'}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Time</div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Test Cases Section */}
        {finalTestCases.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-700">Final Test Cases</h3>
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{finalTestCases.length} total</span>
            </div>

            <div className="space-y-3">
              {finalTestCases.map((tc: any, i: number) => (
                <div key={tc.id || i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                  {/* Header */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded shrink-0">
                      TC-{String(i + 1).padStart(2, '0')}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800 truncate min-w-0">{tc.title || tc.id}</h4>
                    {tc.priority && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getPriorityBadgeClass(tc.priority)}`}>{tc.priority}</span>}
                    {tc.category && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getCategoryBadgeClass(tc.category)}`}>{tc.category}</span>}
                    {tc.status && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${tc.status === 'approved' || tc.status === 'approved_with_changes' || tc.status === 'final' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{tc.status}</span>}
                    {tc.techniqueApplied && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 bg-indigo-50 text-indigo-600 border-indigo-100">{tc.techniqueApplied}</span>}
                    {tc.selfReview?.score !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${tc.selfReview.score >= 8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : tc.selfReview.score >= 5 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                        Score: {tc.selfReview.score}/10
                      </span>
                    )}
                    {tc.selfReview?.pass !== undefined && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${tc.selfReview.pass ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{tc.selfReview.pass ? 'PASS' : 'REVIEW'}</span>}
                  </div>

                  {/* Tags */}
                  {tc.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tc.tags.map((tag: string, j: number) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.2 rounded border bg-slate-50 text-slate-500 border-slate-100">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Preconditions */}
                  {tc.preconditions?.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Preconditions</span>
                      <ul className="space-y-0.5 pl-3 border-l-2 border-slate-100">
                        {tc.preconditions.map((p: string, j: number) => (
                          <li key={j} className="text-xs text-slate-600 leading-snug">{j + 1}. {p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Steps */}
                  {tc.steps?.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Steps ({tc.steps.length})</span>
                      <div className="space-y-1">
                        {tc.steps.map((st: any, sIdx: number) => (
                          <div key={sIdx} className="flex gap-2 text-xs text-slate-600 leading-snug">
                            <span className="text-slate-300 font-bold shrink-0">{sIdx + 1}.</span>
                            <div>
                              <p className="leading-tight">{st.action || st.description || st}</p>
                              {st.expected && <p className="text-xs text-slate-400 italic mt-0.5">→ Expected: {st.expected}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Test Data */}
                  {tc.testData && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Test Data</span>
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        {typeof tc.testData === 'string' ? (
                          <p className="text-xs text-slate-600">{tc.testData}</p>
                        ) : Array.isArray(tc.testData) ? (
                          tc.testData.map((d: any, j: number) => {
                            if (typeof d === 'string') {
                              const sep = d.indexOf(':');
                              return (
                                <div key={j} className="flex items-start gap-2 text-xs">
                                  {sep > 0 ? (
                                    <>
                                      <span className="font-mono font-medium text-slate-700 shrink-0">{d.slice(0, sep)}:</span>
                                      <span className="text-slate-500">{d.slice(sep + 1).trim() || '(empty)'}</span>
                                    </>
                                  ) : (
                                    <span className="text-slate-500">{d}</span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div key={j} className="flex items-center gap-2 text-xs">
                                <span className="font-mono font-medium text-slate-700">{d.key}:</span>
                                <span className="text-slate-500">{d.value ?? '(empty)'}</span>
                              </div>
                            );
                          })
                        ) : (
                          <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap">{JSON.stringify(tc.testData, null, 2)}</pre>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {tc.selfReview?.issues?.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Issues ({tc.selfReview.issues.length})</span>
                      <SelfReviewIssuesList issues={tc.selfReview.issues} />
                    </div>
                  )}

                  {/* Review Summary */}
                  {tc.reviewSummary && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Review Summary</span>
                      <p className="text-xs text-slate-500 italic bg-slate-50 rounded-lg p-2.5 border border-slate-100">{tc.reviewSummary}</p>
                    </div>
                  )}

                  {/* Change Log */}
                  {tc.changeLog && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Change Log</span>
                      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        {typeof tc.changeLog === 'string' ? (
                          <p>{tc.changeLog}</p>
                        ) : Array.isArray(tc.changeLog) ? (
                          <ul className="space-y-0.5">
                            {tc.changeLog.map((cl: any, j: number) => (
                              <li key={j}>
                                <span className="font-medium text-slate-600">{cl.field}</span>
                                {cl.from && <span className="text-slate-400"> from "{cl.from}"</span>}
                                {cl.to && <span className="text-slate-400"> to "{cl.to}"</span>}
                                {cl.reason && <span className="text-slate-400 italic"> ({cl.reason})</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <pre className="whitespace-pre-wrap">{JSON.stringify(tc.changeLog, null, 2)}</pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state if no cases */}
        {finalTestCases.length === 0 && cases > 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400">Test case details not available in agent logs.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getNodeIcon(nodeId: string) {
  switch (nodeId) {
    case 'architect': return <Zap size={14} className="text-indigo-500" />;
    case 'agent_test_analyst': return <Brain size={14} className="text-cyan-600" />;
    case 'checkpoint_0':
    case 'checkpoint_1': 
    case 'checkpoint_2': 
    case 'checkpoint_3': return <FileText size={14} className="text-amber-500" />;
    case 'agent_test_designer': return <PenTool size={14} className="text-violet-500" />;
    case 'agent_quality_manager': return <Star size={14} className="text-amber-500" />;
    case 'complete': return <CheckCircle2 size={14} className="text-emerald-500" />;
    default: return null;
  }
}

function AuditLogView({ logs, onClose }: { logs: any[]; onClose?: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-sm text-slate-400 italic">No audit records</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {logs.map((log: any) => (
        <div key={log.id} className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
          {/* header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                log.action === 'approve' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                log.action === 'retry' ? 'text-amber-700 bg-amber-50 border-amber-200' :
                'text-blue-700 bg-blue-50 border-blue-200'
              }`}>
                {log.action === 'approve' ? 'Approved' : log.action === 'retry' ? 'Retry' : 'Edited'}
              </span>
              <span className="text-xs text-slate-400">{formatRelativeTime(log.created_at)}</span>
            </div>
            <span className="text-[10px] text-slate-400">{log.user_id}</span>
          </div>
          {/* snapshot */}
          {log.snapshot && (
            <div className="px-3.5 py-2.5">
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-1"
              >
                {expandedId === log.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="font-medium">Snapshot</span>
              </button>
              {expandedId === log.id && (
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-100">
                  {JSON.stringify(log.snapshot, null, 2)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CheckpointViewWithAudit({ runId, nodeId, isEditing, children }: { runId?: string; nodeId: string; isEditing: boolean; children: React.ReactNode }) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'review' | 'audit'>('review');

  useEffect(() => {
    if (!runId) { setAuditLogs([]); return; }
    (async () => {
      try {
        const { api } = await import('@/shared/services/api');
        const logs = await api.testGen.audit(runId, nodeId);
        setAuditLogs(logs);
      } catch {}
    })();
  }, [runId, nodeId]);

  const tabs = isEditing
    ? [{ id: 'review' as const, label: 'Review' }]
    : [{ id: 'review' as const, label: 'Review' }, { id: 'audit' as const, label: 'Activity' }];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex border-b border-slate-200 bg-slate-50/70 overflow-x-auto scrollbar-none shrink-0 px-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all -mb-px text-[10px] shrink-0 ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.id === 'audit' && auditLogs.length > 0 && (
              <span className="ml-1.5 text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{auditLogs.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {activeTab === 'review' ? children : <AuditLogView logs={auditLogs} />}
      </div>
    </div>
  );
}

const statusColors: Record<string, { badge: string; label: string }> = {
  running: { badge: 'text-blue-700 bg-blue-50 border-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.1)]', label: 'In Progress' },
  waiting: { badge: 'text-amber-700 bg-amber-50 border-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.1)] animate-pulse', label: 'Action Required' },
  completed: { badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Done' },
  'auto-passed': { badge: 'text-slate-600 bg-slate-50 border-slate-200', label: 'Auto-Passed' },
  error: { badge: 'text-red-700 bg-red-50 border-red-200', label: 'Error' },
};

/** Horizontal batch tab bar with status indicators. Shows "All Batches" + one tab per batch. */
function BatchTabBar({
  total,
  current,
  selected,
  onSelect,
  agentLogs,
}: {
  total: number;
  current: number;
  selected: number | null;
  onSelect: (batch: number | null) => void;
  agentLogs?: any[];
}) {
  if (total <= 1) return null;

  // Compute per-batch status from agent logs
  const batchStatus: Record<number, string> = {};
  for (const log of (agentLogs ?? [])) {
    const b = log.batch ?? 0;
    const status = log.status;
    // Promote: FAILED > RUNNING > COMPLETED
    if (status === 'FAILED') {
      batchStatus[b] = 'error';
    } else if (status === 'RUNNING' && batchStatus[b] !== 'error') {
      batchStatus[b] = 'running';
    } else if (status === 'COMPLETED' && !batchStatus[b]) {
      batchStatus[b] = 'completed';
    }
  }

  const tabs: { label: string; batch: number | null; status?: string }[] = [
    { label: 'All Batches', batch: null, status: undefined },
  ];
  for (let i = 1; i <= total; i++) {
    tabs.push({ label: `Batch ${i}`, batch: i, status: batchStatus[i] });
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-200/85 bg-slate-50/40 overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const isActive = selected === tab.batch;
        const isCurrent = tab.batch !== null && tab.batch === current;
        const status = tab.status;
        return (
          <button
            key={String(tab.batch)}
            onClick={() => onSelect(tab.batch)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all whitespace-nowrap flex items-center gap-1.5 ${
              isActive
                ? isCurrent
                  ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm animate-pulse'
                  : 'bg-white border-slate-300 text-slate-800 shadow-sm'
                : isCurrent
                  ? 'bg-blue-50/40 border-blue-200 text-blue-600 animate-pulse'
                  : 'bg-transparent border-transparent text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }`}
          >
            <span className={isCurrent ? 'text-blue-600 animate-pulse' : ''}>{tab.label}</span>
            {isCurrent && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" title="Current batch" />
            )}
            {status === 'completed' && (
              <CheckCircle2 size={11} className="text-emerald-500" />
            )}
            {status === 'running' && (
              <Loader2 size={11} className="text-blue-500 animate-spin" />
            )}
            {status === 'error' && (
              <AlertCircle size={11} className="text-red-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TestGenDetailPanel({
  runId,
  node,
  agentLog,
  checkpointData,
  thinkingText,
  runSummary,
  agentLogs,
  startConfig,
  requirements,
  businessFlows,
  modelName,
  selectedBatch,
  batchProgress,
  onSelectBatch,
  onClose,
  onApprove,
  onRetry,
  onToggleReview,
  onDoneReviewing,
  onCheckpointDataChange,
  isEditing,
  retrying
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
  const [savingCases, setSavingCases] = useState(false);
  const [casesSaved, setCasesSaved] = useState(false);
  const [saveCasesError, setSaveCasesError] = useState<string | null>(null);

  const handleSaveCases = useCallback(async () => {
    if (!runId) return;
    setSavingCases(true);
    setSaveCasesError(null);
    try {
      const { api } = await import('@/shared/services/api');
      await api.testGen.saveCases(runId);
      setCasesSaved(true);
    } catch (err: any) {
      setSaveCasesError(err?.message || 'Failed to save test cases');
    } finally {
      setSavingCases(false);
    }
  }, [runId]);

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
            
            {(node.meta?.latencyMs || node.meta?.tokenUsage || node.meta?.outputCount) && (
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
            )}
          </div>
        </div>

        {/* Action buttons for checkpoints */}
        {nodeType === 'checkpoint' && (
          <div className="flex items-center gap-2 shrink-0 ml-auto justify-end">
            {node.status === 'waiting' && (
              <>
                <button
                  onClick={onApprove}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={onRetry}
                  disabled={retrying}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {retrying && <Loader2 size={12} className="animate-spin" />}
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              </>
            )}
            {(node.status === 'waiting' || node.status === 'auto-passed' || node.status === 'completed') && (
              isEditing ? (
                <button
                  onClick={onDoneReviewing}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Done Reviewing
                </button>
              ) : (
                <button
                  onClick={onToggleReview}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Review
                </button>
              )
            )}
          </div>
        )}

        {/* Action buttons for error agent nodes */}
        {node.status === 'error' && nodeType !== 'checkpoint' && (
          <div className="flex items-center gap-2 shrink-0 ml-auto justify-end">
            <button
              onClick={onRetry}
              disabled={retrying}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} />
              {retrying ? 'Retrying...' : 'Retry from Checkpoint'}
            </button>
          </div>
        )}

        {nodeType === 'complete' && !casesSaved && (
          <div className="flex items-center gap-2 shrink-0 ml-auto justify-end">
            {saveCasesError && <span className="text-xs text-red-500">{saveCasesError}</span>}
            <button
              onClick={handleSaveCases}
              disabled={savingCases}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              {savingCases && <Loader2 size={12} className="animate-spin" />}
              {savingCases ? 'Saving...' : 'Save to NL Cases'}
            </button>
          </div>
        )}
        {casesSaved && (
          <div className="flex items-center gap-2 shrink-0 ml-auto justify-end">
            <span className="text-xs text-emerald-600 font-medium">Saved to NL Test Cases</span>
          </div>
        )}

        <button 
          onClick={onClose} 
          className="p-1.5 hover:bg-slate-200/60 rounded-lg transition-colors shrink-0 ml-2"
          title="Fold Inspection Panel"
        >
          <X size={15} className="text-slate-400 hover:text-slate-700" />
        </button>
      </div>

      {/* Batch Tab Bar — only shown when totalBatches > 1, hidden for architect (runs once globally) */}
      {batchProgress && batchProgress.total > 1 && onSelectBatch
        && node?.id !== 'architect' && node?.id !== 'checkpoint_0' && (
        <BatchTabBar
          total={batchProgress.total}
          current={batchProgress.current}
          selected={selectedBatch ?? null}
          onSelect={onSelectBatch}
          agentLogs={agentLogs}
        />
      )}

      {/* Main Panel Content Body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {nodeType === 'agent' || nodeType === 'architect' ? (
          <AgentDetailTabs agentLog={agentLog} node={node} thinkingText={thinkingText} agentLogs={agentLogs} selectedBatch={selectedBatch} />
        ) : nodeType === 'checkpoint' ? (
          <CheckpointViewWithAudit
            runId={runId}
            nodeId={node?.id ?? ''}
            isEditing={isEditing ?? false}
          >
            {node?.id === 'checkpoint_3' && (
              <WarningsConsole checkpointData={checkpointData} onDataChange={onCheckpointDataChange} readOnly={!isEditing} />
            )}
            {node?.id === 'checkpoint_0'
              ? <BlueprintReviewView checkpointData={checkpointData} onDataChange={onCheckpointDataChange} readOnly={!isEditing} />
              : <CheckpointEditView checkpointData={checkpointData} onDataChange={onCheckpointDataChange} readOnly={!isEditing} />
            }
          </CheckpointViewWithAudit>
        ) : nodeType === 'complete' ? (
          <CompleteNodeView runSummary={runSummary} node={node} agentLogs={agentLogs} selectedBatch={selectedBatch} />
        ) : null}
      </div>
    </div>
  );
}

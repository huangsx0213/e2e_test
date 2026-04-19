import React, { useState, useMemo } from "react";
import { useCrud } from "@/shared/hooks/useCrud";
import { api } from "@/shared/services/api";
import { ExecutionReport, ExecutionLog, TestSuite } from "@/shared/types";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Globe,
  Terminal,
  Loader2,
  BarChart3,
  Search,
  ListChecks,
  AlertCircle,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  Table2,
  X,
} from "lucide-react";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";
import { ExecutionLogs } from "@/shared/execution/ExecutionLogs";

interface TestReportProps {
  currentProjectId: string;
  suites: TestSuite[];
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

const formatDuration = (start: number, end?: number) => {
  if (!end) return "—";
  const ms = end - start;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

const formatDateTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatDate = (ts: number) => formatDateTime(ts);

const getDateGroup = (ts: number): string => {
  const now = new Date();
  const d = new Date(ts);
  const todayStr = now.toDateString();
  const yestD = new Date(now);
  yestD.setDate(yestD.getDate() - 1);
  if (d.toDateString() === todayStr) return "Today";
  if (d.toDateString() === yestD.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const EXEC_TYPE_META: Record<string, { label: string; color: string }> = {
  plan:     { label: "PLAN",     color: "bg-indigo-100 text-indigo-700" },
  suite:    { label: "SUITE",    color: "bg-blue-100   text-blue-700"   },
  case:     { label: "CASE",     color: "bg-cyan-100   text-cyan-700"   },
  scenario: { label: "SCENARIO", color: "bg-purple-100 text-purple-700" },
};

/* ─────────────────────── Case Result Parser ─────────────────────────── */
interface CaseResult {
  id: string;
  name: string;
  plan?: string;
  scenario?: string;
  suite: string;
  status: "PASSED" | "FAILED" | "RUNNING";
  startTime: number;
  endTime: number;
  duration: string;
  errorMessage?: string;
}

function parseCaseResults(logs: ExecutionLog[]): CaseResult[] {
  const results: CaseResult[] = [];
  let currentPlan = "";
  let currentScenario = "";
  let currentSuite = "";
  let pendingCase: CaseResult | null = null;

  const resolvePending = (endTime: number, forceStatus?: "FAILED", errorMsg?: string) => {
    if (pendingCase) {
      if (forceStatus) pendingCase.status = forceStatus;
      else if (pendingCase.status === "RUNNING") pendingCase.status = "PASSED";
      
      pendingCase.endTime = endTime;
      const durMs = pendingCase.endTime - pendingCase.startTime;
      const durS = Math.floor(durMs / 1000);
      const durM = Math.floor(durS / 60);
      pendingCase.duration = durM > 0 ? `${durM}m ${durS % 60}s` : `${durS}s`;
      if (errorMsg) pendingCase.errorMessage = errorMsg;
      
      results.push(pendingCase);
      pendingCase = null;
    }
  };

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const msg = log.message;

    const isPlan = msg.match(/📋\s*Executing Plan:\s*(.+)/);
    const isScenario = msg.match(/🎬\s*Executing Scenario:\s*(.+)/);
    const isSuite = msg.match(/📦\s*Executing Suite:\s*(.+)/);
    const isCase = msg.match(/🧪\s*Running Case:\s*(.+)/);
    const isFail = msg.match(/❌\s*Case Failed:\s*(.+)/);
    const isFinish = msg.includes("🏁");

    if (isPlan || isScenario || isSuite || isCase || isFinish) {
      resolvePending(log.timestamp);
    }

    if (isPlan) {
      currentPlan = isPlan[1].trim(); currentScenario = ""; currentSuite = "";
    } else if (isScenario) {
      currentScenario = isScenario[1].trim(); currentSuite = "";
    } else if (isSuite) {
      currentSuite = isSuite[1].trim();
    } else if (isCase) {
      pendingCase = {
        id: `${log.stepId || 'case'}-${i}`,
        name: isCase[1].trim(),
        plan: currentPlan || undefined,
        scenario: currentScenario || undefined,
        suite: currentSuite || "—",
        status: "RUNNING",
        startTime: log.timestamp,
        endTime: log.timestamp,
        duration: "0s",
      };
    } else if (isFail && pendingCase) {
      resolvePending(log.timestamp, "FAILED", isFail[1].trim());
    } else if (log.status === "FAIL" && pendingCase) {
      pendingCase.status = "FAILED";
    }
  }

  if (pendingCase) resolvePending(logs[logs.length - 1].timestamp);

  return results;
}

/* ────────────────────── Case Results Table ───────────────────────────── */
interface CaseResultsTableProps { logs: ExecutionLog[] }
const CaseResultsTable: React.FC<CaseResultsTableProps> = ({ logs }) => {
  const cases = useMemo(() => parseCaseResults(logs), [logs]);
  const [filter, setFilter] = useState<"all" | "passed" | "failed">("all");
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedSuites, setCollapsedSuites] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (filter === "all") return cases;
    return cases.filter(c => filter === "passed" ? c.status === "PASSED" : c.status === "FAILED");
  }, [cases, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, CaseResult[]> = {};
    for (const c of filtered) {
      if (!groups[c.suite]) groups[c.suite] = [];
      groups[c.suite].push(c);
    }
    return groups;
  }, [filtered]);

  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <ListChecks size={36} className="mb-3 opacity-50" />
        <p className="text-sm font-medium">No individual case results detected.</p>
        <p className="text-xs text-slate-400 mt-1">Case-level details are available for Suite, Scenario, and Plan executions.</p>
      </div>
    );
  }

  const passed = cases.filter(c => c.status === "PASSED").length;
  const failed = cases.filter(c => c.status === "FAILED").length;
  const isGrouped = viewMode === "grouped";

  const renderRow = (c: CaseResult, idx: number) => (
    <React.Fragment key={c.id}>
      <tr
        className={`hover:bg-slate-50/80 transition-colors ${
          c.status === "FAILED" ? "bg-red-50/20" : ""
        } ${c.errorMessage ? "cursor-pointer" : ""}`}
        onClick={() => c.errorMessage && setExpandedId(expandedId === c.id ? null : c.id)}
      >
        <td className="px-5 py-3.5 text-slate-400 font-mono text-xs text-center">{idx + 1}</td>
        <td className={`px-5 py-3.5 ${isGrouped ? "pl-8" : ""}`}>
          <div className="flex items-center gap-2">
            {c.status === "PASSED" ? (
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            ) : c.status === "FAILED" ? (
              <XCircle size={15} className="text-red-500 shrink-0" />
            ) : (
              <Loader2 size={15} className="text-blue-500 animate-spin shrink-0" />
            )}
            <span className="font-semibold text-slate-800 truncate">{c.name}</span>
            {c.errorMessage && (
              <ChevronRight size={13} className={`text-slate-300 transition-transform ${expandedId === c.id ? "rotate-90" : ""}`} />
            )}
          </div>
        </td>
        {!isGrouped && (
          <td className="px-5 py-3.5 text-xs text-slate-500">
             <div className="flex items-center gap-1.5 flex-wrap">
                {c.plan && (
                   <>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100/50 text-indigo-700 max-w-[120px] truncate" title={c.plan}>{c.plan}</span>
                      <ChevronRight size={10} className="text-slate-300" />
                   </>
                )}
                {c.scenario && (
                   <>
                      <span className="px-1.5 py-0.5 rounded bg-purple-50 border border-purple-100/50 text-purple-700 max-w-[120px] truncate" title={c.scenario}>{c.scenario}</span>
                      <ChevronRight size={10} className="text-slate-300" />
                   </>
                )}
                <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100/50 text-blue-700 font-medium max-w-[180px] truncate" title={c.suite}>{c.suite}</span>
             </div>
          </td>
        )}
        <td className="px-5 py-3.5 text-center">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
            c.status === "PASSED"
              ? "bg-emerald-100 text-emerald-700"
              : c.status === "FAILED"
              ? "bg-red-100 text-red-700"
              : "bg-blue-100 text-blue-700"
          }`}>
            {c.status}
          </span>
        </td>
        <td className="px-5 py-3.5 text-right text-slate-500 font-mono text-xs">{c.duration}</td>
      </tr>
      {/* Expanded error row */}
      {expandedId === c.id && c.errorMessage && (
        <tr>
          <td colSpan={isGrouped ? 4 : 5} className="px-5 py-3 bg-red-50/50">
            <div className="flex items-start gap-2 text-xs font-mono text-red-700">
              <AlertCircle size={13} className="shrink-0 mt-0.5 text-red-500" />
              <span className="break-words max-w-[800px]">{c.errorMessage}</span>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top Header & Filter bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1">Filter:</span>
          {[
            { key: "all" as const, label: "All", count: cases.length, color: "" },
            { key: "passed" as const, label: "Passed", count: passed, color: "text-emerald-600" },
            { key: "failed" as const, label: "Failed", count: failed, color: "text-red-600" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                filter === f.key
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {f.label}
              <span className={`ml-1 ${f.color || "text-slate-400"}`}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* View Mode Switch */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
           <button
             onClick={() => setViewMode("flat")}
             className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
               !isGrouped ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
             }`}
           >
             List
           </button>
           <button
             onClick={() => setViewMode("grouped")}
             className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
               isGrouped ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
             }`}
           >
             Group by Suite
           </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-semibold tracking-wider sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr>
              <th className="px-5 py-3 w-10 text-center">#</th>
              <th className="px-5 py-3">Test Case</th>
              {!isGrouped && <th className="px-5 py-3">Execution Path (Plan / Scenario / Suite)</th>}
              <th className="px-5 py-3 text-center w-28">Status</th>
              <th className="px-5 py-3 text-right w-24">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isGrouped ? (
               filtered.map((c, idx) => renderRow(c, idx))
            ) : Object.entries(grouped).map(([suite, suiteCases], gIdx) => {
               const isCollapsed = collapsedSuites[suite];
               const suitePassed = suiteCases.filter(c => c.status === "PASSED").length;
               const suiteFailed = suiteCases.filter(c => c.status === "FAILED").length;
               return (
                 <React.Fragment key={`suite-${suite}`}>
                   {/* Suite Group Header */}
                   <tr
                     className="bg-slate-50/50 hover:bg-slate-100/50 cursor-pointer transition-colors border-t-2 border-t-slate-200 group"
                     onClick={() => setCollapsedSuites(p => ({ ...p, [suite]: !p[suite] }))}
                   >
                     <td colSpan={5} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                           <ChevronDown size={16} className={`text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                           <div className="flex items-center gap-2">
                             <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold tracking-widest uppercase">Suite</span>
                             <span className="font-bold text-slate-800 text-sm">{suite}</span>
                           </div>
                           <div className="flex items-center gap-2 ml-auto text-xs font-semibold">
                             <span className="text-slate-400">{suiteCases.length} cases</span>
                             {suiteFailed > 0 && <span className="text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{suiteFailed} failed</span>}
                             {suitePassed > 0 && <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{suitePassed} passed</span>}
                           </div>
                        </div>
                     </td>
                   </tr>
                   {/* Suite Cases */}
                   {!isCollapsed && suiteCases.map((c, idx) => renderRow(c, idx))}
                 </React.Fragment>
               );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─────────────────────────── Donut Chart ─────────────────────────────── */
interface DonutProps { rate: number; size?: number }
const DonutChart: React.FC<DonutProps> = ({ rate, size = 112 }) => {
  const r = 44;
  const cx = 56;
  const cy = 56;
  const circ = 2 * Math.PI * r;
  const filled = (rate / 100) * circ;
  const color =
    rate === 100 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
  const trackColor = rate === 100 ? "#d1fae5" : rate >= 50 ? "#fef3c7" : "#fee2e2";

  return (
    <svg width={size} height={size} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={10} />
      {/* Progress */}
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 56 56)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      {/* Center text */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="800" fill={color}>{rate}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fontWeight="600" fill="#94a3b8" letterSpacing="1">PASS %</text>
    </svg>
  );
};

/* ─────────────────────────── Error Summary ───────────────────────────── */
interface ErrorSummaryProps { logs: ExecutionLog[] }
const ErrorSummary: React.FC<ErrorSummaryProps> = ({ logs }) => {
  const [open, setOpen] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const errors = useMemo(() =>
    logs.filter((l) => l.level === "error" || l.status === "FAIL"),
    [logs]
  );

  if (errors.length === 0) return null;

  return (
    <>
      <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50/60 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-red-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white">
              <AlertCircle size={12} />
            </span>
            <span className="text-sm font-bold text-red-800">
              Error Summary
            </span>
            <span className="px-2 py-0.5 bg-red-200 text-red-800 text-xs font-bold rounded-full">
              {errors.length}
            </span>
          </div>
          {open ? <ChevronDown size={16} className="text-red-500" /> : <ChevronRight size={16} className="text-red-500" />}
        </button>

        {/* Body */}
        {open && (
          <div className="border-t border-red-200 divide-y divide-red-100">
            {errors.slice(0, 10).map((log, i) => (
              <div key={i} className="px-5 py-3 flex gap-3 items-start hover:bg-red-50/80 transition-colors">
                <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-red-800 break-words leading-relaxed">{log.message}</p>
                  {log.screenshot && (
                    <div className="mt-2">
                      <img
                        src={log.screenshot}
                        alt="failure screenshot"
                        onClick={() => setLightboxSrc(log.screenshot!)}
                        className="h-24 rounded-lg border border-red-200 object-contain bg-white shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-red-400 shrink-0 mt-0.5">
                  {formatDateTime(log.timestamp)}
                </span>
              </div>
            ))}
            {errors.length > 10 && (
              <div className="px-5 py-2 text-xs text-red-500 text-center">
                + {errors.length - 10} more errors in the log below
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Enlarged screenshot"
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

/* ─────────────────────────── Sidebar Card ────────────────────────────── */
interface SidebarCardProps {
  report: ExecutionReport;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}
const SidebarCard: React.FC<SidebarCardProps> = ({ report, isSelected, onSelect, onDelete }) => {
  const typeMeta = report.executionType
    ? EXEC_TYPE_META[report.executionType.toLowerCase()] ?? { label: report.executionType.toUpperCase(), color: "bg-slate-100 text-slate-600" }
    : null;

  const passColor =
    report.passRate === 100 ? "bg-emerald-500" : report.passRate > 0 ? "bg-amber-400" : "bg-red-500";

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      className={`group w-full text-left rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
        isSelected
          ? "bg-blue-50 border-blue-300 shadow-md ring-2 ring-blue-200/60"
          : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-md"
      }`}
    >
      {/* Top colored accent */}
      <div className={`h-1 w-full ${
        report.status === "COMPLETED" ? "bg-emerald-400" : report.status === "FAILED" ? "bg-red-400" : "bg-blue-400"
      }`} />

      <div className="p-3">
        {/* Title row */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm truncate transition-colors ${isSelected ? "text-blue-800" : "text-slate-800 group-hover:text-blue-700"}`}>
              {report.suiteName || report.suiteId}
            </p>
          </div>
          {/* Status icon */}
          <div className="shrink-0 mt-0.5">
            {report.status === "COMPLETED" ? (
              <CheckCircle2 size={15} className="text-emerald-500" />
            ) : report.status === "FAILED" ? (
              <XCircle size={15} className="text-red-500" />
            ) : (
              <Loader2 size={15} className="text-blue-500 animate-spin" />
            )}
          </div>
        </div>

        {/* Chips row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          {typeMeta && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${typeMeta.color}`}>
              {typeMeta.label}
            </span>
          )}
          {report.environment && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
              <Globe size={9} />
              {report.environment}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
            <Clock size={9} />
            {formatDuration(report.startTime, report.endTime)}
          </span>
        </div>

        {/* Date + delete */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 overflow-hidden" title={new Date(report.startTime).toLocaleString()}>
            <Calendar size={10} className="shrink-0" />
            <span className="truncate">{formatDateTime(report.startTime)}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Mini progress bar */}
        <div className="mt-2.5 w-full bg-slate-100 rounded-full h-1 overflow-hidden flex">
          <div className={`h-full transition-all duration-500 ${passColor}`} style={{ width: `${report.passRate}%` }} />
          {report.passRate < 100 && report.status !== "RUNNING" && (
            <div className="h-full bg-red-300" style={{ width: `${100 - report.passRate}%` }} />
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── Stat Chip ───────────────────────────────── */
const StatChip: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color?: string }> = ({
  icon, label, value, color = "text-slate-700",
}) => (
  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
    <span className="shrink-0 text-slate-400">{icon}</span>
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  </div>
);

/* ──────────────────────────── Main Component ─────────────────────────── */
export const TestReport: React.FC<TestReportProps> = ({ currentProjectId, suites }) => {
  const [reports, reportsApi, loading] = useCrud<ExecutionReport>(api.reports);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "logs">("overview");

  // Reset tab when report changes
  React.useEffect(() => {
    setActiveTab("overview");
  }, [selectedReportId]);

  const selectedReport = reports.find((r) => r.id === selectedReportId);

  // find previous execution of the same suite/plan for comparison
  const previousReport = useMemo(() => {
    if (!selectedReport) return null;
    return [...reports]
      .sort((a, b) => b.startTime - a.startTime)
      .find(r => 
        r.id !== selectedReport.id && 
        r.startTime < selectedReport.startTime &&
        (selectedReport.executionType === "plan" ? r.planId === selectedReport.planId : r.suiteId === selectedReport.suiteId)
      );
  }, [selectedReport, reports]);

  const filteredReports = useMemo(() => {
    return [...reports]
      .filter((r) => {
        const suite = suites.find((s) => s.id === r.suiteId);
        return !suite || suite.projectId === currentProjectId;
      })
      .filter((r) =>
        (r.suiteName || r.suiteId).toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.startTime - a.startTime);
  }, [reports, searchQuery, currentProjectId, suites]);

  // Group by date label
  const groupedReports = useMemo(() => {
    const groups: { label: string; items: ExecutionReport[] }[] = [];
    const seen = new Map<string, ExecutionReport[]>();
    for (const r of filteredReports) {
      const g = getDateGroup(r.startTime);
      if (!seen.has(g)) { seen.set(g, []); groups.push({ label: g, items: seen.get(g)! }); }
      seen.get(g)!.push(r);
    }
    return groups;
  }, [filteredReports]);

  const copyLogs = () => {
    if (!selectedReport) return;
    const text = selectedReport.logs
      .map((l) => `[${formatDateTime(l.timestamp)}] [${l.level || l.status}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-refresh when selected report is RUNNING
  React.useEffect(() => {
    if (!selectedReport || selectedReport.status !== "RUNNING") return;
    const timer = setInterval(() => {
      reportsApi.refresh?.();
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedReport?.id, selectedReport?.status]);

  const onConfirmDelete = async () => {
    if (!reportToDelete) return;
    try {
      await reportsApi.remove(reportToDelete);
      if (selectedReportId === reportToDelete) setSelectedReportId(null);
      setReportToDelete(null);
    } catch {
      alert("Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  /* status-derived hero gradient */
  const heroGradient = !selectedReport
    ? ""
    : selectedReport.status === "COMPLETED"
    ? "from-emerald-50 via-white to-white"
    : selectedReport.status === "FAILED"
    ? "from-red-50 via-white to-white"
    : "from-blue-50 via-white to-white";

  return (
    <>
      <div className="h-full w-full flex overflow-hidden bg-slate-50">
        <ConfirmModal
          isOpen={!!reportToDelete}
          onClose={() => setReportToDelete(null)}
          onConfirm={onConfirmDelete}
          title="Delete Test Report?"
          message="Are you sure you want to delete this historical execution result? This action is permanent and cannot be reversed."
          confirmLabel="Permanent Delete"
          type="danger"
        />

        {/* ══════════ LEFT: SIDEBAR ══════════ */}
        <div className="w-72 border-r border-gray-200 flex flex-col bg-gray-50 shrink-0 shadow-sm z-10">
          {/* Sidebar header */}
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={18} className="text-blue-600" />
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                Test Reports
                <HelpTooltip content="View historical execution results, logs, and pass/fail metrics for your test suites and scenarios." />
              </h2>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reports…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-full hover:bg-slate-200"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Report list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {filteredReports.length === 0 ? (
              <div className="text-sm text-slate-500 text-center p-8 flex flex-col items-center gap-2">
                <Search size={24} className="text-slate-300" />
                <p>No reports found</p>
              </div>
            ) : (
              groupedReports.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1.5">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((report) => (
                      <SidebarCard
                        key={report.id}
                        report={report}
                        isSelected={selectedReportId === report.id}
                        onSelect={() => setSelectedReportId(report.id)}
                        onDelete={() => setReportToDelete(report.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ══════════ RIGHT: DETAIL ══════════ */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {selectedReport ? (
            <div className="flex flex-col flex-1 min-h-0">

              {/* ── Slim Header (Always Visible) ── */}
              <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
                 <div className="flex flex-col gap-1 hidden md:flex">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                       {selectedReport.planName ? `Plan: ${selectedReport.planName}` : 'Execution Report'}
                    </p>
                    <h1 className="text-lg font-black text-slate-900 leading-none truncate max-w-[500px]">
                       {selectedReport.suiteName || selectedReport.suiteId}
                    </h1>
                 </div>
                 
                 <div className="flex items-center gap-3">
                     {selectedReport.executionType && (() => {
                       const m = EXEC_TYPE_META[selectedReport.executionType.toLowerCase()];
                       return m ? (
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${m.color}`}>
                           {m.label}
                         </span>
                       ) : null;
                     })()}
                     <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${
                       selectedReport.status === "COMPLETED"
                         ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                         : selectedReport.status === "FAILED"
                         ? "bg-red-50 border-red-200 text-red-700"
                         : "bg-blue-50 border-blue-200 text-blue-700"
                     }`}>
                       {selectedReport.status === "COMPLETED" && <CheckCircle2 size={14} />}
                       {selectedReport.status === "FAILED"    && <XCircle size={14} />}
                       {selectedReport.status === "RUNNING"   && <Loader2 size={14} className="animate-spin" />}
                       {selectedReport.status}
                     </span>
                 </div>
              </div>

              {/* ── Tab Bar ── */}
              <div className="px-6 shrink-0 bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2 border-b border-slate-200 pt-3">
                  <button
                    onClick={() => setActiveTab("overview")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                      activeTab === "overview"
                        ? "border-blue-500 text-blue-700 bg-blue-50/50 rounded-t-lg"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 rounded-t-lg"
                    }`}
                  >
                    <BarChart3 size={15} />
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab("details")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                      activeTab === "details"
                        ? "border-blue-500 text-blue-700 bg-blue-50/50 rounded-t-lg"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 rounded-t-lg"
                    }`}
                  >
                    <Table2 size={15} />
                    Execution Details
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      activeTab === "details" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                    }`}>
                      {selectedReport.totalCases || 0} Cases
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                      activeTab === "logs"
                        ? "border-blue-500 text-blue-700 bg-blue-50/50 rounded-t-lg"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 rounded-t-lg"
                    }`}
                  >
                    <Terminal size={15} />
                    Terminal Logs
                  </button>
                </div>
              </div>

              {/* ── Tab Content ── */}
              <div className="flex-1 min-h-0 flex flex-col p-6 bg-slate-50 overflow-y-auto">

                {/* --- TAB 1: OVERVIEW --- */}
                {activeTab === "overview" && (
                  <div className="space-y-6 max-w-5xl">
                    {/* Hero Stats */}
                    <div className={`bg-gradient-to-b ${heroGradient} border border-slate-200 rounded-2xl p-8 shadow-sm flex items-center justify-between`}>
                       <div>
                          <h2 className="text-xs font-bold text-slate-500 tracking-widest uppercase mb-4">Execution Summary</h2>
                          <div className="flex flex-wrap gap-3">
                            <StatChip icon={<ListChecks size={16} />} label="Total Cases" value={selectedReport.totalCases || 0} />
                            <StatChip
                              icon={<CheckCircle2 size={16} className="text-emerald-500" />}
                              label="Passed"
                              value={selectedReport.passedCases || 0}
                              color="text-emerald-700"
                            />
                            <StatChip
                              icon={<XCircle size={16} className="text-red-500" />}
                              label="Failed"
                              value={selectedReport.failedCases || 0}
                              color="text-red-700"
                            />
                            <StatChip
                              icon={<Clock size={16} />}
                              label="Duration"
                              value={formatDuration(selectedReport.startTime, selectedReport.endTime)}
                            />
                            <StatChip
                              icon={<Globe size={16} />}
                              label="Environment"
                              value={selectedReport.environment || "DEV"}
                            />
                            <StatChip
                              icon={<Calendar size={16} />}
                              label="Started At"
                              value={formatDate(selectedReport.startTime)}
                            />
                          </div>
                          
                          {/* Historical Comparison */}
                          {previousReport && (
                            <div className="mt-5 flex items-center gap-4 text-xs font-medium border-t border-slate-200 pt-4">
                               <span className="text-slate-500 flex items-center gap-1.5"><Clock size={12}/> vs Previous ({formatDateTime(previousReport.startTime)}):</span>
                               
                               <div className="flex items-center gap-1.5">
                                 <span className="text-slate-400">Pass Rate:</span>
                                 <span className={`${selectedReport.passRate > previousReport.passRate ? 'text-emerald-600' : selectedReport.passRate < previousReport.passRate ? 'text-red-500' : 'text-slate-600'}`}>
                                    {selectedReport.passRate === previousReport.passRate ? 'No Change' : `${selectedReport.passRate > previousReport.passRate ? '+' : ''}${selectedReport.passRate - previousReport.passRate}%`}
                                 </span>
                               </div>
                               
                               <div className="flex items-center gap-1.5 ml-2">
                                 <span className="text-slate-400">Duration:</span>
                                 {(() => {
                                    const durNow = (selectedReport.endTime || selectedReport.startTime) - selectedReport.startTime;
                                    const durPrev = (previousReport.endTime || previousReport.startTime) - previousReport.startTime;
                                    const diffSec = Math.floor((durNow - durPrev) / 1000);
                                    if (diffSec === 0) return <span className="text-slate-600">No Change</span>;
                                    return <span className={`${diffSec > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                       {diffSec > 0 ? '+' : ''}{diffSec}s
                                    </span>;
                                 })()}
                               </div>
                            </div>
                          )}
                       </div>
                       
                       <div className="bg-white/60 backdrop-blur rounded-2xl p-4 border border-slate-100 shadow-sm shrink-0 ml-8">
                         <DonutChart rate={selectedReport.passRate} size={140} />
                       </div>
                    </div>
                    
                    {/* Error Summary */}
                    <ErrorSummary logs={selectedReport.logs || []} />
                  </div>
                )}

                {/* --- TAB 2: DETAILS --- */}
                {activeTab === "details" && (
                  <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-w-7xl">
                    <CaseResultsTable logs={selectedReport.logs || []} />
                  </div>
                )}

                {/* --- TAB 3: LOGS --- */}
                {activeTab === "logs" && (
                  <div className="flex-1 min-h-0 bg-[#0f172a] rounded-xl shadow-xl border border-slate-800 flex flex-col overflow-hidden">
                    {/* Terminal top bar */}
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
                      <div className="flex items-center gap-3">
                        {/* macOS-style dots */}
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-red-500/80" />
                          <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                          <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                        </div>
                        <div className="w-px h-4 bg-slate-700" />
                        <Terminal size={15} className="text-blue-400" />
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Execution Logs
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono">
                          {selectedReport.logs?.length ?? 0} entries
                        </span>
                      </div>

                      <button
                        onClick={copyLogs}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        {copied ? "Copied!" : "Copy All"}
                      </button>
                    </div>

                    {/* Log content */}
                    <div className="flex-1 min-h-0 p-4 font-mono text-[13px] flex flex-col">
                      <ExecutionLogs logs={selectedReport.logs || []} />
                      {(!selectedReport.logs || selectedReport.logs.length === 0) && (
                        <div className="flex flex-col items-center justify-center flex-1 text-slate-600 gap-3">
                          <Terminal size={32} className="opacity-40" />
                          <p className="text-sm">No execution logs recorded.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* ── Empty state ── */
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <div className="relative mb-6">
                <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-md border border-slate-100">
                  <BarChart3 size={48} className="text-blue-400/60" />
                </div>
                <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-9 h-9 bg-blue-500 rounded-full shadow-lg">
                  <Zap size={18} className="text-white" />
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-700 mb-2">No Report Selected</h3>
              <p className="text-slate-500 text-sm max-w-xs text-center leading-relaxed">
                Choose an execution report from the sidebar to view detailed metrics, error summaries, and logs.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

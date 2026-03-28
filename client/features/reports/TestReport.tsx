import React, { useState, useMemo } from 'react';
import { useCrud } from '@/shared/hooks/useCrud';
import { api } from '@/shared/services/api';
import { ExecutionReport } from '@/shared/types';
import { 
  CheckCircle2, XCircle, Clock, Calendar, Globe, Terminal, 
  Loader2, BarChart3, Search, ListChecks, AlertCircle,
  Copy, Check
} from 'lucide-react';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';

export const TestReport: React.FC = () => {
  const [reports, reportsApi, loading] = useCrud<ExecutionReport>(api.reports);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [logFilter, setLogFilter] = useState<'ALL' | 'PASS' | 'FAIL'>('ALL');
  const [copied, setCopied] = useState(false);

  const selectedReport = reports.find(r => r.id === selectedReportId);

  const filteredReports = useMemo(() => {
    return [...reports]
      .filter(r => (r.suiteName || r.suiteId).toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.startTime - a.startTime);
  }, [reports, searchQuery]);

  const filteredLogs = useMemo(() => {
    if (!selectedReport) return [];
    if (logFilter === 'ALL') return selectedReport.logs;
    return selectedReport.logs.filter(log => log.status === logFilter);
  }, [selectedReport, logFilter]);

  const formatDuration = (start: number, end?: number) => {
    if (!end) return '-';
    const ms = end - start;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const copyLogs = () => {
    if (!selectedReport) return;
    const text = filteredLogs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.status}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* Sidebar: Report List */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-white shrink-0 shadow-sm z-10">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={20} className="text-blue-600" />
            <h2 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
              Test Reports
              <HelpTooltip content="View historical execution results, logs, and pass/fail metrics for your test suites and scenarios." />
            </h2>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredReports.length === 0 ? (
            <div className="text-sm text-slate-500 text-center p-8 flex flex-col items-center gap-2">
              <Search size={24} className="text-slate-300" />
              <p>No reports found</p>
            </div>
          ) : (
            filteredReports.map(report => (
              <button
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 group ${
                  selectedReportId === report.id
                    ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100'
                    : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-md hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-slate-800 truncate text-sm pr-2 group-hover:text-blue-700 transition-colors">
                    {report.suiteName || report.suiteId}
                  </span>
                  {report.status === 'COMPLETED' ? (
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  ) : report.status === 'FAILED' ? (
                    <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 size={16} className="text-blue-500 animate-spin shrink-0 mt-0.5" />
                  )}
                </div>
                
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-slate-400" />
                    <span>{new Date(report.startTime).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Globe size={12} className="text-slate-400" />
                    <span className="font-medium">{report.environment || 'DEV'}</span>
                  </div>
                </div>

                {/* Mini Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden flex">
                  <div 
                    className={`h-full ${report.passRate === 100 ? 'bg-emerald-500' : report.passRate > 0 ? 'bg-amber-400' : 'bg-red-500'}`} 
                    style={{ width: `${report.passRate}%` }}
                  />
                  {report.passRate < 100 && report.status !== 'RUNNING' && (
                    <div 
                      className="h-full bg-red-500" 
                      style={{ width: `${100 - report.passRate}%` }}
                    />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content: Report Details */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
        {selectedReport ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Report Header */}
            <div className="p-8 bg-white border-b border-slate-200 shrink-0">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                      {selectedReport.suiteName || selectedReport.suiteId}
                    </h1>
                    <div className={`px-3 py-1 rounded-full border flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
                      selectedReport.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      selectedReport.status === 'FAILED' ? 'bg-red-50 border-red-200 text-red-700' :
                      'bg-blue-50 border-blue-200 text-blue-700'
                    }`}>
                      {selectedReport.status === 'COMPLETED' && <CheckCircle2 size={14} />}
                      {selectedReport.status === 'FAILED' && <XCircle size={14} />}
                      {selectedReport.status === 'RUNNING' && <Loader2 size={14} className="animate-spin" />}
                      {selectedReport.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-slate-500 mt-4">
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="font-medium">{formatDate(selectedReport.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                      <Clock size={14} className="text-slate-400" />
                      <span className="font-medium">{formatDuration(selectedReport.startTime, selectedReport.endTime)}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                      <Globe size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-700">{selectedReport.environment || 'DEV'}</span>
                    </div>
                  </div>
                </div>
                
                {/* Big Pass Rate Circular/Text Indicator */}
                <div className="flex flex-col items-end">
                  <div className="text-5xl font-black tracking-tighter" style={{
                    color: selectedReport.passRate === 100 ? '#10b981' : selectedReport.passRate >= 50 ? '#f59e0b' : '#ef4444'
                  }}>
                    {selectedReport.passRate}%
                  </div>
                  <span className="text-sm font-semibold text-slate-400 uppercase tracking-widest mt-1">Pass Rate</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4 shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <ListChecks size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-0.5">Total Cases</p>
                    <p className="text-2xl font-black text-slate-800">{selectedReport.totalCases || 0}</p>
                  </div>
                </div>
                <div className="bg-white border border-emerald-100 rounded-xl p-5 flex items-center gap-4 shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 rounded-full -mr-8 -mt-8 opacity-50" />
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 relative z-10">
                    <CheckCircle2 size={24} className="text-emerald-600" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-emerald-600/80 text-xs font-bold uppercase tracking-wider mb-0.5">Passed</p>
                    <p className="text-2xl font-black text-emerald-700">{selectedReport.passedCases || 0}</p>
                  </div>
                </div>
                <div className="bg-white border border-red-100 rounded-xl p-5 flex items-center gap-4 shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-red-50 rounded-full -mr-8 -mt-8 opacity-50" />
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0 relative z-10">
                    <XCircle size={24} className="text-red-600" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-red-600/80 text-xs font-bold uppercase tracking-wider mb-0.5">Failed</p>
                    <p className="text-2xl font-black text-red-700">{selectedReport.failedCases || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Logs */}
            <div className="flex-1 overflow-hidden flex flex-col bg-[#0f172a] m-6 rounded-xl shadow-xl border border-slate-800">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                  <Terminal size={18} className="text-blue-400" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-wider">Execution Logs</span>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Log Filters */}
                  <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                    {(['ALL', 'PASS', 'FAIL'] as const).map(filter => (
                      <button
                        key={filter}
                        onClick={() => setLogFilter(filter)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                          logFilter === filter 
                            ? (filter === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : filter === 'FAIL' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400')
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  
                  <button 
                    onClick={copyLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 font-mono text-[13px] space-y-1.5">
                {filteredLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-4 hover:bg-slate-800/50 p-1.5 rounded transition-colors group">
                    <span className="text-slate-500 shrink-0 select-none w-24 pt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    
                    <span className={`shrink-0 w-20 font-bold pt-0.5 ${
                      log.status === 'FAIL' ? 'text-red-400' : 
                      log.status === 'PASS' ? 'text-emerald-400' : 
                      log.status === 'RUNNING' ? 'text-blue-400' : 
                      'text-slate-400'
                    }`}>
                      [{log.status}]
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <span className={`break-words whitespace-pre-wrap ${
                        log.status === 'FAIL' ? 'text-red-300' : 
                        log.status === 'PASS' && log.message.includes('Passed') ? 'text-emerald-300' :
                        log.message.includes('Starting') ? 'text-blue-300 font-bold' :
                        'text-slate-300'
                      }`}>
                        {log.message}
                      </span>
                      {log.screenshot && (
                        <div className="mt-2 text-xs text-blue-400 flex items-center gap-1 cursor-pointer hover:text-blue-300">
                          <AlertCircle size={12} /> View Screenshot attached
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {filteredLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                    <Terminal size={32} className="opacity-50" />
                    <p>No logs match the current filter.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-6 border border-slate-100">
              <BarChart3 size={40} className="text-blue-500/50" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No Report Selected</h3>
            <p className="text-slate-500">Choose an execution report from the sidebar to view its details.</p>
          </div>
        )}
      </div>
    </div>
  );
};


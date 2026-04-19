import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Server, Trash2, PowerOff, Power, RefreshCw, Layers, Clock, X, Terminal, Download } from 'lucide-react';
import { api } from '@/shared/services/api';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';

interface RemoteAgent {
  id: string;
  os: string;
  status: 'idle' | 'busy' | 'offline' | 'disabled';
  labels: string[];
  lastSeen: number;
  currentReportId?: string;
}

interface QueuedTask {
  id: string;
  agentId?: string;
  status: string;
  createdAt: number;
  type: string;
  runId: string;
  name?: string;
}

interface AgentLogLine {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

// ─── Agent Log Panel (expandable per-agent) ───
function AgentLogPanel({ agentId, isOpen, onClose }: { agentId: string; isOpen: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<AgentLogLine[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current && containerRef.current) {
      const container = containerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      if (isNearBottom) {
        logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [logs]);

  useEffect(() => {
    if (!isOpen) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setLogs([]);
      setIsConnected(false);
      return;
    }

    const es = api.agents.logsStream(agentId);
    eventSourceRef.current = es;
    setIsConnected(true);

    es.onmessage = (event) => {
      try {
        const line: AgentLogLine = JSON.parse(event.data);
        setLogs(prev => {
          const next = [...prev, line];
          if (next.length > 1000) return next.slice(next.length - 1000);
          return next;
        });
      } catch { /* ignore */ }
    };

    es.onerror = () => setIsConnected(false);

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isOpen, agentId]);

  if (!isOpen) return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const levelColor = (level: string) => {
    if (level === 'error') return 'text-red-400';
    if (level === 'warn') return 'text-amber-400';
    return 'text-slate-400';
  };

  const messageColor = (line: AgentLogLine) => {
    if (line.level === 'error') return 'text-red-300';
    if (line.level === 'warn') return 'text-amber-300';
    if (line.message.includes('✅')) return 'text-green-400';
    if (line.message.includes('❌')) return 'text-red-400';
    if (line.message.includes('🚀')) return 'text-blue-400';
    if (line.message.includes('[AGENT]')) return 'text-cyan-300';
    if (line.message.includes('[EXEC]')) return 'text-slate-500';
    return 'text-slate-300';
  };

  return (
    <div className="border-t border-slate-700 bg-slate-950 rounded-b-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-green-400" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Live Console</span>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 font-mono">{logs.length} lines</span>
          <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">Clear</button>
          <button onClick={() => onClose()} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={12} /></button>
        </div>
      </div>
      <div ref={containerRef} className="overflow-y-auto font-mono text-xs p-2 space-y-0" style={{ height: '400px' }}>
        {logs.length === 0 && (
          <div className="text-slate-600 text-center py-6 flex flex-col items-center gap-2">
            <Terminal size={20} className="text-slate-700" />
            <span>Waiting for agent output…</span>
          </div>
        )}
        {logs.map((line, i) => (
          <div key={i} className="flex gap-2 py-[1px] hover:bg-slate-900/50 leading-relaxed">
            <span className="text-slate-600 shrink-0 select-none">{formatTime(line.timestamp)}</span>
            <span className={`shrink-0 w-10 text-right select-none ${levelColor(line.level)}`}>{line.level.toUpperCase()}</span>
            <span className={`break-all ${messageColor(line)}`}>{line.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

export function AgentManagement() {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [queue, setQueue] = useState<QueuedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editLabels, setEditLabels] = useState<string>('');
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const [agentData, queueData] = await Promise.all([
        api.agents.list(),
        api.queue.list(),
      ]);
      setAgents(agentData);
      setQueue(queueData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (isManualRefresh) {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleAgentStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'disabled' ? 'offline' : 'disabled';
    await api.agents.updateStatus(id, newStatus);
    fetchData();
  };

  const confirmDeleteAgent = async () => {
    if (agentToDelete) {
      await api.agents.delete(agentToDelete);
      setAgentToDelete(null);
      fetchData();
    }
  };

  const formatLastSeen = (timestamp: number) => {
    const passed = Date.now() - timestamp;
    if (passed < 60000) return 'Just now';
    return `${Math.floor(passed / 60000)} mins ago`;
  };

  const toggleLogPanel = (agentId: string) => {
    setExpandedAgentId(prev => prev === agentId ? null : agentId);
  };

  const handleDownloadAgent = () => {
    window.open('/api/agents/download', '_blank');
  };

  if (loading && !agents.length) {
    return <div className="p-8 text-slate-500">Loading runner nodes...</div>;
  }

  return (
    <div className="h-full w-full flex overflow-hidden bg-slate-50">
      <ConfirmModal
        isOpen={!!agentToDelete}
        title="Delete Agent"
        message="Are you sure you want to delete this remote agent?"
        confirmLabel="Delete Agent"
        type="danger"
        onConfirm={confirmDeleteAgent}
        onClose={() => setAgentToDelete(null)}
      />

      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0 z-10">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
          <h2 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
            <Layers size={20} className="text-blue-600" />
            Task Queue
          </h2>
          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
            {queue.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50/50">
          {queue.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm flex flex-col items-center justify-center">
              <Layers size={32} className="text-slate-300 mb-3" />
              <p>Queue is empty</p>
            </div>
          ) : (
            queue.map((task, idx) => (
              <div key={task.id} className="p-3 border border-slate-200 rounded bg-white shadow-sm flex flex-col relative overflow-hidden transition-all hover:border-slate-300 hover:shadow">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-500 font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-200">#{idx + 1}</span>
                    <span className="font-semibold text-sm text-slate-800">{task.type.toUpperCase()}</span>
                  </div>
                </div>
                {task.name && <p className="text-sm text-slate-700 font-medium truncate mb-2 mt-0.5">{task.name}</p>}
                {task.agentId && (
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 border-t border-slate-100 pt-2">
                    Target: <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{task.agentId}</span>
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 z-10 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
              <Server className="text-blue-600" /> Remote Agents
              <HelpTooltip content="Remote agents are execution nodes that run tests in parallel. Download a pre-configured zip to get started." />
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage remote execution nodes for distributed testing.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAgent}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded shadow-sm hover:bg-blue-100 transition-colors font-medium"
            >
              <Download size={14} /> Download Agent
            </button>
            
            <button
              onClick={() => fetchData(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded shadow-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          <div className="max-w-6xl mx-auto">
            {agents.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 border-dashed p-10 text-center shadow-sm">
                <Server className="mx-auto text-slate-300 mb-4" size={40} />
                <h3 className="text-slate-800 font-medium text-lg">No nodes connected</h3>
                <p className="text-slate-500 text-sm mt-1 mb-6">Start an agent to begin parallel testing.</p>
                
                <div className="flex justify-center mb-10">
                  <button
                    onClick={handleDownloadAgent}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                  >
                    <Download size={20} /> Download Pre-configured Agent
                  </button>
                </div>

                <div className="bg-slate-900 text-slate-300 rounded-lg p-5 text-left font-mono text-sm overflow-x-auto select-all border border-slate-800 mx-auto max-w-2xl">
                  <p className="text-slate-500">{"# Or manual setup (requires Node.js):"}</p>
                  <p className="text-blue-400">npm install</p>
                  <p className="text-slate-500 mt-3">{"# Start the agent pointing to this workspace:"}</p>
                  <p className="text-green-400">
                    {`npm run start-agent -- --url ${window.location.origin.replace('http', 'ws')}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <div className="w-8"></div>
                  <div className="flex-1 min-w-[140px]">Agent</div>
                  <div className="w-16 text-center">Status</div>
                  <div className="w-16 text-center">OS</div>
                  <div className="flex-1 min-w-[120px]">Labels</div>
                  <div className="w-24">Last Seen</div>
                  <div className="w-20 text-center">Activity</div>
                  <div className="w-28 text-right">Actions</div>
                </div>
                {agents.map(agent => (
                  <div key={agent.id} className="flex flex-col">
                    <div className={`flex items-center gap-4 px-4 py-2.5 bg-white rounded-lg border border-slate-200 transition-all hover:shadow-sm ${agent.status === 'offline' ? 'opacity-60' : ''} ${expandedAgentId === agent.id ? 'rounded-b-none border-b-0' : ''}`}>
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${agent.status === 'idle' ? 'bg-green-100 text-green-600' : agent.status === 'busy' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Server size={16} />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <span className="font-semibold text-slate-900 text-sm">{agent.id}</span>
                      </div>
                      <div className="w-16 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${agent.status === 'idle' ? 'bg-green-100 text-green-700' : agent.status === 'busy' ? 'bg-amber-100 text-amber-700' : agent.status === 'disabled' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                          {agent.status}
                        </span>
                      </div>
                      <div className="w-16 text-center text-xs font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{agent.os}</div>
                      <div className="flex-1 min-w-[120px] flex items-center gap-1.5 flex-wrap">
                        {editingAgentId === agent.id ? (
                          <input type="text" autoFocus className="text-xs px-2 py-0.5 border border-blue-400 rounded outline-none w-48 shadow-sm" value={editLabels} onChange={(e) => setEditLabels(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { api.agents.updateLabels(agent.id, editLabels.split(',').map(s => s.trim()).filter(Boolean)).then(fetchData); setEditingAgentId(null); } else if (e.key === 'Escape') setEditingAgentId(null); }} onBlur={() => { api.agents.updateLabels(agent.id, editLabels.split(',').map(s => s.trim()).filter(Boolean)).then(fetchData); setEditingAgentId(null); }} />
                        ) : (
                          <>
                            {agent.labels.length > 0 ? agent.labels.map(label => (
                              <span key={label} className="group inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[11px] border border-indigo-100 font-medium">
                                {label}
                                <button onClick={(e) => { e.stopPropagation(); api.agents.updateLabels(agent.id, agent.labels.filter(l => l !== label)).then(fetchData); }} className="opacity-0 group-hover:opacity-100 text-indigo-400 hover:text-indigo-600 ml-0.5"><X size={10} /></button>
                              </span>
                            )) : <span className="text-[11px] text-slate-400 italic">—</span>}
                            <button onClick={() => { setEditingAgentId(agent.id); setEditLabels(agent.labels.join(', ')); }} className="px-1.5 py-0.5 text-slate-400 rounded text-[11px] border border-slate-200 hover:bg-slate-50 hover:text-slate-600 transition-colors">+</button>
                          </>
                        )}
                      </div>
                      <div className="w-24 text-xs text-slate-500 flex items-center gap-1">
                        <Clock size={11} className="text-slate-400" />
                        <span>{formatLastSeen(agent.lastSeen)}</span>
                      </div>
                      <div className="w-20 text-center">
                        {agent.status === 'busy' ? <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>Running</span> : <span className="text-[10px] text-slate-400">—</span>}
                      </div>
                      <div className="w-28 flex items-center justify-end gap-1">
                        <button onClick={() => toggleLogPanel(agent.id)} className={`p-1.5 rounded transition-colors ${expandedAgentId === agent.id ? 'bg-green-50 text-green-600' : 'text-slate-400 hover:bg-slate-100'}`}><Terminal size={15} /></button>
                        <button onClick={() => toggleAgentStatus(agent.id, agent.status)} className="p-1.5 rounded text-slate-400 hover:bg-slate-100">{agent.status === 'disabled' ? <Power size={15} /> : <PowerOff size={15} />}</button>
                        <button onClick={() => setAgentToDelete(agent.id)} className="p-1.5 rounded text-red-400 hover:bg-red-50"><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <AgentLogPanel agentId={agent.id} isOpen={expandedAgentId === agent.id} onClose={() => setExpandedAgentId(null)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

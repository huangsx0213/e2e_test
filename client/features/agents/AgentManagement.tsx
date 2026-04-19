import React, { useEffect, useState } from 'react';
import { Server, Settings, Trash2, PowerOff, Power, RefreshCw, Layers, Clock, X } from 'lucide-react';
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

export function AgentManagement() {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [queue, setQueue] = useState<QueuedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editLabels, setEditLabels] = useState<string>('');

  const fetchData = async (isManualRefresh = false) => {
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
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleAgentStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'disabled' ? 'offline' : 'disabled'; // Going back online will reconnect normally or just set to offline
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

  if (loading && !agents.length) {
    return <div className="p-8 text-slate-500">Loading runner nodes...</div>;
  }

  return (
    <div className="h-full w-full flex overflow-hidden bg-slate-50">
      <ConfirmModal
        isOpen={!!agentToDelete}
        title="Delete Agent"
        message="Are you sure you want to delete this remote agent? It will be disconnected until re-registered."
        confirmLabel="Delete Agent"
        type="danger"
        onConfirm={confirmDeleteAgent}
        onClose={() => setAgentToDelete(null)}
      />

      {/* Sidebar: Execution Queue */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0 z-10">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
          <h2 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
            <Layers size={20} className="text-blue-600" />
            Task Queue
            <HelpTooltip content="Tasks waiting for an available idle execution node." />
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
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1 rounded truncate ml-2">
                    {formatLastSeen(task.createdAt)}
                  </span>
                </div>
                {task.name && (
                  <p className="text-sm text-slate-700 font-medium truncate mb-2 mt-0.5" title={task.name}>{task.name}</p>
                )}
                {task.agentId ? (
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 border-t border-slate-100 pt-2">
                    Target: <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{task.agentId}</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5 border-t border-slate-100 pt-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                    Target: <span className="text-slate-500">Any available</span>
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content: Agent List */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 z-10 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
              <Server className="text-blue-600" /> Remote Agents
              <HelpTooltip content="Connect remote machines to run tests securely across different environments." />
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage remote execution nodes for distributed UI and API testing.</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded shadow-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          <div className="max-w-6xl mx-auto">
            {agents.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 border-dashed p-10 text-center shadow-sm">
                <Server className="mx-auto text-slate-300 mb-4" size={40} />
                <h3 className="text-slate-800 font-medium text-lg">No nodes connected</h3>
                <p className="text-slate-500 text-sm mt-1 mb-6">You don't have any registered execution nodes. Start an agent to begin parallel testing.</p>
                <div className="bg-slate-900 text-slate-300 rounded-lg p-5 text-left font-mono text-sm overflow-x-auto select-all space-y-2 border border-slate-800 mx-auto max-w-2xl">
                  <p className="text-slate-500"># 1. Download or clone this project to your test machine.</p>
                  <p className="text-slate-500 mt-3"># 2. Install dependencies (requires Node.js):</p>
                  <p className="text-blue-400">npm install</p>
                  <p className="text-slate-500 mt-3"># 3. Start the agent pointing to this workspace:</p>
                  <p className="text-green-400">npm run start-agent -- --url {window.location.origin.replace('http', 'ws')}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {agents.map(agent => (
                  <div key={agent.id} className={`bg-white rounded-lg border ${agent.status === 'offline' ? 'border-slate-200 opacity-70' : 'border-slate-200 shadow-sm'} p-5 relative transition-all hover:shadow-md`}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${agent.status === 'idle' ? 'bg-green-100 text-green-600' : agent.status === 'busy' ? 'bg-amber-100 text-amber-600' : agent.status === 'disabled' ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-400'}`}>
                          <Server size={24} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 text-lg flex items-center gap-2">
                            {agent.id}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${agent.status === 'idle' ? 'bg-green-100 text-green-700' : agent.status === 'busy' ? 'bg-amber-100 text-amber-700' : agent.status === 'disabled' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                              {agent.status}
                            </span>
                          </h3>
                          <div className="flex items-center gap-2 text-xs font-mono mt-0.5">
                            <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{agent.os}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleAgentStatus(agent.id, agent.status)}
                          title={agent.status === 'disabled' ? 'Enable Agent' : 'Disable Agent'}
                          className={`p-2 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ${agent.status === 'disabled' && 'bg-red-50 text-red-500 hover:text-red-700 hover:bg-red-100'}`}
                        >
                          {agent.status === 'disabled' ? <Power size={18} /> : <PowerOff size={18} />}
                        </button>
                        <button
                          onClick={() => setAgentToDelete(agent.id)}
                          title="Delete Agent"
                          className="p-2 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2 items-center min-h-[28px]">
                        {editingAgentId === agent.id ? (
                          <div className="flex items-center gap-2 w-full max-w-[400px]">
                            <input
                              type="text"
                              autoFocus
                              className="text-xs px-2 py-1 border border-blue-400 rounded outline-none focus:ring-2 focus:ring-blue-100 flex-1 shadow-sm transition-all"
                              value={editLabels}
                              onChange={(e) => setEditLabels(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newLabels = editLabels.split(',').map(s => s.trim()).filter(Boolean);
                                  api.agents.updateLabels(agent.id, newLabels).then(fetchData);
                                  setEditingAgentId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingAgentId(null);
                                }
                              }}
                              onBlur={() => {
                                // Save on blur as well for convenience
                                const newLabels = editLabels.split(',').map(s => s.trim()).filter(Boolean);
                                if (newLabels.join(',') !== agent.labels.join(',')) {
                                  api.agents.updateLabels(agent.id, newLabels).then(fetchData);
                                }
                                setEditingAgentId(null);
                              }}
                              placeholder="Enter comma separated labels..."
                            />
                            <span className="text-[10px] text-slate-400 hidden sm:inline-block">Enter to save</span>
                          </div>
                        ) : (
                          <>
                            {agent.labels.length > 0 ? (
                              agent.labels.map(label => (
                                <span key={label} className="group flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs border border-indigo-100 font-medium">
                                  {label}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newLabels = agent.labels.filter(l => l !== label);
                                      api.agents.updateLabels(agent.id, newLabels).then(fetchData);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-indigo-400 hover:text-indigo-600 transition-opacity"
                                    title="Remove label"
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400 italic">No labels</span>
                            )}
                            <button
                              onClick={() => {
                                setEditingAgentId(agent.id);
                                setEditLabels(agent.labels.join(', '));
                              }}
                              title="Edit Labels"
                              className="px-2 py-0.5 bg-white text-slate-500 rounded text-xs border border-slate-200 hover:bg-slate-50 hover:text-slate-700 cursor-pointer shadow-sm transition-colors ml-1"
                            >
                              + Label
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1.5" title="The last time this agent successfully communicated with the central server (via Heartbeat). If an agent shows an old time, it may be dead, abruptly disconnected, or experiencing network issues.">
                        <Clock size={12} className="text-slate-400" />
                        Last seen: {formatLastSeen(agent.lastSeen)}
                        <HelpTooltip content="The last time this agent successfully communicated with the central server (Heartbeat). If this shows a time greater than a few minutes, the agent might be disconnected or dead." />
                      </span>
                      {agent.status === 'busy' && agent.currentReportId && (
                        <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded inline-flex items-center gap-1.5 font-medium border border-amber-200/50">
                          <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                          Executing task
                        </span>
                      )}
                    </div>
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

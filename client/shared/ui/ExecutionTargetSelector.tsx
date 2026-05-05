import React, { useState, useEffect } from 'react';
import { Server, Monitor, Zap, ChevronDown, RefreshCw, Layers, Tag } from 'lucide-react';
import { api } from '../services/api';

interface RemoteAgent {
  id: string;
  os: string;
  status: 'idle' | 'busy' | 'offline' | 'disabled';
  labels?: string[];
  lastSeen: number;
}

interface ExecutionTargetSelectorProps {
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
  mode?: 'execution' | 'recording';
  onSelectedStatusChange?: (status: RemoteAgent['status'] | null) => void;
}

export const ExecutionTargetSelector: React.FC<ExecutionTargetSelectorProps> = ({
  selectedAgentId,
  onSelect,
  mode = 'execution',
  onSelectedStatusChange,
}) => {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Extract all unique labels
  const allLabels = Array.from(new Set(agents.flatMap(a => a.labels || [])));

  const sortedAgents = [...agents].sort((a, b) => {
    const order: Record<string, number> = { idle: 0, busy: 1, offline: 2, disabled: 3 };
    return (order[a.status] ?? 99) - (order[b.status] ?? 99);
  });

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const data = await api.agents.list();
      setAgents(data);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (onSelectedStatusChange) {
      const agent = agents.find(a => a.id === selectedAgentId);
      onSelectedStatusChange(agent?.status ?? null);
    }
  }, [agents, selectedAgentId]);

  const isAnyQueue = selectedAgentId === 'QUEUE:ANY';
  const isLabelQueue = selectedAgentId?.startsWith('QUEUE:LABEL:');
  const labelMatch = selectedAgentId?.replace('QUEUE:LABEL:', '');
  const isLocal = !selectedAgentId;

  if (mode === 'recording') {
    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    const isNonIdle = selectedAgent && selectedAgent.status !== 'idle';

    return (
      <div className="w-full rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recording Target</span>
          <button
            type="button"
            onClick={fetchAgents}
            className={`text-slate-500 hover:text-slate-700 transition-colors ${loading ? 'animate-spin' : ''}`}
            aria-label="Refresh targets"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {isNonIdle && (
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <Zap size={12} className="text-amber-500 shrink-0" />
            <span className="text-[11px] text-amber-700">
              This agent is <span className="font-semibold">{selectedAgent.status}</span>. Recording may fail or queue until it becomes idle.
            </span>
          </div>
        )}

        <div className="p-2 space-y-1 max-h-[120px] overflow-y-auto">
          {agents.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-slate-500 italic border border-dashed border-slate-200 rounded-md bg-slate-50">
              No remote agents connected. Start an agent to begin recording.
            </div>
          ) : (
            sortedAgents.map(agent => {
              const nonIdle = agent.status !== 'idle';
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onSelect(agent.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors ${selectedAgentId === agent.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : nonIdle ? 'hover:bg-slate-50 text-slate-400 border border-transparent' : 'hover:bg-slate-50 text-slate-700 border border-transparent'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Monitor size={14} className={agent.status === 'disabled' ? 'text-slate-400' : nonIdle ? 'text-amber-400' : 'text-slate-500'} />
                    <div className="flex flex-col min-w-0">
                      <span className={`text-xs font-medium truncate ${agent.status === 'disabled' ? 'line-through opacity-60' : ''}`}>{agent.id}</span>
                      <span className={`text-[10px] uppercase truncate ${nonIdle ? 'text-amber-500 font-medium' : 'text-slate-500'}`}>{agent.os} • {agent.status}</span>
                    </div>
                  </div>
                  {selectedAgentId === agent.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-48 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded hover:border-slate-600 transition-colors focus:ring-1 focus:ring-blue-500 outline-none"
      >
        <div className="flex items-center gap-2 truncate">
          {isLocal ? (
            <>
              <Server size={14} className="text-emerald-400" />
              <span>Local Server</span>
            </>
          ) : isAnyQueue ? (
            <>
              <Layers size={14} className="text-purple-400" />
              <span>Any Available Node</span>
            </>
          ) : isLabelQueue ? (
            <>
              <Tag size={14} className="text-blue-300" />
              <span className="truncate">Tag: {labelMatch}</span>
            </>
          ) : (
            <>
              <Monitor size={14} className="text-blue-400" />
              <span className="truncate">{selectedAgentId}</span>
            </>
          )}
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded shadow-xl z-40 overflow-hidden animate-in fade-in slide-in-from-top-1">
            <div className="px-3 py-2 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Available Targets</span>
              <button
                onClick={(e) => { e.stopPropagation(); fetchAgents(); }}
                className={`text-slate-500 hover:text-white transition-colors ${loading ? 'animate-spin' : ''}`}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {/* Option: Local Server */}
              <button
                type="button"
                onClick={() => { onSelect(null); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors ${isLocal ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
              >
                <div className="flex items-center gap-2">
                  <Server size={14} />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">Local Server</span>
                    <span className="text-[10px] opacity-70">Built-in execution engine</span>
                  </div>
                </div>
                {isLocal && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
              </button>

              <div className="h-px bg-slate-700/50 my-1" />

              {mode === 'execution' && (
                <>
                  {/* Option: Queue (Any) */}
                  <button
                    type="button"
                    onClick={() => { onSelect('QUEUE:ANY'); setIsOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors ${isAnyQueue ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">Queue: Any Node</span>
                        <span className="text-[10px] opacity-70">Dispatches to first available</span>
                      </div>
                    </div>
                    {isAnyQueue && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
                  </button>

                  {/* Option: Tags */}
                  {allLabels.length > 0 && (
                    <>
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/30">Target By Tag</div>
                      {allLabels.map(label => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => { onSelect(`QUEUE:LABEL:${label}`); setIsOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors ${selectedAgentId === `QUEUE:LABEL:${label}` ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Tag size={12} className="text-slate-500" />
                            <span className="text-xs font-medium">{label}</span>
                          </div>
                          {selectedAgentId === `QUEUE:LABEL:${label}` && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
                        </button>
                      ))}
                    </>
                  )}

                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/30 mt-1">Specific Nodes</div>
                </>
              )}

              {/* Dynamic Agents */}
              {agents.length === 0 ? (
                <div className="px-3 py-4 text-center ">
                  <p className="text-[10px] text-slate-500 italic">No remote agents connected.</p>
                </div>
              ) : (
                sortedAgents.map(agent => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => { onSelect(agent.id); setIsOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors ${selectedAgentId === agent.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className={agent.status === 'disabled' ? 'text-slate-500' : ''} />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${agent.status === 'disabled' ? 'line-through opacity-60' : ''}`}>{agent.id}</span>
                        <span className="text-[10px] opacity-70 uppercase">{agent.os} • {agent.status}</span>
                      </div>
                    </div>
                    {agent.status !== 'disabled' && (
                      <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'idle' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : agent.status === 'busy' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-500'}`} />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

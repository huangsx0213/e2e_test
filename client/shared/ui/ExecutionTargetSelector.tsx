import React, { useState, useEffect } from 'react';
import { Server, Monitor, Zap, ChevronDown, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface RemoteAgent {
  id: string;
  os: string;
  status: 'idle' | 'busy' | 'offline';
  lastSeen: number;
}

interface ExecutionTargetSelectorProps {
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
}

export const ExecutionTargetSelector: React.FC<ExecutionTargetSelectorProps> = ({
  selectedAgentId,
  onSelect,
}) => {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

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

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-1.5 ml-1">
         <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
           <Zap size={10} className="text-amber-500" /> Run Target
         </span>
      </div>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-48 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded hover:border-slate-600 transition-colors focus:ring-1 focus:ring-blue-500 outline-none"
      >
        <div className="flex items-center gap-2 truncate">
          {selectedAgentId ? (
            <>
              <Monitor size={14} className="text-blue-400" />
              <span className="truncate">{selectedAgentId}</span>
            </>
          ) : (
            <>
              <Server size={14} className="text-emerald-400" />
              <span>Local Server</span>
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
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Available Nodes</span>
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
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors ${!selectedAgentId ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
              >
                <div className="flex items-center gap-2">
                  <Server size={14} />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">Local Server</span>
                    <span className="text-[10px] opacity-70">Built-in execution engine</span>
                  </div>
                </div>
                {!selectedAgentId && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
              </button>

              <div className="h-px bg-slate-700/50 my-1" />

              {/* Dynamic Agents */}
              {agents.length === 0 ? (
                <div className="px-3 py-4 text-center ">
                  <p className="text-[10px] text-slate-500 italic">No remote agents connected.</p>
                </div>
              ) : (
                agents.map(agent => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => { onSelect(agent.id); setIsOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors ${selectedAgentId === agent.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Monitor size={14} />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{agent.id}</span>
                        <span className="text-[10px] opacity-70 uppercase">{agent.os} • {agent.status}</span>
                      </div>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'idle' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'}`} />
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

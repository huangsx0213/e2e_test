import React, { useState, useMemo } from 'react';
import { Play, Search, Filter, Layers, ChevronRight, ChevronDown, FlaskConical, Clock, CheckCircle2, XCircle, CheckSquare, Square } from 'lucide-react';
import { Project, TestSuite, TestCase } from '../types';

interface TestRunnerProps {
  projects: Project[];
  suites: TestSuite[];
  currentProjectId: string;
  onRun: (suiteId: string, caseId: string) => void;
}

export const TestRunner: React.FC<TestRunnerProps> = ({ projects, suites, currentProjectId, onRun }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({});
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PASSED' | 'FAILED'>('ALL');
  const [selectedSuites, setSelectedSuites] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<string, 'PASSED' | 'FAILED' | 'PENDING'>>({});

  const currentProject = projects.find(p => p.id === currentProjectId);

  // Filter Logic
  const filteredSuites = useMemo(() => {
    if (!searchTerm) return suites;
    const lower = searchTerm.toLowerCase();
    return suites.map(s => ({
        ...s,
        cases: s.cases.filter(c => c.name.toLowerCase().includes(lower))
    })).filter(s => s.name.toLowerCase().includes(lower) || s.cases.length > 0);
  }, [suites, searchTerm]);

  const toggleSuite = (id: string) => {
    setExpandedSuites(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSuiteSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedSuites);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedSuites(newSelected);
  };

  const handleBatchRun = async () => {
    if (selectedSuites.size === 0) return;
    setIsBatchRunning(true);
    
    const results: Record<string, 'PASSED' | 'FAILED' | 'PENDING'> = {};
    selectedSuites.forEach(id => results[id] = 'PENDING');
    setBatchResults(results);

    for (const suiteId of selectedSuites) {
      // Mock execution delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      setBatchResults(prev => ({
        ...prev,
        [suiteId]: Math.random() > 0.1 ? 'PASSED' : 'FAILED'
      }));
    }
    
    setIsBatchRunning(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 shadow-sm z-10">
        <div className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Test Runner</h1>
                    <p className="text-slate-500 text-sm mt-1">Select and execute test cases for <span className="font-semibold text-indigo-600">{currentProject?.name}</span>.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={handleBatchRun}
                        disabled={selectedSuites.size === 0 || isBatchRunning}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {isBatchRunning ? <Clock size={16} className="animate-spin" /> : <Play size={16} />}
                        {isBatchRunning ? 'Running Batch...' : `Run Selected (${selectedSuites.size})`}
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text"
                        placeholder="Search test suites or cases..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center gap-2 sm:border-l border-slate-200 sm:pl-4">
                    <span className="text-sm text-slate-500 font-medium mr-2 hidden sm:inline-block">Filter:</span>
                    <button 
                        onClick={() => setFilterStatus('ALL')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        All
                    </button>
                    <button 
                        onClick={() => setFilterStatus('PASSED')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === 'PASSED' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Passed
                    </button>
                    <button 
                        onClick={() => setFilterStatus('FAILED')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === 'FAILED' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Failed
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-4">
            {filteredSuites.map(suite => (
                <div key={suite.id} className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md ${selectedSuites.has(suite.id) ? 'border-indigo-300 ring-1 ring-indigo-500/20' : 'border-slate-200'}`}>
                    {/* Suite Header */}
                    <div 
                        className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleSuite(suite.id)}
                    >
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={(e) => toggleSuiteSelection(e, suite.id)}
                                className="text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                                {selectedSuites.has(suite.id) ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                            </button>
                            <div className={`p-1 rounded hover:bg-slate-200 transition-colors ${expandedSuites[suite.id] ? 'rotate-90' : ''}`}>
                                <ChevronRight size={18} className="text-slate-400" />
                            </div>
                            <div className="flex items-center gap-3">
                                <Layers size={18} className="text-indigo-600" />
                                <h3 className="font-semibold text-slate-900">{suite.name}</h3>
                                <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-white border border-slate-200 rounded-full">
                                    {suite.cases.length} Cases
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             {batchResults[suite.id] === 'PENDING' && (
                                 <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                                    <Clock size={12} className="animate-spin" /> Running...
                                 </div>
                             )}
                             {batchResults[suite.id] === 'PASSED' && (
                                 <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                                    <CheckCircle2 size={12} /> Passed
                                 </div>
                             )}
                             {batchResults[suite.id] === 'FAILED' && (
                                 <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
                                    <XCircle size={12} /> Failed
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* Test Cases List */}
                    {expandedSuites[suite.id] && (
                        <div className="divide-y divide-slate-100">
                            {suite.cases.map(tc => (
                                <div key={tc.id} className="px-6 py-4 flex items-center justify-between hover:bg-indigo-50/30 transition-colors group ml-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                            <FlaskConical size={16} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-slate-900">{tc.name}</h4>
                                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">{tc.description || 'No description provided'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs text-slate-400">Last run</p>
                                            <p className="text-xs font-medium text-slate-600">2h ago</p>
                                        </div>
                                        
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onRun(suite.id, tc.id); }}
                                            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm flex items-center gap-2 group/btn"
                                        >
                                            <Play size={14} className="text-indigo-600 group-hover/btn:text-white transition-colors" />
                                            Run
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {suite.cases.length === 0 && (
                                <div className="px-6 py-8 text-center text-slate-400 text-sm italic">
                                    No test cases in this suite.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
            
            {filteredSuites.length === 0 && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search size={24} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No tests found</h3>
                    <p className="text-slate-500 mt-1">Try adjusting your search or filter.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

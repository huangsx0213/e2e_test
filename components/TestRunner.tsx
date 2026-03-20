import React, { useState, useMemo } from 'react';
import { Play, Search, Filter, Layers, ChevronRight, ChevronDown, FlaskConical, Clock, CheckCircle2, XCircle } from 'lucide-react';
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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 shadow-sm z-10">
        <div className="flex justify-between items-center mb-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Test Runner</h1>
                <p className="text-gray-500 text-sm mt-1">Select and execute test cases for <span className="font-semibold text-indigo-600">{currentProject?.name}</span>.</p>
            </div>
            <div className="flex gap-3">
                <div className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100 flex items-center gap-2">
                    <Clock size={16} />
                    Last Run: 2 hours ago
                </div>
            </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text"
                    placeholder="Search test suites or cases..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                <span className="text-sm text-gray-500 font-medium mr-2">Filter:</span>
                <button 
                    onClick={() => setFilterStatus('ALL')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === 'ALL' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    All
                </button>
                <button 
                    onClick={() => setFilterStatus('PASSED')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === 'PASSED' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    Passed
                </button>
                <button 
                    onClick={() => setFilterStatus('FAILED')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === 'FAILED' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    Failed
                </button>
            </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-4">
            {filteredSuites.map(suite => (
                <div key={suite.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                    {/* Suite Header */}
                    <div 
                        className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleSuite(suite.id)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-1 rounded hover:bg-gray-200 transition-colors ${expandedSuites[suite.id] ? 'rotate-90' : ''}`}>
                                <ChevronRight size={18} className="text-gray-400" />
                            </div>
                            <div className="flex items-center gap-3">
                                <Layers size={18} className="text-indigo-600" />
                                <h3 className="font-semibold text-gray-900">{suite.name}</h3>
                                <span className="text-xs text-gray-400 font-medium px-2 py-0.5 bg-white border border-gray-200 rounded-full">
                                    {suite.cases.length} Cases
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             {/* Mock Status for Suite */}
                             <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                                <CheckCircle2 size={12} />
                                100% Pass Rate
                             </div>
                        </div>
                    </div>

                    {/* Test Cases List */}
                    {expandedSuites[suite.id] && (
                        <div className="divide-y divide-gray-100">
                            {suite.cases.map(tc => (
                                <div key={tc.id} className="px-6 py-4 flex items-center justify-between hover:bg-indigo-50/30 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                            <FlaskConical size={16} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-gray-900">{tc.name}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">{tc.description || 'No description provided'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs text-gray-400">Last run</p>
                                            <p className="text-xs font-medium text-gray-600">2h ago</p>
                                        </div>
                                        
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onRun(suite.id, tc.id); }}
                                            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm flex items-center gap-2 group/btn"
                                        >
                                            <Play size={14} className="text-indigo-600 group-hover/btn:text-white transition-colors" />
                                            Run
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {suite.cases.length === 0 && (
                                <div className="px-6 py-8 text-center text-gray-400 text-sm italic">
                                    No test cases in this suite.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
            
            {filteredSuites.length === 0 && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search size={24} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">No tests found</h3>
                    <p className="text-gray-500 mt-1">Try adjusting your search or filter.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

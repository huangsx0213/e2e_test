import React from 'react';
import { Layers, PlayCircle, Database, ArrowRight, Globe, Box, Workflow, Network, FileText, FileCode, CheckCircle2, Clock, Activity } from 'lucide-react';
import { Project, TestSuite } from '../types';

interface DashboardProps {
  projects: Project[];
  suites: TestSuite[];
  environments: string[];
  currentProjectId: string;
  onNavigate: (tab: 'DASHBOARD' | 'RUN' | 'ELEMENTS' | 'MODULES' | 'TESTS' | 'HEADERS' | 'BODIES' | 'ENDPOINTS' | 'SETTINGS') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, suites, environments, currentProjectId, onNavigate }) => {
  const currentProject = projects.find(p => p.id === currentProjectId);
  
  // Calculate Stats
  const totalScenarios = currentProject?.scenarios?.length || 0;
  const totalSuites = suites.length;
  const totalCases = suites.reduce((acc, s) => acc + s.cases.length, 0);

  // Mock Recent Run Data (since we don't have persistent run history yet)
  const recentRun = {
    scenarioName: currentProject?.scenarios?.[0]?.name || "E2E Checkout Flow",
    status: "PASSED",
    env: environments[0] || "PROD",
    time: "10 mins ago",
    duration: "45s",
    passedCases: 12,
    totalCases: 12
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
        <div className="p-8 w-full mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Workspace Overview</h1>
                <p className="text-slate-500 mt-2">Managing <span className="font-semibold text-blue-600">{currentProject?.name || 'All Projects'}</span> across {environments.length} environments.</p>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={() => onNavigate('RUN')}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
                >
                    <PlayCircle size={16} />
                    Run Scenarios
                </button>
            </div>
        </div>

        {/* Primary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard 
                title="Scenarios" 
                value={totalScenarios} 
                icon={<PlayCircle className="text-emerald-500" size={24} />} 
            />
            <MetricCard 
                title="Test Suites" 
                value={totalSuites} 
                icon={<Layers className="text-blue-500" size={24} />} 
            />
            <MetricCard 
                title="Test Cases" 
                value={totalCases} 
                icon={<FileText className="text-indigo-500" size={24} />} 
            />
        </div>

        {/* Recent Run Summary */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Activity size={18} className="text-slate-400" /> Recent Run Summary
                </h3>
                <button onClick={() => onNavigate('RUN')} className="text-sm text-blue-600 font-medium hover:text-blue-700 cursor-pointer">
                    View Scenarios
                </button>
            </div>
            <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <h4 className="text-lg font-bold text-slate-900">{recentRun.scenarioName}</h4>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                            <span className="flex items-center gap-1.5"><Globe size={14} /> {recentRun.env}</span>
                            <span className="flex items-center gap-1.5"><Clock size={14} /> {recentRun.time}</span>
                            <span className="flex items-center gap-1.5"><Activity size={14} /> {recentRun.duration}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    <div className="text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Status</p>
                        <p className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">{recentRun.status}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Pass Rate</p>
                        <p className="text-xl font-bold text-slate-900">{recentRun.passedCases}/{recentRun.totalCases}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <NavCard 
                title="Test Scenarios"
                description="Orchestrate test suites into end-to-end scenarios with variable overrides."
                icon={<PlayCircle size={24} className="text-emerald-600" />}
                bgClass="bg-emerald-50"
                onClick={() => onNavigate('RUN')}
                actionText="Manage Scenarios"
            />

            <NavCard 
                title="Test Suites"
                description="Build and manage test cases, define steps, and configure assertions."
                icon={<Layers size={24} className="text-blue-600" />}
                bgClass="bg-blue-50"
                onClick={() => onNavigate('TESTS')}
                actionText="Manage Suites"
            />

            <NavCard 
                title="Reusable Modules"
                description="Create reusable blocks of test steps to avoid duplication across cases."
                icon={<Box size={24} className="text-purple-600" />}
                bgClass="bg-purple-50"
                onClick={() => onNavigate('MODULES')}
                actionText="Manage Modules"
            />

            <NavCard 
                title="UI Elements"
                description="Maintain a centralized repository of UI locators for your application."
                icon={<Database size={24} className="text-amber-600" />}
                bgClass="bg-amber-50"
                onClick={() => onNavigate('ELEMENTS')}
                actionText="Manage Elements"
            />

            <NavCard 
                title="API Endpoints"
                description="Configure REST API endpoints for use in your test steps."
                icon={<Network size={24} className="text-teal-600" />}
                bgClass="bg-teal-50"
                onClick={() => onNavigate('ENDPOINTS')}
                actionText="Manage Endpoints"
            />

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 flex-1">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                            <Workflow size={24} className="text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">API Templates</h3>
                    </div>
                    <p className="text-slate-500 text-sm mb-6">
                        Manage reusable headers and request bodies for API testing.
                    </p>
                    <div className="flex gap-3 mt-auto relative z-10">
                        <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onNavigate('HEADERS'); }}
                            className="flex-1 py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <FileText size={16} /> Headers
                        </button>
                        <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onNavigate('BODIES'); }}
                            className="flex-1 py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <FileCode size={16} /> Bodies
                        </button>
                    </div>
                </div>
            </div>

        </div>

        </div>
    </div>
  );
};

const MetricCard = ({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex items-center gap-5">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 shrink-0">
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{value}</h3>
        </div>
    </div>
);

const NavCard = ({ title, description, icon, bgClass, onClick, actionText }: { title: string, description: string, icon: React.ReactNode, bgClass: string, onClick: () => void, actionText: string }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group cursor-pointer" onClick={onClick}>
        <div className="p-6 flex-1">
            <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-lg ${bgClass} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            </div>
            <p className="text-slate-500 text-sm">
                {description}
            </p>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center group-hover:bg-slate-100 transition-colors">
            <span className="text-sm font-medium text-slate-700">{actionText}</span>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-slate-700 group-hover:translate-x-1 transition-all" />
        </div>
    </div>
);

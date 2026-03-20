import React from 'react';
import { Layers, PlayCircle, Database, Activity, ArrowRight, Zap, Globe, CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { Project, TestSuite } from '../types';

interface DashboardProps {
  projects: Project[];
  suites: TestSuite[];
  environments: string[];
  currentProjectId: string;
  onNavigate: (tab: 'TESTS' | 'RUN') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, suites, environments, currentProjectId, onNavigate }) => {
  const currentProject = projects.find(p => p.id === currentProjectId);
  
  // Calculate Stats
  const totalSuites = suites.length;
  const totalCases = suites.reduce((acc, s) => acc + s.cases.length, 0);
  const totalElements = currentProject?.pages.reduce((acc, p) => acc + p.elements.length, 0) || 0;

  // Mock Data for Charts
  const passRate = 92;
  const recentRuns = [
    { id: 1, name: 'Smoke Test Suite', env: 'PROD', status: 'PASSED', time: '10 mins ago', duration: '45s' },
    { id: 2, name: 'Checkout Flow', env: 'UAT', status: 'FAILED', time: '2 hours ago', duration: '1m 12s' },
    { id: 3, name: 'User Registration', env: 'DEV', status: 'PASSED', time: '5 hours ago', duration: '30s' },
    { id: 4, name: 'API Health Check', env: 'PROD', status: 'PASSED', time: '1 day ago', duration: '15s' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Workspace Overview</h1>
                <p className="text-slate-500 mt-2">Monitoring <span className="font-semibold text-indigo-600">{currentProject?.name || 'All Projects'}</span> across {environments.length} environments.</p>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={() => onNavigate('RUN')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <PlayCircle size={16} />
                    Run Tests
                </button>
            </div>
        </div>

        {/* Primary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
                title="Pass Rate" 
                value={`${passRate}%`} 
                subtitle="Last 30 days"
                icon={<Activity className="text-emerald-500" size={20} />} 
                trend="+2.4%"
                trendUp={true}
            />
            <MetricCard 
                title="Total Test Cases" 
                value={totalCases} 
                subtitle="Across all suites"
                icon={<Layers className="text-indigo-500" size={20} />} 
                trend="+12"
                trendUp={true}
            />
            <MetricCard 
                title="UI Elements" 
                value={totalElements} 
                subtitle="In Object Repository"
                icon={<Database className="text-blue-500" size={20} />} 
            />
            <MetricCard 
                title="Active Environments" 
                value={environments.length} 
                subtitle="Configured targets"
                icon={<Globe className="text-purple-500" size={20} />} 
            />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Test Execution History */}
            <div className="lg:col-span-2 space-y-8">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <Calendar size={18} className="text-slate-400" /> Recent Test Runs
                        </h3>
                        <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">View All</button>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {recentRuns.map((run) => (
                            <div key={run.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                        run.status === 'PASSED' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                                    }`}>
                                        {run.status === 'PASSED' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-900">{run.name}</h4>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span className="flex items-center gap-1"><Globe size={12} /> {run.env}</span>
                                            <span className="flex items-center gap-1"><Clock size={12} /> {run.time}</span>
                                            <span className="flex items-center gap-1"><Activity size={12} /> {run.duration}</span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onNavigate('RUN')}
                                    className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-indigo-600 transition-all"
                                >
                                    View Details
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Health Overview */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <TrendingUp size={18} className="text-slate-400" /> Suite Health Overview
                        </h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            {suites.slice(0, 3).map(suite => {
                                const passPercentage = Math.floor(Math.random() * 20) + 80; // Mock 80-100%
                                return (
                                <div key={suite.id}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-slate-700">{suite.name}</span>
                                        <span className="text-slate-500">{passPercentage}% Pass</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                        <div className={`h-2 rounded-full ${passPercentage > 90 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${passPercentage}%` }}></div>
                                    </div>
                                </div>
                            )})}
                            {suites.length === 0 && (
                                <div className="text-center py-4 text-sm text-slate-500">No test suites available.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Actionable Insights & Quick Links */}
            <div className="space-y-8">
                
                {/* Actionable Insights */}
                <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-amber-200/50 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-amber-600" />
                        <h3 className="font-semibold text-amber-900">Needs Attention</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex gap-3">
                            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                            <div>
                                <p className="text-sm font-medium text-amber-900">Flaky Test Detected</p>
                                <p className="text-xs text-amber-700 mt-0.5">"Checkout Flow" failed 2 times in the last 5 runs.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                            <div>
                                <p className="text-sm font-medium text-amber-900">Missing Assertions</p>
                                <p className="text-xs text-amber-700 mt-0.5">3 test cases in "Smoke Test Suite" have no assertions.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <Zap size={18} className="text-slate-400" /> Quick Actions
                        </h3>
                    </div>
                    <div className="p-4 space-y-2">
                        <button 
                            onClick={() => onNavigate('TESTS')}
                            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Layers size={16} />
                                </div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">Create New Test</span>
                            </div>
                            <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600" />
                        </button>
                        <button 
                            onClick={() => onNavigate('RUN')}
                            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <PlayCircle size={16} />
                                </div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-600">Run Smoke Suite</span>
                            </div>
                            <ArrowRight size={16} className="text-slate-300 group-hover:text-emerald-600" />
                        </button>
                    </div>
                </div>

            </div>
        </div>
        </div>
    </div>
  );
};

const MetricCard = ({ title, value, subtitle, icon, trend, trendUp }: { title: string, value: string | number, subtitle: string, icon: React.ReactNode, trend?: string, trendUp?: boolean }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500">{title}</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-2">{value}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                {icon}
            </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-slate-500">{subtitle}</span>
            {trend && (
                <span className={`font-medium ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
                    {trend}
                </span>
            )}
        </div>
    </div>
);

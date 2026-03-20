import React from 'react';
import { Layers, PlayCircle, Database, Activity, BarChart3, ArrowRight, Zap, Globe, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
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
  const totalModules = currentProject?.modules.length || 0;

  // Mock Data for Charts
  const passRate = 85;

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50">
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-2">Overview of your automation workspace for <span className="font-semibold text-indigo-600">{currentProject?.name}</span>.</p>
            </div>
            <div className="flex gap-3">
                <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center gap-2 text-sm font-medium text-gray-600">
                    <Globe size={16} className="text-indigo-500" />
                    {environments.length} Environments
                </div>
                <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center gap-2 text-sm font-medium text-gray-600">
                    <Layers size={16} className="text-green-500" />
                    {projects.length} Projects
                </div>
            </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
                label="Test Suites" 
                value={totalSuites} 
                icon={<Layers className="text-indigo-600" size={24} />} 
                trend="+2 this week"
                color="indigo"
            />
            <StatCard 
                label="Test Cases" 
                value={totalCases} 
                icon={<PlayCircle className="text-emerald-600" size={24} />} 
                trend="+12% coverage"
                color="emerald"
            />
            <StatCard 
                label="UI Elements" 
                value={totalElements} 
                icon={<Database className="text-blue-600" size={24} />} 
                trend="In current project"
                color="blue"
            />
            <StatCard 
                label="Pass Rate" 
                value={`${passRate}%`} 
                icon={<Activity className="text-purple-600" size={24} />} 
                trend="Last 24h"
                color="purple"
            />
        </div>

        {/* Main Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Col: Activity & Status */}
            <div className="lg:col-span-2 space-y-8">
                
                {/* Execution Status */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Activity size={18} className="text-gray-400" /> Execution Status
                        </h3>
                        <div className="flex gap-2">
                            <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-600 rounded-md">Last 7 Days</span>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: '85%' }}></div>
                                <div className="h-full bg-red-500" style={{ width: '10%' }}></div>
                                <div className="h-full bg-amber-500" style={{ width: '5%' }}></div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                                <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Passed</p>
                                <p className="text-2xl font-bold text-emerald-700 mt-1">142</p>
                            </div>
                            <div className="p-4 rounded-lg bg-red-50 border border-red-100">
                                <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Failed</p>
                                <p className="text-2xl font-bold text-red-700 mt-1">12</p>
                            </div>
                            <div className="p-4 rounded-lg bg-amber-50 border border-amber-100">
                                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Skipped</p>
                                <p className="text-2xl font-bold text-amber-700 mt-1">8</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900">Recent Executions</h3>
                        <button className="text-xs text-indigo-600 font-medium hover:underline">View History</button>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {[1, 2, 3, 4].map((_, i) => (
                            <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                        i === 1 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                        {i === 1 ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {i === 0 ? 'Smoke Test Suite' : i === 1 ? 'Checkout Flow' : i === 2 ? 'User Registration' : 'API Health Check'}
                                            <span className="ml-2 text-xs text-gray-400 font-normal">
                                                {i === 0 ? '(Dev)' : i === 1 ? '(UAT)' : '(Prod)'}
                                            </span>
                                        </p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                                <Clock size={12} /> {i + 2} hours ago
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                Duration: {Math.floor(Math.random() * 60) + 10}s
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <button 
                                        onClick={() => onNavigate('RUN')}
                                        className="text-xs font-medium text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 px-3 py-1.5 rounded-md transition-colors"
                                    >
                                        Rerun
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Col: Quick Actions & System */}
            <div className="space-y-8">
                {/* Quick Actions */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Zap size={16} className="text-amber-500" /> Quick Actions
                        </h3>
                    </div>
                    <div className="p-4 space-y-3">
                        <button 
                            onClick={() => onNavigate('RUN')}
                            className="w-full p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group flex items-center gap-4 text-left"
                        >
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <PlayCircle size={20} />
                            </div>
                            <div>
                                <h4 className="font-semibold text-gray-900 text-sm">Run Automation</h4>
                                <p className="text-xs text-gray-500">Execute test suites</p>
                            </div>
                            <ArrowRight size={16} className="ml-auto text-gray-300 group-hover:text-indigo-400" />
                        </button>

                        <button 
                            onClick={() => onNavigate('TESTS')}
                            className="w-full p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group flex items-center gap-4 text-left"
                        >
                            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Layers size={20} />
                            </div>
                            <div>
                                <h4 className="font-semibold text-gray-900 text-sm">Design Tests</h4>
                                <p className="text-xs text-gray-500">Create new cases</p>
                            </div>
                            <ArrowRight size={16} className="ml-auto text-gray-300 group-hover:text-emerald-400" />
                        </button>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-xl shadow-lg p-6 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="font-bold text-lg mb-1">NexusAuto Pro</h3>
                        <p className="text-indigo-200 text-xs mb-4">v2.4.0 (Stable)</p>
                        
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                <span className="text-indigo-200">Current Project</span>
                                <span className="font-medium truncate max-w-[120px]">{currentProject?.name || 'None'}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <span className="text-indigo-200">System Status</span>
                                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                    Online
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Decorative BG */}
                    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
                    <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/20 rounded-full blur-2xl"></div>
                </div>
            </div>

        </div>
        </div>
    </div>
  );
};

const StatCard = ({ label, value, icon, trend, color }: { label: string, value: number | string, icon: React.ReactNode, trend: string, color: string }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all duration-200 group">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                <h3 className="text-3xl font-bold text-gray-900 mt-2 group-hover:scale-105 transition-transform origin-left">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg bg-${color}-50 border border-${color}-100 group-hover:bg-${color}-100 transition-colors`}>
                {icon}
            </div>
        </div>
        <div className="mt-4 flex items-center text-xs">
            <span className={`text-${color}-600 font-medium bg-${color}-50 px-2 py-0.5 rounded-full`}>
                {trend}
            </span>
        </div>
    </div>
);

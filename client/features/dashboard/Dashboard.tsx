import React, { useMemo, useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  AlertCircle,
  Printer,
  Download,
  AlertTriangle,
  TrendingUp,
  Globe,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { Project, TestSuite, ExecutionReport } from "@/shared/types";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { useReports } from "@/shared/hooks/useQueryHooks";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";

interface DashboardProps {
  projects: Project[];
  suites: TestSuite[];
  environments: string[];
  currentProjectId: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projects,
  suites,
  environments,
  currentProjectId,
}) => {
  const { data: reports = [], refetch: refetchReports } = useReports();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentProject = projects.find((p) => p.id === currentProjectId);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // 1. All plan-level reports for this project (chronological)
  const allPlanReports = useMemo(() => {
    return [...reports]
      .filter((r) => {
        const suite = suites.find((s) => s.id === r.suiteId);
        return (!suite || suite.projectId === currentProjectId) && r.executionType === "plan";
      })
      .sort((a, b) => a.startTime - b.startTime);
  }, [reports, suites, currentProjectId]);

  // 2. Distinct plans ever run (de-duped by planId, keeping the latest name)
  const availablePlans = useMemo(() => {
    const seenIds = new Set<string>();
    const plans: { id: string; name: string }[] = [];
    // iterate in reverse-chron so we keep the latest name per plan
    [...allPlanReports].reverse().forEach((r) => {
      if (r.planId && !seenIds.has(r.planId)) {
        seenIds.add(r.planId);
        plans.unshift({ id: r.planId, name: r.planName || r.planId });
      }
    });
    return plans;
  }, [allPlanReports]);

  // 3. Auto-select the most recently run plan on first load / project switch
  useEffect(() => {
    if (availablePlans.length === 0) { setSelectedPlanId(null); return; }
    const mostRecentReport = [...allPlanReports].reverse().find((r) => r.planId);
    setSelectedPlanId(mostRecentReport?.planId ?? availablePlans[0].id);
  }, [currentProjectId, availablePlans.length]);

  // 4. Filter analytics to the selected plan only
  const planReports = useMemo(() => {
    if (!selectedPlanId) return allPlanReports;
    return allPlanReports.filter((r) => r.planId === selectedPlanId);
  }, [allPlanReports, selectedPlanId]);

  const latestReport = planReports[planReports.length - 1];

  // Calculate General Test Plan Stats
  const totalScenarios = currentProject?.scenarios?.length || 0;
  const totalCases = suites
    .filter((s) => s.projectId === currentProjectId)
    .reduce((acc, s) => acc + s.cases.length, 0);

  // Print function
  const handlePrint = () => {
    window.print();
  };

  const handleExportHtml = () => {
    // Clone the entire DOM to keep tailwind CSS stylesheets intact
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    
    // Remove all elements that are meant to be hidden in print (Sidebar, Header, Print/Export Buttons)
    const hiddenElements = clone.querySelectorAll('.print\\:hidden');
    hiddenElements.forEach(el => el.remove());

    // Clean up dynamic script elements that shouldn't run in the static HTML report
    const scripts = clone.querySelectorAll('script');
    scripts.forEach(s => s.remove());

    const htmlContent = clone.outerHTML;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quantumqa_report_${new Date().getTime()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- ANALYTICS ---

  // A. Historical Trend Data
  const trendData = useMemo(() => {
    return planReports.slice(-20).map((r, index) => { // Last 20 Plan runs
      const duration = r.endTime ? Math.max(0, (r.endTime - r.startTime) / 1000) : 0; // seconds
      return {
        runName: `#${index + 1}`,
        date: new Date(r.startTime).toLocaleDateString(),
        passRate: r.passRate,
        duration: duration,
        status: r.status,
      };
    });
  }, [planReports]);

  // B. Flaky Suite Detection
  // Check which suites constantly swap from PASS -> FAIL -> PASS
  const flakySuites = useMemo(() => {
    const suiteHistory: Record<string, { suiteName: string; statuses: string[] }> = {};
    planReports.forEach((r) => {
      if (!suiteHistory[r.suiteId]) {
        suiteHistory[r.suiteId] = { suiteName: r.suiteName, statuses: [] };
      }
      suiteHistory[r.suiteId].statuses.push(r.status);
    });

    const flakyList = [];
    for (const [suiteId, data] of Object.entries(suiteHistory)) {
      let transitions = 0;
      for (let i = 1; i < data.statuses.length; i++) {
        if (data.statuses[i] !== data.statuses[i - 1]) {
          transitions++;
        }
      }
      if (transitions >= 2) { // Switched states at least twice
        flakyList.push({ ...data, suiteId, transitions });
      }
    }
    return flakyList.sort((a, b) => b.transitions - a.transitions).slice(0, 5);
  }, [planReports]);

  // Display Formatters
  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 print:overflow-visible print:h-auto print:bg-white print:p-0">
      <style>
        {`
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .dashboard-print-container {
              zoom: 0.7;
            }
            /* Hide scrollbars strictly in print */
            ::-webkit-scrollbar {
              display: none !important;
            }
            * {
              scrollbar-width: none !important;
              -ms-overflow-style: none !important;
            }
          }
        `}
      </style>
      <div className="p-8 w-full mx-auto space-y-6 animate-in fade-in duration-500 print:w-full print:max-w-none print:p-0 dashboard-print-container">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 print:mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center">
              Quality Assurance Dashboard
              <HelpTooltip content="This analytical dashboard observes ONLY official Test Plan regression results, filtering out partial debug runs to maintain high data fidelity." />
            </h1>
            <p className="text-slate-500 mt-2">
              Project:{" "}
              <span className="font-semibold text-blue-600">
                {currentProject?.name || "All Projects"}
              </span>
              {selectedPlanId && availablePlans.length > 0 && (
                <>
                  {" "}·{" "}
                  <span className="font-semibold text-indigo-600">
                    {availablePlans.find(p => p.id === selectedPlanId)?.name || "Selected Plan"}
                  </span>
                </>
              )}
            </p>
          </div>
        <div className="flex items-center gap-3 print:hidden">
          {/* Plan Selector */}
          {availablePlans.length > 0 && (
            <div className="relative">
              <select
                value={selectedPlanId ?? ""}
                onChange={(e) => setSelectedPlanId(e.target.value || null)}
                className="appearance-none pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm cursor-pointer transition-colors"
              >
                {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    📋 {plan.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          )}
        <button
          onClick={() => {
            setIsRefreshing(true);
            refetchReports();
            setTimeout(() => setIsRefreshing(false), 500);
          }}
          className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} /> Refresh
          </button>
            <button
              onClick={handleExportHtml}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
            >
              <Download size={16} /> HTML
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
            >
              <Printer size={16} /> PDF Report
            </button>
            <button
              onClick={() => window.open('/aut/login', '_blank')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg cursor-pointer ml-1"
            >
              <Globe size={16} /> AUT Login
            </button>
          </div>
        </div>

        {/* Global Overview Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            title="Total Environments"
            value={environments.length}
            icon={<Globe className="text-slate-500" size={24} />}
            compact
          />
          <MetricCard
            title="Total Scenarios"
            value={totalScenarios}
            icon={<Activity className="text-blue-500" size={24} />}
            compact
          />
          <MetricCard
            title="Repository Cases"
            value={totalCases}
            icon={<CheckCircle2 className="text-emerald-500" size={24} />}
            compact
          />
          <MetricCard
            title="Plan Runs Recorded"
            value={planReports.length}
            icon={<TrendingUp className="text-indigo-500" size={24} />}
            compact
          />
        </div>

        {planReports.length === 0 ? (
          <div className="p-16 bg-white rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 text-center">
            <AlertCircle size={48} className="text-slate-300 mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">No Test Plan Data Available</h3>
            <p className="max-w-md">
              To keep metrics robust, this dashboard exclusively monitors full **Test Plan** executions.
              There are no official test plan records logged in the database yet.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Top Level: Primary Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Recent Plan Run Summary */}
              <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Activity size={20} className="text-blue-500" /> Latest Regression
                </h3>
                
                {latestReport && (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                       <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
                          latestReport.status === "COMPLETED" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                        }`}>
                          {latestReport.status === "COMPLETED" ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
                        </div>
                        <div>
                           <h4 className="text-2xl font-bold text-slate-900">{latestReport.passRate}%</h4>
                           <p className="text-sm text-slate-500">Overall Pass Rate</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-lg p-3">
                         <p className="text-xs font-medium text-slate-500 mb-1">Status</p>
                         <p className={`text-sm font-bold ${latestReport.status === 'COMPLETED' ? 'text-emerald-600' : 'text-red-600'}`}>
                           {latestReport.status}
                         </p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                         <p className="text-xs font-medium text-slate-500 mb-1">Run Time</p>
                         <p className="text-sm font-bold text-slate-700">
                           {formatTime((latestReport.endTime - latestReport.startTime) / 1000)}
                         </p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                         <p className="text-xs font-medium text-slate-500 mb-1">Passed Cases</p>
                         <p className="text-sm font-bold text-emerald-600">{latestReport.passedCases}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                         <p className="text-xs font-medium text-slate-500 mb-1">Failed Cases</p>
                         <p className="text-sm font-bold text-red-600">{latestReport.failedCases}</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100 flex items-center text-xs text-slate-400 gap-2">
                       <Clock size={14} /> Ran {getTimeAgo(latestReport.startTime)} on {latestReport.environment}
                    </div>
                  </div>
                )}
              </div>

              {/* Middle/Right Column: Pass Rate Trend (Bar Chart) */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                 <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <TrendingUp size={20} className="text-indigo-500" /> Historical Pass Rate Trend
                 </h3>
                 <div className="flex-1 min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="runName" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} domain={[0, 100]} />
                        <RechartsTooltip 
                           cursor={{fill: '#f8fafc'}}
                           contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                           formatter={(value: number) => [`${value}%`, 'Pass Rate']}
                           labelFormatter={(label) => `Run ${label}`}
                        />
                        <Bar 
                          dataKey="passRate" 
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        >
                          {trendData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.passRate === 100 ? '#10b981' : entry.passRate > 50 ? '#f59e0b' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>

            </div>

            {/* Bottom Level: Performance & Flaky Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Execution Time Analytics Line Chart */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                 <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <Activity size={20} className="text-teal-500" /> Execution Time Analytics
                 </h3>
                 <div className="flex-1 min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="runName" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip 
                           contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                           formatter={(value: number) => [`${Math.round(value)}s`, 'Duration']}
                        />
                        <Line type="monotone" dataKey="duration" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              {/* Flaky Suies Detection */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-0 flex flex-col overflow-hidden">
                 <div className="p-6 border-b border-slate-100 bg-amber-50/30">
                   <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <AlertTriangle size={20} className="text-amber-500" /> Flaky Test Detection
                   </h3>
                   <p className="text-sm text-slate-500 mt-1">
                     Suites that frequently toggle between PASS and FAIL across consecutive Test Plan runs.
                   </p>
                 </div>
                 
                 <div className="flex-1 overflow-auto">
                    {flakySuites.length === 0 ? (
                      <div className="p-12 flex flex-col items-center justify-center text-emerald-600/60">
                         <CheckCircle2 size={32} className="mb-3 opacity-50" />
                         <p className="text-sm font-medium">No unstable tests detected!</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                          <tr>
                            <th className="px-6 py-3">Suite Name</th>
                            <th className="px-6 py-3 text-center">Instability Index</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {flakySuites.map((suite, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="px-6 py-4 font-medium text-slate-900 truncate max-w-[200px]" title={suite.suiteName}>
                                {suite.suiteName}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                   <div className="w-16 bg-slate-200 rounded-full h-2">
                                     <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${Math.min(100, suite.transitions * 20)}%` }}></div>
                                   </div>
                                   <span className="font-bold text-amber-600">{suite.transitions} Flips</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                 </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({
  title,
  value,
  icon,
  compact = false,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  compact?: boolean;
}) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm flex items-center ${compact ? 'p-4 gap-4' : 'p-6 gap-5'}`}>
    <div className={`${compact ? 'p-3' : 'p-4'} rounded-xl bg-slate-50 border border-slate-100 shrink-0`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">
        {title}
      </p>
      <h3 className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold text-slate-900`}>{value}</h3>
    </div>
  </div>
);

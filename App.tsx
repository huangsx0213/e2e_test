import React, { useState, useEffect } from "react";
import {
  Layout,
  Box,
  PlaySquare,
  Layers,
  Settings as SettingsIcon,
  Activity,
  ChevronRight,
  BarChart3,
  Database,
  PlayCircle,
  Command,
  Search,
  Bell,
  Workflow,
  FileText,
  FileCode,
  Globe,
  Loader2,
} from "lucide-react";
import { ElementRepo } from "./components/ElementRepo";
import { TestBuilder } from "./components/TestBuilder";
import { ModuleBuilder } from "./components/ModuleBuilder";
import { ExecutionRunner } from "./components/ExecutionRunner";
import { HeadersManager } from "./components/HeadersManager";
import { BodyManager } from "./components/BodyManager";
import { EndpointManager } from "./components/EndpointManager";
import { Settings } from "./components/Settings";
import { Dashboard } from "./components/Dashboard";
import { TestRunner } from "./components/TestRunner";
import {
  Project,
  TestSuite,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
} from "./types";
import { api } from "./services/api";
import { useCrud, useEnvCrud } from "./hooks/useCrud";

function App() {
  const [activeTab, setActiveTab] = useState<
    | "DASHBOARD"
    | "RUN"
    | "ELEMENTS"
    | "MODULES"
    | "TESTS"
    | "HEADERS"
    | "BODIES"
    | "ENDPOINTS"
    | "SETTINGS"
  >("DASHBOARD");

  const [projects, projectsApi, loadingProjects] = useCrud<Project>(
    api.projects,
  );
  const [suites, suitesApi, loadingSuites] = useCrud<TestSuite>(api.suites);
  const [headers, headersApi, loadingHeaders] = useCrud<HeaderProfile>(
    api.headers,
  );
  const [bodies, bodiesApi, loadingBodies] = useCrud<BodyTemplate>(api.bodies);
  const [endpoints, endpointsApi, loadingEndpoints] = useCrud<ApiEndpoint>(
    api.endpoints,
  );
  const [environments, environmentsApi, loadingEnvironments] = useEnvCrud(
    api.environments,
  );

  const [currentEnvironment, setCurrentEnvironment] = useState<string>("");
  const [currentProjectId, setCurrentProjectId] = useState<string>("");

  useEffect(() => {
    if (!currentProjectId && projects.length > 0) {
      setCurrentProjectId(projects[0].id);
    }
  }, [projects, currentProjectId]);

  useEffect(() => {
    if (!currentEnvironment && environments.length > 0) {
      setCurrentEnvironment(environments[0]);
    }
  }, [environments, currentEnvironment]);

  const [executionState, setExecutionState] = useState<{
    suiteId: string;
    caseId: string;
  } | null>(null);

  const isLoading =
    loadingProjects ||
    loadingSuites ||
    loadingHeaders ||
    loadingBodies ||
    loadingEndpoints ||
    loadingEnvironments;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-gray-500 font-medium animate-pulse">
            Loading workspace data...
          </p>
        </div>
      </div>
    );
  }

  const activeSuite = suites.find((s) => s.id === executionState?.suiteId);
  const activeCase = activeSuite?.cases.find(
    (c) => c.id === executionState?.caseId,
  );

  // We need to pass the correct project to the runner to resolve modules
  // We use the globally selected project for execution context
  const executionProject =
    projects.find((p) => p.id === currentProjectId) || projects[0];

  return (
    <div className="flex h-screen bg-gray-50 text-slate-900 font-sans">
      {/* Professional Dark Sidebar */}
      <nav className="w-64 flex flex-col bg-slate-900 border-r border-slate-800 text-slate-300 z-20 shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-slate-800/50">
          <div className="flex items-center gap-2.5 text-white font-semibold tracking-tight">
            <div className="bg-blue-600 p-1.5 rounded-md">
              <Layers className="text-white fill-white/20" size={18} />
            </div>
            <span>
              Quantum<span className="text-blue-400 font-normal">QA</span>
            </span>
          </div>
        </div>

        <div className="p-3 space-y-0.5 mt-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-3 pt-2">
            Platform
          </div>
          <NavItem
            icon={<Activity />}
            label="Dashboard"
            active={activeTab === "DASHBOARD"}
            onClick={() => setActiveTab("DASHBOARD")}
          />
          <NavItem
            icon={<PlayCircle />}
            label="Run Tests"
            active={activeTab === "RUN"}
            onClick={() => setActiveTab("RUN")}
          />
          <NavItem
            icon={<PlaySquare />}
            label="Test Designer"
            active={activeTab === "TESTS"}
            onClick={() => setActiveTab("TESTS")}
          />
          <NavItem
            icon={<Database />}
            label="Object Repository"
            active={activeTab === "ELEMENTS"}
            onClick={() => setActiveTab("ELEMENTS")}
          />
          <NavItem
            icon={<Workflow />}
            label="Shared Modules"
            active={activeTab === "MODULES"}
            onClick={() => setActiveTab("MODULES")}
          />

          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-3 pt-4">
            API Assets
          </div>
          <NavItem
            icon={<Globe />}
            label="Endpoints"
            active={activeTab === "ENDPOINTS"}
            onClick={() => setActiveTab("ENDPOINTS")}
          />
          <NavItem
            icon={<FileText />}
            label="Headers"
            active={activeTab === "HEADERS"}
            onClick={() => setActiveTab("HEADERS")}
          />
          <NavItem
            icon={<FileCode />}
            label="Body Templates"
            active={activeTab === "BODIES"}
            onClick={() => setActiveTab("BODIES")}
          />
        </div>

        <div className="mt-auto p-3 border-t border-slate-800">
          <NavItem
            icon={<SettingsIcon />}
            label="Settings"
            active={activeTab === "SETTINGS"}
            onClick={() => setActiveTab("SETTINGS")}
          />
          <div className="mt-3 flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-md border border-slate-800">
            <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs border border-blue-500/30">
              QA
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-slate-200 truncate">
                QA Engineer
              </span>
              <span className="text-[10px] text-slate-500 truncate">
                admin@company.com
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col bg-white">
        {/* Modern Header */}
        <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 font-medium">Workspace</span>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              {projects.find((p) => p.id === currentProjectId)?.name ||
                "No Project Selected"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-gray-600 relative">
              <Bell size={18} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative bg-gray-50/50">
          {activeTab === "DASHBOARD" && (
            <Dashboard
              projects={projects}
              suites={suites}
              environments={environments}
              currentProjectId={currentProjectId}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "RUN" && (
            <TestRunner
              projects={projects}
              projectsApi={projectsApi}
              suites={suites}
              currentProjectId={currentProjectId}
              headers={headers}
              bodies={bodies}
              endpoints={endpoints}
              environments={environments}
              initialEnvironment={currentEnvironment}
            />
          )}

          {activeTab === "ELEMENTS" && (
            <ElementRepo
              projects={projects}
              projectsApi={projectsApi}
              currentProjectId={currentProjectId}
            />
          )}

          {activeTab === "MODULES" && (
            <ModuleBuilder
              projects={projects}
              projectsApi={projectsApi}
              headers={headers}
              bodies={bodies}
              endpoints={endpoints}
              currentProjectId={currentProjectId}
            />
          )}

          {activeTab === "TESTS" && (
            <TestBuilder
              suites={suites}
              suitesApi={suitesApi}
              projects={projects}
              headers={headers}
              bodies={bodies}
              endpoints={endpoints}
              onRunCase={(sId, cId) =>
                setExecutionState({ suiteId: sId, caseId: cId })
              }
              currentProjectId={currentProjectId}
            />
          )}

          {activeTab === "ENDPOINTS" && (
            <EndpointManager
              endpoints={endpoints}
              endpointsApi={endpointsApi}
              environments={environments}
            />
          )}

          {activeTab === "HEADERS" && (
            <HeadersManager headers={headers} headersApi={headersApi} />
          )}

          {activeTab === "BODIES" && (
            <BodyManager bodies={bodies} bodiesApi={bodiesApi} />
          )}

          {activeTab === "SETTINGS" && (
            <Settings
              environments={environments}
              environmentsApi={environmentsApi}
              currentEnvironment={currentEnvironment}
              setCurrentEnvironment={setCurrentEnvironment}
              projects={projects}
              projectsApi={projectsApi}
              currentProjectId={currentProjectId}
              setCurrentProjectId={setCurrentProjectId}
            />
          )}
        </div>
      </main>

      {/* Execution Overlay */}
      {executionState && activeSuite && activeCase && (
        <ExecutionRunner
          suite={activeSuite}
          testCase={activeCase}
          project={executionProject}
          headers={headers}
          bodies={bodies}
          endpoints={endpoints}
          environments={environments}
          initialEnvironment={currentEnvironment}
          onClose={() => setExecutionState(null)}
        />
      )}
    </div>
  );
}

const NavItem = ({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 group ${
      active
        ? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
    }`}
  >
    {React.cloneElement(icon as React.ReactElement<any>, {
      size: 18,
      className: active
        ? "text-white"
        : "text-slate-500 group-hover:text-slate-300",
    })}
    <span>{label}</span>
  </button>
);

const StatCard = ({
  label,
  value,
  icon,
  change,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  change: string;
}) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <div className="flex items-baseline gap-2 mt-1">
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <p className="text-xs text-gray-400 mt-1">{change}</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
        {icon}
      </div>
    </div>
  </div>
);

export default App;

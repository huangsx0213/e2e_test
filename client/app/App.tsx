import React, { useCallback, useState } from "react";
import { ExecutionRunner } from "@/features/execution/ExecutionRunner";
import { SuiteExecutionRunner } from "@/features/execution/SuiteExecutionRunner";
import { AppContent } from "@/app/components/AppContent";
import { AppHeader } from "@/app/components/AppHeader";
import { AppLoadingScreen } from "@/app/components/AppLoadingScreen";
import { AppSidebar } from "@/app/components/AppSidebar";
import { AppTab } from "@/app/types";
import { AppProviders } from "@/app/contexts/AppProviders";
import { useWorkspaceContext } from "@/app/contexts/WorkspaceContext";
import { useDataContext } from "@/app/contexts/DataContext";
import { useExecutionPanelContext } from "@/app/contexts/ExecutionContext";

function AppShell() {
  const [activeTab, setActiveTab] = useState<AppTab>("DASHBOARD");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const { currentProject, currentEnvironment, environments } = useWorkspaceContext();
  const { suites, headers, bodies, endpoints, reportsApi } = useDataContext();
  const { executionState, setExecutionState } = useExecutionPanelContext();

  const currentProjectName = currentProject?.name || "No Project Selected";

  const handleTabChange = useCallback(
    (tab: AppTab) => {
      setActiveTab(tab);
    },
    [],
  );

  const activeSuite = React.useMemo(
    () => suites.find((suite) => suite.id === executionState?.suiteId),
    [suites, executionState],
  );

  const activeCase = React.useMemo(
    () => activeSuite?.cases.find((testCase) => testCase.id === executionState?.caseId),
    [activeSuite, executionState],
  );

  return (
    <div className="flex h-screen bg-gray-50 text-slate-900 font-sans">
      <AppSidebar
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        onCollapseChange={setIsSidebarCollapsed}
        onTabChange={handleTabChange}
      />

      <main className="flex-1 overflow-hidden relative flex flex-col bg-white">
        <AppHeader currentProjectName={currentProjectName} />

        <div className="flex-1 overflow-hidden relative bg-gray-50/50">
          <AppContent activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </main>

      {executionState &&
        activeSuite &&
        !executionState.runSuite &&
        activeCase && (
          <div className="fixed inset-0 z-50">
            <ExecutionRunner
              suite={activeSuite}
              testCase={activeCase}
              project={currentProject!}
              headers={headers}
              bodies={bodies}
              endpoints={endpoints}
              environments={environments}
              initialEnvironment={currentEnvironment}
              reportsApi={reportsApi}
              onClose={() => setExecutionState(null)}
            />
          </div>
        )}

      {executionState && activeSuite && executionState.runSuite && (
        <div className="fixed inset-0 z-50 bg-white">
          <SuiteExecutionRunner
            suite={activeSuite}
            project={currentProject!}
            headers={headers}
            bodies={bodies}
            endpoints={endpoints}
            environments={environments}
            initialEnvironment={currentEnvironment}
            reportsApi={reportsApi}
            onClose={() => setExecutionState(null)}
          />
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AppProviders>
      {(isLoading) => isLoading ? <AppLoadingScreen /> : <AppShell />}
    </AppProviders>
  );
}

export default App;

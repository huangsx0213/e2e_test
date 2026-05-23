import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { Project, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint, Settings, ExecutionReport, DynamicVariable } from '@/shared/types';
import type { BusinessFlow, Requirement } from '../../../shared/contracts/index';

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.projects.list(),
  });
}

export function useSuites() {
  return useQuery({
    queryKey: queryKeys.suites,
    queryFn: () => api.suites.list(),
  });
}

export function useHeaders() {
  return useQuery({
    queryKey: queryKeys.headers,
    queryFn: () => api.headers.list(),
  });
}

export function useBodies() {
  return useQuery({
    queryKey: queryKeys.bodies,
    queryFn: () => api.bodies.list(),
  });
}

export function useEndpoints() {
  return useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: () => api.endpoints.list(),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.settings.list(),
  });
}

export function useEnvironments() {
  return useQuery({
    queryKey: queryKeys.environments,
    queryFn: () => api.environments.list(),
  });
}

export function useReports() {
  return useQuery({
    queryKey: queryKeys.reports,
    queryFn: () => api.reports.list(),
    refetchInterval: (query) => {
      const running = query.state.data?.some((r) => r.status === 'RUNNING');
      return running ? 4000 : false;
    },
  });
}

export function useDynamicVariables(projectId: string) {
  return useQuery({
    queryKey: queryKeys.dynamicVariables(projectId),
    queryFn: () => api.dynamicVariables.list(projectId),
    enabled: !!projectId,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.agents.list(),
    refetchInterval: 5000,
  });
}

export function useQueue() {
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: () => api.queue.list(),
    refetchInterval: 5000,
  });
}

export interface MutationActions<T extends { id: string }> {
  create: (item: Omit<T, 'id'> | T) => Promise<T>;
  update: (id: string, item: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

export interface EnvironmentMutationActions {
  create: (env: string) => Promise<string>;
  remove: (env: string) => Promise<void>;
}

export function useProjectMutations(): MutationActions<Project> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<Project, 'id'> | Project) => api.projects.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) => api.projects.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useSuiteMutations(): MutationActions<TestSuite> {
  const qc = useQueryClient();
  const latestUpdateVersionBySuiteId = useRef(new Map<string, number>());
  const create = useMutation({
    mutationFn: (item: Omit<TestSuite, 'id'> | TestSuite) => api.suites.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.suites }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TestSuite> }) => api.suites.update(id, data),
    onMutate: async ({ id, data }: { id: string; data: Partial<TestSuite> }) => {
      await qc.cancelQueries({ queryKey: queryKeys.suites });
      const previousSuites = qc.getQueryData<TestSuite[]>(queryKeys.suites);
      const requestVersion = (latestUpdateVersionBySuiteId.current.get(id) || 0) + 1;

      latestUpdateVersionBySuiteId.current.set(id, requestVersion);

      qc.setQueryData<TestSuite[]>(queryKeys.suites, (old) =>
        old?.map((suite) => (suite.id === id ? { ...suite, ...data } : suite)) ?? old,
      );

      return { previousSuites, requestVersion, suiteId: id };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (latestUpdateVersionBySuiteId.current.get(context.suiteId) !== context.requestVersion) {
        return;
      }

      qc.setQueryData(queryKeys.suites, context.previousSuites);
    },
    onSuccess: (updatedSuite, _variables, context) => {
      if (!context) return;
      if (latestUpdateVersionBySuiteId.current.get(context.suiteId) !== context.requestVersion) {
        return;
      }

      qc.setQueryData<TestSuite[]>(queryKeys.suites, (old) =>
        old?.map((suite) => (suite.id === updatedSuite.id ? updatedSuite : suite)) ?? old,
      );
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.suites.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.suites }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useHeaderMutations(): MutationActions<HeaderProfile> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<HeaderProfile, 'id'> | HeaderProfile) => api.headers.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.headers }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HeaderProfile> }) => api.headers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.headers }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.headers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.headers }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useBodyMutations(): MutationActions<BodyTemplate> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<BodyTemplate, 'id'> | BodyTemplate) => api.bodies.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bodies }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BodyTemplate> }) => api.bodies.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bodies }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.bodies.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bodies }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useEndpointMutations(): MutationActions<ApiEndpoint> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<ApiEndpoint, 'id'> | ApiEndpoint) => api.endpoints.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.endpoints }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ApiEndpoint> }) => api.endpoints.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.endpoints }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.endpoints.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.endpoints }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useSettingsMutations(): MutationActions<Settings> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<Settings, 'id'> | Settings) => api.settings.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Settings> }) => api.settings.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.settings.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useEnvironmentMutations(): EnvironmentMutationActions {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (env: string) => api.environments.create(env),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.environments }),
  });
  const remove = useMutation({
    mutationFn: (env: string) => api.environments.delete(env),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.environments }),
  });
  return {
    create: (env) => create.mutateAsync(env),
    remove: (env) => remove.mutateAsync(env),
  };
}

export function useReportMutations(): MutationActions<ExecutionReport> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<ExecutionReport, 'id'> | ExecutionReport) => api.reports.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reports }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExecutionReport> }) => api.reports.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reports }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.reports.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reports }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useDynamicVariableMutations(projectId: string) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (data: Omit<DynamicVariable, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => api.dynamicVariables.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dynamicVariables(projectId) }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DynamicVariable> }) => api.dynamicVariables.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dynamicVariables(projectId) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.dynamicVariables.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dynamicVariables(projectId) }),
  });
  return {
    create: (data: Omit<DynamicVariable, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => create.mutateAsync(data),
    update: (id: string, data: Partial<DynamicVariable>) => update.mutateAsync({ id, data }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}

export function useAgentMutations() {
  const qc = useQueryClient();
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.agents.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
  const updateLabels = useMutation({
    mutationFn: ({ id, labels }: { id: string; labels: string[] }) => api.agents.updateLabels(id, labels),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
  return {
    updateStatus: (id: string, status: string) => updateStatus.mutateAsync({ id, status }),
    updateLabels: (id: string, labels: string[]) => updateLabels.mutateAsync({ id, labels }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}

export function useRequirements(projectId: string) {
  return useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.listByProject(projectId),
    enabled: !!projectId,
  });
}

export function useRequirementMutations(projectId: string) {
  const qc = useQueryClient();
  const queryKey = ['requirements', projectId];
  const create = useMutation({
    mutationFn: (item: Omit<Requirement, 'id'> | Requirement) => api.requirements.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Requirement> }) => api.requirements.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.requirements.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}

export function useBusinessFlows(projectId: string) {
  return useQuery({
    queryKey: ['business-flows', projectId],
    queryFn: () => api.businessFlows.listByProject(projectId),
enabled: !!projectId,
  });
}

export function useProviderConfigs() {
  return useQuery({
    queryKey: queryKeys.providerConfigs,
    queryFn: () => api.providerConfigs.list(),
  });
}

export function useProviderConfigMutations() {
  const qc = useQueryClient();
  const queryKey = queryKeys.providerConfigs;
  const create = useMutation({
    mutationFn: (item: any) => api.providerConfigs.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.providerConfigs.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.providerConfigs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const setActive = useMutation({
    mutationFn: (id: string) => api.providerConfigs.setActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return {
    create: (item: any) => create.mutateAsync(item),
    update: (id: string, data: any) => update.mutateAsync({ id, data }),
    remove: (id: string) => remove.mutateAsync(id),
    setActive: (id: string) => setActive.mutateAsync(id),
  };
}

export function useBusinessFlowMutations(projectId: string) {
  const qc = useQueryClient();
  const queryKey = ['business-flows', projectId];
  const create = useMutation({
    mutationFn: (item: Omit<BusinessFlow, 'id'> | BusinessFlow) => api.businessFlows.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BusinessFlow> }) => api.businessFlows.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.businessFlows.delete(id),
    onSuccess: (_, id) => {
      qc.setQueryData<BusinessFlow[]>(queryKey, (current = []) => current.filter((flow) => flow.id !== id));
    },
  });
  const approve = useMutation({
    mutationFn: (id: string) => api.businessFlows.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const unapprove = useMutation({
    mutationFn: (id: string) => api.businessFlows.unapprove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    create: (item: Omit<BusinessFlow, 'id'> | BusinessFlow) => create.mutateAsync(item),
    update: (id: string, data: Partial<BusinessFlow>) => update.mutateAsync({ id, data }),
    remove: (id: string) => remove.mutateAsync(id),
approve: (id: string) => approve.mutateAsync(id),
    unapprove: (id: string) => unapprove.mutateAsync(id),
  };
}

export function usePipelineRuns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.runs(projectId),
    queryFn: () => api.pipeline.runs(projectId),
    enabled: !!projectId,
    refetchInterval: (query: any) => {
      const running = query.state.data?.some((r: any) => r.status === 'RUNNING' || r.status === 'WAITING_REVIEW');
      return running ? 3000 : false;
    },
  });
}

export function useCheckpoint(runId: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.checkpoint(runId),
    queryFn: () => api.pipeline.checkpoint(runId),
    enabled: !!runId,
    refetchInterval: 5000,
  });
}

export function useAgentLogs(runId: string, agentName?: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.logs(runId),
    queryFn: () => api.pipeline.logs(runId, agentName),
    enabled: !!runId,
  });
}

export function useNlCases(projectId: string) {
  return useQuery({
    queryKey: queryKeys.nlCases(projectId),
    queryFn: () => api.nlCases.listByProject(projectId),
    enabled: !!projectId,
  });
}

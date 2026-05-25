import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { TestSuite } from '@/shared/types';
import type { MutationActions } from './mutation-types';

export function useSuites() {
  return useQuery({
    queryKey: queryKeys.suites,
    queryFn: () => api.suites.list(),
  });
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

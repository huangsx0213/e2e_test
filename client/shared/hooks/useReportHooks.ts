import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { ExecutionReport } from '@/shared/types';
import type { MutationActions } from './mutation-types';

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

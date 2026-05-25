import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';

export function useNlCases(projectId: string) {
  return useQuery({
    queryKey: queryKeys.nlCases(projectId),
    queryFn: () => api.nlCases.listByProject(projectId),
    enabled: !!projectId,
  });
}

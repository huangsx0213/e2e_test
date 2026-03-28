import { useMemo } from 'react';
import {
  ApiEndpoint,
  BodyTemplate,
  HeaderProfile,
  TestSuite,
} from '@/shared/types';

interface UseProjectScopeParams {
  currentProjectId: string;
  suites: TestSuite[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
}

export function useProjectScope({
  currentProjectId,
  suites,
  headers,
  bodies,
  endpoints,
}: UseProjectScopeParams) {
  return useMemo(
    () => ({
      suites: suites.filter((suite) => suite.projectId === currentProjectId),
      headers: headers.filter((header) => header.projectId === currentProjectId),
      bodies: bodies.filter((body) => body.projectId === currentProjectId),
      endpoints: endpoints.filter(
        (endpoint) => endpoint.projectId === currentProjectId,
      ),
    }),
    [suites, headers, bodies, endpoints, currentProjectId],
  );
}

import { createContext, useContext } from 'react';
import { MutationActions } from '@/shared/hooks/useQueryHooks';
import {
  ApiEndpoint,
  BodyTemplate,
  ExecutionReport,
  HeaderProfile,
  TestSuite,
} from '@/shared/types';

export interface DataContextValue {
  suites: TestSuite[];
  suitesApi: MutationActions<TestSuite>;
  headers: HeaderProfile[];
  headersApi: MutationActions<HeaderProfile>;
  bodies: BodyTemplate[];
  bodiesApi: MutationActions<BodyTemplate>;
  endpoints: ApiEndpoint[];
  endpointsApi: MutationActions<ApiEndpoint>;
  reportsApi: MutationActions<ExecutionReport>;
  scopedSuites: TestSuite[];
  scopedHeaders: HeaderProfile[];
  scopedBodies: BodyTemplate[];
  scopedEndpoints: ApiEndpoint[];
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useDataContext() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useDataContext must be used within DataContext.Provider');
  return ctx;
}

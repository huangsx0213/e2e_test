import { createContext, useContext } from 'react';
import { CrudActions } from '@/shared/hooks/useCrud';
import {
  ApiEndpoint,
  BodyTemplate,
  HeaderProfile,
  TestSuite,
} from '@/shared/types';

export interface DataContextValue {
  suites: TestSuite[];
  suitesApi: CrudActions<TestSuite>;
  headers: HeaderProfile[];
  headersApi: CrudActions<HeaderProfile>;
  bodies: BodyTemplate[];
  bodiesApi: CrudActions<BodyTemplate>;
  endpoints: ApiEndpoint[];
  endpointsApi: CrudActions<ApiEndpoint>;
  reportsApi: CrudActions<import('@/shared/types').ExecutionReport>;
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

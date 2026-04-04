import { Project, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint, ExecutionReport, Settings, ExecutionRequest, DynamicVariable } from '@/shared/types';

export interface CrudService<T extends { id: string }> {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (data: Omit<T, 'id'> | T) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T>;
  delete: (id: string) => Promise<void>;
}

export interface EnvironmentService {
  list: () => Promise<string[]>;
  create: (env: string) => Promise<string>;
  delete: (env: string) => Promise<void>;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `/api/${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let message = 'An error occurred';
    try {
      const errorData = await response.json();
      message = errorData.error || message;
    } catch (e) {
      message = response.statusText;
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// --- API Services ---
// This pattern provides strong typing and a clean interface for components

function createCrudService<T extends { id: string }>(resource: string): CrudService<T> {
  return {
    list: () => apiFetch<T[]>(resource),
    get: (id: string) => apiFetch<T>(`${resource}/${id}`),
    create: (data: Omit<T, 'id'> | T) => apiFetch<T>(resource, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<T>) => apiFetch<T>(`${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiFetch<void>(`${resource}/${id}`, {
      method: 'DELETE',
    }),
  };
}

export const api = {
  projects: createCrudService<Project>('projects'),
  suites: createCrudService<TestSuite>('suites'),
  headers: createCrudService<HeaderProfile>('headers'),
  bodies: createCrudService<BodyTemplate>('bodies'),
  endpoints: createCrudService<ApiEndpoint>('endpoints'),
  reports: createCrudService<ExecutionReport>('reports'),
  settings: createCrudService<Settings>('settings'),
  environments: {
    list: () => apiFetch<string[]>('environments'),
    create: (env: string) => apiFetch<string>('environments', {
      method: 'POST',
      body: JSON.stringify({ name: env })
    }),
    delete: (env: string) => apiFetch<void>(`environments/${env}`, {
      method: 'DELETE'
    }),
  } satisfies EnvironmentService,
  dynamicVariables: {
    list: (projectId: string) => apiFetch<DynamicVariable[]>(`projects/${projectId}/dynamic-variables`),
    create: (projectId: string, data: Omit<DynamicVariable, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => apiFetch<DynamicVariable>(`projects/${projectId}/dynamic-variables`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<DynamicVariable>) => apiFetch<DynamicVariable>(`dynamic-variables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiFetch<void>(`dynamic-variables/${id}`, {
      method: 'DELETE',
    }),
    preview: (expression: string) => apiFetch<{ samples: string[] }>(`dynamic-variables/preview`, {
      method: 'POST',
      body: JSON.stringify({ expression }),
    }),
  },
};

// --- Execution API ---

export const executionApi = {
  execute: (request: ExecutionRequest) =>
    apiFetch<{ reportId: string; runId: string; status: string }>('runners/execute', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  stream: (reportId: string): EventSource => {
    return new EventSource(`/api/runners/stream/${reportId}`);
  },

  status: (reportId: string) =>
    apiFetch<{ runId: string; reportId: string; status: string }>(`runners/status/${reportId}`),

  abort: (reportId: string) =>
    apiFetch<{ success: boolean }>(`runners/abort/${reportId}`, { method: 'POST' }),
};

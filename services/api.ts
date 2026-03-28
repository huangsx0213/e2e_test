import { Project, TestSuite, HeaderProfile, BodyTemplate, ApiEndpoint, ExecutionReport } from '../types';
import { MOCK_PROJECTS, MOCK_SUITES, MOCK_HEADERS, MOCK_BODIES, MOCK_ENDPOINTS, MOCK_REPORTS } from '../constants';

// --- Simulated Database ---
let db = {
  projects: [...MOCK_PROJECTS] as Project[],
  suites: [...MOCK_SUITES] as TestSuite[],
  headers: [...MOCK_HEADERS] as HeaderProfile[],
  bodies: [...MOCK_BODIES] as BodyTemplate[],
  endpoints: [...MOCK_ENDPOINTS] as ApiEndpoint[],
  reports: [...MOCK_REPORTS] as ExecutionReport[],
};

let environmentsDb = ['DEV', 'SIT', 'UAT', 'PROD'];

// --- API Client Core ---
// In a real app, this would use fetch() or axios
const delay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function simulatedFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  await delay(); // Simulate network latency

  // Simulate random network errors (optional, disabled for now)
  // if (Math.random() < 0.05) throw new ApiError(500, 'Internal Server Error');

  const [resource, id] = endpoint.split('/');
  const method = options?.method || 'GET';
  
  if (resource === 'environments') {
      if (method === 'GET') return [...environmentsDb] as any;
      if (method === 'POST') {
          const env = JSON.parse(options?.body as string).name;
          environmentsDb.push(env);
          return env as any;
      }
      if (method === 'DELETE') {
          environmentsDb = environmentsDb.filter(e => e !== id);
          return null as any;
      }
  }

  const collection = db[resource as keyof typeof db] as any[];
  
  if (!collection) {
    throw new ApiError(404, `Endpoint /${resource} not found`);
  }

  switch (method) {
    case 'GET':
      if (id) {
        const item = collection.find(i => i.id === id);
        if (!item) throw new ApiError(404, 'Not found');
        return { ...item } as T;
      }
      return [...collection] as T;

    case 'POST':
      const newItem = JSON.parse(options?.body as string);
      collection.push(newItem);
      return { ...newItem } as T;

    case 'PUT':
    case 'PATCH':
      if (!id) throw new ApiError(400, 'ID required for update');
      const updateData = JSON.parse(options?.body as string);
      const index = collection.findIndex(i => i.id === id);
      if (index === -1) throw new ApiError(404, 'Not found');
      collection[index] = { ...collection[index], ...updateData };
      return { ...collection[index] } as T;

    case 'DELETE':
      if (!id) throw new ApiError(400, 'ID required for deletion');
      const delIndex = collection.findIndex(i => i.id === id);
      if (delIndex === -1) throw new ApiError(404, 'Not found');
      collection.splice(delIndex, 1);
      return null as any;

    default:
      throw new ApiError(405, 'Method not allowed');
  }
}

// --- API Services ---
// This pattern provides strong typing and a clean interface for components

function createCrudService<T extends { id: string }>(resource: string) {
  return {
    list: () => simulatedFetch<T[]>(resource),
    get: (id: string) => simulatedFetch<T>(`${resource}/${id}`),
    create: (data: Omit<T, 'id'> | T) => simulatedFetch<T>(resource, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<T>) => simulatedFetch<T>(`${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => simulatedFetch<void>(`${resource}/${id}`, {
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
  environments: {
    list: () => simulatedFetch<string[]>('environments'),
    create: (env: string) => simulatedFetch<string>('environments', {
      method: 'POST',
      body: JSON.stringify({ name: env })
    }),
    delete: (env: string) => simulatedFetch<void>(`environments/${env}`, {
      method: 'DELETE'
    })
  }
};

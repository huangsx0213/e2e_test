import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { TestRunner } from '../TestRunner';
import type { Project } from '@/shared/types';

vi.mock('@/shared/hooks/useQueryHooks', () => ({
  useReports: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
  useReportMutations: vi.fn(() => ({
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock('@/features/execution/TestPlanBuilder', () => ({
  TestPlanBuilder: () => React.createElement('div', null, 'TestPlanBuilder'),
}));

vi.mock('@/features/execution/ScenarioExecutionRunner', () => ({
  ScenarioExecutionRunner: () => React.createElement('div', null, 'ScenarioExecutionRunner'),
}));

vi.mock('@/features/execution/TestPlanExecutionRunner', () => ({
  TestPlanExecutionRunner: () => React.createElement('div', null, 'TestPlanExecutionRunner'),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Project One',
    pages: [],
    modules: [],
    scenarios: [
      {
        id: 'scenario-1',
        name: 'Scenario One',
        description: 'Old scenario description',
        variables: [{ id: 'var-1', key: 'OLD_KEY', value: 'Old Value' }],
        dataRows: [{ OLD_KEY: 'row-1' }],
        suites: [],
      },
    ],
    plans: [],
  };
}

afterEach(() => {
  cleanup();
});

describe('TestRunner', () => {
  it('keeps the scenario variable draft when the parent rerenders with old data', () => {
    const projectsApi = { update: vi.fn(), create: vi.fn(), remove: vi.fn() };
    const projects = [makeProject()];

    const { rerender } = render(
      React.createElement(Wrapper, null,
        React.createElement(TestRunner, {
          projects,
          projectsApi: projectsApi as any,
          suites: [],
          currentProjectId: 'proj-1',
          headers: [],
          bodies: [],
          endpoints: [],
          environments: ['dev'],
          initialEnvironment: 'dev',
        }),
      ),
    );

    fireEvent.click(screen.getByText('Scenario Builder'));
    fireEvent.click(screen.getByText('Scenario Data & Variables'));
    const input = screen.getByPlaceholderText('Variable Key');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'NEW_KEY' } });

    rerender(
      React.createElement(Wrapper, null,
        React.createElement(TestRunner, {
          projects,
          projectsApi: projectsApi as any,
          suites: [],
          currentProjectId: 'proj-1',
          headers: [],
          bodies: [],
          endpoints: [],
          environments: ['dev'],
          initialEnvironment: 'dev',
        }),
      ),
    );

    expect((screen.getByPlaceholderText('Variable Key') as HTMLInputElement).value).toBe('NEW_KEY');
  });
});

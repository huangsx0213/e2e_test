import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { ModuleBuilder } from '../ModuleBuilder';
import type { Project } from '@/shared/types';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Project One',
    pages: [],
    modules: [
      {
        id: 'mod-1',
        name: 'Login Module',
        description: 'Old module description',
        params: [],
        steps: [],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
});

describe('ModuleBuilder', () => {
  it('keeps the module description draft when the parent rerenders with old data', () => {
    const projectsApi = { update: vi.fn(), create: vi.fn(), remove: vi.fn() };
    const projects = [makeProject()];

    const { rerender } = render(
      React.createElement(Wrapper, null,
        React.createElement(ModuleBuilder, {
          projects,
          projectsApi: projectsApi as any,
          headers: [],
          bodies: [],
          endpoints: [],
          currentProjectId: 'proj-1',
        }),
      ),
    );

    fireEvent.click(screen.getByText('Login Module'));
    const input = screen.getByPlaceholderText('Add a description for this module...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Typed module description' } });

    rerender(
      React.createElement(Wrapper, null,
        React.createElement(ModuleBuilder, {
          projects,
          projectsApi: projectsApi as any,
          headers: [],
          bodies: [],
          endpoints: [],
          currentProjectId: 'proj-1',
        }),
      ),
    );

    expect((screen.getByPlaceholderText('Add a description for this module...') as HTMLInputElement).value).toBe('Typed module description');
  });
});

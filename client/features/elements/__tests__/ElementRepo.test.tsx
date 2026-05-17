import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { ElementRepo } from '../ElementRepo';
import type { Project } from '@/shared/types';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Project One',
    pages: [
      {
        id: 'page-1',
        name: 'Login Page',
        description: 'Old page description',
        elements: [
          {
            id: 'el-1',
            name: 'Username',
            selectorType: 'CSS',
            value: '#username',
            description: 'Old element description',
          },
        ],
      },
    ],
    modules: [],
  };
}

afterEach(() => {
  cleanup();
});

describe('ElementRepo', () => {
  it('keeps the page description draft when the parent rerenders with old data', () => {
    const projectsApi = { update: vi.fn(), create: vi.fn(), remove: vi.fn() };
    const projects = [makeProject()];

    const { rerender } = render(
      React.createElement(Wrapper, null,
        React.createElement(ElementRepo, {
          projects,
          projectsApi: projectsApi as any,
          currentProjectId: 'proj-1',
        }),
      ),
    );

    fireEvent.click(screen.getByText('Login Page'));
    const input = screen.getByPlaceholderText('Page Description (optional)');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Typed page description' } });

    rerender(
      React.createElement(Wrapper, null,
        React.createElement(ElementRepo, {
          projects,
          projectsApi: projectsApi as any,
          currentProjectId: 'proj-1',
        }),
      ),
    );

    expect((screen.getByPlaceholderText('Page Description (optional)') as HTMLInputElement).value).toBe('Typed page description');
  });
});

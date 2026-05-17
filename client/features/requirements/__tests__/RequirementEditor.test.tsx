import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../shared/hooks/useQueryHooks', () => ({
  useRequirements: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
  useRequirementMutations: vi.fn(() => ({
    create: vi.fn().mockResolvedValue({ id: 'new-id' }),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { RequirementEditor } from '../RequirementEditor';
import type { Requirement } from '../../../../shared/contracts/index';

function makeReq(overrides: Partial<Requirement> & { id: string; title: string }): Requirement {
  return {
    projectId: 'proj-1',
    parentId: null,
    description: 'Some description',
    level: 'story',
    priority: 'MEDIUM',
    status: 'DRAFT',
    tags: [],
    position: 0,
    metadata: {},
    ...overrides,
  } as Requirement;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const last = <T,>(arr: T[]) => arr[arr.length - 1];

describe('RequirementEditor', () => {
  const onSaved = vi.fn();

  it('shows placeholder when no item and no projectId', () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item: null, projectId: '', onSaved })
      )
    );
    expect(screen.getByText('Select a requirement to view details')).toBeInTheDocument();
  });

  it('shows title input and save button in create mode', () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item: null, projectId: 'proj-1', onSaved })
      )
    );
    expect(screen.getByPlaceholderText('Requirement title...')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('disables save button when title is empty', () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item: null, projectId: 'proj-1', onSaved })
      )
    );
    expect(last(screen.getAllByRole('button', { name: /create/i }))).toBeDisabled();
  });

  it('loads existing item data into form fields', () => {
    const item = makeReq({ id: 'Edit01', title: 'EditMeTitle', priority: 'HIGH' });
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item, projectId: 'proj-1', onSaved })
      )
    );
    const input = last(screen.getAllByPlaceholderText('Requirement title...')) as HTMLInputElement;
    expect(input.value).toBe('EditMeTitle');
  });

  it('shows Save changes button for existing item', () => {
    const item = makeReq({ id: 'Exist01', title: 'Existing Title' });
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item, projectId: 'proj-1', onSaved })
      )
    );
    expect(last(screen.getAllByText('Save'))).toBeInTheDocument();
  });

  it('shows item ID badge', () => {
    const item = makeReq({ id: 'Meta01', title: 'Meta Title' });
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item, projectId: 'proj-1', onSaved })
      )
    );
    expect(last(screen.getAllByText('Meta01'))).toBeInTheDocument();
  });

  it('renders select dropdowns for all form fields', () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item: null, projectId: 'proj-1', onSaved })
      )
    );
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(3);
  });
});
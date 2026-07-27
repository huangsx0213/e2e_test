import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { hooks } = vi.hoisted(() => ({
  hooks: {
    useRequirements: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
    useBusinessFlows: vi.fn(() => ({ data: [], isLoading: false })),
    create: vi.fn().mockResolvedValue({ id: 'new-id' }),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../shared/hooks/useQueryHooks', () => ({
  useRequirements: hooks.useRequirements,
  useBusinessFlows: hooks.useBusinessFlows,
  useRequirementMutations: vi.fn(() => ({
    create: hooks.create,
    update: hooks.update,
    remove: hooks.remove,
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

  beforeEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hooks.useRequirements.mockReset();
    hooks.useBusinessFlows.mockReset();
    hooks.create.mockReset();
    hooks.update.mockReset();
    hooks.remove.mockReset();

    hooks.useRequirements.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() });
    hooks.useBusinessFlows.mockReturnValue({ data: [], isLoading: false });
    hooks.create.mockResolvedValue({ id: 'new-id' });
    hooks.update.mockResolvedValue({});
    hooks.remove.mockResolvedValue(undefined);
  });

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

  it('saves selected requirement dependencies', async () => {
    hooks.useRequirements.mockReturnValue({
      data: [
        makeReq({ id: 'Epic1', title: 'Authentication', level: 'epic' }),
        makeReq({ id: 'Feature1', title: 'Email Login', level: 'story', parentId: 'Epic1' }),
        makeReq({ id: 'ReqA', title: 'Current', parentId: 'Feature1' }),
        makeReq({ id: 'ReqB', title: 'Auth prerequisite', parentId: 'Feature1' }),
        makeReq({ id: 'Ac1', title: 'Acceptance detail', level: 'ac' }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    const item = makeReq({ id: 'ReqA', title: 'Current', dependencies: ['ReqB'], parentId: 'Feature1' });

    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item, projectId: 'proj-1', onSaved })
      )
    );

    expect(hooks.useRequirements).toHaveBeenCalledWith('proj-1');
    expect(screen.getByText('Auth prerequisite')).toBeInTheDocument();
    expect(screen.getByText('Edit Dependencies')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Auth prerequisite' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit Dependencies'));

    expect(screen.getByRole('checkbox', { name: 'Auth prerequisite' })).toBeInTheDocument();
    expect(screen.getByText('Authentication > Email Login > Auth prerequisite')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Acceptance detail' })).not.toBeInTheDocument();
    fireEvent.click(last(screen.getAllByText('Save')));

    await waitFor(() => {
      expect(hooks.update).toHaveBeenCalledWith('ReqA', expect.objectContaining({
        dependencies: ['ReqB'],
      }));
    });
  });

  it('shows dependency candidates in requirement tree order inside a scrollable panel', () => {
    hooks.useRequirements.mockReturnValue({
      data: [
        makeReq({ id: 'Epic1', title: 'Authentication', level: 'epic', position: 0 }),
        makeReq({ id: 'Feature1', title: 'Email Login', level: 'story', parentId: 'Epic1', position: 0 }),
        makeReq({ id: 'Story2', title: 'Password reset', level: 'story', parentId: 'Feature1', position: 1 }),
        makeReq({ id: 'Story1', title: 'Sign in', level: 'story', parentId: 'Feature1', position: 0 }),
        makeReq({ id: 'Epic2', title: 'Checkout', level: 'epic', position: 1 }),
        makeReq({ id: 'Feature2', title: 'Payment', level: 'story', parentId: 'Epic2', position: 0 }),
        makeReq({ id: 'Story3', title: 'Pay order', level: 'story', parentId: 'Feature2', position: 0 }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, {
          item: makeReq({ id: 'StoryCurrent', title: 'Current story', parentId: 'Feature1' }),
          projectId: 'proj-1',
          onSaved,
        })
      )
    );

    fireEvent.click(screen.getByText('Edit Dependencies'));

    const checkboxLabels = screen.getAllByRole('checkbox').map((checkbox) => checkbox.getAttribute('aria-label'));
    expect(checkboxLabels).toEqual(['Sign in', 'Password reset', 'Pay order']);

    const list = screen.getByTestId('dependency-candidate-list');
    expect(list.className).toContain('max-h-80');
    expect(list.className).toContain('overflow-y-auto');
  });

  it('hides dependencies for non-story requirements', () => {
    hooks.useRequirements.mockReturnValue({
      data: [
        makeReq({ id: 'Feature1', title: 'Feature A', level: 'epic' }),
        makeReq({ id: 'Story1', title: 'Story A', level: 'story' }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, {
          item: makeReq({ id: 'Feature1', title: 'Feature A', level: 'epic' }),
          projectId: 'proj-1',
          onSaved,
        })
      )
    );

    expect(screen.queryByText('Dependencies')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Story A' })).not.toBeInTheDocument();
  });

  it('shows business flows that reference the current requirement', () => {
    hooks.useRequirements.mockReturnValue({
      data: [makeReq({ id: 'ReqFlow', title: 'Sign in' })],
      isLoading: false,
      refetch: vi.fn(),
    });
    hooks.useBusinessFlows.mockReturnValue({
      data: [
        {
          id: 'flow-1',
          projectId: 'proj-1',
          name: 'Checkout flow',
          description: '',
          type: 'happy-path',
          status: 'APPROVED',
          steps: [{ sequence: 1, requirementIds: ['ReqFlow'], actionSummary: 'User signs in' }],
        },
      ],
      isLoading: false,
    });

    const item = makeReq({ id: 'ReqFlow', title: 'Sign in' });

    render(
      React.createElement(Wrapper, null,
        React.createElement(RequirementEditor, { item, projectId: 'proj-1', onSaved })
      )
    );

    expect(hooks.useBusinessFlows).toHaveBeenCalledWith('proj-1');
    expect(hooks.useBusinessFlows.mock.results.at(-1)?.value.data).toHaveLength(1);

    expect(screen.getByText('Used In Business Flows')).toBeInTheDocument();
    expect(screen.getByText(/Checkout flow/)).toBeInTheDocument();
  });
});

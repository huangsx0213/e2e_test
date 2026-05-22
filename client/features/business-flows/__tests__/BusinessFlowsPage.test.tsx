import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/shared/services/api', () => ({
  api: {
    requirements: {
      list: vi.fn(),
      listByProject: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    businessFlows: {
      list: vi.fn(),
      listByProject: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      approve: vi.fn(),
      unapprove: vi.fn(),
    },
  },
}));

import { api } from '@/shared/services/api';
import { BusinessFlowsPage } from '../BusinessFlowsPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(
    <Wrapper>
      <BusinessFlowsPage currentProjectId="proj-1" />
    </Wrapper>,
  );
}

describe('BusinessFlowsPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(api.requirements.listByProject).mockReset();
    vi.mocked(api.businessFlows.listByProject).mockReset();
    vi.mocked(api.businessFlows.approve).mockReset();
    vi.mocked(api.businessFlows.delete).mockReset();
  });

  it('renders business flows for the current project', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      {
        id: 'epic-1',
        projectId: 'proj-1',
        title: 'Authentication',
        description: '',
        dependencies: [],
        level: 'epic',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: null,
        metadata: {},
      },
      {
        id: 'feature-1',
        projectId: 'proj-1',
        title: 'Email Login',
        description: '',
        dependencies: [],
        level: 'feature',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: 'epic-1',
        metadata: {},
      },
      {
        id: 'story-1',
        projectId: 'proj-1',
        title: 'Sign in',
        description: '',
        dependencies: [],
        level: 'story',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: 'feature-1',
        metadata: {},
      },
    ] as any);
    vi.mocked(api.businessFlows.listByProject).mockResolvedValue([
      {
        id: 'flow-1',
        projectId: 'proj-1',
        name: 'Checkout flow',
        description: '',
        type: 'happy-path',
        status: 'DRAFT',
        steps: [{ sequence: 1, requirementIds: ['story-1'], actionSummary: 'User signs in' }],
      },
    ] as any);

    renderPage();

    fireEvent.click(await screen.findByText('Checkout flow'));

    expect(await screen.findByDisplayValue('Checkout flow')).toBeInTheDocument();
    expect(screen.queryAllByTitle('Delete Business Flow')).toHaveLength(1);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Action Summary')).toBeInTheDocument();
    expect(screen.getByDisplayValue('User signs in')).toBeInTheDocument();
    expect(screen.getByText('Linked Requirement · Sign in')).toBeInTheDocument();
    expect(screen.getByTestId('linked-requirement-toggle-0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Linked Requirement · Sign in'));
    expect(screen.getByText('Linked Requirements')).toBeInTheDocument();
    expect(screen.getByText('Link Requirements')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Link Requirements'));
    expect(screen.getByRole('checkbox', { name: 'Select requirement Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Authentication > Email Login > Sign in')).toBeInTheDocument();
    expect(screen.getByText('Acceptance Criteria Reference')).toBeInTheDocument();

    const stepHeader = screen.getByTestId('business-flow-step-header-0');
    expect(within(stepHeader).getByTitle('Move Step Up')).toBeInTheDocument();
    expect(within(stepHeader).getByTitle('Move Step Down')).toBeInTheDocument();
    expect(within(stepHeader).getByTitle('Delete Step')).toBeInTheDocument();
  });

  it('blocks approval when a step references a missing requirement', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([] as any);
    vi.mocked(api.businessFlows.listByProject).mockResolvedValue([
      {
        id: 'flow-1',
        projectId: 'proj-1',
        name: 'Broken flow',
        description: '',
        type: 'happy-path',
        status: 'DRAFT',
        steps: [{ sequence: 1, requirementIds: ['missing-story'], actionSummary: 'Ghost step' }],
      },
    ] as any);

    renderPage();

    fireEvent.click(await screen.findByText('Approve'));

    expect(vi.mocked(api.businessFlows.approve)).not.toHaveBeenCalled();
    expect(await screen.findByText('Fix invalid or empty steps before approving this flow.')).toBeInTheDocument();
  });

  it('adds a new step without a default linked requirement selection', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      {
        id: 'epic-1',
        projectId: 'proj-1',
        title: 'Authentication',
        description: '',
        dependencies: [],
        level: 'epic',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: null,
        metadata: {},
      },
      {
        id: 'feature-1',
        projectId: 'proj-1',
        title: 'Email Login',
        description: '',
        dependencies: [],
        level: 'feature',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: 'epic-1',
        metadata: {},
      },
      {
        id: 'story-1',
        projectId: 'proj-1',
        title: 'Sign in',
        description: '',
        dependencies: [],
        level: 'story',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: 'feature-1',
        metadata: {},
      },
    ] as any);
    vi.mocked(api.businessFlows.listByProject).mockResolvedValue([
      {
        id: 'flow-1',
        projectId: 'proj-1',
        name: 'Draft flow',
        description: '',
        type: 'happy-path',
        status: 'DRAFT',
        steps: [],
      },
    ] as any);

    renderPage();

    fireEvent.click(await screen.findByText('Draft flow'));
    fireEvent.click(screen.getByText('Add Step'));

    expect(await screen.findByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Linked Requirements')).toBeInTheDocument();
    expect(screen.getByText('No linked requirements')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Link Requirements'));
    expect(screen.getByRole('checkbox', { name: 'Select requirement Sign in' })).not.toBeChecked();
    expect(screen.getByText('Missing requirement reference')).toBeInTheDocument();
  });

  it('deletes the selected business flow', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([] as any);
    vi.mocked(api.businessFlows.listByProject).mockResolvedValue([
      {
        id: 'flow-1',
        projectId: 'proj-1',
        name: 'Disposable flow',
        description: '',
        type: 'happy-path',
        status: 'DRAFT',
        steps: [],
      },
    ] as any);
    vi.mocked(api.businessFlows.delete).mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByText('Disposable flow'));
    fireEvent.click(await screen.findByTitle('Delete Business Flow'));

    expect(await screen.findByText('Delete Business Flow')).toBeInTheDocument();
    expect(vi.mocked(api.businessFlows.delete)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(vi.mocked(api.businessFlows.delete)).toHaveBeenCalledWith('flow-1');
    });

    await waitFor(() => {
      expect(screen.queryByText('Disposable flow')).not.toBeInTheDocument();
    });
    expect(screen.getByText('No business flows yet')).toBeInTheDocument();
    expect(screen.getByText('Select a business flow to view details')).toBeInTheDocument();
  });

  it('shows inline save success feedback', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      {
        id: 'story-1',
        projectId: 'proj-1',
        title: 'Sign in',
        description: '',
        dependencies: [],
        level: 'story',
        priority: 'MEDIUM',
        status: 'DRAFT',
        tags: [],
        position: 0,
        parentId: null,
        metadata: {},
      },
    ] as any);
    vi.mocked(api.businessFlows.listByProject).mockResolvedValue([
      {
        id: 'flow-1',
        projectId: 'proj-1',
        name: 'Checkout flow',
        description: '',
        type: 'happy-path',
        status: 'DRAFT',
        steps: [{ sequence: 1, requirementIds: ['story-1'], actionSummary: 'User signs in' }],
      },
    ] as any);
    vi.mocked(api.businessFlows.update).mockResolvedValue({
      id: 'flow-1',
      projectId: 'proj-1',
      name: 'Checkout flow',
      description: '',
      type: 'happy-path',
      status: 'DRAFT',
      steps: [{ sequence: 1, requirementIds: ['story-1'], actionSummary: 'User signs in' }],
    } as any);

    renderPage();

    fireEvent.click(await screen.findByText('Checkout flow'));
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
  });

  it('shows an error message when delete fails', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([] as any);
    vi.mocked(api.businessFlows.listByProject).mockResolvedValue([
      {
        id: 'flow-1',
        projectId: 'proj-1',
        name: 'Temp flow',
        description: '',
        type: 'happy-path',
        status: 'DRAFT',
        steps: [],
      },
    ] as any);
    vi.mocked(api.businessFlows.delete).mockRejectedValue(new Error('Server error'));

    renderPage();

    fireEvent.click(await screen.findByText('Temp flow'));
    fireEvent.click(screen.getByTitle('Delete Business Flow'));
    expect(await screen.findByText('Delete Business Flow')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Failed to delete business flow.')).toBeInTheDocument();
    expect(api.businessFlows.delete).toHaveBeenCalledWith('flow-1');
  });
});

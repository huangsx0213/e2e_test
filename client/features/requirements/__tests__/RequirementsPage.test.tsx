import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { api } from '@/shared/services/api';

vi.mock('@/shared/services/api', () => ({
  api: {
    requirements: {
      list: vi.fn(),
      listByProject: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { RequirementsPage } from '../RequirementsPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function renderPage(props: { currentProjectId?: string } = {}) {
  return render(
    React.createElement(Wrapper, null,
      React.createElement(RequirementsPage, props)
    )
  );
}

describe('RequirementsPage', () => {
  beforeEach(() => {
    vi.mocked(api.requirements.listByProject).mockReset();
  });

  it('shows loading state', () => {
    vi.mocked(api.requirements.listByProject).mockReturnValue(new Promise(() => {}));
    renderPage({ currentProjectId: 'proj-1' });
    expect(screen.getByText('Loading requirements...')).toBeInTheDocument();
  });

  it('shows empty state when no requirements', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([]);
    renderPage({ currentProjectId: 'proj-1' });
    expect(await screen.findByText('No requirements found')).toBeInTheDocument();
  });

  it('shows empty state when nothing selected but project set', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'Req', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    await screen.findByText('Req');
    expect(screen.getByText('Select a story or epic to view details')).toBeInTheDocument();
  });

  it('renders requirements in the tree', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'Login', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
      { id: 'r2', projectId: 'proj-1', title: 'Payment', description: '', level: 'story', status: 'DRAFT', position: 1, parentId: null },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
  });

  it('shows total count', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'One', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    expect(await screen.findByText('1 stories · 0 epics')).toBeInTheDocument();
  });

  it('shows editor form when requirement selected', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'rS', projectId: 'proj-1', title: 'Selected Req', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    fireEvent.click(await screen.findByText('Selected Req'));
    expect(await screen.findByText('Save')).toBeInTheDocument();
  });

  it('opens import modal when import clicked', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'Req', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    await screen.findByText('Req');
    const importBtns = screen.getAllByTitle('Import Requirements');
    fireEvent.click(importBtns[importBtns.length - 1]);
    expect(await screen.findByText('Import Requirements')).toBeInTheDocument();
  });

  it('does not render add child button on tree rows (moved to right panel)', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'p1', projectId: 'proj-1', title: 'Parent', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    await screen.findByText('Parent');
    expect(document.querySelector('button[title="Add Child Requirement"]')).toBeNull();
  });

  describe('right pane routing', () => {
    it('renders StoryDetailView when story selected', async () => {
      vi.mocked(api.requirements.listByProject).mockResolvedValue([
        { id: 's1', projectId: 'proj-1', title: 'Login Story', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
      ] as any);
      renderPage({ currentProjectId: 'proj-1' });
      fireEvent.click(await screen.findByText('Login Story'));
      // StoryDetailView renders ACList which shows "Acceptance Criteria" header
      expect(await screen.findByText(/Acceptance Criteria/i)).toBeInTheDocument();
    });

    it('renders EpicDetailView when epic selected', async () => {
      vi.mocked(api.requirements.listByProject).mockResolvedValue([
        { id: 'e1', projectId: 'proj-1', title: 'Auth Epic', description: '', level: 'epic', status: 'DRAFT', position: 0, parentId: null },
      ] as any);
      renderPage({ currentProjectId: 'proj-1' });
      fireEvent.click(await screen.findByText('Auth Epic'));
      // EpicDetailView should NOT render the "Acceptance Criteria" section (that's Story-only)
      // But it should render a "Save" button (both views have it)
      expect(await screen.findByRole('button', { name: /Save/i })).toBeInTheDocument();
      expect(screen.queryByText(/Acceptance Criteria/i)).not.toBeInTheDocument();
    });

    it('renders empty state when nothing selected', async () => {
      vi.mocked(api.requirements.listByProject).mockResolvedValue([
        { id: 'r1', projectId: 'proj-1', title: 'Some Req', description: '', level: 'story', status: 'DRAFT', position: 0, parentId: null },
      ] as any);
      renderPage({ currentProjectId: 'proj-1' });
      await screen.findByText('Some Req');
      expect(screen.getByText('Select a story or epic to view details')).toBeInTheDocument();
    });
  });
});
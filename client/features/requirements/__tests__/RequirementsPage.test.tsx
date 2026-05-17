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

  it('shows editor create form when nothing selected but project set', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'Req', description: '', level: 'story', priority: 'MEDIUM', tags: [], status: 'DRAFT', position: 0, parentId: null, metadata: {} },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    await screen.findByText('Req');
    const createBtns = screen.getAllByText('Create');
    expect(createBtns[createBtns.length - 1]).toBeInTheDocument();
  });

  it('renders requirements in the tree', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'Login', description: '', level: 'story', priority: 'MEDIUM', tags: [], status: 'DRAFT', position: 0, parentId: null, metadata: {} },
      { id: 'r2', projectId: 'proj-1', title: 'Payment', description: '', level: 'story', priority: 'HIGH', tags: [], status: 'DRAFT', position: 1, parentId: null, metadata: {} },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
  });

  it('shows total count', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'One', description: '', level: 'story', priority: 'MEDIUM', tags: [], status: 'DRAFT', position: 0, parentId: null, metadata: {} },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    expect(await screen.findByText('1 requirement total')).toBeInTheDocument();
  });

  it('shows editor form when requirement selected', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'rS', projectId: 'proj-1', title: 'Selected Req', description: '', level: 'story', priority: 'MEDIUM', tags: [], status: 'DRAFT', position: 0, parentId: null, metadata: {} },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    fireEvent.click(await screen.findByText('Selected Req'));
    expect(await screen.findByText('Save')).toBeInTheDocument();
  });

  it('opens import modal when import clicked', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'r1', projectId: 'proj-1', title: 'Req', description: '', level: 'story', priority: 'MEDIUM', tags: [], status: 'DRAFT', position: 0, parentId: null, metadata: {} },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    await screen.findByText('Req');
    const importBtns = screen.getAllByTitle('Import Requirements');
    fireEvent.click(importBtns[importBtns.length - 1]);
    expect(await screen.findByText('Import Requirements')).toBeInTheDocument();
  });

  it('shows create form when add child button clicked', async () => {
    vi.mocked(api.requirements.listByProject).mockResolvedValue([
      { id: 'p1', projectId: 'proj-1', title: 'Parent', description: '', level: 'story', priority: 'MEDIUM', tags: [], status: 'DRAFT', position: 0, parentId: null, metadata: {} },
    ] as any);
    renderPage({ currentProjectId: 'proj-1' });
    await screen.findByText('Parent');
    const addChildBtns = document.querySelectorAll('button[title="Add Child Requirement"]');
    expect(addChildBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(addChildBtns[addChildBtns.length - 1]);
    const createBtns = screen.getAllByText('Create');
    expect(createBtns[createBtns.length - 1]).toBeInTheDocument();
  });
});
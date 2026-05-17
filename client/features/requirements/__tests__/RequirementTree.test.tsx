import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RequirementTree } from '../RequirementTree';
import type { Requirement } from '../../../../shared/contracts/index';

function makeReq(overrides: Partial<Requirement> & { id: string; title: string }): Requirement {
  return {
    projectId: 'proj-1',
    parentId: null,
    description: '',
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

describe('RequirementTree', () => {
  const onSelect = vi.fn();
  const onAddChild = vi.fn();
  const onRefresh = vi.fn();

  beforeEach(() => {
    onSelect.mockReset();
    onAddChild.mockReset();
    onRefresh.mockReset();
  });

  describe('rendering', () => {
    it('renders a list of root requirements', () => {
      const items = [
        makeReq({ id: 'T1', title: 'Alpha Feature' }),
        makeReq({ id: 'T2', title: 'Beta Flow' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      expect(screen.getByText('Alpha Feature')).toBeInTheDocument();
      expect(screen.getByText('Beta Flow')).toBeInTheDocument();
    });

    it('renders empty when no items match parent filter', () => {
      const items = [
        makeReq({ id: 'T5', title: 'Hidden Root', parentId: 'nonexistent' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1', parentId: 'filter-id' })
        )
      );
      expect(screen.queryByText('Hidden Root')).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('highlights the selected requirement', () => {
      const items = [makeReq({ id: 'T3', title: 'Selected Feature' })];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: 'T3', onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      const row = screen.getByText('Selected Feature').closest('[class*="group flex"]');
      expect(row?.className).toMatch(/bg-blue-100/);
    });

    it('calls onSelect when a requirement is clicked', () => {
      const items = [makeReq({ id: 'T4', title: 'Clickable Feature' })];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      fireEvent.click(screen.getByText('Clickable Feature'));
      expect(onSelect).toHaveBeenCalledWith('T4');
    });

    it('calls onAddChild when add child button is clicked', () => {
      const items = [makeReq({ id: 'T6', title: 'Parent Req' })];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      const addBtns = document.querySelectorAll('button[title="Add Child Requirement"]');
      fireEvent.click(addBtns[addBtns.length - 1]);
      expect(onAddChild).toHaveBeenCalledWith('T6');
    });
  });

  describe('hierarchy', () => {
    it('shows nested children when parent is expanded', () => {
      const items = [
        makeReq({ id: 'H1', title: 'Auth Module' }),
        makeReq({ id: 'H2', title: 'Login Page', parentId: 'H1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      expect(chevrons.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(chevrons[chevrons.length - 1]);
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    it('shows child count badge next to level', () => {
      const items = [
        makeReq({ id: 'H3', title: 'Checkout' }),
        makeReq({ id: 'H4', title: 'Cart', parentId: 'H3' }),
        makeReq({ id: 'H5', title: 'Payment', parentId: 'H3' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      const countSpans = document.querySelectorAll('span.text-slate-400.text-\\[10px\\]');
      const countSpan = Array.from(countSpans).find(s => s.textContent === '2');
      expect(countSpan).not.toBeUndefined();
    });
  });

  describe('status badges', () => {
    it('displays status badge for non-DRAFT requirements', () => {
      const items = [
        makeReq({ id: 'S1', title: 'Approved Story', status: 'APPROVED' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      const dot = document.querySelector('[title="APPROVED"]');
      expect(dot).toBeInTheDocument();
    });

    it('does not show status badge for DRAFT requirements', () => {
      const items = [
        makeReq({ id: 'S2', title: 'Draft Story', status: 'DRAFT' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      expect(screen.queryByText('DRAFT')).not.toBeInTheDocument();
    });
  });
});
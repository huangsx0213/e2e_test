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

    it('renders human_id next to title', () => {
      const items = [
        makeReq({ id: 'T1', title: 'Alpha Feature', humanId: 'AUTH-001' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      expect(screen.getByText('AUTH-001')).toBeInTheDocument();
    });

    it('does not render level letter labels', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      expect(screen.queryByText('E')).not.toBeInTheDocument();
      expect(screen.queryByText('S')).not.toBeInTheDocument();
    });

    it('does not render child count badge separate from progress chip', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      // Only progress chip "0/1" should appear, not a standalone "1" count badge
      const standaloneCount = Array.from(document.querySelectorAll('span')).find(s => s.textContent === '1' && !s.className.includes('font-mono'));
      expect(standaloneCount).toBeUndefined();
    });
  });

  describe('selection', () => {
    it('highlights the selected requirement with bordered blue background', () => {
      const items = [makeReq({ id: 'T3', title: 'Selected Feature' })];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: 'T3', onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      const row = screen.getByText('Selected Feature').closest('[class*="group flex"]');
      expect(row?.className).toMatch(/bg-blue-50/);
      expect(row?.className).toMatch(/border-blue-200/);
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

    it('renders child connector border on nested items', () => {
      const items = [
        makeReq({ id: 'H1', title: 'Auth Module' }),
        makeReq({ id: 'H2', title: 'Login Page', parentId: 'H1' }),
      ];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onAddChild, onRefresh, projectId: 'proj-1' })
        )
      );
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      fireEvent.click(chevrons[chevrons.length - 1]);
      const connector = container.querySelector('.border-l.border-slate-200');
      expect(connector).toBeInTheDocument();
    });
  });

  describe('progress chips', () => {
    it('renders progress chip {approved}/{total} on story with ACs', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
        makeReq({ id: 'AC1', title: 'AC1', level: 'ac', parentId: 'S1' }),
        makeReq({ id: 'AC2', title: 'AC2', level: 'ac', parentId: 'S1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, {
            items,
            selectedId: null,
            onSelect,
            onAddChild,
            onRefresh,
            projectId: 'proj-1',
          })
        )
      );
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      fireEvent.click(chevrons[chevrons.length - 1]);
      expect(screen.getByText('0/2')).toBeInTheDocument();
    });

    it('renders emerald progress chip when all ACs are approved', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
        makeReq({ id: 'AC1', title: 'AC1', level: 'ac', parentId: 'S1', status: 'APPROVED' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, {
            items,
            selectedId: null,
            onSelect,
            onAddChild,
            onRefresh,
            projectId: 'proj-1',
          })
        )
      );
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      fireEvent.click(chevrons[chevrons.length - 1]);
      const chip = screen.getByText('1/1');
      expect(chip).toBeInTheDocument();
      expect(chip.className).toMatch(/bg-emerald-50/);
      expect(chip.className).toMatch(/text-emerald-700/);
    });

    it('renders progress chip on epic with approved/total stories', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story 1', level: 'story', parentId: 'E1', status: 'APPROVED' }),
        makeReq({ id: 'S2', title: 'Story 2', level: 'story', parentId: 'E1', status: 'DRAFT' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, {
            items,
            selectedId: null,
            onSelect,
            onAddChild,
            onRefresh,
            projectId: 'proj-1',
          })
        )
      );
      expect(screen.getByText('1/2')).toBeInTheDocument();
    });

    it('hides AC level rows from tree', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
        makeReq({ id: 'AC1', title: 'Hidden AC', level: 'ac', parentId: 'S1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, {
            items,
            selectedId: null,
            onSelect,
            onAddChild,
            onRefresh,
            projectId: 'proj-1',
          })
        )
      );
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      fireEvent.click(chevrons[chevrons.length - 1]);
      expect(screen.queryByText('Hidden AC')).not.toBeInTheDocument();
    });
  });
});

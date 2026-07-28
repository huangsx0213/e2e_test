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
    status: 'DRAFT',
    position: 0,
    ...overrides,
  } as Requirement;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('RequirementTree', () => {
  const onSelect = vi.fn();
  const onReorder = vi.fn();
  const onRefresh = vi.fn();
  const onToggleExpand = vi.fn();
  const defaultExpandedIds = new Set<string>();

  beforeEach(() => {
    onSelect.mockReset();
    onReorder.mockReset();
    onRefresh.mockReset();
    onToggleExpand.mockReset();
  });

  describe('rendering', () => {
    it('renders a list of root requirements', () => {
      const items = [
        makeReq({ id: 'T1', title: 'Alpha Feature' }),
        makeReq({ id: 'T2', title: 'Beta Flow' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
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
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', parentId: 'filter-id', expandedIds: defaultExpandedIds, onToggleExpand })
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
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
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
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      expect(screen.queryByText('E')).not.toBeInTheDocument();
      expect(screen.queryByText('S')).not.toBeInTheDocument();
    });

    it('does not render progress chips (moved to right panel)', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
        makeReq({ id: 'AC1', title: 'AC1', level: 'ac', parentId: 'S1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      // No 0/1 or 0/N chips should appear in the tree rows
      expect(screen.queryByText('0/1')).not.toBeInTheDocument();
      expect(screen.queryByText('0/0')).not.toBeInTheDocument();
    });

    it('does not render up/down/add-child buttons on rows', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      expect(document.querySelector('button[title="Move Up"]')).toBeNull();
      expect(document.querySelector('button[title="Move Down"]')).toBeNull();
      expect(document.querySelector('button[title="Add Child Requirement"]')).toBeNull();
    });
  });

  describe('selection', () => {
    it('highlights the selected requirement with bordered blue background', () => {
      const items = [makeReq({ id: 'T3', title: 'Selected Feature' })];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: 'T3', onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
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
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      fireEvent.click(screen.getByText('Clickable Feature'));
      expect(onSelect).toHaveBeenCalledWith('T4');
    });
  });

  describe('hierarchy', () => {
    it('shows nested children when epic is expanded', () => {
      const items = [
        makeReq({ id: 'H1', title: 'Auth Module', level: 'epic' }),
        makeReq({ id: 'H2', title: 'Login Page', parentId: 'H1', level: 'story' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: new Set(['H1']), onToggleExpand })
        )
      );
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    it('renders child connector border on nested items', () => {
      const items = [
        makeReq({ id: 'H1', title: 'Auth Module', level: 'epic' }),
        makeReq({ id: 'H2', title: 'Login Page', parentId: 'H1', level: 'story' }),
      ];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: new Set(['H1']), onToggleExpand })
        )
      );
      const connector = container.querySelector('.border-l.border-slate-200');
      expect(connector).toBeInTheDocument();
    });
  });

  describe('level dot', () => {
    it('renders epic dot in purple and story dot in emerald', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic A', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story A', level: 'story', parentId: 'E1' }),
      ];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: new Set(['E1']), onToggleExpand })
        )
      );
      const purple = container.querySelector('.bg-purple-500');
      const emerald = container.querySelector('.bg-emerald-500');
      expect(purple).toBeInTheDocument();
      expect(emerald).toBeInTheDocument();
    });

    it('does not change dot color with priority (fixed per level)', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
      ];
      const { container } = render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      // No red (CRITICAL) or gray (LOW) priority dots should be used
      expect(container.querySelector('.bg-red-500')).toBeNull();
      expect(container.querySelector('.bg-gray-400')).toBeNull();
    });
  });

  describe('expand icon', () => {
    it('shows expand icon only on epic rows, not on story rows', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Auth Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Login Story', level: 'story', parentId: 'E1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      // Expand the epic first
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      fireEvent.click(chevrons[chevrons.length - 1]);
      // Only one Expand button should remain (story has none)
      const expandBtns = document.querySelectorAll('button[aria-label="Expand"], button[aria-label="Collapse"]');
      expect(expandBtns.length).toBe(1);
    });
  });

  describe('drag and drop', () => {
    function createDataTransfer() {
      const store: Record<string, string> = {};
      return {
        effectAllowed: '',
        dropEffect: '',
        setData: (type: string, value: string) => {
          store[type] = value;
        },
        getData: (type: string) => store[type] ?? '',
        clearData: () => {
          Object.keys(store).forEach((k) => delete store[k]);
        },
        _data: store,
      } as unknown as DataTransfer;
    }

    it('rows are draggable', () => {
      const items = [
        makeReq({ id: 'D1', title: 'First' }),
        makeReq({ id: 'D2', title: 'Second' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      const firstRow = screen.getByText('First').closest('[data-testid="tree-row"]');
      expect(firstRow).toHaveAttribute('draggable', 'true');
    });

    it('drop on a target row triggers onReorder with parentId/fromId/toId', () => {
      const items = [
        makeReq({ id: 'D1', title: 'First', position: 0 }),
        makeReq({ id: 'D2', title: 'Second', position: 1 }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand, onReorder })
        )
      );
      const firstRow = screen.getByText('First').closest('[data-testid="tree-row"]')!;
      const secondRow = screen.getByText('Second').closest('[data-testid="tree-row"]')!;
      const dt = createDataTransfer();
      fireEvent.dragStart(firstRow, { dataTransfer: dt });
      fireEvent.dragOver(secondRow, { dataTransfer: dt });
      fireEvent.drop(secondRow, { dataTransfer: dt });
      expect(onReorder).toHaveBeenCalledWith(null, 'D1', 'D2');
    });
  });

  describe('hiding AC level', () => {
    it('hides AC level rows from tree', () => {
      const items = [
        makeReq({ id: 'E1', title: 'Epic', level: 'epic' }),
        makeReq({ id: 'S1', title: 'Story', level: 'story', parentId: 'E1' }),
        makeReq({ id: 'AC1', title: 'Hidden AC', level: 'ac', parentId: 'S1' }),
      ];
      render(
        React.createElement(Wrapper, null,
          React.createElement(RequirementTree, { items, selectedId: null, onSelect, onRefresh, projectId: 'proj-1', expandedIds: defaultExpandedIds, onToggleExpand })
        )
      );
      const chevrons = document.querySelectorAll('button svg.lucide-chevron-right');
      fireEvent.click(chevrons[chevrons.length - 1]);
      expect(screen.queryByText('Hidden AC')).not.toBeInTheDocument();
    });
  });
});

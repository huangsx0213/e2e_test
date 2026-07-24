import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TestGenConfigPanel, type TestGenStartConfig } from '../TestGenConfigPanel';
import type { Requirement, BusinessFlow } from '../../../../shared/contracts/index';

vi.mock('@/shared/ui/HelpTooltip', () => ({
  HelpTooltip: ({ content }: { content: string }) => React.createElement('span', { 'data-testid': 'help-tooltip' }, content),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

import { useProviderConfigs } from '@/shared/hooks/useQueryHooks';

vi.mock('@/shared/hooks/useQueryHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/hooks/useQueryHooks')>();
  return {
    ...actual,
    useProviderConfigs: vi.fn().mockReturnValue({
      data: [
        { id: 'p1', name: 'Azure OpenAI', type: 'azure-openai', model: 'gpt-4o', isActive: true },
        { id: 'p2', name: 'OpenAI Compatible', type: 'openai-compatible', model: 'gpt-4', isActive: false },
      ],
    }),
  };
});

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: `req-${Math.random().toString(36).slice(2, 8)}`,
    projectId: 'proj-1',
    parentId: null,
    title: 'Test Requirement',
    description: 'A test requirement',
    level: 'story',
    priority: 'MEDIUM',
    status: 'DRAFT',
    tags: [],
    position: 0,
    metadata: {},
    ...overrides,
  };
}

function makeBusinessFlow(overrides: Partial<BusinessFlow> = {}): BusinessFlow {
  return {
    id: `flow-${Math.random().toString(36).slice(2, 8)}`,
    projectId: 'proj-1',
    name: 'Test Flow',
    description: 'A test flow',
    type: 'happy-path',
    status: 'APPROVED',
    steps: [],
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client: queryClient }, ui));
}

function buildTreeSample(): Requirement[] {
  const epic = makeRequirement({ id: 'epic-1', title: 'User Management', level: 'epic' as const, parentId: null });
  const feature = makeRequirement({ id: 'feat-1', title: 'User Registration', level: 'feature' as const, parentId: epic.id });
  const story1 = makeRequirement({ id: 'story-1', title: 'Email Registration', level: 'story' as const, parentId: feature.id });
  const story2 = makeRequirement({ id: 'story-2', title: 'Phone Registration', level: 'story' as const, parentId: feature.id });
  return [epic, feature, story1, story2];
}

describe('TestGenConfigPanel', () => {
  afterEach(cleanup);

  const defaultProps = {
    projectId: 'proj-1',
    requirements: [],
    businessFlows: [],
    onStart: vi.fn() as (config: TestGenStartConfig) => void,
    disabled: false,
  };

  it('TC-1.1: renders requirement tree with expand/collapse', () => {
    const reqs = buildTreeSample();
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, requirements: reqs }));
    expect(screen.getByText('User Management')).toBeTruthy();
    expect(screen.getByText('Requirements')).toBeTruthy();
  });

  it('TC-1.3: Select all checkbox selects/deselects all requirements', () => {
    const reqs = buildTreeSample();
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, requirements: reqs }));

    const checkbox = screen.getAllByLabelText('Select all')[0];
    fireEvent.click(checkbox);
    expect(screen.getByText('4')).toBeTruthy();

    fireEvent.click(checkbox);
    expect(screen.queryByText('4')).toBeNull();
  });

  it('TC-1.4: Business Flow only shows approved by default', () => {
    const flows = [
      makeBusinessFlow({ id: 'f1', name: 'Approved Flow', status: 'APPROVED' }),
      makeBusinessFlow({ id: 'f2', name: 'Draft Flow', status: 'DRAFT' }),
    ];
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, businessFlows: flows }));
    expect(screen.getByText('Approved Flow')).toBeTruthy();
    expect(screen.queryByText('Draft Flow')).toBeNull();
  });

  it('TC-1.5: toggle show approved only shows all flows', () => {
    const flows = [
      makeBusinessFlow({ id: 'f1', name: 'Approved Flow', status: 'APPROVED' }),
      makeBusinessFlow({ id: 'f2', name: 'Draft Flow', status: 'DRAFT' }),
    ];
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, businessFlows: flows }));

    const checkbox = screen.getByLabelText('Show approved flows only');
    fireEvent.click(checkbox);
    expect(screen.getByText('Draft Flow')).toBeTruthy();
  });

  it('TC-1.6: mode toggle switches Auto/Interactive', () => {
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getByText('Interactive')).toBeTruthy();
    fireEvent.click(screen.getByText('Interactive'));
    expect(screen.getByText('Pause at each checkpoint for review')).toBeTruthy();
    fireEvent.click(screen.getByText('Auto'));
    expect(screen.getByText('Automatically complete all stages')).toBeTruthy();
  });

  it('TC-1.7: AI Provider dropdown shows configs', () => {
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();
    const options = screen.getAllByRole('option');
    const providerOption = options.find(o => o.textContent?.includes('Azure OpenAI'));
    expect(providerOption).toBeTruthy();
  });

  it('TC-1.8: Start button disabled when no requirements/flows selected', () => {
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    const startBtn = screen.getByText('Start Test Gen');
    expect(startBtn.closest('button')).toBeDisabled();
  });

  it('TC-1.9: Start button enabled when requirements and provider selected', () => {
    const reqs = buildTreeSample();
    const onStart = vi.fn();
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, requirements: reqs, onStart }));
    fireEvent.click(screen.getAllByLabelText('Select all')[0]);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Azure OpenAI' } });
    const startBtn = screen.getByText('Start Test Gen');
    expect(startBtn.closest('button')).not.toBeDisabled();
    fireEvent.click(startBtn);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('TC-1.10: Test Gen name input works', () => {
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    const nameInput = screen.getByPlaceholderText('e.g. User Management Test');
    fireEvent.change(nameInput, { target: { value: 'My Test Gen' } });
    expect((nameInput as HTMLInputElement).value).toBe('My Test Gen');
  });

  it('TC-8.2: shows warning when no providers configured', () => {
    vi.mocked(useProviderConfigs).mockReturnValueOnce({ data: [] } as any);
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    expect(screen.getByText(/No providers configured/)).toBeTruthy();
  });
});

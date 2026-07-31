import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TestGenConfigPanel, type TestGenStartConfig } from '../TestGenConfigPanel';
import type { Requirement } from '../../../../shared/contracts/index';

vi.mock('@/shared/ui/HelpTooltip', () => ({
  HelpTooltip: ({ content }: { content: string }) => React.createElement('span', { 'data-testid': 'help-tooltip' }, content),
}));

vi.mock('../requirements/FormatSegmentBlock', () => ({
  FormatSegmentBlock: () => React.createElement('div', { 'data-testid': 'format-segment-block' }),
}));

vi.mock('../../shared/requirements/format-parser', () => ({
  parseStoryMarkdown: () => ({ role: '', action: '', value: '', remainder: '', hasAllSegments: true }),
  parseACMarkdown: () => ({ given: '', when: '', then: '', remainder: '', hasAllSegments: true }),
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
        { id: 'p1', name: 'Azure OpenAI', type: 'azure-openai', model: 'gpt-4o', models: ['gpt-4o'], isActive: true },
        { id: 'p2', name: 'OpenAI Compatible', type: 'openai-compatible', model: 'gpt-4', models: ['gpt-4'], isActive: false },
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
    status: 'DRAFT',
    position: 0,
    ...overrides,
  };
}

function makeFlowStory(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: `flow-${Math.random().toString(36).slice(2, 8)}`,
    projectId: 'proj-1',
    parentId: null,
    title: 'Test Flow',
    description: 'A test flow',
    level: 'story',
    status: 'APPROVED',
    position: 0,
    isFlow: true,
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client: queryClient }, ui));
}

function buildTreeSample(): Requirement[] {
  const epic = makeRequirement({ id: 'epic-1', title: 'User Management', level: 'epic' as const, parentId: null });
  const feature = makeRequirement({ id: 'feat-1', title: 'User Registration', level: 'story' as const, parentId: epic.id });
  const story1 = makeRequirement({ id: 'story-1', title: 'Email Registration', level: 'story' as const, parentId: feature.id });
  const story2 = makeRequirement({ id: 'story-2', title: 'Phone Registration', level: 'story' as const, parentId: feature.id });
  return [epic, feature, story1, story2];
}

describe('TestGenConfigPanel', () => {
  afterEach(cleanup);

  const defaultProps = {
    projectId: 'proj-1',
    requirements: [],
    flowStories: [],
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
    // 3 stories selected (epic is not counted as a selectable leaf)
    expect(screen.getByText('3')).toBeTruthy();

    fireEvent.click(checkbox);
    expect(screen.queryByText('3')).toBeNull();
  });

  it('TC-1.4: Flow stories appear in the requirements tree', () => {
    const epic = makeRequirement({ id: 'epic-flow', title: 'Flow Epic', level: 'epic' as const, parentId: null });
    const flows = [
      makeFlowStory({ id: 'f1', title: 'Approved Flow', status: 'APPROVED', parentId: epic.id }),
      makeFlowStory({ id: 'f2', title: 'Draft Flow', status: 'DRAFT', parentId: epic.id }),
    ];
    const allReqs = [epic, ...flows];
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, requirements: allReqs, flowStories: flows }));
    // Epic is visible in the tree
    expect(screen.getByText('Flow Epic')).toBeTruthy();
    // Expand all to reveal flow story children
    const expandBtn = screen.getByText('Expand');
    fireEvent.click(expandBtn);
    expect(screen.getByText('Approved Flow')).toBeTruthy();
    expect(screen.getByText('Draft Flow')).toBeTruthy();
  });

  it('TC-1.4a: Toggling a flow story only adds it to flowIds (no auto-linking)', () => {
    // Structure: epic → componentStory (with AC) + flowStory (with flow AC referencing componentStory)
    const epic = makeRequirement({ id: 'epic-1', title: 'Auth Epic', level: 'epic' as const, parentId: null });
    const componentStory = makeRequirement({ id: 'story-1', title: 'Login UI', level: 'story' as const, parentId: epic.id, isFlow: false });
    const flowStory = makeFlowStory({ id: 'flow-1', title: 'Login Flow', parentId: epic.id });
    const flowAC = makeRequirement({
      id: 'flow-1-ac1',
      title: 'Happy path login',
      level: 'ac' as const,
      parentId: flowStory.id,
      flowType: 'flow',
      relatedRequirementIds: ['story-1'],
    });
    const allReqs = [epic, componentStory, flowStory, flowAC];
    const onStart = vi.fn();
    renderWithQuery(React.createElement(TestGenConfigPanel, {
      ...defaultProps,
      requirements: allReqs,
      flowStories: [flowStory],
      onStart,
    }));

    // Expand tree to see flow story
    fireEvent.click(screen.getByText('Expand'));

    // Click the flow story's checkbox (purple checkbox for flow)
    const flowRow = screen.getByText('Login Flow').closest('div');
    const flowCheckbox = flowRow!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(flowCheckbox);

    // Verify onStart receives flowIds only — component stories are NOT auto-linked
    // (the backend resolves them at orchestration time)
    const startBtn = screen.getByRole('button', { name: /Start|Generate/i });
    fireEvent.click(startBtn);

    expect(onStart).toHaveBeenCalledTimes(1);
    const call = onStart.mock.calls[0][0] as TestGenStartConfig;
    expect(call.flowIds).toContain('flow-1');
    expect(call.requirementIds).not.toContain('story-1');
  });

  it('TC-1.4b: Toggling flow off removes it from flowIds', () => {
    const epic = makeRequirement({ id: 'epic-1', title: 'Auth Epic', level: 'epic' as const, parentId: null });
    const componentStory = makeRequirement({ id: 'story-1', title: 'Login UI', level: 'story' as const, parentId: epic.id, isFlow: false });
    const flowStory = makeFlowStory({ id: 'flow-1', title: 'Login Flow', parentId: epic.id });
    const flowAC = makeRequirement({
      id: 'flow-1-ac1',
      title: 'Happy path login',
      level: 'ac' as const,
      parentId: flowStory.id,
      flowType: 'flow',
      relatedRequirementIds: ['story-1'],
    });
    const allReqs = [epic, componentStory, flowStory, flowAC];
    const onStart = vi.fn();
    renderWithQuery(React.createElement(TestGenConfigPanel, {
      ...defaultProps,
      requirements: allReqs,
      flowStories: [flowStory],
      onStart,
    }));

    fireEvent.click(screen.getByText('Expand'));

    // First: toggle flow ON — should show flow count badge only
    const flowRow = screen.getByText('Login Flow').closest('div');
    const flowCheckbox = flowRow!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(flowCheckbox);

    // Verify the purple flow badge appears (1 flow)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);

    // Then: toggle flow OFF
    fireEvent.click(flowCheckbox);

    // Verify the count badge is gone
    const reqBadges = screen.queryAllByText('1');
    expect(reqBadges.length).toBe(0);
  });

  it('TC-1.6: mode toggle switches Auto/Interactive', () => {
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    const autoBtn = screen.getByRole('button', { name: /Auto/ });
    const interactiveBtn = screen.getByRole('button', { name: /Interactive/ });
    expect(autoBtn).toBeTruthy();
    expect(interactiveBtn).toBeTruthy();
    fireEvent.click(interactiveBtn);
    expect(screen.getByText('Pause at each checkpoint for review')).toBeTruthy();
    fireEvent.click(autoBtn);
    expect(screen.getByText('Run all stages automatically')).toBeTruthy();
  });

  it('TC-1.7: Model dropdown auto-selects from active provider config', () => {
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    // Active provider 'Azure OpenAI' has model 'gpt-4o' — auto-selected on mount
    expect(screen.getByText('gpt-4o')).toBeTruthy();
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
    // Model auto-selects from active provider on mount; only requirements need selection
    fireEvent.click(screen.getAllByLabelText('Select all')[0]);
    const startBtn = screen.getByText('Start Test Gen');
    expect(startBtn.closest('button')).not.toBeDisabled();
    fireEvent.click(startBtn);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('TC-1.10: Start passes an auto-generated run name', () => {
    const reqs = buildTreeSample();
    const onStart = vi.fn();
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps, requirements: reqs, onStart }));
    fireEvent.click(screen.getAllByLabelText('Select all')[0]);
    fireEvent.click(screen.getByText('Start Test Gen'));
    expect(onStart).toHaveBeenCalledTimes(1);
    const config = onStart.mock.calls[0][0] as TestGenStartConfig;
    expect(typeof config.name).toBe('string');
    expect(config.name.length).toBeGreaterThan(0);
  });

  it('TC-8.2: shows warning when no providers configured', () => {
    vi.mocked(useProviderConfigs).mockReturnValueOnce({ data: [] } as any);
    renderWithQuery(React.createElement(TestGenConfigPanel, { ...defaultProps }));
    expect(screen.getByText(/No models configured/)).toBeTruthy();
  });
});

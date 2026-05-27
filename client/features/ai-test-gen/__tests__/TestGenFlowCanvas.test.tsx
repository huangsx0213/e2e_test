import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { TestGenFlowCanvas } from '../TestGenFlowCanvas';

interface NodeState {
  id: string;
  label: string;
  type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
  agentName?: string;
  subSteps?: { label: string; done: boolean; running?: boolean }[];
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'auto-passed';
  meta?: { tokenUsage?: number; latencyMs?: number; outputCount?: number; outputLabel?: string; errorMessage?: string };
}

const PIPELINE_NODES: NodeState[] = [
  { id: 'preparation', label: 'Preparation', type: 'preparation', status: 'pending' },
  { id: 'agent_test_analyst', label: 'Test Analyst', type: 'agent', agentName: 'test_analyst', status: 'pending',
    subSteps: [
      { label: 'Assess risk & priority', done: false },
      { label: 'Extract test conditions', done: false },
    ] },
  { id: 'checkpoint_1', label: 'Review Conditions', type: 'checkpoint', status: 'pending' },
  { id: 'agent_test_designer', label: 'Test Designer', type: 'agent', agentName: 'test_designer', status: 'pending',
    subSteps: [
      { label: 'Design test cases', done: false },
    ] },
  { id: 'checkpoint_2', label: 'Review Drafts', type: 'checkpoint', status: 'pending' },
  { id: 'agent_quality_manager', label: 'Quality Manager', type: 'agent', agentName: 'quality_manager', status: 'pending',
    subSteps: [
      { label: 'Review 6 dimensions', done: false },
    ] },
  { id: 'checkpoint_3', label: 'Final Review', type: 'checkpoint', status: 'pending' },
  { id: 'complete', label: 'Complete', type: 'complete', status: 'pending' },
];

function emptyNodes(): NodeState[] {
  return PIPELINE_NODES.map(n => ({ ...n }));
}

describe('TestGenFlowCanvas', () => {
  afterEach(cleanup);

  const defaultProps = {
    nodes: emptyNodes(),
    batch: 0,
    totalBatches: 3,
    generatedCases: 0,
    onNodeClick: vi.fn(),
    selectedNodeId: null as string | null,
    onAbort: vi.fn(),
    isRunning: false,
  };

  it('TC-2.1: renders all 8 nodes in correct order', () => {
    render(React.createElement(TestGenFlowCanvas, defaultProps));
    const expectedLabels = ['Preparation', 'Test Analyst', 'Review Conditions', 'Test Designer', 'Review Drafts', 'Quality Manager', 'Final Review', 'Complete'];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('TC-2.2: node shows running status with pulse class', () => {
    const nodes = emptyNodes();
    nodes[1].status = 'running';
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, nodes }));
    const testAnalyst = screen.getByText('Test Analyst').closest('[class*="border-2"]');
    expect(testAnalyst?.className).toContain('animate-pulse');
    expect(testAnalyst?.className).toContain('border-blue-400');
  });

  it('TC-2.2: node shows waiting status with orange border', () => {
    const nodes = emptyNodes();
    nodes[2].status = 'waiting';
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, nodes }));
    const cp = screen.getByText('Review Conditions').closest('[class*="border-2"]');
    expect(cp?.className).toContain('border-orange-400');
  });

  it('TC-2.2: node shows done status with green border', () => {
    const nodes = emptyNodes();
    nodes[0].status = 'done';
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, nodes }));
    const prep = screen.getByText('Preparation').closest('[class*="border-2"]');
    expect(prep?.className).toContain('border-green-400');
  });

  it('TC-2.2: node shows error status with red border', () => {
    const nodes = emptyNodes();
    nodes[1].status = 'error';
    nodes[1].meta = { errorMessage: 'LLM call failed' };
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, nodes }));
    const agent = screen.getByText('Test Analyst').closest('[class*="border-2"]');
    expect(agent?.className).toContain('border-red-400');
    expect(screen.getByText(/LLM call failed/)).toBeTruthy();
  });

  it('TC-2.2: auto-passed shows dashed border', () => {
    const nodes = emptyNodes();
    nodes[2].status = 'auto-passed';
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, nodes }));
    const cp = screen.getByText('Review Conditions').closest('[class*="border-2"]');
    expect(cp?.className).toContain('border-dashed');
    expect(cp?.className).toContain('border-slate-300');
  });

  it('TC-2.3: selected node has ring highlight', () => {
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, selectedNodeId: 'agent_test_analyst' }));
    const agent = screen.getByText('Test Analyst').closest('[class*="border-2"]');
    expect(agent?.className).toContain('ring-2');
    expect(agent?.className).toContain('ring-blue-400');
  });

  it('TC-2.4: progress bar shows batch info', () => {
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, batch: 1, totalBatches: 3 }));
    expect(screen.getByText('Batch 1/3')).toBeTruthy();
  });

  it('TC-2.5: Abort button visible when running', () => {
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, isRunning: true }));
    expect(screen.getByText('Abort')).toBeTruthy();
  });

  it('TC-2.5: Abort button hidden when not running', () => {
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, isRunning: false }));
    expect(screen.queryByText('Abort')).toBeNull();
  });

  it('TC-2.6: legend shows status colors', () => {
    render(React.createElement(TestGenFlowCanvas, defaultProps));
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('TC-2.4: shows generated cases count', () => {
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, generatedCases: 28 }));
    expect(screen.getByText('28 cases')).toBeTruthy();
  });

  it('clicking a node triggers onNodeClick', () => {
    const onNodeClick = vi.fn();
    render(React.createElement(TestGenFlowCanvas, { ...defaultProps, onNodeClick }));
    fireEvent.click(screen.getByText('Preparation'));
    expect(onNodeClick).toHaveBeenCalledWith('preparation');
  });
});

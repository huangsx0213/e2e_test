import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { PipelineNodeDetail } from '../PipelineNodeDetail';

describe('PipelineNodeDetail', () => {
  afterEach(cleanup);

  const defaultProps = {
    node: null as any,
    agentLog: null,
    checkpointData: null,
    thinkingText: null as string | null,
    onClose: vi.fn(),
    onCheckpointAction: vi.fn() as any,
    runSummary: null as any,
  };

  it('TC-3.1: shows placeholder when no node selected', () => {
    render(React.createElement(PipelineNodeDetail, defaultProps));
    expect(screen.getByText('Click a node to see details')).toBeTruthy();
  });

  it('TC-3.2: agent node shows 6 tabs', () => {
    const agentNode = {
      id: 'agent_test_analyst',
      label: 'Test Analyst',
      type: 'agent' as const,
      agentName: 'test_analyst',
      status: 'running',
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: agentNode }));
    expect(screen.getByText('summary')).toBeTruthy();
    expect(screen.getByText('thinking')).toBeTruthy();
    expect(screen.getByText('input')).toBeTruthy();
    expect(screen.getByText('output')).toBeTruthy();
    expect(screen.getByText('trace')).toBeTruthy();
    expect(screen.getByText('errors')).toBeTruthy();
  });

  it('TC-3.3: thinking tab shows waiting text when running without content', () => {
    const agentNode = {
      id: 'agent_test_analyst',
      label: 'Test Analyst',
      type: 'agent' as const,
      agentName: 'test_analyst',
      status: 'running',
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: agentNode }));
    fireEvent.click(screen.getByText('thinking'));
    expect(screen.getByText('Waiting for agent response...')).toBeTruthy();
  });

  it('TC-3.3: thinking tab shows content when provided', () => {
    const agentNode = {
      id: 'agent_test_analyst',
      label: 'Test Analyst',
      type: 'agent' as const,
      agentName: 'test_analyst',
      status: 'running',
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: agentNode, thinkingText: 'Analyzing requirements...' }));
    expect(screen.getByText('Analyzing requirements...')).toBeTruthy();
  });

  it('TC-3.4: input tab shows system prompt and user message', () => {
    const agentNode = {
      id: 'agent_test_analyst',
      label: 'Test Analyst',
      type: 'agent' as const,
      status: 'done',
    };
    const agentLog = {
      input_prompt: {
        systemPrompt: 'You are an ISTQB analyst...',
        userMessage: 'Analyze these requirements...',
      },
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: agentNode, agentLog }));
    fireEvent.click(screen.getByText('input'));
    expect(screen.getByText('System Prompt')).toBeTruthy();
    expect(screen.getByText('User Message')).toBeTruthy();
    expect(screen.getByText('You are an ISTQB analyst...')).toBeTruthy();
    expect(screen.getByText('Analyze these requirements...')).toBeTruthy();
  });

  it('TC-3.5: output tab shows raw JSON in details', () => {
    const agentNode = {
      id: 'agent_test_analyst',
      label: 'Test Analyst',
      type: 'agent' as const,
      status: 'done',
    };
    const agentLog = {
      output_data: { conditions: [{ condition: 'Email format valid' }] },
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: agentNode, agentLog }));
    fireEvent.click(screen.getByText('output'));
    expect(screen.getByText('Raw JSON')).toBeTruthy();
  });

  it('TC-3.7: errors tab shows failure message', () => {
    const agentNode = {
      id: 'agent_test_analyst',
      label: 'Test Analyst',
      type: 'agent' as const,
      status: 'error',
    };
    const agentLog = { status: 'FAILED' };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: agentNode, agentLog }));
    fireEvent.click(screen.getByText('errors'));
    expect(screen.getByText('Agent execution failed.')).toBeTruthy();
  });

  it('TC-3.8: checkpoint shows conditions list', () => {
    const cpNode = {
      id: 'checkpoint_1',
      label: 'Review Conditions',
      type: 'checkpoint' as const,
      status: 'waiting',
    };
    const checkpointData = {
      conditions: [
        { condition: 'Email format validation', category: 'error', riskLevel: 'high', primaryTechnique: 'equivalence-partitioning' },
        { condition: 'Password strength check', category: 'boundary', riskLevel: 'medium' },
      ],
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: cpNode, checkpointData }));
    expect(screen.getByText('Email format validation')).toBeTruthy();
    expect(screen.getByText('Password strength check')).toBeTruthy();
    expect(screen.getByText('2 Test Conditions')).toBeTruthy();
  });

  it('TC-3.9: checkpoint shows approve/edit/retry buttons', () => {
    const cpNode = {
      id: 'checkpoint_1',
      label: 'Review Conditions',
      type: 'checkpoint' as const,
      status: 'waiting',
    };
    const checkpointData = { conditions: [{ condition: 'Test' }] };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: cpNode, checkpointData }));
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Edit & Continue')).toBeTruthy();
    expect(screen.getByText('Retry Agent')).toBeTruthy();
  });

  it('TC-3.10: feedback textarea for checkpoint review', () => {
    const cpNode = {
      id: 'checkpoint_1',
      label: 'Review Conditions',
      type: 'checkpoint' as const,
      status: 'waiting',
    };
    const checkpointData = { conditions: [{ condition: 'Test' }] };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: cpNode, checkpointData }));
    const textarea = screen.getByPlaceholderText('Add review feedback...');
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea, { target: { value: 'Looks good' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('Looks good');
  });

  it('TC-3.11: auto-passed message for checkpoint in auto mode', () => {
    const cpNode = {
      id: 'checkpoint_1',
      label: 'Review Conditions',
      type: 'checkpoint' as const,
      status: 'auto-passed',
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: cpNode }));
    expect(screen.getByText(/Auto-passed/)).toBeTruthy();
  });

  it('checkpoint status: shows auto-passed when no checkpoint data', () => {
    const cpNode = {
      id: 'checkpoint_2',
      label: 'Review Drafts',
      type: 'checkpoint' as const,
      status: 'pending',
    };
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: cpNode }));
    expect(screen.getByText(/Auto-passed/)).toBeTruthy();
  });

  it('TC-3.9: approve button triggers onCheckpointAction', () => {
    const cpNode = {
      id: 'checkpoint_1',
      label: 'Review Conditions',
      type: 'checkpoint' as const,
      status: 'waiting',
    };
    const checkpointData = { conditions: [{ condition: 'Test' }] };
    const onCheckpointAction = vi.fn();
    render(React.createElement(PipelineNodeDetail, { ...defaultProps, node: cpNode, checkpointData, onCheckpointAction }));
    fireEvent.click(screen.getByText('Approve'));
    expect(onCheckpointAction).toHaveBeenCalledWith('approve', expect.anything());
  });
});

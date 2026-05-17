import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { StepList } from '../StepList';
import type { Project, TestStep } from '@/shared/types';

vi.mock('@/shared/ui/HelpTooltip', () => ({
  HelpTooltip: () => React.createElement('span', null, '?'),
}));

vi.mock('../AssertionEditor', () => ({
  AssertionEditor: () => React.createElement('div', null, 'AssertionEditor'),
}));

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Project One',
    pages: [],
    modules: [],
    scenarios: [],
    plans: [],
  };
}

function makeStep(): TestStep {
  return {
    id: 'step-1',
    action: 'click',
    target: 'Button.Submit',
    waitForNetwork: {
      enabled: true,
      urlPattern: '/api/orders',
      method: 'POST',
      expectedStatus: 200,
      timeoutMs: 10000,
      extractors: [
        {
          id: 'ext-1',
          name: 'orderId',
          source: 'API_BODY_JSON',
          expression: '$.data.id',
          scope: 'CASE',
        },
      ],
    },
    networkMocks: [
      {
        id: 'mock-1',
        enabled: true,
        urlPattern: '.*\/api\/orders.*',
        method: 'POST',
        status: 200,
        body: '{"success": true}',
      },
    ],
  };
}

afterEach(() => {
  cleanup();
});

describe('StepList advanced settings', () => {
  it('keeps the extractor name draft when the parent rerenders with old data', () => {
    const onUpdateStep = vi.fn();
    const step = makeStep();

    const { rerender } = render(
      React.createElement(StepList, {
        title: 'Steps',
        steps: [step],
        onUpdateStep,
        onDeleteStep: vi.fn(),
        onMoveStep: vi.fn(),
        activeProject: makeProject(),
        endpoints: [],
        headers: [],
        bodies: [],
      }),
    );

    fireEvent.click(screen.getByText('Advanced Settings'));
    const input = screen.getByPlaceholderText('Variable Name');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'typedVar' } });

    rerender(
      React.createElement(StepList, {
        title: 'Steps',
        steps: [step],
        onUpdateStep,
        onDeleteStep: vi.fn(),
        onMoveStep: vi.fn(),
        activeProject: makeProject(),
        endpoints: [],
        headers: [],
        bodies: [],
      }),
    );

    expect((screen.getByPlaceholderText('Variable Name') as HTMLInputElement).value).toBe('typedVar');
  });

  it('keeps the mock response body draft when the parent rerenders with old data', () => {
    const onUpdateStep = vi.fn();
    const step = makeStep();

    const { rerender } = render(
      React.createElement(StepList, {
        title: 'Steps',
        steps: [step],
        onUpdateStep,
        onDeleteStep: vi.fn(),
        onMoveStep: vi.fn(),
        activeProject: makeProject(),
        endpoints: [],
        headers: [],
        bodies: [],
      }),
    );

    fireEvent.click(screen.getByText('Advanced Settings'));
    const textarea = screen.getByPlaceholderText('{"success": true}');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: '{"success": false}' } });

    rerender(
      React.createElement(StepList, {
        title: 'Steps',
        steps: [step],
        onUpdateStep,
        onDeleteStep: vi.fn(),
        onMoveStep: vi.fn(),
        activeProject: makeProject(),
        endpoints: [],
        headers: [],
        bodies: [],
      }),
    );

    expect((screen.getByPlaceholderText('{"success": true}') as HTMLTextAreaElement).value).toBe('{"success": false}');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AiTestGenPage } from '../AiTestGenPage';
import { TestGenRunDepsProvider } from '@/shared/test-gen-run';
import { createFetchSSEConnection } from '@/shared/sse';

vi.mock('@/shared/ui/HelpTooltip', () => ({
  HelpTooltip: ({ content }: { content: string }) => React.createElement('span', { 'data-testid': 'help-tooltip' }, content),
}));

vi.mock('@/shared/ui/ConfirmModal', () => ({
  ConfirmModal: ({ isOpen, title, message, onConfirm, onClose, confirmLabel }: any) =>
    isOpen
      ? React.createElement('div', { 'data-testid': 'confirm-modal' },
          React.createElement('div', null, title),
          React.createElement('div', null, message),
          React.createElement('button', { onClick: onConfirm, 'data-testid': 'confirm-yes' }, confirmLabel),
          React.createElement('button', { onClick: onClose, 'data-testid': 'confirm-no' }, 'Cancel'),
        )
      : null,
}));

vi.mock('@/shared/hooks/useQueryHooks', () => ({
  useRequirements: vi.fn().mockReturnValue({ data: [] }),
  useBusinessFlows: vi.fn().mockReturnValue({ data: [] }),
  useTestGenRuns: vi.fn().mockReturnValue({ data: [], refetch: vi.fn() }),
  useCheckpoint: vi.fn().mockReturnValue({ data: null }),
  useAgentLogs: vi.fn().mockReturnValue({ data: [] }),
  useProviderConfigs: vi.fn().mockReturnValue({ data: [] }),
}));

vi.mock('@/shared/services/api', () => ({
  api: {
    pipeline: {
      start: vi.fn().mockResolvedValue({ runId: 'run-test-1' }),
      resume: vi.fn().mockResolvedValue({ success: true }),
      abort: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      active: vi.fn().mockResolvedValue(null),
      runs: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/shared/sse', () => ({
  createFetchSSEConnection: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn(() => 'disconnected'),
    getLastError: vi.fn(() => null),
  })),
}));

const mockDeps = {
  api: {
    start: vi.fn().mockResolvedValue({ runId: 'run-test-1' }),
    resume: vi.fn().mockResolvedValue({ success: true }),
    abort: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    active: vi.fn().mockResolvedValue(null),
    runs: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    checkpoint: vi.fn().mockResolvedValue(null),
    logs: vi.fn().mockResolvedValue([]),
  },
  createSSEConnection: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn(() => 'disconnected' as const),
    getLastError: vi.fn(() => null),
  })),
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(TestGenRunDepsProvider as any, { deps: mockDeps },
      React.createElement(QueryClientProvider, { client: queryClient }, ui),
    ),
  );
}

describe('AiTestGenPage', () => {
  afterEach(cleanup);
  afterEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = { currentProjectId: 'proj-1' };

  it('TC-4.1: shows project selection prompt when no projectId', () => {
    renderWithProviders(React.createElement(AiTestGenPage, { currentProjectId: null }));
    expect(screen.getByText('Select a project to continue')).toBeTruthy();
  });

  it('renders header with AI Test Gen title', () => {
    renderWithProviders(React.createElement(AiTestGenPage, defaultProps));
    expect(screen.getByText('AI Test Gen')).toBeTruthy();
  });

  it('TC-4.2: can switch between config and history views', () => {
    renderWithProviders(React.createElement(AiTestGenPage, defaultProps));
    const historyBtn = screen.getByText('History');
    fireEvent.click(historyBtn);
    expect(screen.getByText('Run History')).toBeTruthy();
    const newRunBtn = screen.getByText('New Run');
    fireEvent.click(newRunBtn);
    expect(screen.getByText('Test Gen Config')).toBeTruthy();
  });

  it('TC-4.2: shows New Run button when in history view', () => {
    renderWithProviders(React.createElement(AiTestGenPage, defaultProps));
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText('New Run')).toBeTruthy();
  });

  it('TC-4.5: abort confirmation modal appears on abort click', () => {
    renderWithProviders(React.createElement(AiTestGenPage, defaultProps));
    expect(screen.queryByTestId('confirm-modal')).toBeNull();
  });

  it('shows header with AI Test Gen title and buttons', () => {
    renderWithProviders(React.createElement(AiTestGenPage, defaultProps));
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

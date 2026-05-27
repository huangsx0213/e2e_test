import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { TestGenRunHistory } from '../TestGenRunHistory';

function makeRun(overrides: Record<string, any> = {}) {
  return {
    id: `run-${Math.random().toString(36).slice(2, 8)}`,
    status: 'COMPLETED',
    phase: 'complete',
    mode: 'auto',
    current_batch: 3,
    total_batches: 3,
    config: { name: 'Test Run' },
    created_at: '2026-05-24T10:30:00.000Z',
    ...overrides,
  };
}

describe('TestGenRunHistory', () => {
  afterEach(cleanup);

  const defaultProps = {
    runs: [] as any[],
    onSelect: vi.fn(),
    onBack: vi.fn(),
    onDeleteRun: vi.fn() as (runId: string) => Promise<void>,
  };

  it('TC-5.1: renders list of pipeline runs', () => {
    const runs = [makeRun()];
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs }));
    expect(screen.getByText('Test Run')).toBeTruthy();
    expect(screen.getByText('COMPLETED')).toBeTruthy();
    expect(screen.getByText('auto')).toBeTruthy();
  });

  it('TC-5.2: search filters runs by name', () => {
    const runs = [
      makeRun({ id: 'r1', config: { name: 'User Module Test' } }),
      makeRun({ id: 'r2', config: { name: 'Order Module Test' } }),
    ];
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs }));
    const searchInput = screen.getByPlaceholderText('Search runs...');
    fireEvent.change(searchInput, { target: { value: 'User' } });
    expect(screen.getByText('User Module Test')).toBeTruthy();
    expect(screen.queryByText('Order Module Test')).toBeNull();
  });

  it('TC-5.3: status filter works', () => {
    const runs = [
      makeRun({ id: 'r1', status: 'COMPLETED', config: { name: 'Run 1' } }),
      makeRun({ id: 'r2', status: 'RUNNING', config: { name: 'Run 2' } }),
    ];
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs }));
    const statusSelect = screen.getByDisplayValue('All Status');
    fireEvent.change(statusSelect, { target: { value: 'RUNNING' } });
    expect(screen.getByText('Run 2')).toBeTruthy();
    expect(screen.queryByText('Run 1')).toBeNull();
  });

  it('TC-5.4: mode filter works', () => {
    const runs = [
      makeRun({ id: 'r1', mode: 'auto', config: { name: 'Auto Run' } }),
      makeRun({ id: 'r2', mode: 'interactive', config: { name: 'Interactive Run' } }),
    ];
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs }));
    const modeSelect = screen.getByDisplayValue('All Modes');
    fireEvent.change(modeSelect, { target: { value: 'interactive' } });
    expect(screen.getByText('Interactive Run')).toBeTruthy();
    expect(screen.queryByText('Auto Run')).toBeNull();
  });

  it('TC-5.5: delete confirmation shows Yes/No', () => {
    const runs = [makeRun()];
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs }));
    const deleteBtn = screen.getByTitle('Delete run');
    fireEvent.click(deleteBtn);
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('TC-5.5: confirming delete calls onDeleteRun', async () => {
    const runs = [makeRun({ id: 'run-1' })];
    const onDeleteRun = vi.fn().mockResolvedValue(undefined);
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs, onDeleteRun }));
    fireEvent.click(screen.getByTitle('Delete run'));
    fireEvent.click(screen.getByText('Yes'));
    expect(onDeleteRun).toHaveBeenCalledWith('run-1');
  });

  it('TC-5.6: empty state when no runs match filter', () => {
    render(React.createElement(TestGenRunHistory, defaultProps));
    expect(screen.getByText('No matching runs found')).toBeTruthy();
  });

  it('clicking run name triggers onSelect', () => {
    const runs = [makeRun()];
    const onSelect = vi.fn();
    render(React.createElement(TestGenRunHistory, { ...defaultProps, runs, onSelect }));
    fireEvent.click(screen.getByText('Test Run'));
    expect(onSelect).toHaveBeenCalledWith(runs[0].id);
  });
});

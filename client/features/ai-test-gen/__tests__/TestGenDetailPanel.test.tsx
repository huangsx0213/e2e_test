import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TestGenDetailPanel } from '../TestGenDetailPanel';

describe('TestGenDetailPanel', () => {
  it('renders preparation summary details for preparation nodes', () => {
    render(
      <TestGenDetailPanel
        node={{
          id: 'preparation',
          label: 'Preparation',
          kind: 'preparation',
          status: 'completed',
          meta: {
            initLogs: [
              { type: 'pipeline:context', data: { flows: 2, indexEntries: 5 }, timestamp: '2026-01-01T00:00:00.000Z' },
            ],
            requirementCount: 5,
            totalBatches: 2,
            estimatedTokens: 5000,
            flowCases: 2,
          },
        }}
        agentLog={{
          output_data: {
            initLogs: [
              { type: 'pipeline:context', data: { flows: 2, indexEntries: 5 }, timestamp: '2026-01-01T00:00:00.000Z' },
            ],
            requirementCount: 5,
            totalBatches: 2,
            estimatedTokens: 5000,
            flowCases: 2,
          },
        }}
        checkpointData={null}
        thinkingText={null}
        runSummary={null}
        agentLogs={[]}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
        onToggleReview={vi.fn()}
        onDoneReviewing={vi.fn()}
      />,
    );

    expect(screen.getByText('Environment Initialized')).toBeInTheDocument();
    expect(screen.getByText('AI Flow Initialization Logs')).toBeInTheDocument();
    expect(screen.getByText('Requirements')).toBeInTheDocument();
    expect(screen.getByText('Batches')).toBeInTheDocument();
    expect(screen.getByText('Token Budget')).toBeInTheDocument();
    expect(screen.getByText('Flow Cases')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getAllByText('2')).toHaveLength(2);
  });
});

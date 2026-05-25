import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NlCasesPage } from '../NlCasesPage';

vi.mock('@/shared/hooks/useQueryHooks', () => ({
  useNlCases: vi.fn(),
}));

import { useNlCases } from '@/shared/hooks/useQueryHooks';

function makeCase(overrides: Record<string, any> = {}) {
  return {
    id: `tc-${Math.random().toString(36).slice(2, 8)}`,
    projectId: 'proj-1',
    title: 'Test Case',
    priority: 'medium',
    status: 'FINAL',
    category: 'happy-path',
    preconditions: ['User is logged in'],
    testData: [{ key: 'email', value: 'test@test.com', description: 'Email address' }],
    steps: [{ sequence: 1, action: 'Enter email', expected: 'Email shown' }],
    postconditions: ['User created'],
    tags: ['smoke', 'regression'],
    reviewSummary: 'Approved',
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client: queryClient }, ui));
}

describe('NlCasesPage', () => {
  afterEach(cleanup);

  const defaultProps = {
    currentProjectId: 'proj-1',
  };

  it('TC-6.1: shows project selection prompt when no project', () => {
    vi.mocked(useNlCases).mockReturnValue({ data: [], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, { currentProjectId: null }));
    expect(screen.getByText('Select a project to continue')).toBeTruthy();
  });

  it('TC-6.2: shows loading state', () => {
    vi.mocked(useNlCases).mockReturnValue({ data: [], isLoading: true } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    expect(screen.getByText('Loading test cases...')).toBeTruthy();
  });

  it('TC-6.3: renders cases in table with correct columns', () => {
    vi.mocked(useNlCases).mockReturnValue({ data: [makeCase({ title: 'My Test Case', priority: 'critical', category: 'happy-path', status: 'FINAL' })], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    expect(screen.getByText('My Test Case')).toBeTruthy();
    expect(screen.getByText('critical')).toBeTruthy();
    expect(screen.getByText('happy-path')).toBeTruthy();
    expect(screen.getByText('FINAL')).toBeTruthy();
  });

  it('TC-6.4: row click expands detail panel', () => {
    const tc = makeCase({ title: 'Email Registration', preconditions: ['User is on registration page'] });
    vi.mocked(useNlCases).mockReturnValue({ data: [tc], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    fireEvent.click(screen.getByText('Email Registration'));
    expect(screen.getByText('User is on registration page')).toBeTruthy();
  });

  it('TC-6.4: detail shows steps', () => {
    const tc = makeCase({ title: 'Login Test', steps: [{ sequence: 1, action: 'Enter password', expected: 'Password accepted' }] });
    vi.mocked(useNlCases).mockReturnValue({ data: [tc], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    fireEvent.click(screen.getByText('Login Test'));
    expect(screen.getByText(/Enter password/)).toBeTruthy();
    expect(screen.getByText(/Password accepted/)).toBeTruthy();
  });

  it('TC-6.5: search filters cases by title', () => {
    const cases = [
      makeCase({ id: 'c1', title: 'Email Registration' }),
      makeCase({ id: 'c2', title: 'Phone Registration' }),
    ];
    vi.mocked(useNlCases).mockReturnValue({ data: cases, isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    const searchInput = screen.getByPlaceholderText('Search test cases...');
    fireEvent.change(searchInput, { target: { value: 'Phone' } });
    expect(screen.getByText('Phone Registration')).toBeTruthy();
    expect(screen.queryByText('Email Registration')).toBeNull();
  });

  it('TC-6.6: status filter works', () => {
    const cases = [
      makeCase({ id: 'c1', title: 'Case A', status: 'FINAL' }),
      makeCase({ id: 'c2', title: 'Case B', status: 'DRAFT' }),
    ];
    vi.mocked(useNlCases).mockReturnValue({ data: cases, isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    const statusSelect = screen.getByDisplayValue('All Status');
    fireEvent.change(statusSelect, { target: { value: 'DRAFT' } });
    expect(screen.getByText('Case B')).toBeTruthy();
    expect(screen.queryByText('Case A')).toBeNull();
  });

  it('TC-6.6: priority filter works', () => {
    const cases = [
      makeCase({ id: 'c1', title: 'Critical Case', priority: 'critical' }),
      makeCase({ id: 'c2', title: 'Low Priority', priority: 'low' }),
    ];
    vi.mocked(useNlCases).mockReturnValue({ data: cases, isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    const prioritySelect = screen.getByDisplayValue('All Priority');
    fireEvent.change(prioritySelect, { target: { value: 'critical' } });
    expect(screen.getByText('Critical Case')).toBeTruthy();
    expect(screen.queryByText('Low Priority')).toBeNull();
  });

  it('TC-6.11: empty state when no cases', () => {
    vi.mocked(useNlCases).mockReturnValue({ data: [], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    expect(screen.getByText(/No test cases yet/)).toBeTruthy();
  });

  it('TC-6.9: no results matching filter message', () => {
    vi.mocked(useNlCases).mockReturnValue({ data: [makeCase({ title: 'Something' })], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    const searchInput = screen.getByPlaceholderText('Search test cases...');
    fireEvent.change(searchInput, { target: { value: 'NonExistentCase' } });
    expect(screen.getByText(/No results match your filters/)).toBeTruthy();
  });

  it('TC-6.7: shows pagination when > 20 cases', () => {
    const manyCases = Array.from({ length: 25 }, (_, i) => makeCase({ id: `c${i}`, title: `Case ${i}` }));
    vi.mocked(useNlCases).mockReturnValue({ data: manyCases, isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    expect(screen.getByText(/1-20 of 25/)).toBeTruthy();
  });

  it('TC-6.3: shows correct case count in header', () => {
    vi.mocked(useNlCases).mockReturnValue({ data: [makeCase(), makeCase()], isLoading: false } as any);
    renderWithQuery(React.createElement(NlCasesPage, defaultProps));
    expect(screen.getByText(/2 of 2 cases/)).toBeTruthy();
  });
});

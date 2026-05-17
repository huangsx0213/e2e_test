import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RequirementImport } from '../RequirementImport';

describe('RequirementImport', () => {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    onClose.mockReset();
    onImported.mockReset();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders modal title', () => {
    render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    const titles = screen.getAllByText('Import Requirements');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('renders textarea for content', () => {
    render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('calls onClose when Cancel clicked', () => {
    render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    const buttons = screen.getAllByRole('button', { name: 'Cancel' });
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables Import when content empty', () => {
    render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    const buttons = screen.getAllByRole('button', { name: /^Import$/ });
    expect(buttons[0]).toBeDisabled();
  });

  it('enables Import when content entered', () => {
    render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: '# Epic' } });
    const buttons = screen.getAllByRole('button', { name: /^Import$/ });
    expect(buttons[0]).not.toBeDisabled();
  });

  it('has Markdown and CSV format buttons', () => {
    render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    expect(screen.getAllByRole('button', { name: /Markdown/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /CSV/ }).length).toBeGreaterThan(0);
  });

  it('calls onClose when backdrop clicked', () => {
    const { container } = render(
      React.createElement(RequirementImport, { projectId: 'proj-1', onClose, onImported })
    );
    const backdrops = container.querySelectorAll('.absolute.inset-0');
    if (backdrops.length) fireEvent.click(backdrops[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

import { AutosaveTextField } from '../AutosaveTextField';

describe('AutosaveTextField', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the typed draft when the parent rerenders with the old value', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();

    const { rerender } = render(
      React.createElement(AutosaveTextField, {
        value: 'Original',
        onSave,
        placeholder: 'Title',
      }),
    );

    const input = screen.getByPlaceholderText('Title') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'AB' } });

    rerender(
      React.createElement(AutosaveTextField, {
        value: 'Original',
        onSave,
        placeholder: 'Title',
      }),
    );

    expect((screen.getByPlaceholderText('Title') as HTMLInputElement).value).toBe('AB');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSave).toHaveBeenCalledWith('AB');
  });

  it('syncs back to the parent value after blur', () => {
    const onSave = vi.fn();

    const { rerender } = render(
      React.createElement(AutosaveTextField, {
        value: 'Original',
        onSave,
        placeholder: 'Title',
      }),
    );

    const input = screen.getByPlaceholderText('Title') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Typed' } });
    fireEvent.blur(input);

    rerender(
      React.createElement(AutosaveTextField, {
        value: 'Saved',
        onSave,
        placeholder: 'Title',
      }),
    );

    expect((screen.getByPlaceholderText('Title') as HTMLInputElement).value).toBe('Saved');
  });
});

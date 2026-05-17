import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { AssertionEditor } from '../AssertionEditor';
import type { StepAssertion } from '@/shared/types';

function makeAssertions(): StepAssertion[] {
  return [
    {
      id: 'assert-1',
      source: 'API_BODY_JSON',
      operator: 'EQUALS',
      expectedValue: 'Old expected',
      expression: 'Old expression',
      message: 'Old message',
      flags: 'i',
    },
  ];
}

afterEach(() => {
  cleanup();
});

describe('AssertionEditor', () => {
  it('keeps the expression draft when the parent rerenders with old data', () => {
    const onChange = vi.fn();
    const assertions = makeAssertions();

    const { rerender } = render(
      React.createElement(AssertionEditor, {
        assertions,
        onChange,
        isApiStep: true,
      }),
    );

    const input = screen.getByPlaceholderText('$.data.id') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Typed expression' } });

    rerender(
      React.createElement(AssertionEditor, {
        assertions,
        onChange,
        isApiStep: true,
      }),
    );

    expect((screen.getByPlaceholderText('$.data.id') as HTMLInputElement).value).toBe('Typed expression');
  });
});

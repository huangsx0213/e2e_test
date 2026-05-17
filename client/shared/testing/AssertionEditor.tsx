import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { StepAssertion, AssertionSource, AssertionOperator } from '@/shared/types';
import { generateId } from '../utils';
import { AutosaveTextField } from './AutosaveTextField';

interface AssertionEditorProps {
  assertions: StepAssertion[];
  onChange: (assertions: StepAssertion[]) => void;
  isApiStep: boolean;
}

const API_SOURCES: { value: AssertionSource; label: string }[] = [
  { value: 'API_BODY_JSON', label: 'JSON Body' },
  { value: 'API_BODY_XML', label: 'XML Body' },
  { value: 'API_BODY_REGEX', label: 'Body Regex' },
  { value: 'API_STATUS', label: 'Status Code' },
  { value: 'API_HEADER', label: 'Header' },
  { value: 'API_DURATION', label: 'Duration (ms)' },
];

const UI_SOURCES: { value: AssertionSource; label: string }[] = [
  { value: 'UI_TEXT', label: 'Element Text' },
  { value: 'UI_VALUE', label: 'Input Value' },
  { value: 'UI_ATTRIBUTE', label: 'Attribute' },
  { value: 'UI_PAGE_URL', label: 'Page URL' },
  { value: 'UI_PAGE_TITLE', label: 'Page Title' },
  { value: 'UI_ELEMENT_COUNT', label: 'Element Count' },
  { value: 'UI_ELEMENT_VISIBLE', label: 'Is Visible' },
  { value: 'UI_ELEMENT_ENABLED', label: 'Is Enabled' },
  { value: 'UI_ELEMENT_CHECKED', label: 'Is Checked' },
];

type SourceGroup = 'api' | 'ui';

const OPERATORS_BY_SOURCE: Record<SourceGroup, { value: AssertionOperator; label: string }[]> = {
  api: [
    { value: 'EQUALS', label: 'Equals' },
    { value: 'NOT_EQUALS', label: 'Not Equals' },
    { value: 'CONTAINS', label: 'Contains' },
    { value: 'NOT_CONTAINS', label: 'Not Contains' },
    { value: 'EXISTS', label: 'Exists' },
    { value: 'NOT_EXISTS', label: 'Not Exists' },
    { value: 'MATCHES_REGEX', label: 'Matches Regex' },
    { value: 'GREATER_THAN', label: 'Greater Than' },
    { value: 'LESS_THAN', label: 'Less Than' },
    { value: 'GREATER_THAN_OR_EQUAL', label: '≥ (Greater/Equal)' },
    { value: 'LESS_THAN_OR_EQUAL', label: '≤ (Less/Equal)' },
    { value: 'IS_TYPE', label: 'Is Type' },
    { value: 'HAS_LENGTH', label: 'Has Length' },
    { value: 'CONTAINS_KEY', label: 'Contains Key' },
    { value: 'MATCHES_JSON_SCHEMA', label: 'JSON Schema' },
    { value: 'LESS_THAN_DURATION', label: '< Duration (ms)' },
    { value: 'GREATER_THAN_DURATION', label: '> Duration (ms)' },
  ],
  ui: [
    { value: 'EQUALS', label: 'Equals' },
    { value: 'NOT_EQUALS', label: 'Not Equals' },
    { value: 'CONTAINS', label: 'Contains' },
    { value: 'NOT_CONTAINS', label: 'Not Contains' },
    { value: 'EXISTS', label: 'Exists' },
    { value: 'NOT_EXISTS', label: 'Not Exists' },
    { value: 'MATCHES_REGEX', label: 'Matches Regex' },
    { value: 'GREATER_THAN', label: 'Greater Than' },
    { value: 'LESS_THAN', label: 'Less Than' },
    { value: 'GREATER_THAN_OR_EQUAL', label: '≥ (Greater/Equal)' },
    { value: 'LESS_THAN_OR_EQUAL', label: '≤ (Less/Equal)' },
    { value: 'IS_TYPE', label: 'Is Type' },
    { value: 'HAS_LENGTH', label: 'Has Length' },
  ],
};

function getSourceGroup(source: AssertionSource): SourceGroup {
  return source.startsWith('API_') ? 'api' : 'ui';
}

const NO_EXPECTED_OPERATORS = new Set<AssertionOperator>(['EXISTS', 'NOT_EXISTS']);

function needsExpression(source: AssertionSource): boolean {
  return !['API_STATUS', 'API_DURATION', 'UI_TEXT', 'UI_VALUE', 'UI_PAGE_URL', 'UI_PAGE_TITLE', 'UI_ELEMENT_COUNT', 'UI_ELEMENT_VISIBLE', 'UI_ELEMENT_ENABLED', 'UI_ELEMENT_CHECKED'].includes(source);
}

function expressionPlaceholder(source: AssertionSource): string {
  switch (source) {
    case 'API_BODY_JSON': return "$.data.id";
    case 'API_BODY_XML': return "$.root.user.name";
    case 'API_BODY_REGEX': return "(?<=status: )\\d+";
    case 'API_HEADER': return 'Content-Type';
    case 'UI_ATTRIBUTE': return 'href, src, class…';
    default: return 'Expression';
  }
}

function expectedPlaceholder(operator: AssertionOperator): string {
  switch (operator) {
    case 'IS_TYPE': return 'string, number, array, object…';
    case 'HAS_LENGTH': return '3';
    case 'CONTAINS_KEY': return 'keyName';
    case 'MATCHES_JSON_SCHEMA': return '{"type":"object","required":["id"]}';
    case 'LESS_THAN_DURATION': return '500';
    case 'GREATER_THAN_DURATION': return '100';
    case 'MATCHES_REGEX': return '^\\d+$';
    default: return 'Expected Value';
  }
}

export function AssertionEditor({ assertions, onChange, isApiStep }: AssertionEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const allSources = isApiStep ? API_SOURCES : UI_SOURCES;

  const handleAdd = () => {
    const defaultSource: AssertionSource = isApiStep ? 'API_BODY_JSON' : 'UI_TEXT';
    const newAssertion: StepAssertion = {
      id: generateId(),
      source: defaultSource,
      operator: 'EQUALS',
      expectedValue: '',
      expression: '',
    };
    onChange([...assertions, newAssertion]);
  };

  const handleUpdate = (index: number, updates: Partial<StepAssertion>) => {
    const newAssertions = [...assertions];
    const current = newAssertions[index];
    const updated = { ...current, ...updates };

    if (updates.source && updates.source !== current.source) {
      const newGroup = getSourceGroup(updates.source);
      const availableOps = OPERATORS_BY_SOURCE[newGroup].map(o => o.value);
      if (!availableOps.includes(updated.operator)) {
        updated.operator = 'EQUALS';
      }
    }

    newAssertions[index] = updated;
    onChange(newAssertions);
  };

  const handleRemove = (index: number) => {
    const newAssertions = [...assertions];
    newAssertions.splice(index, 1);
    onChange(newAssertions);
  };

  return (
    <div className="w-full">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span>{isApiStep ? 'API' : 'UI'} Assertions</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleAdd(); }}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <Plus size={10} /> Add Assertion
        </button>
      </div>

      {assertions.length > 0 && (
        <div className="space-y-2">
          {assertions.map((assertion, idx) => {
            const group = getSourceGroup(assertion.source);
            const availableOperators = OPERATORS_BY_SOURCE[group];
            const showExpression = needsExpression(assertion.source);
            const showExpected = !NO_EXPECTED_OPERATORS.has(assertion.operator);
            const isExpanded = expandedIndex === idx;

            return (
        <div key={assertion.id} className="bg-gray-50 p-1.5 rounded border border-gray-200">
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            className="shrink-0 w-28 text-xs border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-blue-500 bg-white"
            value={assertion.source}
            onChange={(e) => handleUpdate(idx, { source: e.target.value as AssertionSource })}
          >
            {allSources.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {showExpression && (
            <AutosaveTextField
              className="flex-1 min-w-[60px] text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
              placeholder={expressionPlaceholder(assertion.source)}
              value={assertion.expression || ''}
              onSave={(next) => handleUpdate(idx, { expression: next })}
            />
          )}

          <select
            className="shrink-0 w-28 text-xs border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-blue-500 bg-white"
            value={assertion.operator}
            onChange={(e) => handleUpdate(idx, { operator: e.target.value as AssertionOperator })}
          >
            {availableOperators.map(op => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>

          {showExpected && (
            <AutosaveTextField
              className="flex-1 min-w-[60px] text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
              placeholder={expectedPlaceholder(assertion.operator)}
              value={assertion.expectedValue || ''}
              onSave={(next) => handleUpdate(idx, { expectedValue: next })}
            />
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setExpandedIndex(isExpanded ? null : idx); }}
            className="shrink-0 text-gray-400 hover:text-gray-600 p-1"
            title="Advanced options"
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
            className="shrink-0 text-gray-400 hover:text-red-500 p-1"
          >
            <Trash2 size={12} />
          </button>
        </div>

                {isExpanded && (
                  <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-200">
                    <AutosaveTextField
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                      placeholder="Custom message (optional)"
                      value={assertion.message || ''}
                      onSave={(next) => handleUpdate(idx, { message: next })}
                    />
                    <AutosaveTextField
                      className="w-20 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                      placeholder="Flags (e.g. i)"
                      value={assertion.flags || ''}
                      onSave={(next) => handleUpdate(idx, { flags: next })}
                    />
                    <label className="flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={assertion.continueOnFailure || false}
                        onChange={(e) => handleUpdate(idx, { continueOnFailure: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Continue
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

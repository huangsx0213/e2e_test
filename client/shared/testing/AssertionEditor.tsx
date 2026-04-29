import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { StepAssertion, AssertionSource, AssertionOperator } from '@/shared/types';
import { generateId } from '../utils';

interface AssertionEditorProps {
  assertions: StepAssertion[];
  onChange: (assertions: StepAssertion[]) => void;
  isApiStep: boolean;
}

export function AssertionEditor({ assertions, onChange, isApiStep }: AssertionEditorProps) {
  const handleAdd = () => {
    const newAssertion: StepAssertion = {
      id: generateId(),
      source: 'API_BODY_JSON',
      operator: 'EQUALS',
      expectedValue: '',
      expression: '',
    };
    onChange([...assertions, newAssertion]);
  };

  const handleUpdate = (index: number, updates: Partial<StepAssertion>) => {
    const newAssertions = [...assertions];
    newAssertions[index] = { ...newAssertions[index], ...updates };
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
          <span>API Assertions</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAdd();
          }}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <Plus size={10} /> Add Assertion
        </button>
      </div>
      
      {assertions.length > 0 && (
        <div className="space-y-2">
          {assertions.map((assertion, idx) => (
            <div key={assertion.id} className="flex items-center gap-2 bg-gray-50 p-1.5 rounded border border-gray-200">
              <select
                className="w-36 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500 bg-white"
                value={assertion.source}
                onChange={(e) => handleUpdate(idx, { source: e.target.value as AssertionSource })}
              >
                <option value="API_BODY_JSON">JSON Body</option>
                <option value="API_BODY_XML">XML Body</option>
                <option value="API_STATUS">Status Code</option>
                <option value="API_HEADER">Header</option>
              </select>
              
              {assertion.source !== 'API_STATUS' && (
                <input
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                  placeholder={(assertion.source === 'API_BODY_JSON' || assertion.source === 'API_BODY_XML') ? '$.data.id (or $.user[\'@_id\'])' : assertion.source === 'API_HEADER' ? 'Content-Type' : 'Expression'}
                  value={assertion.expression || ''}
                  onChange={(e) => handleUpdate(idx, { expression: e.target.value })}
                />
              )}

              <select
                className="w-32 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500 bg-white"
                value={assertion.operator}
                onChange={(e) => handleUpdate(idx, { operator: e.target.value as AssertionOperator })}
              >
                <option value="EQUALS">Equals</option>
                <option value="NOT_EQUALS">Not Equals</option>
                <option value="CONTAINS">Contains</option>
                <option value="NOT_CONTAINS">Not Contains</option>
                <option value="EXISTS">Exists</option>
                <option value="NOT_EXISTS">Not Exists</option>
                <option value="MATCHES_REGEX">Matches Regex</option>
              </select>
              
              {!['EXISTS', 'NOT_EXISTS'].includes(assertion.operator) && (
                <input
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                  placeholder="Expected Value"
                  value={assertion.expectedValue || ''}
                  onChange={(e) => handleUpdate(idx, { expectedValue: e.target.value })}
                />
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(idx);
                }}
                className="text-gray-400 hover:text-red-500 p-1"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

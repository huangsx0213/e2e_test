import React from 'react';
import { BookOpen, Shield, Zap, Workflow, Database, Layers, Info, CheckCircle2 } from 'lucide-react';

export const Documentation: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <BookOpen size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">System Documentation</h1>
        </div>
        <p className="text-slate-500 max-w-3xl">
          Welcome to the Quantum QA documentation. This guide covers the core concepts and features of our automated testing platform.
        </p>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto w-full p-8 space-y-12 pb-24">
        
        {/* Data Lifecycle Management Section */}
        <section id="data-lifecycle" className="space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <Zap className="text-blue-600" size={20} />
            <h2 className="text-xl font-bold text-slate-800">Data Lifecycle Management (DLM)</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Evaluation strategies define the <strong>Cache Persistence Level</strong> of a dynamic expression. This ensures data consistency across different architectural boundaries of your test execution.
          </p>
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Strategy</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Cache Lifecycle</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Best Use Case</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900">Every Time</td>
                  <td className="px-4 py-3 text-slate-600">None (Real-time)</td>
                  <td className="px-4 py-3 text-slate-500 italic">OTPs, unique nonces, dynamic timestamps.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900">Once Per Case</td>
                  <td className="px-4 py-3 text-slate-600">Current Case execution</td>
                  <td className="px-4 py-3 text-slate-500 italic">Sharing a random name between input and validation steps.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900">Once Per Suite</td>
                  <td className="px-4 py-3 text-slate-600">Current Suite execution</td>
                  <td className="px-4 py-3 text-slate-500 italic">Batch IDs shared across all tests in an "Order Suite".</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900">Once Per Scenario</td>
                  <td className="px-4 py-3 text-slate-600">Current Scenario execution</td>
                  <td className="px-4 py-3 text-slate-500 italic">A "New User ID" created in Signup and used in Checkout.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900">Once Per Run</td>
                  <td className="px-4 py-3 text-slate-600">Global Task execution</td>
                  <td className="px-4 py-3 text-slate-500 italic">Execution UUIDs, environment-wide session tokens.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Variable System Section */}
        <section id="variable-system" className="space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <Database className="text-blue-600" size={20} />
            <h2 className="text-xl font-bold text-slate-800">Variable System</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Layers size={18} className="text-blue-500" />
                Variable Scopes
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Variables can be stored in four different scopes, prioritized from highest to lowest:
              </p>
              <ul className="space-y-2">
                <li className="flex gap-2 text-sm">
                  <span className="font-bold text-blue-600 min-w-[100px]">CASE:</span>
                  <span className="text-slate-600">Valid only within the current test case. Cleared after execution.</span>
                </li>
                <li className="flex gap-2 text-sm">
                  <span className="font-bold text-blue-600 min-w-[100px]">SUITE:</span>
                  <span className="text-slate-600">Shared across all test cases within the same suite.</span>
                </li>
                <li className="flex gap-2 text-sm">
                  <span className="font-bold text-blue-600 min-w-[100px]">SCENARIO:</span>
                  <span className="text-slate-600">Shared across all suites within a scenario run.</span>
                </li>
                <li className="flex gap-2 text-sm">
                  <span className="font-bold text-blue-600 min-w-[100px]">ENVIRONMENT:</span>
                  <span className="text-slate-600">Global variables defined in the environment settings.</span>
                </li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Shield size={18} className="text-blue-500" />
                Auto-Namespacing
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                To prevent conflicts between different test cases or suites, the system automatically prefixes runtime variables:
              </p>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-blue-300 space-y-1">
                <div>// Case-level variable</div>
                <div className="text-white">login.token</div>
                <div className="mt-2 text-slate-500">// Suite-level variable</div>
                <div className="text-white">auth_suite.session_id</div>
              </div>
              <p className="text-xs text-slate-500 italic">
                Note: You can still access variables by their original name, but prefixes allow explicit referencing.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Workflow size={18} className="text-blue-500" />
              Module Namespacing (RUN_MODULE)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  When using the <code className="bg-slate-100 px-1 rounded text-blue-600">RUN_MODULE</code> step, you can specify a <strong>Namespace</strong> (export alias).
                </p>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-sm text-blue-800">
                  <strong>Example:</strong> If you call a module with namespace <code className="font-bold">buyer</code>, a variable <code className="font-bold">userId</code> extracted inside that module will be returned as <code className="font-bold">buyer.userId</code>.
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  This solves variable collision issues when the same module is called multiple times in a single scenario (e.g., creating multiple users).
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Zap size={18} className="text-blue-500" />
                Dynamic Variable Strategy
              </div>
              <p className="text-sm text-slate-600">
                Configure how dynamic expressions are cached:
              </p>
              <ul className="space-y-3">
                <li className="text-sm">
                  <span className="font-bold block text-slate-800">Every Time (Default)</span>
                  <span className="text-slate-500 text-xs">Re-evaluated on every reference.</span>
                </li>
                <li className="text-sm">
                  <span className="font-bold block text-slate-800">Once Per Case/Suite/Scenario/Run</span>
                  <span className="text-slate-500 text-xs">Cached at the specified boundary level to ensure data stability.</span>
                </li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Info size={18} className="text-blue-500" />
                Pipe Assignment & Hybrid Extraction
              </div>
              <p className="text-sm text-slate-600">
                Persist dynamic values or API responses directly:
              </p>
              <ul className="space-y-2">
                <li className="text-xs text-slate-600">
                  <span className="font-mono text-blue-600">{"{{$generator() | set('var_name', 'scope')}}"}</span> - Pipe assignment.
                </li>
                <li className="text-xs text-slate-600">
                  <strong>Smart Wait:</strong> Enable "Wait for API Response" in UI steps to extract data from background network traffic.
                </li>
              </ul>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-[11px] text-amber-800">
                <strong>Default Scope:</strong> Both <code className="font-bold">set</code> pipe and Smart Wait extractors default to the <code className="font-bold">CASE</code> scope.
              </div>
            </div>
          </div>
        </section>

        {/* Best Practices Section */}
        <section className="bg-slate-900 rounded-2xl p-8 text-white space-y-6">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <CheckCircle2 className="text-emerald-400" size={20} />
            <h2 className="text-xl font-bold">Best Practices</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <h3 className="font-semibold text-emerald-400">Prefer CASE Scope</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Keep your context clean. Only use SUITE or SCENARIO scopes if the variable truly needs to be shared across multiple test cases.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-emerald-400">Use Namespaces</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Always set a clear Namespace for RUN_MODULE steps to ensure robustness and readability in complex flows.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-emerald-400">Freeze Random Values</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                If a random ID needs to be used across multiple steps (e.g., Create &rarr; Query), use the 'Once Per Run' strategy or the 'set' pipe to freeze it.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

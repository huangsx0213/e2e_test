import React from 'react';
import { BookOpen, Shield, Zap, Workflow, Database, Layers, Info, CheckCircle2, Radio, Globe, Target, Server, Terminal, Cpu, Download, GitBranch, Activity } from 'lucide-react';

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

        {/* Recording Engine Section */}
        <section id="recording-engine" className="space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <Radio className="text-blue-600" size={20} />
            <h2 className="text-xl font-bold text-slate-800">Unified Recording Engine</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Globe size={18} className="text-indigo-500" />
                API Recording
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automatically capture network traffic and convert it into portable test assets.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Environment-Aware:</strong> Maps origins to environment-keyed Base URLs.</span>
                </li>
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Intelligent Merging:</strong> Updates existing endpoints instead of duplicates.</span>
                </li>
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Auto-Sanitization:</strong> Strips browser noise (UA,指纹) from headers.</span>
                </li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Layers size={18} className="text-emerald-500" />
                UI Recording
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record user interactions with smart locator generation and real-time validation.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Smart Locators:</strong> Uses Role &gt; TestID &gt; Text content hierarchy.</span>
                </li>
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Visual Pulse:</strong> Real-time browser feedback for validated elements.</span>
                </li>
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Live Sync:</strong> Steps appear in TestBuilder via WebSocket broadcast.</span>
                </li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Target size={18} className="text-amber-500" />
                Element Repository
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Centralized management for UI locators, enabling high reusability and self-healing.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Multi-Point Locators:</strong> Stores multiple candidates for every element.</span>
                </li>
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Self-Healing:</strong> Runtime fallback if primary locator fails.</span>
                </li>
                <li className="flex items-start gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5" />
                  <span><strong>Project Scope:</strong> Shared repository across all suites in a project.</span>
                </li>
              </ul>
            </div>
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

        {/* Remote Agent Section */}
        <section id="remote-agents" className="space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <Server className="text-blue-600" size={20} />
            <h2 className="text-xl font-bold text-slate-800">Remote Agent</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Remote Agents are lightweight execution nodes that connect to the QuantumQA server over a persistent <strong>WebSocket</strong> connection.
            They receive test tasks, run them locally (with full browser and API support), and stream real-time logs and results back to the dashboard.
            This enables <strong>distributed and parallel test execution</strong> across any number of machines.
          </p>

          {/* Architecture overview */}
          <div className="bg-slate-900 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch size={16} className="text-blue-400" />
              <span className="text-sm font-bold text-white">Communication Architecture</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-800 rounded-lg p-4 space-y-2 border border-slate-700">
                <div className="text-blue-400 font-bold">① Register</div>
                <div className="text-slate-300">Agent connects and sends <span className="text-amber-300">AGENT_REGISTER</span> with its ID and platform info.</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 space-y-2 border border-slate-700">
                <div className="text-blue-400 font-bold">② Dispatch</div>
                <div className="text-slate-300">Server sends <span className="text-amber-300">TASK_DISPATCH</span>. Agent queues it and begins execution immediately.</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 space-y-2 border border-slate-700">
                <div className="text-blue-400 font-bold">③ Stream</div>
                <div className="text-slate-300">Agent streams <span className="text-amber-300">LOG_STREAM</span>, <span className="text-amber-300">PROGRESS_STREAM</span>, and <span className="text-amber-300">EXECUTION_COMPLETE</span> events back in real-time.</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 italic">Heartbeats are sent every 15 seconds to report idle/busy status. On disconnect, the agent auto-reconnects in 5 seconds.</div>
          </div>

          {/* Task Types & Lifecycle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Cpu size={18} className="text-indigo-500" />
                Supported Task Types
              </div>
              <p className="text-xs text-slate-600">Agents can execute all QuantumQA execution scopes:</p>
              <div className="space-y-2">
                {[
                  { type: 'case', desc: 'Runs a single test case end-to-end.' },
                  { type: 'suite', desc: 'Runs all cases in a test suite including setup/teardown.' },
                  { type: 'scenario', desc: 'Executes a multi-suite business flow, supports data-driven rows.' },
                  { type: 'plan', desc: 'Orchestrates a full test plan across multiple scenarios.' },
                ].map(({ type, desc }) => (
                  <div key={type} className="flex items-start gap-3">
                    <span className="mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 rounded font-mono shrink-0">{type}</span>
                    <span className="text-xs text-slate-600">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Activity size={18} className="text-emerald-500" />
                Agent Lifecycle States
              </div>
              <div className="space-y-2">
                {[
                  { status: 'idle', color: 'bg-green-100 text-green-700', desc: 'Connected and waiting for tasks.' },
                  { status: 'busy', color: 'bg-amber-100 text-amber-700', desc: 'Actively executing a queued task.' },
                  { status: 'offline', color: 'bg-slate-100 text-slate-500', desc: 'Connection lost; will auto-reconnect.' },
                  { status: 'disabled', color: 'bg-red-50 text-red-600', desc: 'Manually paused by an operator. Will not accept new tasks.' },
                ].map(({ status, color, desc }) => (
                  <div key={status} className="flex items-start gap-3">
                    <span className={`mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded ${color} shrink-0`}>{status}</span>
                    <span className="text-xs text-slate-600">{desc}</span>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded p-3 text-[11px] text-blue-800">
                <strong>Task Queue:</strong> While busy, the agent continues to accept incoming tasks into its local queue, ensuring no dispatched task is lost.
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Shield size={18} className="text-blue-500" />
              Configuration Reference
            </div>
            <p className="text-xs text-slate-600">The agent supports three configuration methods, resolved in this priority order: CLI Args &gt; Environment Variables &gt; <code className="bg-slate-100 px-1 rounded">agent-config.json</code> (for pre-packaged bundles).</p>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Setting</th>
                    <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">CLI Arg</th>
                    <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Env Variable</th>
                    <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Default</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">Server URL</td>
                    <td className="px-4 py-2.5 font-mono text-blue-600">--url</td>
                    <td className="px-4 py-2.5 font-mono text-blue-600">SERVER_URL</td>
                    <td className="px-4 py-2.5 text-slate-500">ws://localhost:3000</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">Agent ID</td>
                    <td className="px-4 py-2.5 font-mono text-blue-600">--name</td>
                    <td className="px-4 py-2.5 font-mono text-blue-600">AGENT_ID</td>
                    <td className="px-4 py-2.5 text-slate-500">agent-{'{random}'}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">Auth Secret</td>
                    <td className="px-4 py-2.5 text-slate-400">—</td>
                    <td className="px-4 py-2.5 font-mono text-blue-600">AGENT_SECRET</td>
                    <td className="px-4 py-2.5 text-slate-500">(empty)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Console & Quick Start */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Terminal size={18} className="text-green-600" />
                Live Console
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Each agent row in the <strong>Remote Agents</strong> panel has a <strong>Terminal</strong> button that opens a real-time log stream (via Server-Sent Events).
              </p>
              <ul className="space-y-2">
                {[
                  'All console output (info, warn, error) is forwarded from the agent to the server.',
                  'Color-coded by log level and execution phase.',
                  'Capped at 1,000 lines (oldest lines are pruned automatically).',
                  'Connection state shown with a live pulse indicator.',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-slate-500">
                    <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900 p-6 rounded-xl space-y-3">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Download size={18} className="text-blue-400" />
                Quick Start
              </div>
              <p className="text-[11px] text-slate-400">Download the pre-configured agent bundle from the Remote Agents page, or run manually:</p>
              <div className="space-y-1 font-mono text-xs">
                <div className="text-slate-500"># 1. Install dependencies</div>
                <div className="text-blue-400">npm install</div>
                <div className="text-slate-500 mt-2"># 2. Start the agent</div>
                <div className="text-green-400">npm run start-agent -- --url ws://&lt;host&gt;:3000 --name my-node</div>
                <div className="text-slate-500 mt-2"># 3. Or use .env in the /agent directory</div>
                <div className="text-slate-300">SERVER_URL=ws://&lt;host&gt;:3000</div>
                <div className="text-slate-300">AGENT_ID=my-node</div>
                <div className="text-slate-300">AGENT_SECRET=your_secret</div>
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

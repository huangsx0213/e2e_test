import React from "react";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";

const AC_FORMAT_CONTENT = (
  <div className="space-y-1.5">
    <div className="font-semibold">AC format (recommended):</div>
    <div className="font-mono text-[11px] leading-relaxed">
      <div>Given &lt;precondition&gt;</div>
      <div>When &lt;action&gt;</div>
      <div>Then &lt;observable result&gt;</div>
    </div>
    <div className="text-slate-300 text-[10.5px] pt-1 border-t border-slate-600 mt-1.5">
      Checklists, free-form prose, and plain Markdown are also supported.
      A soft warning appears if no segments are detected.
    </div>
  </div>
);

const FLOW_SCENARIO_CONTENT = (
  <div className="space-y-1.5">
    <div className="font-semibold">Scenario format (recommended):</div>
    <div className="font-mono text-[11px] leading-relaxed">
      <div>Given / When / Then = one path (happy/alternate/exception).</div>
      <div>Each AC = one path.</div>
    </div>
    <div className="text-slate-300 text-[10.5px] pt-1 border-t border-slate-600 mt-1.5">
      A soft warning appears if no segments are detected.
    </div>
  </div>
);

export function ACFormatHelpTooltip({ isFlow = false }: { isFlow?: boolean }) {
  return (
    <HelpTooltip
      content={isFlow ? FLOW_SCENARIO_CONTENT : AC_FORMAT_CONTENT}
      maxWidthClass="max-w-xs"
    />
  );
}

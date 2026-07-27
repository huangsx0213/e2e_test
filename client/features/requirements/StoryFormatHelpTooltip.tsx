import React from "react";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";

const STORY_FORMAT_CONTENT = (
  <div className="space-y-1.5">
    <div className="font-semibold">Story format (recommended):</div>
    <div className="font-mono text-[11px] leading-relaxed">
      <div>As a &lt;role&gt;</div>
      <div>I want &lt;action&gt;</div>
      <div>So that &lt;value&gt;</div>
    </div>
    <div className="text-slate-300 text-[10.5px] pt-1 border-t border-slate-600 mt-1.5">
      Free-form prose and plain Markdown are also supported.
      A soft warning appears if no segments are detected.
    </div>
  </div>
);

export function StoryFormatHelpTooltip() {
  return <HelpTooltip content={STORY_FORMAT_CONTENT} maxWidthClass="max-w-xs" />;
}

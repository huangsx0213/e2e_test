import React from 'react';

interface AiPipelinePageProps {
  currentProjectId: string | null;
}

export function AiPipelinePage({ currentProjectId }: AiPipelinePageProps) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">AI Pipeline</h1>
      <p className="text-gray-500">Start an AI pipeline run to generate test cases from requirements.</p>
    </div>
  );
}
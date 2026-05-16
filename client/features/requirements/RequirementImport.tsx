import React, { useState } from 'react';

interface Props { projectId: string; onClose: () => void; onImported: () => void; }

export function RequirementImport({ projectId, onClose, onImported }: Props) {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'markdown' | 'csv'>('markdown');
  const handleImport = async () => {
    const res = await fetch(`/api/requirements/${projectId}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, format }) });
    const data = await res.json();
    alert(`Imported ${data.imported} requirements`);
    onImported(); onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded p-6 w-96">
        <h2 className="text-lg font-semibold mb-3">Import Requirements</h2>
        <div className="mb-2"><label className="block text-sm font-medium mb-1">Format</label><select value={format} onChange={e => setFormat(e.target.value as any)} className="w-full border rounded px-2 py-1 text-sm"><option value="markdown">Markdown</option><option value="csv">CSV</option></select></div>
        <div className="mb-3"><label className="block text-sm font-medium mb-1">Content</label><textarea value={content} onChange={e => setContent(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" rows={8} placeholder={format === 'markdown' ? '# Feature\n## Story\n### AC' : 'title,description,parent_title,priority'} /></div>
        <div className="flex gap-2 justify-end"><button onClick={onClose} className="px-3 py-1 bg-gray-300 rounded text-sm">Cancel</button><button onClick={handleImport} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Import</button></div>
      </div>
    </div>
  );
}
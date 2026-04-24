import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { BookOpen, Layers, Menu, ChevronRight, Maximize2, X } from 'lucide-react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

const MermaidDiagram = ({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);
  const id = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        const { svg } = await mermaid.render(id, chart);
        if (isMounted) setSvg(svg);
      } catch (e) {
        console.error('Mermaid rendering error:', e);
        if (isMounted) setSvg(`<div class="text-red-500 p-4 border border-red-200 rounded bg-red-50">Error rendering diagram</div>`);
      }
    };
    renderChart();
    return () => { isMounted = false; };
  }, [chart, id]);

  return (
    <>
      <div className="relative group flex justify-center my-8 p-6 border border-slate-200 rounded-xl bg-white hover:shadow-md transition-all">
        <div dangerouslySetInnerHTML={{ __html: svg }} className="overflow-x-auto w-full flex justify-center [&>svg]:!max-w-full [&>svg]:!h-auto" />
        {svg && !svg.includes('Error') && (
          <button 
            onClick={() => setIsExpanded(true)}
            className="absolute top-3 right-3 p-2 bg-white border border-slate-200 rounded-lg text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50 hover:text-blue-600 shadow-sm"
            title="View Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        )}
      </div>

      {isExpanded && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 md:p-8" 
          onClick={() => setIsExpanded(false)}
        >
          <div 
            className="relative bg-white rounded-2xl w-full h-full flex flex-col shadow-2xl overflow-hidden" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">Architecture Diagram</h3>
              <button 
                onClick={() => setIsExpanded(false)}
                className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-slate-50">
               {/* 强制放大：通过将宽度设置为极大的像素值，强迫 SVG 基于 viewBox 等比例缩放 */}
               <div 
                 dangerouslySetInnerHTML={{ __html: svg }} 
                 className="flex justify-center [&>svg]:!w-[1600px] [&>svg]:!max-w-[1600px] [&>svg]:!h-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200 mx-auto w-max" 
               />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import userGuideRaw from '../../../docs/01-UserGuide.md?raw';
import architectureRaw from '../../../docs/02-Architecture.md?raw';

interface ToCItem {
  id: string;
  text: string;
  level: number;
}

const extractToC = (md: string): ToCItem[] => {
  const lines = md.split('\n');
  const toc: ToCItem[] = [];
  
  // A simple flag to avoid matching headers inside code blocks
  let inCodeBlock = false;

  lines.forEach(line => {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    
    if (inCodeBlock) return;

    const match = line.match(/^(#{2,3})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      let text = match[2].trim();
      // Remove possible markdown links from ToC text
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      toc.push({ id, text, level });
    }
  });
  return toc;
};

const renderers = {
  h2: ({ node, children, ...props }: any) => {
    const text = String(children).replace(/\n/g, '');
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return <h2 id={id} className="text-2xl font-bold mt-10 mb-4 pb-2 border-b border-slate-200 text-slate-800" {...props}>{children}</h2>;
  },
  h3: ({ node, children, ...props }: any) => {
    const text = String(children).replace(/\n/g, '');
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return <h3 id={id} className="text-xl font-bold mt-8 mb-3 text-slate-800" {...props}>{children}</h3>;
  },
  h1: ({ node, children, ...props }: any) => (
    <h1 className="text-3xl font-extrabold mb-6 text-slate-900" {...props}>{children}</h1>
  ),
  p: ({ node, children, ...props }: any) => (
    <p className="text-slate-600 leading-relaxed mb-4" {...props}>{children}</p>
  ),
  ul: ({ node, children, ...props }: any) => (
    <ul className="list-disc list-outside ml-6 mb-4 space-y-2 text-slate-600" {...props}>{children}</ul>
  ),
  ol: ({ node, children, ...props }: any) => (
    <ol className="list-decimal list-outside ml-6 mb-4 space-y-2 text-slate-600" {...props}>{children}</ol>
  ),
  li: ({ node, children, ...props }: any) => (
    <li {...props}>{children}</li>
  ),
  a: ({ node, children, ...props }: any) => (
    <a className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  ),
  blockquote: ({ node, children, ...props }: any) => (
    <blockquote className="border-l-4 border-slate-300 pl-4 py-1 italic text-slate-500 mb-4 bg-slate-50 rounded-r" {...props}>{children}</blockquote>
  ),
  table: ({ node, children, ...props }: any) => (
    <div className="overflow-x-auto mb-6 border border-slate-200 rounded-lg shadow-sm">
      <table className="w-full text-left border-collapse text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ node, children, ...props }: any) => (
    <thead className="bg-slate-50 border-b border-slate-200" {...props}>{children}</thead>
  ),
  th: ({ node, children, ...props }: any) => (
    <th className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap" {...props}>{children}</th>
  ),
  td: ({ node, children, ...props }: any) => (
    <td className="px-4 py-3 text-slate-600 border-b border-slate-100" {...props}>{children}</td>
  ),
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match && match[1] === 'mermaid') {
      return <MermaidDiagram chart={String(children)} />;
    }
    return !inline && match ? (
      <SyntaxHighlighter
        style={vscDarkPlus as any}
        language={match[1]}
        PreTag="div"
        className="rounded-lg mb-4 text-sm"
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className="bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    );
  }
};

type DocId = 'user-guide' | 'architecture';

export const Documentation: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState<DocId>('user-guide');
  
  const content = activeDoc === 'user-guide' ? userGuideRaw : architectureRaw;
  const title = activeDoc === 'user-guide' ? 'User Guide' : 'Architecture';
  const Icon = activeDoc === 'user-guide' ? BookOpen : Layers;
  
  const toc = useMemo(() => extractToC(content), [content]);

  // Scroll to top when changing documents
  useEffect(() => {
    const container = document.getElementById('docs-content-container');
    if (container) {
      container.scrollTop = 0;
    }
  }, [activeDoc]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    const container = document.getElementById('docs-content-container');
    if (element && container) {
      const topPos = element.offsetTop - 40; // Add some padding
      container.scrollTo({ top: topPos, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      
      {/* Left Sidebar - Navigation */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Menu size={16} className="text-slate-500" />
            Documentation
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <button
            onClick={() => setActiveDoc('user-guide')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeDoc === 'user-guide' 
                ? 'bg-blue-50 text-blue-700 font-semibold' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen size={18} className={activeDoc === 'user-guide' ? 'text-blue-500' : 'text-slate-400'} />
            User Guide
          </button>
          <button
            onClick={() => setActiveDoc('architecture')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeDoc === 'architecture' 
                ? 'bg-blue-50 text-blue-700 font-semibold' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers size={18} className={activeDoc === 'architecture' ? 'text-blue-500' : 'text-slate-400'} />
            Architecture
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Content Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0 z-10 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <Icon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500">QuantumQA Documentation</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto flex" id="docs-content-container">
          <div className="flex-1 max-w-4xl p-8 min-w-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={renderers}
            >
              {content}
            </ReactMarkdown>
            
            {/* Bottom spacer to ensure scrolling reaches past the last item */}
            <div className="h-32 w-full"></div>
          </div>

          {/* Right Sidebar - Table of Contents */}
          {toc.length > 0 && (
            <div className="w-64 shrink-0 border-l border-slate-200 bg-slate-50/50 hidden xl:block">
              <div className="sticky top-0 p-6 h-full overflow-y-auto">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">On this page</h3>
                <nav className="space-y-1 border-l border-slate-200">
                  {toc.map((item, index) => (
                    <button
                      key={`${item.id}-${index}`}
                      onClick={() => scrollToSection(item.id)}
                      className={`block w-full text-left py-1 text-sm hover:text-blue-600 transition-colors ${
                        item.level === 2 
                          ? 'pl-4 text-slate-700 font-medium' 
                          : 'pl-8 text-slate-500'
                      }`}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};


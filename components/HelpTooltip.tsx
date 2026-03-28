import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

export const HelpTooltip = ({ content }: { content: string }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      
      if (spaceAbove < 50) {
        setPosition('bottom');
        setCoords({
          top: rect.bottom + 8,
          left: rect.left + rect.width / 2,
        });
      } else {
        setPosition('top');
        setCoords({
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
        });
      }
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible]);

  return (
    <div 
      className="relative inline-flex items-center justify-center ml-1.5 align-middle"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      ref={triggerRef}
    >
      <HelpCircle size={14} className="text-slate-400 hover:text-blue-500 cursor-help transition-colors" />
      {isVisible && createPortal(
        <div 
          className={`fixed z-[9999] pointer-events-none -translate-x-1/2 w-max max-w-xs ${position === 'top' ? '-translate-y-full' : ''}`}
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="bg-slate-800 text-white text-xs rounded py-1.5 px-2.5 shadow-lg whitespace-normal text-left font-normal tracking-normal normal-case leading-relaxed">
            {content}
          </div>
          <div className={`w-2 h-2 bg-slate-800 transform rotate-45 absolute left-1/2 -translate-x-1/2 ${position === 'top' ? '-bottom-1' : '-top-1'}`}></div>
        </div>,
        document.body
      )}
    </div>
  );
};

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const targetRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    const rect = targetRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 6, left: rect.left });
      setVisible(true);
    }
  };

  const hide = () => setVisible(false);

  return (
    <>
      <span ref={targetRef} onMouseEnter={show} onMouseLeave={hide} className="tooltip-trigger">
        {children}
      </span>
      {visible && createPortal(
        <div className="tooltip-panel" style={{ top: pos.top, left: pos.left }}>
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

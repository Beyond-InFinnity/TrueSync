import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { THEME } from '../theme.js';

// ══════════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL SINGLETON STATE
// ══════════════════════════════════════════════════════════════════════════════

let _setTip = null;

export function showTooltip(element, text) {
  if (_setTip) _setTip({ element, text });
}

export function hideTooltip() {
  if (_setTip) _setTip(null);
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOLTIP COMPONENT — render once at root
// ══════════════════════════════════════════════════════════════════════════════

export default function Tooltip() {
  const [pending, setPending] = useState(null);
  const [active, setActive] = useState(null); // { element, text }
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timerRef = useRef(null);
  const tipRef = useRef(null);

  // Register singleton setter
  useEffect(() => {
    _setTip = (tip) => {
      if (tip) {
        setPending(tip);
      } else {
        clearTimeout(timerRef.current);
        setPending(null);
        setActive(null);
      }
    };
    return () => { _setTip = null; };
  }, []);

  // 500ms delay
  useEffect(() => {
    if (pending) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(pending), 500);
    } else {
      clearTimeout(timerRef.current);
      setActive(null);
    }
    return () => clearTimeout(timerRef.current);
  }, [pending]);

  // Position calculation
  useLayoutEffect(() => {
    if (!active || !tipRef.current) return;
    const rect = active.element.getBoundingClientRect();
    const tipRect = tipRef.current.getBoundingClientRect();
    let top = rect.top - tipRect.height - 6;
    const left = rect.left + rect.width / 2 - tipRect.width / 2;
    // Flip below if too close to top
    if (top < 8) {
      top = rect.bottom + 6;
    }
    setPos({ top, left: Math.max(4, left) });
  }, [active]);

  if (!active) return null;

  return (
    <div ref={tipRef} style={{
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      background: THEME.surface,
      color: THEME.text,
      fontSize: 11,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '4px 10px',
      borderRadius: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      border: `1px solid ${THEME.border}`,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 10000,
    }}>
      {active.text}
    </div>
  );
}

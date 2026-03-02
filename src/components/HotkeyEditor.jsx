import { useEffect, useCallback } from 'react';
import { DEFAULT_HOTKEYS, hotkeyDisplayString } from '../hotkeys.js';
import { THEME } from '../theme.js';

export default function HotkeyEditor({ showHelp, setShowHelp, hotkeys, setHotkeys, rebindingAction, setRebindingAction }) {
  // Listen for key when rebinding
  useEffect(() => {
    if (!rebindingAction) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRebindingAction(null);
        return;
      }
      const newBinding = {
        ...hotkeys[rebindingAction],
        code: e.code,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      };
      setHotkeys(prev => ({ ...prev, [rebindingAction]: newBinding }));
      setRebindingAction(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [rebindingAction, hotkeys, setHotkeys, setRebindingAction]);

  const resetOne = useCallback((action) => {
    setHotkeys(prev => ({ ...prev, [action]: { ...DEFAULT_HOTKEYS[action] } }));
  }, [setHotkeys]);

  const restoreAll = useCallback(() => {
    setHotkeys(JSON.parse(JSON.stringify(DEFAULT_HOTKEYS)));
  }, [setHotkeys]);

  // Detect conflicts
  const getConflicts = useCallback((action) => {
    const binding = hotkeys[action];
    const key = `${binding.ctrl}|${binding.shift}|${binding.code}`;
    const conflicts = [];
    for (const [a, b] of Object.entries(hotkeys)) {
      if (a === action) continue;
      if (`${b.ctrl}|${b.shift}|${b.code}` === key) conflicts.push(b.label);
    }
    return conflicts;
  }, [hotkeys]);

  if (!showHelp) return null;

  const mouseInteractions = [
    ['Ctrl + Scroll', 'Zoom timeline'],
    ['Scroll', 'Pan timeline'],
    ['Click event', 'Select (deselects others)'],
    ['Ctrl + Click', 'Toggle event in selection'],
    ['Shift + Click', 'Range select (time + track)'],
    ['Drag event', 'Move event'],
    ['Drag edge', 'Resize event'],
    ['Right-click event', 'Context menu (master block)'],
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={() => { setShowHelp(false); setRebindingAction(null); }}>
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 32, maxWidth: 560, width: '90vw', maxHeight: '80vh', overflow: 'auto', fontSize: 13, lineHeight: 1.8 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Keyboard Shortcuts</h2>
          <button onClick={restoreAll}
            style={{ padding: '4px 12px', background: THEME.surfaceLight, color: THEME.textDim, border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
            Restore All Defaults
          </button>
        </div>

        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          {Object.entries(hotkeys).map(([action, binding]) => {
            const isRebinding = rebindingAction === action;
            const conflicts = getConflicts(action);
            const isDefault = JSON.stringify(binding) === JSON.stringify(DEFAULT_HOTKEYS[action]);

            return (
              <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <span
                  onClick={() => setRebindingAction(action)}
                  style={{
                    color: isRebinding ? '#fff' : conflicts.length ? '#E57373' : THEME.accent,
                    minWidth: 140, cursor: 'pointer',
                    background: isRebinding ? THEME.accentDim : 'transparent',
                    padding: '1px 6px', borderRadius: 3,
                    border: isRebinding ? `1px solid ${THEME.accent}` : '1px solid transparent',
                  }}>
                  {isRebinding ? 'Press a key...' : hotkeyDisplayString(binding)}
                </span>
                <span style={{ color: THEME.textDim, flex: 1 }}>{binding.label}</span>
                {conflicts.length > 0 && (
                  <span style={{ fontSize: 10, color: '#E57373' }} title={`Conflicts with: ${conflicts.join(', ')}`}>!</span>
                )}
                {!isDefault && (
                  <button onClick={() => resetOne(action)}
                    style={{ padding: '0 6px', background: 'transparent', color: THEME.textDim, border: `1px solid ${THEME.border}`, borderRadius: 3, fontSize: 10, cursor: 'pointer', lineHeight: '18px' }}>
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, borderTop: `1px solid ${THEME.border}`, paddingTop: 12 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: THEME.textDim }}>Mouse Interactions</h3>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            {mouseInteractions.map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
                <span style={{ color: THEME.accent, minWidth: 140 }}>{key}</span>
                <span style={{ color: THEME.textDim }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

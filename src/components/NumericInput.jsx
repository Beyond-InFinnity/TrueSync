import { THEME } from '../theme.js';

export default function NumericInput({ numericMode, setNumericMode, numericValue, setNumericValue, applyNumericEdit, selectedEvents }) {
  return (
    <div style={{ height: 40, minHeight: 40, background: THEME.surfaceLight, borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, fontSize: 12 }}>
      <select value={numericMode} onChange={(e) => setNumericMode(e.target.value)}
        style={{ background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
        <option value="shift">Shift</option>
        <option value="extendStart">Extend Start</option>
        <option value="extendEnd">Extend End</option>
      </select>
      <input type="text" value={numericValue} onChange={(e) => setNumericValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && applyNumericEdit()} placeholder="ms (negative = earlier)" autoFocus
        style={{ background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: '2px 8px', width: 160, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }} />
      <button onClick={applyNumericEdit} style={{ padding: '2px 12px', background: THEME.accent, color: '#000', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
      <span style={{ color: THEME.textDim }}>({selectedEvents.size} event{selectedEvents.size !== 1 ? 's' : ''} selected)</span>
    </div>
  );
}

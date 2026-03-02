import { THEME } from '../theme.js';

function codecLabel(codecId) {
  if (codecId === 'S_TEXT/ASS') return 'ASS';
  if (codecId === 'S_TEXT/SSA') return 'SSA';
  if (codecId === 'S_TEXT/UTF8') return 'SRT';
  return codecId;
}

export default function SubtitleTrackSelector({ tracks, onSelect, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onCancel}>
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 32, minWidth: 360, maxWidth: 520, fontSize: 13, lineHeight: 1.8 }}
        onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Select Subtitle Track</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tracks.map((t) => (
            <button key={t.index} onClick={() => onSelect(t.index)}
              style={{
                display: 'flex', gap: 16, alignItems: 'center', padding: '8px 16px',
                background: THEME.surfaceLight, border: `1px solid ${THEME.border}`, borderRadius: 6,
                color: THEME.text, cursor: 'pointer', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                textAlign: 'left',
              }}>
              <span style={{ color: THEME.textDim, minWidth: 30 }}>#{t.index}</span>
              <span style={{ minWidth: 40 }}>{t.language}</span>
              <span style={{ color: THEME.accent, minWidth: 36 }}>{codecLabel(t.codecId)}</span>
              <span style={{ color: THEME.textDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || ''}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onCancel}
            style={{ padding: '6px 20px', background: THEME.surfaceLight, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

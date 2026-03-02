import { THEME } from '../theme.js';
import { formatTimestamp } from '../assParser.js';

function ToolbarBtn({ children, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ padding: '4px 10px', background: THEME.surfaceLight, color: disabled ? THEME.textMuted : THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 6, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, lineHeight: 1 }}>
      {children}
    </button>
  );
}

export default function Toolbar({ isPlaying, togglePlayback, setPlayheadTime, videoRef, playheadTime, setMarkers, selectedEvents, lockSelected, unlockSelected, showNumericInput, setShowNumericInput, showHelp, setShowHelp, handleFileInput, handleExport, fileName }) {
  return (
    <div style={{ height: 48, minHeight: 48, background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>⟐ SAE</span>
      <span style={{ color: THEME.textDim, fontSize: 12, marginRight: 16, fontFamily: "'JetBrains Mono', monospace" }}>{fileName}</span>

      <div style={{ display: 'flex', gap: 4 }}>
        <ToolbarBtn onClick={togglePlayback} title="Space">{isPlaying ? '⏸' : '▶'}</ToolbarBtn>
        <ToolbarBtn onClick={() => { setPlayheadTime(0); if (videoRef.current) videoRef.current.currentTime = 0; }} title="Return to start">⏮</ToolbarBtn>
      </div>

      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: THEME.accent, minWidth: 100 }}>
        {formatTimestamp(playheadTime)}
      </span>

      <div style={{ flex: 1 }} />

      <ToolbarBtn onClick={() => setMarkers((m) => [...m, { time: playheadTime, id: Date.now() }])} title="Add marker (M)">📍</ToolbarBtn>
      <ToolbarBtn onClick={lockSelected} disabled={selectedEvents.size < 2} title="Lock selected">🔗</ToolbarBtn>
      <ToolbarBtn onClick={unlockSelected} title="Unlock selected">🔓</ToolbarBtn>
      <ToolbarBtn onClick={() => setShowNumericInput(!showNumericInput)} title="Numeric edit (N)">#±</ToolbarBtn>
      <ToolbarBtn onClick={() => setShowHelp(!showHelp)} title="Help">?</ToolbarBtn>

      <div style={{ width: 1, height: 24, background: THEME.border, margin: '0 4px' }} />

      <label style={{ padding: '4px 12px', background: THEME.surfaceLight, borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `1px solid ${THEME.border}` }}>
        + Load
        <input type="file" multiple accept=".ass,.ssa,.wav,.mp3,.ogg,.flac,.m4a,.mp4,.mkv,.webm" onChange={handleFileInput} style={{ display: 'none' }} />
      </label>

      <button onClick={handleExport} style={{ padding: '4px 16px', background: THEME.accent, color: '#000', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
        Export .ass
      </button>
    </div>
  );
}

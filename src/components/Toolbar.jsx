import { useState } from 'react';
import { THEME } from '../theme.js';
import { formatTimestamp } from '../assParser.js';
import { hotkeyDisplayString } from '../hotkeys.js';
import { showTooltip, hideTooltip } from './Tooltip.jsx';

function tooltipText(label, hotkeyAction, hotkeys) {
  if (hotkeyAction && hotkeys && hotkeys[hotkeyAction]) {
    return `${label} (${hotkeyDisplayString(hotkeys[hotkeyAction])})`;
  }
  return label;
}

function tip(e, text) { showTooltip(e.currentTarget, text); }

function ToolbarBtn({ children, onClick, disabled, tooltip, active }) {
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={tooltip ? (e) => tip(e, tooltip) : undefined}
      onMouseLeave={tooltip ? hideTooltip : undefined}
      style={{
        padding: '4px 10px', background: active ? THEME.accentDim : THEME.surfaceLight,
        color: disabled ? THEME.textMuted : THEME.text,
        border: `1px solid ${active ? THEME.accent : THEME.border}`, borderRadius: 6,
        fontSize: 13, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, lineHeight: 1,
      }}>
      {children}
    </button>
  );
}

function GridOption({ label, value, current, onChange }) {
  const isActive = current === value;
  return (
    <button onClick={() => onChange(value)}
      style={{
        padding: '3px 8px', background: isActive ? THEME.accentDim : THEME.surfaceLight,
        color: isActive ? '#fff' : THEME.textDim,
        border: `1px solid ${isActive ? THEME.accent : THEME.border}`,
        borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: isActive ? 600 : 400,
      }}>
      {label}
    </button>
  );
}

export default function Toolbar({ isPlaying, togglePlayback, setPlayheadTime, videoRef, playheadTime, setMarkers, selectedEvents, lockSelected, unlockSelected, showNumericInput, setShowNumericInput, showHelp, setShowHelp, handleFileInput, handleExport, fileName, gridLines, setGridLines, gridDensity, setGridDensity, hotkeys }) {
  const [showGridMenu, setShowGridMenu] = useState(false);
  const gridActive = gridLines !== 'off';

  return (
    <div style={{ height: 48, minHeight: 48, background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>⟐ SAE</span>
      <span style={{ color: THEME.textDim, fontSize: 12, marginRight: 16, fontFamily: "'JetBrains Mono', monospace" }}>{fileName}</span>

      <div style={{ display: 'flex', gap: 4 }}>
        <ToolbarBtn onClick={togglePlayback} tooltip={tooltipText('Play / Pause', 'togglePlayback', hotkeys)}>{isPlaying ? '⏸' : '▶'}</ToolbarBtn>
        <ToolbarBtn onClick={() => { setPlayheadTime(0); if (videoRef.current) videoRef.current.currentTime = 0; }} tooltip="Return to start">⏮</ToolbarBtn>
      </div>

      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: THEME.accent, minWidth: 100 }}>
        {formatTimestamp(playheadTime)}
      </span>

      <div style={{ flex: 1 }} />

      <ToolbarBtn onClick={() => setMarkers((m) => [...m, { time: playheadTime, id: Date.now() }])} tooltip={tooltipText('Add Marker', 'addMarker', hotkeys)}>Marker</ToolbarBtn>

      {/* Grid settings button */}
      <div style={{ position: 'relative' }}>
        <ToolbarBtn onClick={() => setShowGridMenu(!showGridMenu)} tooltip="Grid Settings" active={gridActive}>Grid</ToolbarBtn>
        {showGridMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowGridMenu(false)} />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
              background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 8,
              padding: 12, minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 11, color: THEME.textDim, marginBottom: 6, fontWeight: 600 }}>Grid Lines</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                <GridOption label="Off" value="off" current={gridLines} onChange={setGridLines} />
                <GridOption label="All" value="all" current={gridLines} onChange={setGridLines} />
                <GridOption label="Major" value="major" current={gridLines} onChange={setGridLines} />
              </div>
              <div style={{ fontSize: 11, color: THEME.textDim, marginBottom: 6, fontWeight: 600 }}>Tick Density</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <GridOption label="0.5x" value={0.5} current={gridDensity} onChange={setGridDensity} />
                <GridOption label="1x" value={1} current={gridDensity} onChange={setGridDensity} />
                <GridOption label="2x" value={2} current={gridDensity} onChange={setGridDensity} />
                <GridOption label="4x" value={4} current={gridDensity} onChange={setGridDensity} />
              </div>
            </div>
          </>
        )}
      </div>

      <ToolbarBtn onClick={lockSelected} disabled={selectedEvents.size < 2} tooltip="Lock Selected">Lock</ToolbarBtn>
      <ToolbarBtn onClick={unlockSelected} tooltip="Unlock Selected">Unlock</ToolbarBtn>
      <ToolbarBtn onClick={() => setShowNumericInput(!showNumericInput)} tooltip={tooltipText('Numeric Edit', 'toggleNumeric', hotkeys)}>Numeric</ToolbarBtn>
      <ToolbarBtn onClick={() => setShowHelp(!showHelp)} tooltip="Hotkeys">Hotkeys</ToolbarBtn>

      <div style={{ width: 1, height: 24, background: THEME.border, margin: '0 4px' }} />

      <label style={{ padding: '4px 12px', background: THEME.surfaceLight, borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `1px solid ${THEME.border}` }}>
        + Load
        <input type="file" multiple accept=".ass,.ssa,.wav,.mp3,.ogg,.flac,.m4a,.mp4,.mkv,.webm" onChange={handleFileInput} style={{ display: 'none' }} />
      </label>

      <button onClick={handleExport}
        onMouseEnter={(e) => tip(e, tooltipText('Export .ass File', 'exportFile', hotkeys))}
        onMouseLeave={hideTooltip}
        style={{ padding: '4px 16px', background: THEME.accent, color: '#000', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
        Export .ass
      </button>
    </div>
  );
}

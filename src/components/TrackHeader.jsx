import { THEME } from '../theme.js';
import { showTooltip, hideTooltip } from './Tooltip.jsx';

function SmallBtn({ children, active, color, onClick, tooltip }) {
  return (
    <button onClick={onClick}
      onMouseEnter={tooltip ? (e) => showTooltip(e.currentTarget, tooltip) : undefined}
      onMouseLeave={tooltip ? hideTooltip : undefined}
      style={{ padding: '2px 8px', background: active ? color : THEME.surfaceLight, color: active ? '#000' : THEME.textDim, border: `1px solid ${active ? color : THEME.border}`, borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
      {children}
    </button>
  );
}

export default function TrackHeader({ track, trackEvents, layers, toggleTrackMute, toggleTrackSolo, setTrackDragState, isDraggingTrack }) {
  return (
    <div style={{ width: 220, minWidth: 220, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ cursor: 'grab', color: THEME.textDim, fontSize: 14, lineHeight: 1, userSelect: 'none' }}
            onMouseDown={(e) => { e.stopPropagation(); setTrackDragState({ draggedTrack: track.name, startY: e.clientY, currentY: e.clientY }); }}>⠿</span>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: track.color }} />
          {track.name}
        </div>
        <div style={{ fontSize: 10, color: THEME.textDim, marginTop: 2 }}>
          {trackEvents.length} events · {layers.length} layer{layers.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <SmallBtn active={track.muted} color="#E57373" onClick={() => toggleTrackMute(track.name)} tooltip="Mute — hide this track">Mute</SmallBtn>
        <SmallBtn active={track.solo} color="#FFD54F" onClick={() => toggleTrackSolo(track.name)} tooltip="Solo — show only this track">Solo</SmallBtn>
      </div>
    </div>
  );
}

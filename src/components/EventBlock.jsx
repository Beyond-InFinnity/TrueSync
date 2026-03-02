import { LAYER_SUB_HEIGHT, THEME } from '../theme.js';

export default function EventBlock({ ev, track, x, y, w, isSelected, isLocked, isMaster, dragState, handleEventMouseDown, onContextMenu }) {
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: Math.max(w, 4), height: LAYER_SUB_HEIGHT - 4,
        background: isSelected ? `${track.color}CC` : `${track.color}66`,
        border: isMaster ? `2px solid ${THEME.marker}` : `1px solid ${isSelected ? track.color : `${track.color}88`}`,
        borderRadius: 3, cursor: dragState ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', overflow: 'hidden',
        boxShadow: isMaster ? `0 0 0 1px ${THEME.marker}, 0 2px 8px rgba(0,0,0,0.3)` : isSelected ? `0 0 0 1px ${track.color}, 0 2px 8px rgba(0,0,0,0.3)` : 'none',
      }}
      onMouseDown={(e) => handleEventMouseDown(e, ev._id, 'move')}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, ev._id) : undefined}
      onClick={(e) => e.stopPropagation()}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 5, height: '100%', cursor: 'w-resize', zIndex: 2 }}
        onMouseDown={(e) => handleEventMouseDown(e, ev._id, 'resizeStart')} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'e-resize', zIndex: 2 }}
        onMouseDown={(e) => handleEventMouseDown(e, ev._id, 'resizeEnd')} />
      {isMaster && <span style={{ fontSize: 9, marginLeft: 3, color: THEME.marker, fontWeight: 700, flexShrink: 0 }}>M</span>}
      {isLocked && <span style={{ fontSize: 8, marginLeft: 3, color: THEME.lockIcon, flexShrink: 0 }}>🔗</span>}
      <span style={{ fontSize: 10, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', fontWeight: 500, textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
        {ev._text}
      </span>
    </div>
  );
}

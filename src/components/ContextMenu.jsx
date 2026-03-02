import { THEME } from '../theme.js';

function MenuItem({ label, onClick, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{
        display: 'block', width: '100%', padding: '6px 16px', textAlign: 'left',
        background: 'transparent', color: disabled ? THEME.textMuted : THEME.text,
        border: 'none', fontSize: 12, cursor: disabled ? 'default' : 'pointer',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = THEME.surfaceLight; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      {label}
    </button>
  );
}

export default function ContextMenu({ contextMenu, onClose, masterEventId, onSetMaster, onAlignToMaster, onMatchMasterDuration, onClearMaster }) {
  if (!contextMenu) return null;
  const hasMaster = masterEventId != null;
  const isSelf = contextMenu.eventId === masterEventId;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={onClose}>
      <div
        style={{
          position: 'absolute', left: contextMenu.x, top: contextMenu.y,
          background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 8,
          padding: '4px 0', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}>
        <MenuItem label="Set as Master" onClick={() => { onSetMaster(contextMenu.eventId); onClose(); }} />
        <MenuItem label="Align to Master" disabled={!hasMaster || isSelf} onClick={() => { onAlignToMaster(contextMenu.eventId); onClose(); }} />
        <MenuItem label="Match Master Duration" disabled={!hasMaster || isSelf} onClick={() => { onMatchMasterDuration(contextMenu.eventId); onClose(); }} />
        <div style={{ height: 1, background: THEME.border, margin: '4px 0' }} />
        <MenuItem label="Clear Master" disabled={!hasMaster} onClick={() => { onClearMaster(); onClose(); }} />
      </div>
    </div>
  );
}

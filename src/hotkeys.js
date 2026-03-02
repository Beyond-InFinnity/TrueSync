// ══════════════════════════════════════════════════════════════════════════════
// HOTKEY DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_HOTKEYS = {
  togglePlayback:  { code: 'Space',      ctrl: false, shift: false, label: 'Play / Pause' },
  addMarker:       { code: 'KeyM',       ctrl: false, shift: false, label: 'Add marker at playhead' },
  toggleNumeric:   { code: 'KeyN',       ctrl: false, shift: false, label: 'Toggle numeric input' },
  undo:            { code: 'KeyZ',       ctrl: true,  shift: false, label: 'Undo' },
  redo:            { code: 'KeyZ',       ctrl: true,  shift: true,  label: 'Redo' },
  nudgeLeft:       { code: 'ArrowLeft',  ctrl: false, shift: false, label: 'Nudge selected -10ms' },
  nudgeRight:      { code: 'ArrowRight', ctrl: false, shift: false, label: 'Nudge selected +10ms' },
  nudgeLeftBig:    { code: 'ArrowLeft',  ctrl: false, shift: true,  label: 'Nudge selected -100ms' },
  nudgeRightBig:   { code: 'ArrowRight', ctrl: false, shift: true,  label: 'Nudge selected +100ms' },
  clearSelection:  { code: 'Escape',     ctrl: false, shift: false, label: 'Clear selection / close panels' },
  deselect:        { code: 'Delete',     ctrl: false, shift: false, label: 'Deselect all' },
};

export function matchesHotkey(e, binding) {
  if (e.code !== binding.code) return false;
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (binding.ctrl && !ctrlOrCmd) return false;
  if (!binding.ctrl && ctrlOrCmd) return false;
  if (binding.shift && !e.shiftKey) return false;
  if (!binding.shift && e.shiftKey) return false;
  return true;
}

export function hotkeyDisplayString(binding) {
  const parts = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.shift) parts.push('Shift');
  const codeMap = {
    Space: 'Space', Escape: 'Esc', Delete: 'Del', Backspace: 'Backspace',
    ArrowLeft: '\u2190', ArrowRight: '\u2192', ArrowUp: '\u2191', ArrowDown: '\u2193',
  };
  const keyName = codeMap[binding.code] || binding.code.replace(/^Key/, '').replace(/^Digit/, '');
  parts.push(keyName);
  return parts.join(' + ');
}

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { parseASS, serializeASS, formatTimestamp } from './assParser.js';
import { generateWaveformData, renderWaveform } from './waveform.js';
import {
  TRACK_HEIGHT, LAYER_SUB_HEIGHT, HEADER_WIDTH, RULER_HEIGHT,
  WAVEFORM_HEIGHT, MIN_PX_PER_SEC, MAX_PX_PER_SEC, THEME
} from './theme.js';

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function SubtitleAlignmentEditor() {
  const [assData, setAssData] = useState(null);
  const [events, setEvents] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [waveformData, setWaveformData] = useState(null);
  const [duration, setDuration] = useState(120);
  const [pxPerSec, setPxPerSec] = useState(80);
  const [scrollX, setScrollX] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState(new Set());
  const [lockGroups, setLockGroups] = useState([]);
  const [dragState, setDragState] = useState(null);
  const [showNumericInput, setShowNumericInput] = useState(false);
  const [numericValue, setNumericValue] = useState('');
  const [numericMode, setNumericMode] = useState('shift');
  const [showHelp, setShowHelp] = useState(false);
  const [fileName, setFileName] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);

  const timelineRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const playStartRef = useRef(null);
  const playOffsetRef = useRef(null);
  const animFrameRef = useRef(null);
  const videoRef = useRef(null);

  // ── Derived state ──
  const visibleTracks = useMemo(() => {
    const hasSolo = tracks.some((t) => t.solo);
    return tracks.filter((t) => (hasSolo ? t.solo : !t.muted));
  }, [tracks]);

  // ── Audio context ──
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const loadAudio = useCallback(async (file) => {
    const ctx = getAudioContext();
    const arrayBuf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    setAudioBuffer(decoded);
    setDuration(decoded.duration);
    setWaveformData(generateWaveformData(decoded, 256));
  }, [getAudioContext]);

  // ── Playback ──
  const startPlayback = useCallback(() => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0, playheadTime);
    audioSourceRef.current = source;
    playStartRef.current = ctx.currentTime;
    playOffsetRef.current = playheadTime;
    setIsPlaying(true);

    source.onended = () => setIsPlaying(false);

    const animate = () => {
      const elapsed = ctx.currentTime - playStartRef.current;
      const currentTime = playOffsetRef.current + elapsed;
      setPlayheadTime(currentTime);
      if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.1) {
        videoRef.current.currentTime = currentTime;
      }
      if (currentTime < duration) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [audioBuffer, playheadTime, duration, getAudioContext]);

  const stopPlayback = useCallback(() => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      const ctx = getAudioContext();
      const elapsed = ctx.currentTime - playStartRef.current;
      setPlayheadTime(playOffsetRef.current + elapsed);
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, startPlayback, stopPlayback, getAudioContext]);

  // ── File loading ──
  const handleASSFile = useCallback((file) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseASS(e.target.result);
      setAssData(parsed);
      setEvents([...parsed.events]);
      setTracks([...parsed.tracks]);
      if (parsed.events.length > 0) {
        const maxEnd = Math.max(...parsed.events.map((ev) => ev._end));
        setDuration((d) => Math.max(d, maxEnd + 10));
      }
    };
    reader.readAsText(file);
  }, []);

  const handleAudioFile = useCallback((file) => loadAudio(file), [loadAudio]);

  const handleVideoFile = useCallback((file) => {
    setVideoUrl(URL.createObjectURL(file));
    loadAudio(file);
  }, [loadAudio]);

  const routeFile = useCallback((file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'ass' || ext === 'ssa') handleASSFile(file);
    else if (['wav', 'mp3', 'ogg', 'flac', 'm4a'].includes(ext)) handleAudioFile(file);
    else if (['mp4', 'mkv', 'webm'].includes(ext)) handleVideoFile(file);
  }, [handleASSFile, handleAudioFile, handleVideoFile]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) routeFile(file);
  }, [routeFile]);

  const handleFileInput = useCallback((e) => {
    for (const file of e.target.files) routeFile(file);
  }, [routeFile]);

  // ── Export ──
  const handleExport = useCallback(() => {
    if (!assData) return;
    const output = serializeASS(assData, events);
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'output.ass';
    a.click();
    URL.revokeObjectURL(url);
  }, [assData, events, fileName]);

  // ── Zoom & scroll ──
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left - HEADER_WIDTH + scrollX;
      const timeAtMouse = mouseX / pxPerSec;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newPxPerSec = Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, pxPerSec * factor));
      setPxPerSec(newPxPerSec);
      setScrollX(Math.max(0, timeAtMouse * newPxPerSec - (e.clientX - rect.left - HEADER_WIDTH)));
    } else {
      setScrollX((s) => Math.max(0, s + e.deltaX + e.deltaY));
    }
  }, [pxPerSec, scrollX]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' && !showNumericInput) {
        e.preventDefault();
        togglePlayback();
      }
      if (e.code === 'KeyM' && !showNumericInput) {
        setMarkers((m) => [...m, { time: playheadTime, id: Date.now() }]);
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && !showNumericInput) {
        setSelectedEvents(new Set());
      }
      if (e.code === 'KeyN' && !showNumericInput) {
        setShowNumericInput(true);
      }
      if (e.code === 'Escape') {
        setShowNumericInput(false);
        setSelectedEvents(new Set());
      }
      if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && selectedEvents.size > 0 && !showNumericInput) {
        e.preventDefault();
        const delta = (e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01);
        setEvents((evts) => evts.map((ev) => {
          if (!selectedEvents.has(ev._id)) return ev;
          return { ...ev, _start: ev._start + delta, _end: ev._end + delta };
        }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlayback, playheadTime, selectedEvents, showNumericInput]);

  // ── Lock groups ──
  const getLockGroup = useCallback((eventId) => lockGroups.find((g) => g.has(eventId)), [lockGroups]);

  const getAffectedEvents = useCallback((eventId) => {
    const group = getLockGroup(eventId);
    return group || new Set([eventId]);
  }, [getLockGroup]);

  const lockSelected = useCallback(() => {
    if (selectedEvents.size < 2) return;
    setLockGroups((gs) => {
      const merged = new Set(selectedEvents);
      const remaining = gs.filter((g) => {
        for (const id of g) {
          if (merged.has(id)) {
            for (const gid of g) merged.add(gid);
            return false;
          }
        }
        return true;
      });
      return [...remaining, merged];
    });
  }, [selectedEvents]);

  const unlockSelected = useCallback(() => {
    setLockGroups((gs) =>
      gs.map((g) => {
        const filtered = new Set([...g].filter((id) => !selectedEvents.has(id)));
        return filtered.size >= 2 ? filtered : null;
      }).filter(Boolean)
    );
  }, [selectedEvents]);

  // ── Track controls ──
  const toggleTrackMute = useCallback((name) => {
    setTracks((ts) => ts.map((t) => (t.name === name ? { ...t, muted: !t.muted } : t)));
  }, []);

  const toggleTrackSolo = useCallback((name) => {
    setTracks((ts) => ts.map((t) => (t.name === name ? { ...t, solo: !t.solo } : t)));
  }, []);

  // ── Event drag ──
  const handleEventMouseDown = useCallback((e, eventId, mode) => {
    e.stopPropagation();
    const ev = events.find((ev) => ev._id === eventId);
    if (!ev) return;
    if (e.shiftKey) {
      setSelectedEvents((s) => {
        const ns = new Set(s);
        ns.has(eventId) ? ns.delete(eventId) : ns.add(eventId);
        return ns;
      });
      return;
    }
    if (!selectedEvents.has(eventId)) setSelectedEvents(new Set([eventId]));
    setDragState({ mode, eventId, startX: e.clientX, origStart: ev._start, origEnd: ev._end });
  }, [events, selectedEvents]);

  useEffect(() => {
    if (!dragState) return;
    const handleMouseMove = (e) => {
      const deltaTime = (e.clientX - dragState.startX) / pxPerSec;
      const affected = getAffectedEvents(dragState.eventId);
      setEvents((evts) => evts.map((ev) => {
        const isTarget = ev._id === dragState.eventId;
        const isAffected = affected.has(ev._id) && !isTarget;
        const isSelected = selectedEvents.has(ev._id) && !isTarget;
        if (!isTarget && !isAffected && !isSelected) return ev;
        if (dragState.mode === 'move') {
          return { ...ev, _start: (isTarget ? dragState.origStart : ev._start) + deltaTime, _end: (isTarget ? dragState.origEnd : ev._end) + deltaTime };
        }
        if (dragState.mode === 'resizeStart' && isTarget) {
          return { ...ev, _start: Math.min(dragState.origStart + deltaTime, ev._end - 0.01) };
        }
        if (dragState.mode === 'resizeEnd' && isTarget) {
          return { ...ev, _end: Math.max(dragState.origEnd + deltaTime, ev._start + 0.01) };
        }
        return ev;
      }));
    };
    const handleMouseUp = () => setDragState(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, pxPerSec, getAffectedEvents, selectedEvents]);

  // ── Timeline click ──
  const handleTimelineClick = useCallback((e) => {
    if (dragState) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - HEADER_WIDTH + scrollX;
    const time = Math.max(0, x / pxPerSec);
    setPlayheadTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
  }, [pxPerSec, scrollX, dragState]);

  // ── Numeric edit ──
  const applyNumericEdit = useCallback(() => {
    const ms = parseFloat(numericValue);
    if (isNaN(ms)) return;
    const delta = ms / 1000;
    setEvents((evts) => evts.map((ev) => {
      if (!selectedEvents.has(ev._id)) return ev;
      if (numericMode === 'shift') return { ...ev, _start: ev._start + delta, _end: ev._end + delta };
      if (numericMode === 'extendStart') return { ...ev, _start: ev._start + delta };
      if (numericMode === 'extendEnd') return { ...ev, _end: ev._end + delta };
      return ev;
    }));
    setShowNumericInput(false);
    setNumericValue('');
  }, [numericValue, numericMode, selectedEvents]);

  // ── Waveform canvas rendering ──
  useEffect(() => {
    if (!waveformData || !waveformCanvasRef.current || !timelineRef.current) return;
    const canvas = waveformCanvasRef.current;
    const viewWidth = timelineRef.current.clientWidth - HEADER_WIDTH;
    canvas.width = viewWidth;
    canvas.height = WAVEFORM_HEIGHT;
    const ctx = canvas.getContext('2d');
    const viewStart = scrollX / pxPerSec;
    const viewEnd = viewStart + viewWidth / pxPerSec;
    renderWaveform(ctx, waveformData, viewStart, viewEnd, pxPerSec, viewWidth, WAVEFORM_HEIGHT, THEME.waveform);
  }, [waveformData, scrollX, pxPerSec]);

  // ── Track helpers ──
  const getTrackLayers = useCallback((track) => {
    const trackEvents = events.filter((ev) => ev._style === track.name);
    return [...new Set(trackEvents.map((ev) => ev._layer))].sort((a, b) => a - b);
  }, [events]);

  const getTrackHeight = useCallback((track) => {
    return Math.max(TRACK_HEIGHT, LAYER_SUB_HEIGHT * getTrackLayers(track).length + 16);
  }, [getTrackLayers]);

  // ── Ruler ──
  const renderRuler = useCallback(() => {
    const viewWidth = timelineRef.current ? timelineRef.current.clientWidth - HEADER_WIDTH : 800;
    const viewStart = scrollX / pxPerSec;
    const viewEnd = viewStart + viewWidth / pxPerSec;
    const minTickPx = 80;
    const rawInterval = minTickPx / pxPerSec;
    const intervals = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const interval = intervals.find((i) => i >= rawInterval) || 60;
    const ticks = [];
    const start = Math.floor(viewStart / interval) * interval;
    for (let t = start; t <= viewEnd; t += interval) {
      const x = t * pxPerSec - scrollX;
      if (x < 0) continue;
      const isMajor = Math.abs(t % (interval * 5)) < 0.001 || interval >= 5;
      ticks.push(
        <g key={t.toFixed(4)}>
          <line x1={x} y1={isMajor ? 2 : 14} x2={x} y2={RULER_HEIGHT} stroke={isMajor ? THEME.textDim : THEME.textMuted} strokeWidth={isMajor ? 1 : 0.5} />
          {isMajor && <text x={x + 4} y={12} fill={THEME.textDim} fontSize="10" fontFamily="'JetBrains Mono', monospace">{formatTimestamp(t)}</text>}
        </g>
      );
    }
    return ticks;
  }, [scrollX, pxPerSec]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — Drop zone
  // ══════════════════════════════════════════════════════════════════════════

  if (!assData) {
    return (
      <div style={{ background: THEME.bg, color: THEME.text, width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', system-ui, sans-serif" }}
        onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}>
        <div style={{ textAlign: 'center', padding: 48, border: `2px dashed ${THEME.border}`, borderRadius: 16, maxWidth: 560 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⟐</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Subtitle Alignment Editor</h1>
          <p style={{ color: THEME.textDim, fontSize: 14, margin: '0 0 32px', lineHeight: 1.6 }}>
            Drop files to begin — .ass subtitle file (required),<br />audio (.wav/.mp3/.flac) or video (.mp4/.mkv/.webm)
          </p>
          <label style={{ display: 'inline-block', padding: '10px 24px', background: THEME.accent, color: '#000', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Choose Files
            <input type="file" multiple accept=".ass,.ssa,.wav,.mp3,.ogg,.flac,.m4a,.mp4,.mkv,.webm" onChange={handleFileInput} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — Editor
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div style={{ background: THEME.bg, color: THEME.text, width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden', userSelect: 'none' }}
      onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}>

      {/* ── TOOLBAR ── */}
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

      {/* ── NUMERIC INPUT ── */}
      {showNumericInput && (
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
      )}

      {/* ── HELP OVERLAY ── */}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setShowHelp(false)}>
          <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 32, maxWidth: 480, fontSize: 13, lineHeight: 1.8 }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Keyboard Shortcuts</h2>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              {[
                ['Space', 'Play / Pause'], ['M', 'Add marker at playhead'], ['N', 'Toggle numeric input'],
                ['← →', 'Nudge selected ±10ms'], ['Shift + ← →', 'Nudge selected ±100ms'],
                ['Ctrl + Scroll', 'Zoom timeline'], ['Scroll', 'Pan timeline'],
                ['Click event', 'Select event'], ['Shift + Click', 'Add/remove from selection'],
                ['Drag event', 'Move event'], ['Drag edge', 'Resize event'], ['Esc', 'Clear selection / close panels'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
                  <span style={{ color: THEME.accent, minWidth: 140 }}>{key}</span>
                  <span style={{ color: THEME.textDim }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN AREA ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Video preview */}
        {videoUrl && (
          <div style={{ width: 320, minWidth: 320, background: '#000', borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: THEME.textDim, background: THEME.surface, borderBottom: `1px solid ${THEME.border}` }}>Preview</div>
            <video ref={videoRef} src={videoUrl} style={{ width: '100%', flex: 1, objectFit: 'contain' }} muted />
          </div>
        )}

        {/* ── TIMELINE ── */}
        <div ref={timelineRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }} onWheel={handleWheel}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>

            {/* Ruler */}
            <div style={{ display: 'flex', height: RULER_HEIGHT, minHeight: RULER_HEIGHT, borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 10, background: THEME.bg }}>
              <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 10, color: THEME.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
                {Math.round(pxPerSec)}px/s
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <svg width="100%" height={RULER_HEIGHT} style={{ position: 'absolute' }}>{renderRuler()}</svg>
              </div>
            </div>

            {/* Waveform */}
            {waveformData && (
              <div style={{ display: 'flex', height: WAVEFORM_HEIGHT, minHeight: WAVEFORM_HEIGHT, borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: RULER_HEIGHT, zIndex: 9, background: THEME.waveformBg }}>
                <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 600, color: THEME.waveform }}>
                  🔊 Audio
                </div>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={handleTimelineClick}>
                  <canvas ref={waveformCanvasRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: playheadTime * pxPerSec - scrollX, top: 0, width: 1, height: WAVEFORM_HEIGHT, background: THEME.playhead, pointerEvents: 'none', zIndex: 5 }} />
                </div>
              </div>
            )}

            {/* Track lanes */}
            {visibleTracks.map((track) => {
              const layers = getTrackLayers(track);
              const trackH = getTrackHeight(track);
              const trackEvents = events.filter((ev) => ev._style === track.name);

              return (
                <div key={track.name} style={{ display: 'flex', height: trackH, minHeight: trackH, borderBottom: `1px solid ${THEME.border}` }}>
                  {/* Header */}
                  <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: track.color }} />
                        {track.name}
                      </div>
                      <div style={{ fontSize: 10, color: THEME.textDim, marginTop: 2 }}>
                        {trackEvents.length} events · {layers.length} layer{layers.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <SmallBtn active={track.muted} color="#E57373" onClick={() => toggleTrackMute(track.name)}>M</SmallBtn>
                      <SmallBtn active={track.solo} color="#FFD54F" onClick={() => toggleTrackSolo(track.name)}>S</SmallBtn>
                    </div>
                  </div>

                  {/* Events */}
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={handleTimelineClick}>
                    {layers.map((layerNum, li) => (
                      <div key={layerNum} style={{ position: 'absolute', top: 8 + li * LAYER_SUB_HEIGHT, left: 4, fontSize: 9, color: THEME.textMuted, fontFamily: "'JetBrains Mono', monospace", zIndex: 1, pointerEvents: 'none' }}>
                        L{layerNum}
                      </div>
                    ))}

                    {trackEvents.map((ev) => {
                      const x = ev._start * pxPerSec - scrollX;
                      const w = (ev._end - ev._start) * pxPerSec;
                      const layerIdx = layers.indexOf(ev._layer);
                      const y = 8 + layerIdx * LAYER_SUB_HEIGHT;
                      const isSelected = selectedEvents.has(ev._id);
                      const isLocked = !!getLockGroup(ev._id);
                      const containerWidth = timelineRef.current?.clientWidth || 2000;
                      if (x + w < -50 || x > containerWidth) return null;

                      return (
                        <div key={ev._id}
                          style={{
                            position: 'absolute', left: x, top: y, width: Math.max(w, 4), height: LAYER_SUB_HEIGHT - 4,
                            background: isSelected ? `${track.color}CC` : `${track.color}66`,
                            border: `1px solid ${isSelected ? track.color : `${track.color}88`}`,
                            borderRadius: 3, cursor: dragState ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', overflow: 'hidden',
                            boxShadow: isSelected ? `0 0 0 1px ${track.color}, 0 2px 8px rgba(0,0,0,0.3)` : 'none',
                          }}
                          onMouseDown={(e) => handleEventMouseDown(e, ev._id, 'move')}>
                          <div style={{ position: 'absolute', left: 0, top: 0, width: 5, height: '100%', cursor: 'w-resize', zIndex: 2 }}
                            onMouseDown={(e) => handleEventMouseDown(e, ev._id, 'resizeStart')} />
                          <div style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'e-resize', zIndex: 2 }}
                            onMouseDown={(e) => handleEventMouseDown(e, ev._id, 'resizeEnd')} />
                          {isLocked && <span style={{ fontSize: 8, marginLeft: 3, color: THEME.lockIcon, flexShrink: 0 }}>🔗</span>}
                          <span style={{ fontSize: 10, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', fontWeight: 500, textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
                            {ev._text}
                          </span>
                        </div>
                      );
                    })}

                    <div style={{ position: 'absolute', left: playheadTime * pxPerSec - scrollX, top: 0, width: 1, height: trackH, background: THEME.playhead, pointerEvents: 'none', zIndex: 20 }} />
                    {markers.map((m) => (
                      <div key={m.id} style={{ position: 'absolute', left: m.time * pxPerSec - scrollX - 1, top: 0, width: 2, height: trackH, background: THEME.marker, opacity: 0.6, pointerEvents: 'none', zIndex: 15 }} />
                    ))}
                  </div>
                </div>
              );
            })}

            <div style={{ flex: 1, minHeight: 100 }} />
          </div>
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{ height: 28, minHeight: 28, background: THEME.surface, borderTop: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, fontSize: 11, color: THEME.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{events.length} events · {tracks.length} tracks</span>
        <span>{markers.length} markers</span>
        <span>{selectedEvents.size} selected · {lockGroups.length} lock groups</span>
        <span>Duration: {formatTimestamp(duration)}</span>
        <div style={{ flex: 1 }} />
        <span>Ctrl+Scroll to zoom · Space to play</span>
      </div>
    </div>
  );
}

// ── Utility Components ──

function ToolbarBtn({ children, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ padding: '4px 10px', background: THEME.surfaceLight, color: disabled ? THEME.textMuted : THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 6, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, lineHeight: 1 }}>
      {children}
    </button>
  );
}

function SmallBtn({ children, active, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{ padding: '2px 8px', background: active ? color : THEME.surfaceLight, color: active ? '#000' : THEME.textDim, border: `1px solid ${active ? color : THEME.border}`, borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
      {children}
    </button>
  );
}

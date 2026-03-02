import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { parseASS, serializeASS, formatTimestamp } from './assParser.js';
import {
  TRACK_HEIGHT, LAYER_SUB_HEIGHT, HEADER_WIDTH, RULER_HEIGHT,
  WAVEFORM_HEIGHT, MIN_PX_PER_SEC, MAX_PX_PER_SEC, THEME
} from './theme.js';

import { DEFAULT_HOTKEYS, matchesHotkey } from './hotkeys.js';
import { extractSubtitleTracks, reassembleASS, srtToASS } from './mkvExtractor.js';
import useHistory from './hooks/useHistory.js';
import useAudio from './hooks/useAudio.js';
import useDrag from './hooks/useDrag.js';

import Toolbar from './components/Toolbar.jsx';
import NumericInput from './components/NumericInput.jsx';
import HotkeyEditor from './components/HotkeyEditor.jsx';
import WaveformLane from './components/WaveformLane.jsx';
import Ruler from './components/Ruler.jsx';
import TrackHeader from './components/TrackHeader.jsx';
import TrackLane from './components/TrackLane.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import SubtitleTrackSelector from './components/SubtitleTrackSelector.jsx';

export default function SubtitleAlignmentEditor() {
  const [assData, setAssData] = useState(null);
  const [events, setEvents] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState(new Set());
  const [lockGroups, setLockGroups] = useState([]);
  const [showNumericInput, setShowNumericInput] = useState(false);
  const [numericValue, setNumericValue] = useState('');
  const [numericMode, setNumericMode] = useState('shift');
  const [showHelp, setShowHelp] = useState(false);
  const [fileName, setFileName] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [pxPerSec, setPxPerSec] = useState(80);
  const [scrollX, setScrollX] = useState(0);
  const [trackOrder, setTrackOrder] = useState([]);
  const [trackDragState, setTrackDragState] = useState(null);

  // Feature state
  const [masterEventId, setMasterEventId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [pendingMkvData, setPendingMkvData] = useState(null);
  const [hotkeys, setHotkeys] = useState(() => JSON.parse(JSON.stringify(DEFAULT_HOTKEYS)));
  const [rebindingAction, setRebindingAction] = useState(null);

  const timelineRef = useRef(null);
  const videoRef = useRef(null);

  // ── Hooks ──
  const { pushHistory, undo, redo, initHistory } = useHistory(setEvents, setTracks);
  const { audioBuffer, waveformData, duration, setDuration, isPlaying, playheadTime, setPlayheadTime, loadAudio, togglePlayback, stopPlayback } = useAudio(videoRef);

  // ── Derived state ──
  const visibleTracks = useMemo(() => {
    const hasSolo = tracks.some((t) => t.solo);
    const filtered = tracks.filter((t) => (hasSolo ? t.solo : !t.muted));
    if (trackOrder.length === 0) return filtered;
    return [...filtered].sort((a, b) => {
      const ai = trackOrder.indexOf(a.name);
      const bi = trackOrder.indexOf(b.name);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }, [tracks, trackOrder]);

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

  // ── Drag hook ──
  const { dragState, handleEventMouseDown } = useDrag({
    events, selectedEvents, setSelectedEvents, setEvents, pxPerSec,
    getAffectedEvents, pushHistory, trackOrder, visibleTracks, tracks,
  });

  // ── Track controls ──
  const toggleTrackMute = useCallback((name) => {
    pushHistory(events, tracks);
    setTracks((ts) => ts.map((t) => (t.name === name ? { ...t, muted: !t.muted } : t)));
  }, [events, tracks, pushHistory]);

  const toggleTrackSolo = useCallback((name) => {
    pushHistory(events, tracks);
    setTracks((ts) => ts.map((t) => (t.name === name ? { ...t, solo: !t.solo } : t)));
  }, [events, tracks, pushHistory]);

  // ── Track helpers ──
  const getTrackLayers = useCallback((track) => {
    const trackEvents = events.filter((ev) => ev._style === track.name);
    return [...new Set(trackEvents.map((ev) => ev._layer))].sort((a, b) => a - b);
  }, [events]);

  const getTrackHeight = useCallback((track) => {
    return Math.max(TRACK_HEIGHT, LAYER_SUB_HEIGHT * getTrackLayers(track).length + 16);
  }, [getTrackLayers]);

  // ── File loading ──
  const handleASSFile = useCallback((file) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseASS(e.target.result);
      setAssData(parsed);
      const initialEvents = [...parsed.events];
      setEvents(initialEvents);
      setTracks([...parsed.tracks]);
      setTrackOrder(parsed.tracks.map(t => t.name));
      initHistory(initialEvents, [...parsed.tracks]);
      if (parsed.events.length > 0) {
        const maxEnd = Math.max(...parsed.events.map((ev) => ev._end));
        setDuration((d) => Math.max(d, maxEnd + 10));
      }
    };
    reader.readAsText(file);
  }, [initHistory, setDuration]);

  const handleAudioFile = useCallback((file) => loadAudio(file), [loadAudio]);

  const handleVideoFile = useCallback(async (file) => {
    setVideoUrl(URL.createObjectURL(file));
    loadAudio(file);
    // Attempt MKV subtitle extraction
    try {
      const arrayBuf = await file.arrayBuffer();
      const result = extractSubtitleTracks(arrayBuf);
      if (result.tracks.length > 0) {
        setPendingMkvData(result);
      }
    } catch (e) {
      // Silently ignore extraction failures — video/audio still loaded
    }
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

  // ── MKV subtitle selection ──
  const handleMkvSubtitleSelect = useCallback((trackIndex) => {
    if (!pendingMkvData) return;
    const trackMeta = pendingMkvData.tracks.find(t => t.index === trackIndex);
    const subs = pendingMkvData.subtitles[trackIndex];
    if (!trackMeta || !subs) { setPendingMkvData(null); return; }

    let assString;
    if (trackMeta.codecId === 'S_TEXT/ASS' || trackMeta.codecId === 'S_TEXT/SSA') {
      assString = reassembleASS(trackMeta.codecPrivate, subs);
    } else {
      assString = srtToASS(subs);
    }

    const parsed = parseASS(assString);
    setAssData(parsed);
    const initialEvents = [...parsed.events];
    setEvents(initialEvents);
    setTracks([...parsed.tracks]);
    setTrackOrder(parsed.tracks.map(t => t.name));
    initHistory(initialEvents, [...parsed.tracks]);
    if (parsed.events.length > 0) {
      const maxEnd = Math.max(...parsed.events.map((ev) => ev._end));
      setDuration((d) => Math.max(d, maxEnd + 10));
    }
    setFileName('embedded.ass');
    setPendingMkvData(null);
  }, [pendingMkvData, initHistory, setDuration]);

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

  // ── Keyboard shortcuts (data-driven via hotkeys state) ──
  useEffect(() => {
    const handler = (e) => {
      if (showNumericInput && e.code !== 'Escape') return;

      const actions = {
        undo:           () => { e.preventDefault(); undo(); },
        redo:           () => { e.preventDefault(); redo(); },
        togglePlayback: () => { e.preventDefault(); togglePlayback(); },
        addMarker:      () => { setMarkers((m) => [...m, { time: playheadTime, id: Date.now() }]); },
        toggleNumeric:  () => { setShowNumericInput(true); },
        deselect:       () => { setSelectedEvents(new Set()); },
        clearSelection: () => { setShowNumericInput(false); setSelectedEvents(new Set()); setContextMenu(null); },
        nudgeLeft:      () => {
          if (selectedEvents.size === 0) return;
          e.preventDefault();
          setEvents((evts) => {
            pushHistory(evts, tracks);
            return evts.map((ev) => selectedEvents.has(ev._id) ? { ...ev, _start: ev._start - 0.01, _end: ev._end - 0.01 } : ev);
          });
        },
        nudgeRight:     () => {
          if (selectedEvents.size === 0) return;
          e.preventDefault();
          setEvents((evts) => {
            pushHistory(evts, tracks);
            return evts.map((ev) => selectedEvents.has(ev._id) ? { ...ev, _start: ev._start + 0.01, _end: ev._end + 0.01 } : ev);
          });
        },
        nudgeLeftBig:   () => {
          if (selectedEvents.size === 0) return;
          e.preventDefault();
          setEvents((evts) => {
            pushHistory(evts, tracks);
            return evts.map((ev) => selectedEvents.has(ev._id) ? { ...ev, _start: ev._start - 0.1, _end: ev._end - 0.1 } : ev);
          });
        },
        nudgeRightBig:  () => {
          if (selectedEvents.size === 0) return;
          e.preventDefault();
          setEvents((evts) => {
            pushHistory(evts, tracks);
            return evts.map((ev) => selectedEvents.has(ev._id) ? { ...ev, _start: ev._start + 0.1, _end: ev._end + 0.1 } : ev);
          });
        },
      };

      for (const [action, binding] of Object.entries(hotkeys)) {
        if (matchesHotkey(e, binding) && actions[action]) {
          actions[action]();
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlayback, playheadTime, selectedEvents, showNumericInput, undo, redo, pushHistory, tracks, hotkeys]);

  // ── Track drag ──
  useEffect(() => {
    if (!trackDragState) return;
    const handleMouseMove = (e) => {
      setTrackDragState(s => s ? { ...s, currentY: e.clientY } : null);
    };
    const handleMouseUp = (e) => {
      const deltaY = e.clientY - trackDragState.startY;
      setTrackOrder(order => {
        const newOrder = [...order];
        const fromIdx = newOrder.indexOf(trackDragState.draggedTrack);
        if (fromIdx === -1) return order;
        const visTrackNames = visibleTracks.map(t => t.name);
        const visIdx = visTrackNames.indexOf(trackDragState.draggedTrack);
        if (visIdx === -1) return order;
        let toVisIdx = visIdx;
        let accumulated = 0;
        if (deltaY > 0) {
          for (let i = visIdx + 1; i < visibleTracks.length; i++) {
            accumulated += getTrackHeight(visibleTracks[i]);
            if (deltaY < accumulated) break;
            toVisIdx = i;
          }
        } else {
          for (let i = visIdx - 1; i >= 0; i--) {
            accumulated -= getTrackHeight(visibleTracks[i]);
            if (deltaY > accumulated) break;
            toVisIdx = i;
          }
        }
        const toTrack = visibleTracks[toVisIdx]?.name;
        if (!toTrack || toTrack === trackDragState.draggedTrack) return order;
        const toIdx = newOrder.indexOf(toTrack);
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, trackDragState.draggedTrack);
        return newOrder;
      });
      setTrackDragState(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [trackDragState, visibleTracks, getTrackHeight]);

  // ── Timeline click ──
  const handleTimelineClick = useCallback((e) => {
    if (dragState) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - HEADER_WIDTH + scrollX;
    const time = Math.max(0, x / pxPerSec);
    setPlayheadTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
    setSelectedEvents(new Set());
  }, [pxPerSec, scrollX, dragState, setPlayheadTime]);

  // ── Numeric edit ──
  const applyNumericEdit = useCallback(() => {
    const ms = parseFloat(numericValue);
    if (isNaN(ms)) return;
    const delta = ms / 1000;
    setEvents((evts) => {
      pushHistory(evts, tracks);
      return evts.map((ev) => {
        if (!selectedEvents.has(ev._id)) return ev;
        if (numericMode === 'shift') return { ...ev, _start: ev._start + delta, _end: ev._end + delta };
        if (numericMode === 'extendStart') return { ...ev, _start: ev._start + delta };
        if (numericMode === 'extendEnd') return { ...ev, _end: ev._end + delta };
        return ev;
      });
    });
    setShowNumericInput(false);
    setNumericValue('');
  }, [numericValue, numericMode, selectedEvents, pushHistory, tracks]);

  // ── Context menu / master block ──
  const handleEventContextMenu = useCallback((e, eventId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, eventId });
  }, []);

  const setMasterEvent = useCallback((eventId) => {
    setMasterEventId(eventId);
  }, []);

  const alignToMaster = useCallback((eventId) => {
    if (masterEventId == null) return;
    const master = events.find(ev => ev._id === masterEventId);
    const target = events.find(ev => ev._id === eventId);
    if (!master || !target) return;
    pushHistory(events, tracks);
    const delta = master._start - target._start;
    setEvents(evts => evts.map(ev =>
      ev._id === eventId ? { ...ev, _start: ev._start + delta, _end: ev._end + delta } : ev
    ));
  }, [masterEventId, events, tracks, pushHistory]);

  const matchMasterDuration = useCallback((eventId) => {
    if (masterEventId == null) return;
    const master = events.find(ev => ev._id === masterEventId);
    const target = events.find(ev => ev._id === eventId);
    if (!master || !target) return;
    pushHistory(events, tracks);
    const masterDuration = master._end - master._start;
    setEvents(evts => evts.map(ev =>
      ev._id === eventId ? { ...ev, _end: ev._start + masterDuration } : ev
    ));
  }, [masterEventId, events, tracks, pushHistory]);

  const clearMaster = useCallback(() => {
    setMasterEventId(null);
  }, []);

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

      <Toolbar
        isPlaying={isPlaying} togglePlayback={togglePlayback} setPlayheadTime={setPlayheadTime}
        videoRef={videoRef} playheadTime={playheadTime} setMarkers={setMarkers}
        selectedEvents={selectedEvents} lockSelected={lockSelected} unlockSelected={unlockSelected}
        showNumericInput={showNumericInput} setShowNumericInput={setShowNumericInput}
        showHelp={showHelp} setShowHelp={setShowHelp}
        handleFileInput={handleFileInput} handleExport={handleExport} fileName={fileName} />

      {showNumericInput && (
        <NumericInput
          numericMode={numericMode} setNumericMode={setNumericMode}
          numericValue={numericValue} setNumericValue={setNumericValue}
          applyNumericEdit={applyNumericEdit} selectedEvents={selectedEvents} />
      )}

      <HotkeyEditor showHelp={showHelp} setShowHelp={setShowHelp}
        hotkeys={hotkeys} setHotkeys={setHotkeys}
        rebindingAction={rebindingAction} setRebindingAction={setRebindingAction} />
      <ContextMenu contextMenu={contextMenu} onClose={() => setContextMenu(null)}
        masterEventId={masterEventId} onSetMaster={setMasterEvent}
        onAlignToMaster={alignToMaster} onMatchMasterDuration={matchMasterDuration}
        onClearMaster={clearMaster} />

      {pendingMkvData && (
        <SubtitleTrackSelector
          tracks={pendingMkvData.tracks}
          onSelect={handleMkvSubtitleSelect}
          onCancel={() => setPendingMkvData(null)} />
      )}

      {/* ── MAIN AREA ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {videoUrl && (
          <div style={{ width: 320, minWidth: 320, background: '#000', borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: THEME.textDim, background: THEME.surface, borderBottom: `1px solid ${THEME.border}` }}>Preview</div>
            <video ref={videoRef} src={videoUrl} style={{ width: '100%', flex: 1, objectFit: 'contain' }} muted />
          </div>
        )}

        {/* ── TIMELINE ── */}
        <div ref={timelineRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }} onWheel={handleWheel}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
            <Ruler scrollX={scrollX} pxPerSec={pxPerSec} timelineRef={timelineRef} />

            <WaveformLane
              waveformData={waveformData} scrollX={scrollX} pxPerSec={pxPerSec}
              handleTimelineClick={handleTimelineClick} playheadTime={playheadTime}
              timelineRef={timelineRef} />

            {/* Track lanes */}
            {visibleTracks.map((track) => {
              const layers = getTrackLayers(track);
              const trackH = getTrackHeight(track);
              const trackEvents = events.filter((ev) => ev._style === track.name);
              const isDraggingTrack = trackDragState?.draggedTrack === track.name;

              return (
                <div key={track.name} style={{ display: 'flex', height: trackH, minHeight: trackH, borderBottom: `1px solid ${THEME.border}`, opacity: isDraggingTrack ? 0.6 : 1, cursor: isDraggingTrack ? 'grabbing' : undefined }}>
                  <TrackHeader
                    track={track} trackEvents={trackEvents} layers={layers}
                    toggleTrackMute={toggleTrackMute} toggleTrackSolo={toggleTrackSolo}
                    setTrackDragState={setTrackDragState} isDraggingTrack={isDraggingTrack} />

                  <TrackLane
                    track={track} layers={layers} trackH={trackH} trackEvents={trackEvents}
                    pxPerSec={pxPerSec} scrollX={scrollX} selectedEvents={selectedEvents}
                    getLockGroup={getLockGroup} dragState={dragState}
                    handleEventMouseDown={handleEventMouseDown}
                    handleTimelineClick={handleTimelineClick} playheadTime={playheadTime}
                    markers={markers} timelineRef={timelineRef}
                    masterEventId={masterEventId} onContextMenu={handleEventContextMenu} />
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
        <span>Ctrl+Z undo · Ctrl+Scroll to zoom · Space to play</span>
      </div>
    </div>
  );
}

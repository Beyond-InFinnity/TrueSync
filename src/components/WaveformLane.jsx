import { useState, useRef, useEffect, useCallback } from 'react';
import { renderWaveform, initSpeechCache, computeSpeechEnergyChunked, renderSpeechOverlay } from '../waveform.js';
import { HEADER_WIDTH, WAVEFORM_HEIGHT, THEME } from '../theme.js';

export default function WaveformLane({ waveformData, audioBuffer, scrollX, pxPerSec, handleTimelineClick, playheadTime, timelineRef }) {
  const waveformCanvasRef = useRef(null);

  // Speech overlay state (all local)
  const [showSpeechOverlay, setShowSpeechOverlay] = useState(false);
  const [speechOpacity, setSpeechOpacity] = useState(0.5);
  const [speechProgress, setSpeechProgress] = useState(null); // { completedChunks, totalChunks }
  const [speechVersion, setSpeechVersion] = useState(0); // incremented per chunk for re-renders
  const [speechRegion, setSpeechRegion] = useState(null); // { start, end } in seconds, or null

  const speechCacheRef = useRef(null);
  const abortRef = useRef(null);
  const regionDragRef = useRef(null); // { startTime }

  // Invalidate cache when audioBuffer changes
  useEffect(() => {
    if (speechCacheRef.current && audioBuffer !== speechCacheRef.current._audioBufferKey) {
      speechCacheRef.current = null;
      setSpeechRegion(null);
      setSpeechVersion(0);
      setSpeechProgress(null);
      abortRef.current?.abort();
    }
  }, [audioBuffer]);

  // Cancel processing when overlay toggled off
  useEffect(() => {
    if (!showSpeechOverlay) {
      abortRef.current?.abort();
      setSpeechProgress(null);
    }
  }, [showSpeechOverlay]);

  // Trigger chunked computation
  const runComputation = useCallback((region) => {
    if (!audioBuffer) return;

    // Abort any in-progress work
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Init cache if needed (or if audioBuffer changed)
    if (!speechCacheRef.current || speechCacheRef.current._audioBufferKey !== audioBuffer) {
      speechCacheRef.current = { ...initSpeechCache(audioBuffer), _audioBufferKey: audioBuffer };
    }
    const cache = speechCacheRef.current;

    const startTime = region ? region.start : 0;
    const endTime = region ? region.end : audioBuffer.duration;

    // Check if fully cached already
    const { hopSize, sampleRate, totalFrames } = cache;
    const sf = Math.max(0, Math.floor(startTime * sampleRate / hopSize));
    const ef = Math.min(totalFrames, Math.ceil(endTime * sampleRate / hopSize));
    let allCached = true;
    for (let i = sf; i < ef; i++) {
      if (!cache.computed[i]) { allCached = false; break; }
    }
    if (allCached) {
      // Already computed — just make sure we render it
      setSpeechVersion(v => v + 1);
      return;
    }

    setSpeechProgress({ completedChunks: 0, totalChunks: 1 }); // placeholder until real count arrives

    computeSpeechEnergyChunked(audioBuffer, startTime, endTime, cache, {
      onChunkDone: ({ completedChunks, totalChunks }) => {
        if (ac.signal.aborted) return;
        setSpeechProgress({ completedChunks, totalChunks });
        setSpeechVersion(v => v + 1);
      },
      signal: ac.signal,
    }).then(() => {
      if (!ac.signal.aborted) setSpeechProgress(null);
    }).catch(() => {
      if (!ac.signal.aborted) setSpeechProgress(null);
    });
  }, [audioBuffer]);

  // When overlay toggled on (and no region), compute whole track
  useEffect(() => {
    if (showSpeechOverlay && audioBuffer && !speechRegion) {
      runComputation(null);
    }
  }, [showSpeechOverlay, audioBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  // When region changes while overlay is on, compute the region
  useEffect(() => {
    if (showSpeechOverlay && audioBuffer && speechRegion) {
      runComputation(speechRegion);
    }
  }, [speechRegion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render waveform + speech overlay
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

    const cache = speechCacheRef.current;
    if (showSpeechOverlay && cache && cache.maxEnergy > 0) {
      renderSpeechOverlay(ctx, cache, viewStart, viewEnd, pxPerSec, viewWidth, WAVEFORM_HEIGHT, speechOpacity);
    }
  }, [waveformData, scrollX, pxPerSec, timelineRef, showSpeechOverlay, speechOpacity, speechVersion]);

  // Shift+drag region selection
  const handleWaveformMouseDown = useCallback((e) => {
    if (!showSpeechOverlay || !e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const time = Math.max(0, x / pxPerSec);
    regionDragRef.current = { startTime: time };
    // Set a temporary single-point region
    setSpeechRegion({ start: time, end: time });

    const handleMouseMove = (me) => {
      if (!regionDragRef.current) return;
      const mx = me.clientX - rect.left + scrollX;
      const mt = Math.max(0, mx / pxPerSec);
      const s = regionDragRef.current.startTime;
      setSpeechRegion({ start: Math.min(s, mt), end: Math.max(s, mt) });
    };

    const handleMouseUp = (me) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!regionDragRef.current) return;
      const mx = me.clientX - rect.left + scrollX;
      const mt = Math.max(0, mx / pxPerSec);
      const s = regionDragRef.current.startTime;
      regionDragRef.current = null;
      const rStart = Math.min(s, mt);
      const rEnd = Math.max(s, mt);
      // If drag was too short (< 0.1s), treat as clear-region click
      if (rEnd - rStart < 0.1) {
        setSpeechRegion(null);
      } else {
        setSpeechRegion({ start: rStart, end: rEnd });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [showSpeechOverlay, scrollX, pxPerSec]);

  if (!waveformData) return null;

  const isProcessing = speechProgress !== null;
  const progressPct = speechProgress ? Math.round((speechProgress.completedChunks / speechProgress.totalChunks) * 100) : 0;
  const hasCache = speechCacheRef.current && speechCacheRef.current.maxEnergy > 0;

  return (
    <div style={{ display: 'flex', height: WAVEFORM_HEIGHT, minHeight: WAVEFORM_HEIGHT, borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 32, zIndex: 9, background: THEME.waveformBg }}>
      {/* ── Header ── */}
      <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 600, color: THEME.waveform, gap: 6, position: 'relative' }}>
        <span style={{ whiteSpace: 'nowrap' }}>🔊 Audio</span>

        {/* Speech overlay toggle */}
        <button
          onClick={() => setShowSpeechOverlay(v => !v)}
          title={showSpeechOverlay ? 'Hide speech overlay (Shift+drag waveform to select region)' : 'Show speech overlay'}
          style={{
            marginLeft: 'auto',
            width: 22, height: 22, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${showSpeechOverlay ? '#FF4444' : THEME.border}`,
            borderRadius: 4,
            background: showSpeechOverlay ? '#FF444433' : 'transparent',
            color: showSpeechOverlay ? '#FF4444' : THEME.textDim,
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          S
        </button>

        {/* Progress text */}
        {isProcessing && (
          <span style={{ fontSize: 10, color: '#FF4444', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
            {speechProgress.completedChunks}/{speechProgress.totalChunks}
          </span>
        )}

        {/* Opacity slider (when overlay active and has data) */}
        {showSpeechOverlay && !isProcessing && hasCache && (
          <input
            type="range"
            min="0.1" max="1" step="0.05"
            value={speechOpacity}
            onChange={(e) => setSpeechOpacity(parseFloat(e.target.value))}
            title={`Speech overlay opacity: ${Math.round(speechOpacity * 100)}%`}
            style={{ width: 50, height: 12, cursor: 'pointer', accentColor: '#FF4444' }}
          />
        )}

        {/* Progress bar at bottom of header */}
        {isProcessing && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: THEME.border }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: '#FF4444', transition: 'width 0.15s ease-out' }} />
          </div>
        )}
      </div>

      {/* ── Waveform area ── */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: showSpeechOverlay ? 'crosshair' : 'pointer' }}
        onClick={handleTimelineClick}
        onMouseDown={handleWaveformMouseDown}
      >
        <canvas ref={waveformCanvasRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />

        {/* Region highlight overlay */}
        {showSpeechOverlay && speechRegion && (() => {
          const leftPx = speechRegion.start * pxPerSec - scrollX;
          const widthPx = (speechRegion.end - speechRegion.start) * pxPerSec;
          return (
            <div style={{
              position: 'absolute', top: 0, height: WAVEFORM_HEIGHT,
              left: leftPx, width: widthPx,
              background: '#FF444418',
              borderLeft: '1px solid #FF444466',
              borderRight: '1px solid #FF444466',
              pointerEvents: 'none', zIndex: 3,
            }} />
          );
        })()}

        {/* Playhead */}
        <div style={{ position: 'absolute', left: playheadTime * pxPerSec - scrollX, top: 0, width: 1, height: WAVEFORM_HEIGHT, background: THEME.playhead, pointerEvents: 'none', zIndex: 5 }} />
      </div>
    </div>
  );
}

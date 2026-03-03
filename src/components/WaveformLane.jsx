import { useState, useRef, useEffect } from 'react';
import { renderWaveform, computeSpeechEnergy, renderSpeechOverlay } from '../waveform.js';
import { HEADER_WIDTH, WAVEFORM_HEIGHT, THEME } from '../theme.js';

export default function WaveformLane({ waveformData, audioBuffer, scrollX, pxPerSec, handleTimelineClick, playheadTime, timelineRef }) {
  const waveformCanvasRef = useRef(null);

  // Speech overlay state (all local)
  const [speechData, setSpeechData] = useState(null);
  const [isComputingSpeech, setIsComputingSpeech] = useState(false);
  const [showSpeechOverlay, setShowSpeechOverlay] = useState(false);
  const [speechOpacity, setSpeechOpacity] = useState(0.5);
  const speechCacheKeyRef = useRef(null);

  // Invalidate cache when audioBuffer changes
  useEffect(() => {
    if (audioBuffer !== speechCacheKeyRef.current) {
      setSpeechData(null);
      speechCacheKeyRef.current = null;
    }
  }, [audioBuffer]);

  // Compute speech energy when toggled on
  useEffect(() => {
    if (!showSpeechOverlay || !audioBuffer || speechData || isComputingSpeech) return;
    if (speechCacheKeyRef.current === audioBuffer && speechData) return;

    let cancelled = false;
    setIsComputingSpeech(true);
    computeSpeechEnergy(audioBuffer).then((result) => {
      if (!cancelled) {
        setSpeechData(result);
        speechCacheKeyRef.current = audioBuffer;
        setIsComputingSpeech(false);
      }
    }).catch(() => {
      if (!cancelled) setIsComputingSpeech(false);
    });

    return () => { cancelled = true; };
  }, [showSpeechOverlay, audioBuffer, speechData, isComputingSpeech]);

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

    if (showSpeechOverlay && speechData) {
      renderSpeechOverlay(ctx, speechData, viewStart, viewEnd, pxPerSec, viewWidth, WAVEFORM_HEIGHT, speechOpacity);
    }
  }, [waveformData, scrollX, pxPerSec, timelineRef, showSpeechOverlay, speechData, speechOpacity]);

  if (!waveformData) return null;

  const speechActive = showSpeechOverlay && (speechData || isComputingSpeech);

  return (
    <div style={{ display: 'flex', height: WAVEFORM_HEIGHT, minHeight: WAVEFORM_HEIGHT, borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 32, zIndex: 9, background: THEME.waveformBg }}>
      <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 600, color: THEME.waveform, gap: 6 }}>
        🔊 Audio

        {/* Speech overlay toggle */}
        <button
          onClick={() => setShowSpeechOverlay(v => !v)}
          title={showSpeechOverlay ? 'Hide speech overlay' : 'Show speech overlay'}
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

        {/* Computing spinner */}
        {isComputingSpeech && (
          <span style={{ display: 'inline-block', animation: 'sae-spin 1s linear infinite', fontSize: 12, color: '#FF4444', flexShrink: 0 }}>⟳</span>
        )}

        {/* Opacity slider */}
        {speechActive && !isComputingSpeech && (
          <input
            type="range"
            min="0.1" max="1" step="0.05"
            value={speechOpacity}
            onChange={(e) => setSpeechOpacity(parseFloat(e.target.value))}
            title={`Speech overlay opacity: ${Math.round(speechOpacity * 100)}%`}
            style={{ width: 50, height: 12, cursor: 'pointer', accentColor: '#FF4444' }}
          />
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={handleTimelineClick}>
        <canvas ref={waveformCanvasRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: playheadTime * pxPerSec - scrollX, top: 0, width: 1, height: WAVEFORM_HEIGHT, background: THEME.playhead, pointerEvents: 'none', zIndex: 5 }} />
      </div>
    </div>
  );
}

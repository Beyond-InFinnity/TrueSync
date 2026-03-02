import { useRef, useEffect } from 'react';
import { renderWaveform } from '../waveform.js';
import { HEADER_WIDTH, WAVEFORM_HEIGHT, THEME } from '../theme.js';

export default function WaveformLane({ waveformData, scrollX, pxPerSec, handleTimelineClick, playheadTime, timelineRef }) {
  const waveformCanvasRef = useRef(null);

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
  }, [waveformData, scrollX, pxPerSec, timelineRef]);

  if (!waveformData) return null;

  return (
    <div style={{ display: 'flex', height: WAVEFORM_HEIGHT, minHeight: WAVEFORM_HEIGHT, borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 32, zIndex: 9, background: THEME.waveformBg }}>
      <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 600, color: THEME.waveform }}>
        🔊 Audio
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={handleTimelineClick}>
        <canvas ref={waveformCanvasRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: playheadTime * pxPerSec - scrollX, top: 0, width: 1, height: WAVEFORM_HEIGHT, background: THEME.playhead, pointerEvents: 'none', zIndex: 5 }} />
      </div>
    </div>
  );
}

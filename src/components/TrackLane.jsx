import { useMemo } from 'react';
import { LAYER_SUB_HEIGHT, THEME } from '../theme.js';
import EventBlock from './EventBlock.jsx';

export default function TrackLane({ track, layers, trackH, trackEvents, pxPerSec, scrollX, selectedEvents, getLockGroup, dragState, handleEventMouseDown, handleTimelineClick, playheadTime, markers, timelineRef, masterEventId, onContextMenu, gridLines = 'off', gridDensity = 1 }) {
  const containerWidth = timelineRef.current?.clientWidth || 2000;

  // Compute grid lines
  const gridElements = useMemo(() => {
    if (gridLines === 'off') return null;
    const minTickPx = 80 / gridDensity;
    const rawInterval = minTickPx / pxPerSec;
    const intervals = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const interval = intervals.find(i => i >= rawInterval) || 60;
    const viewStart = scrollX / pxPerSec;
    const viewEnd = viewStart + containerWidth / pxPerSec;
    const start = Math.floor(viewStart / interval) * interval;
    const lines = [];
    for (let t = start; t <= viewEnd; t += interval) {
      const x = t * pxPerSec - scrollX;
      if (x < 0) continue;
      const isMajor = Math.abs(t % (interval * 5)) < 0.001 || interval >= 5;
      if (gridLines === 'major' && !isMajor) continue;
      lines.push(
        <div key={`g${t.toFixed(4)}`} style={{
          position: 'absolute', left: x, top: 0, width: isMajor ? 1 : 0.5,
          height: trackH, background: THEME.textDim,
          opacity: isMajor ? 0.15 : 0.08,
          pointerEvents: 'none', zIndex: 0,
        }} />
      );
    }
    return lines;
  }, [gridLines, gridDensity, pxPerSec, scrollX, containerWidth, trackH]);

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={handleTimelineClick}>
      {/* Grid lines (behind everything) */}
      {gridElements}

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
        const isMaster = masterEventId === ev._id;
        if (x + w < -50 || x > containerWidth) return null;

        return (
          <EventBlock key={ev._id}
            ev={ev} track={track} x={x} y={y} w={w}
            isSelected={isSelected} isLocked={isLocked} isMaster={isMaster}
            dragState={dragState} handleEventMouseDown={handleEventMouseDown}
            onContextMenu={onContextMenu} />
        );
      })}

      <div style={{ position: 'absolute', left: playheadTime * pxPerSec - scrollX, top: 0, width: 1, height: trackH, background: THEME.playhead, pointerEvents: 'none', zIndex: 20 }} />
      {markers.map((m) => (
        <div key={m.id} style={{ position: 'absolute', left: m.time * pxPerSec - scrollX - 1, top: 0, width: 2, height: trackH, background: THEME.marker, opacity: 0.6, pointerEvents: 'none', zIndex: 15 }} />
      ))}
    </div>
  );
}

import { LAYER_SUB_HEIGHT, THEME } from '../theme.js';
import EventBlock from './EventBlock.jsx';

export default function TrackLane({ track, layers, trackH, trackEvents, pxPerSec, scrollX, selectedEvents, getLockGroup, dragState, handleEventMouseDown, handleTimelineClick, playheadTime, markers, timelineRef, masterEventId, onContextMenu }) {
  const containerWidth = timelineRef.current?.clientWidth || 2000;

  return (
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

import { useCallback } from 'react';
import { formatTimestamp } from '../assParser.js';
import { HEADER_WIDTH, RULER_HEIGHT, THEME } from '../theme.js';

export default function Ruler({ scrollX, pxPerSec, timelineRef }) {
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
  }, [scrollX, pxPerSec, timelineRef]);

  return (
    <div style={{ display: 'flex', height: RULER_HEIGHT, minHeight: RULER_HEIGHT, borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 10, background: THEME.bg }}>
      <div style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH, background: THEME.surface, borderRight: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 10, color: THEME.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
        {Math.round(pxPerSec)}px/s
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height={RULER_HEIGHT} style={{ position: 'absolute' }}>{renderRuler()}</svg>
      </div>
    </div>
  );
}

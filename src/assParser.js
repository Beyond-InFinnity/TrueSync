// ══════════════════════════════════════════════════════════════════════════════
// ASS PARSER / SERIALIZER
// ══════════════════════════════════════════════════════════════════════════════

export function parseTimestamp(ts) {
  const m = ts.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!m) return 0;
  return (
    parseInt(m[1]) * 3600 +
    parseInt(m[2]) * 60 +
    parseInt(m[3]) +
    parseInt(m[4]) / 100
  );
}

export function formatTimestamp(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function parseASS(text) {
  const lines = text.split(/\r?\n/);
  const sections = {};
  let currentSection = null;
  const rawLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections[currentSection] = [];
      rawLines.push({ type: 'section', section: currentSection, raw: line });
      continue;
    }
    if (currentSection) {
      sections[currentSection].push(line);
    }
    rawLines.push({ type: 'line', section: currentSection, raw: line });
  }

  // Parse styles
  const styles = {};
  const styleSection = sections['V4+ Styles'] || sections['V4 Styles'] || [];
  let styleFormat = null;
  for (const line of styleSection) {
    if (line.startsWith('Format:')) {
      styleFormat = line.substring(7).split(',').map((s) => s.trim());
    } else if (line.startsWith('Style:') && styleFormat) {
      const vals = line.substring(6).split(',').map((s) => s.trim());
      const style = {};
      styleFormat.forEach((key, i) => { style[key] = vals[i] || ''; });
      styles[style.Name] = style;
    }
  }

  // Parse events
  const events = [];
  const eventSection = sections['Events'] || [];
  let eventFormat = null;
  for (const line of eventSection) {
    if (line.startsWith('Format:')) {
      eventFormat = line.substring(7).split(',').map((s) => s.trim());
    } else if (
      (line.startsWith('Dialogue:') || line.startsWith('Comment:')) &&
      eventFormat
    ) {
      const isComment = line.startsWith('Comment:');
      const content = line.substring(line.indexOf(':') + 1);
      const parts = content.split(',');
      const vals = parts.slice(0, eventFormat.length - 1);
      vals.push(parts.slice(eventFormat.length - 1).join(','));
      vals.forEach((v, i) => (vals[i] = v.trim()));

      const event = { _type: isComment ? 'Comment' : 'Dialogue' };
      eventFormat.forEach((key, i) => { event[key] = vals[i] || ''; });

      event._start = parseTimestamp(event.Start || '0:00:00.00');
      event._end = parseTimestamp(event.End || '0:00:00.00');
      event._layer = parseInt(event.Layer) || 0;
      event._id = events.length;
      event._style = event.Style || 'Default';
      event._text = (event.Text || '').replace(/\{[^}]*\}/g, '').trim() || '[empty]';
      events.push(event);
    }
  }

  // Group by style into tracks
  const trackColors = [
    '#4FC3F7', '#81C784', '#FFB74D', '#F06292', '#CE93D8',
    '#FFD54F', '#4DB6AC', '#E57373', '#90A4AE', '#AED581',
  ];
  const trackMap = {};
  for (const ev of events) {
    if (!trackMap[ev._style]) {
      trackMap[ev._style] = {
        name: ev._style,
        events: [],
        muted: false,
        solo: false,
        color: null,
      };
    }
    trackMap[ev._style].events.push(ev);
  }
  const tracks = Object.values(trackMap);
  tracks.forEach((t, i) => { t.color = trackColors[i % trackColors.length]; });

  return { rawLines, sections, styles, events, tracks, eventFormat, styleFormat };
}

export function serializeASS(parsed, events) {
  const lines = [];
  let inEvents = false;

  for (const entry of parsed.rawLines) {
    if (entry.type === 'section' && entry.section === 'Events') {
      inEvents = true;
      lines.push(entry.raw);
      continue;
    }
    if (entry.type === 'section' && entry.section !== 'Events') {
      inEvents = false;
    }

    if (inEvents) {
      if (entry.raw.startsWith('Format:')) {
        lines.push(entry.raw);
        for (const ev of events) {
          const vals = parsed.eventFormat.map((key) => {
            if (key === 'Start') return formatTimestamp(ev._start);
            if (key === 'End') return formatTimestamp(ev._end);
            if (key === 'Layer') return String(ev._layer);
            return ev[key] || '';
          });
          lines.push(`${ev._type}: ${vals.join(',')}`);
        }
      }
      continue;
    }

    lines.push(entry.raw);
  }

  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// MKV / EBML SUBTITLE EXTRACTOR
//
// Zero-dependency manual EBML parser. Only parses the subset needed for
// extracting subtitle tracks from Matroska containers.
// ══════════════════════════════════════════════════════════════════════════════

// EBML Element IDs (Matroska spec)
const EBML_HEADER       = 0x1A45DFA3;
const SEGMENT           = 0x18538067;
const TRACKS            = 0x1654AE6B;
const TRACK_ENTRY       = 0xAE;
const TRACK_NUMBER      = 0xD7;
const TRACK_TYPE        = 0x83;
const CODEC_ID          = 0x86;
const CODEC_PRIVATE     = 0x63A2;
const TRACK_NAME        = 0x536E;
const LANGUAGE          = 0x22B59C;
const CLUSTER           = 0x1F43B675;
const TIMECODE          = 0xE7;
const SIMPLE_BLOCK      = 0xA3;
const BLOCK_GROUP       = 0xA0;
const BLOCK             = 0xA1;
const BLOCK_DURATION    = 0x9B;
const TIMECODE_SCALE    = 0x2AD7B1;
const SEGMENT_INFO      = 0x1549A966;

const TRACK_TYPE_SUBTITLE = 17;

const decoder = new TextDecoder('utf-8');

function readVint(buf, pos) {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  if (first === 0) return null;
  let width = 1;
  let mask = 0x80;
  while (width <= 8 && (first & mask) === 0) { width++; mask >>= 1; }
  if (width > 8 || pos + width > buf.length) return null;
  let value = first & (mask - 1);
  for (let i = 1; i < width; i++) {
    value = value * 256 + buf[pos + i];
  }
  return { value, length: width };
}

function readVintRaw(buf, pos) {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  if (first === 0) return null;
  let width = 1;
  let mask = 0x80;
  while (width <= 8 && (first & mask) === 0) { width++; mask >>= 1; }
  if (width > 8 || pos + width > buf.length) return null;
  let value = first;
  for (let i = 1; i < width; i++) {
    value = value * 256 + buf[pos + i];
  }
  return { value, length: width };
}

function readElementHeader(buf, pos) {
  const idResult = readVintRaw(buf, pos);
  if (!idResult) return null;
  const sizeResult = readVint(buf, pos + idResult.length);
  if (!sizeResult) return null;
  const headerLength = idResult.length + sizeResult.length;
  // Check for unknown size (all data bits set)
  const allOnes = (1 << (7 * sizeResult.length)) - 1;
  const isUnknownSize = sizeResult.value === allOnes;
  return {
    id: idResult.value,
    size: isUnknownSize ? -1 : sizeResult.value,
    dataOffset: pos + headerLength,
    headerLength,
  };
}

function readUint(buf, offset, length) {
  let val = 0;
  for (let i = 0; i < length; i++) {
    val = val * 256 + buf[offset + i];
  }
  return val;
}

function readSignedInt16(buf, offset) {
  const val = (buf[offset] << 8) | buf[offset + 1];
  return val >= 0x8000 ? val - 0x10000 : val;
}

function iterateChildren(buf, start, end) {
  const elements = [];
  let pos = start;
  while (pos < end) {
    const header = readElementHeader(buf, pos);
    if (!header || header.size < 0) break;
    if (header.dataOffset + header.size > end + 1) break;
    elements.push(header);
    pos = header.dataOffset + header.size;
  }
  return elements;
}

function parseTrackEntry(buf, start, size) {
  const children = iterateChildren(buf, start, start + size);
  const track = { trackNumber: 0, trackType: 0, codecId: '', language: 'und', name: '', codecPrivate: null };
  for (const child of children) {
    switch (child.id) {
      case TRACK_NUMBER:
        track.trackNumber = readUint(buf, child.dataOffset, child.size);
        break;
      case TRACK_TYPE:
        track.trackType = readUint(buf, child.dataOffset, child.size);
        break;
      case CODEC_ID:
        track.codecId = decoder.decode(buf.slice(child.dataOffset, child.dataOffset + child.size));
        break;
      case CODEC_PRIVATE:
        track.codecPrivate = buf.slice(child.dataOffset, child.dataOffset + child.size);
        break;
      case TRACK_NAME:
        track.name = decoder.decode(buf.slice(child.dataOffset, child.dataOffset + child.size));
        break;
      case LANGUAGE:
        track.language = decoder.decode(buf.slice(child.dataOffset, child.dataOffset + child.size));
        break;
    }
  }
  return track;
}

export function extractSubtitleTracks(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const result = { tracks: [], subtitles: {} };

  let pos = 0;
  let segmentStart = 0;
  let segmentEnd = buf.length;
  let timecodeScale = 1000000; // default: 1ms in ns

  // Find EBML header and Segment
  while (pos < buf.length) {
    const header = readElementHeader(buf, pos);
    if (!header) break;
    if (header.id === EBML_HEADER) {
      pos = header.dataOffset + header.size;
      continue;
    }
    if (header.id === SEGMENT) {
      segmentStart = header.dataOffset;
      segmentEnd = header.size >= 0 ? header.dataOffset + header.size : buf.length;
      break;
    }
    if (header.size < 0) break;
    pos = header.dataOffset + header.size;
  }

  if (segmentStart === 0) return result;

  // Walk top-level Segment children
  const subtitleTrackNumbers = new Set();
  const trackMap = {};
  const blocks = [];
  let currentClusterTime = 0;

  pos = segmentStart;
  while (pos < segmentEnd) {
    const header = readElementHeader(buf, pos);
    if (!header) break;

    if (header.id === SEGMENT_INFO && header.size >= 0) {
      const infoChildren = iterateChildren(buf, header.dataOffset, header.dataOffset + header.size);
      for (const ic of infoChildren) {
        if (ic.id === TIMECODE_SCALE) {
          timecodeScale = readUint(buf, ic.dataOffset, ic.size);
        }
      }
      pos = header.dataOffset + header.size;
      continue;
    }

    if (header.id === TRACKS && header.size >= 0) {
      const trackEntries = iterateChildren(buf, header.dataOffset, header.dataOffset + header.size);
      for (const te of trackEntries) {
        if (te.id === TRACK_ENTRY) {
          const track = parseTrackEntry(buf, te.dataOffset, te.size);
          if (track.trackType === TRACK_TYPE_SUBTITLE &&
              (track.codecId === 'S_TEXT/ASS' || track.codecId === 'S_TEXT/SSA' || track.codecId === 'S_TEXT/UTF8')) {
            subtitleTrackNumbers.add(track.trackNumber);
            trackMap[track.trackNumber] = track;
            result.tracks.push({
              index: track.trackNumber,
              codecId: track.codecId,
              language: track.language,
              name: track.name,
              codecPrivate: track.codecPrivate ? decoder.decode(track.codecPrivate) : '',
            });
            result.subtitles[track.trackNumber] = [];
          }
        }
      }
      pos = header.dataOffset + header.size;
      continue;
    }

    if (header.id === CLUSTER) {
      const clusterEnd = header.size >= 0 ? header.dataOffset + header.size : segmentEnd;
      let cpos = header.dataOffset;
      while (cpos < clusterEnd) {
        const ch = readElementHeader(buf, cpos);
        if (!ch) break;
        if (ch.size < 0) break;

        if (ch.id === TIMECODE) {
          currentClusterTime = readUint(buf, ch.dataOffset, ch.size);
        } else if (ch.id === SIMPLE_BLOCK) {
          parseBlock(buf, ch.dataOffset, ch.size, currentClusterTime, timecodeScale, subtitleTrackNumbers, result.subtitles, null);
        } else if (ch.id === BLOCK_GROUP) {
          let blockDuration = null;
          let blockHeader = null;
          let blockSize = 0;
          const bgChildren = iterateChildren(buf, ch.dataOffset, ch.dataOffset + ch.size);
          for (const bgc of bgChildren) {
            if (bgc.id === BLOCK) {
              blockHeader = bgc;
              blockSize = bgc.size;
            }
            if (bgc.id === BLOCK_DURATION) {
              blockDuration = readUint(buf, bgc.dataOffset, bgc.size);
            }
          }
          if (blockHeader) {
            parseBlock(buf, blockHeader.dataOffset, blockSize, currentClusterTime, timecodeScale, subtitleTrackNumbers, result.subtitles, blockDuration);
          }
        }
        cpos = ch.dataOffset + ch.size;
      }
      pos = header.size >= 0 ? header.dataOffset + header.size : segmentEnd;
      continue;
    }

    if (header.size < 0) break;
    pos = header.dataOffset + header.size;
  }

  return result;
}

function parseBlock(buf, offset, size, clusterTime, timecodeScale, subtitleTrackNumbers, subtitles, blockDuration) {
  const trackVint = readVint(buf, offset);
  if (!trackVint) return;
  const trackNumber = trackVint.value;
  if (!subtitleTrackNumbers.has(trackNumber)) return;

  const dataStart = offset + trackVint.length;
  if (dataStart + 3 > offset + size) return;

  const relativeTime = readSignedInt16(buf, dataStart);
  // Skip flags byte (dataStart + 2)
  const payloadStart = dataStart + 3;
  const payloadEnd = offset + size;
  if (payloadStart >= payloadEnd) return;

  const text = decoder.decode(buf.slice(payloadStart, payloadEnd));
  const startMs = (clusterTime + relativeTime) * timecodeScale / 1000000;
  const durationMs = blockDuration != null ? blockDuration * timecodeScale / 1000000 : 0;

  subtitles[trackNumber].push({ start: startMs, duration: durationMs, text });
}

function formatASSTimestamp(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function reassembleASS(codecPrivate, subtitles) {
  let header = codecPrivate || '';

  // Ensure [Events] section exists with Format line
  if (!/\[Events\]/i.test(header)) {
    header = header.trimEnd() + '\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  } else if (!/^Format:/m.test(header.slice(header.search(/\[Events\]/i)))) {
    header = header.trimEnd() + '\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  }

  const lines = [];
  for (const sub of subtitles) {
    // MKV ASS block text format: ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    const parts = sub.text.split(',');
    if (parts.length < 9) continue;
    const layer = parts[1] || '0';
    const style = parts[2] || 'Default';
    const name = parts[3] || '';
    const marginL = parts[4] || '0';
    const marginR = parts[5] || '0';
    const marginV = parts[6] || '0';
    const effect = parts[7] || '';
    const text = parts.slice(8).join(',');
    const start = formatASSTimestamp(sub.start / 1000);
    const end = formatASSTimestamp((sub.start + sub.duration) / 1000);
    lines.push(`Dialogue: ${layer},${start},${end},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`);
  }

  return header + lines.join('\n') + '\n';
}

export function srtToASS(subtitles) {
  const header = `[Script Info]
Title: Converted from SRT
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];
  for (const sub of subtitles) {
    const start = formatASSTimestamp(sub.start / 1000);
    const end = formatASSTimestamp((sub.start + sub.duration) / 1000);
    const text = (sub.text || '').replace(/\r?\n/g, '\\N');
    lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
  }

  return header + lines.join('\n') + '\n';
}

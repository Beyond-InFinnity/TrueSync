// ══════════════════════════════════════════════════════════════════════════════
// WAVEFORM GENERATION
//
// Generates min/max peak data from an AudioBuffer for efficient rendering.
// At default 256 samples/pixel, a 22-min episode at 44.1kHz produces ~230KB
// of peak data — trivial memory cost.
// ══════════════════════════════════════════════════════════════════════════════

export function generateWaveformData(audioBuffer, samplesPerPixel = 256) {
  const channel = audioBuffer.getChannelData(0);
  const length = Math.ceil(channel.length / samplesPerPixel);
  const peaks = new Float32Array(length * 2);

  for (let i = 0; i < length; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, channel.length);
    let min = 1, max = -1;
    for (let j = start; j < end; j++) {
      if (channel[j] < min) min = channel[j];
      if (channel[j] > max) max = channel[j];
    }
    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }

  return { peaks, samplesPerPixel, sampleRate: audioBuffer.sampleRate };
}

/**
 * Render waveform peaks to a canvas 2D context.
 * Separated from React to allow offscreen/worker rendering later.
 */
export function renderWaveform(ctx, waveformData, viewStart, viewEnd, pxPerSec, width, height, color) {
  const { peaks, samplesPerPixel, sampleRate } = waveformData;

  ctx.clearRect(0, 0, width, height);

  // Center line
  ctx.strokeStyle = 'rgba(48, 54, 61, 0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Peaks
  const mid = height / 2;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;

  const scrollX = viewStart * pxPerSec;
  const startSample = Math.max(0, Math.floor(viewStart * sampleRate / samplesPerPixel));
  const endSample = Math.min(
    Math.ceil(viewEnd * sampleRate / samplesPerPixel),
    peaks.length / 2
  );

  const barWidth = Math.max(1, pxPerSec * samplesPerPixel / sampleRate);

  for (let i = startSample; i < endSample; i++) {
    const min = peaks[i * 2];
    const max = peaks[i * 2 + 1];
    const x = (i * samplesPerPixel / sampleRate) * pxPerSec - scrollX;

    if (x + barWidth < 0 || x > width) continue;

    const yMin = mid - max * mid;
    const yMax = mid - min * mid;
    ctx.fillRect(x, yMin, barWidth, Math.max(1, yMax - yMin));
  }

  ctx.globalAlpha = 1;
}

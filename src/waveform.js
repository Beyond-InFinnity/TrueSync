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

/**
 * Compute speech-frequency energy from an AudioBuffer.
 * Bandpass filters 300Hz–3400Hz (speech range) then computes windowed RMS.
 * Returns { energy: Float32Array, hopSize, sampleRate, windowSize }.
 */
export async function computeSpeechEnergy(audioBuffer, windowSize = 1024, hopSize = 256) {
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  const offline = new OfflineAudioContext(1, length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;

  // Bandpass via highpass 300Hz → lowpass 3400Hz
  const highpass = offline.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 300;
  highpass.Q.value = 0.7;

  const lowpass = offline.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3400;
  lowpass.Q.value = 0.7;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  const filtered = rendered.getChannelData(0);

  // Windowed RMS
  const numFrames = Math.floor((length - windowSize) / hopSize) + 1;
  const energy = new Float32Array(numFrames);
  let maxEnergy = 0;

  for (let i = 0; i < numFrames; i++) {
    const offset = i * hopSize;
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const s = filtered[offset + j];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / windowSize);
    energy[i] = rms;
    if (rms > maxEnergy) maxEnergy = rms;
  }

  // Normalize to 0–1
  if (maxEnergy > 0) {
    for (let i = 0; i < numFrames; i++) {
      energy[i] /= maxEnergy;
    }
  }

  return { energy, hopSize, sampleRate, windowSize };
}

/**
 * Render speech energy overlay as a symmetric filled envelope on a canvas.
 */
export function renderSpeechOverlay(ctx, speechData, viewStart, viewEnd, pxPerSec, width, height, opacity) {
  const { energy, hopSize, sampleRate } = speechData;
  const mid = height / 2;
  const scrollX = viewStart * pxPerSec;

  const startFrame = Math.max(0, Math.floor(viewStart * sampleRate / hopSize) - 1);
  const endFrame = Math.min(energy.length, Math.ceil(viewEnd * sampleRate / hopSize) + 1);

  if (startFrame >= endFrame) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#FF4444';
  ctx.beginPath();

  // Top edge (left to right)
  let firstX = null;
  for (let i = startFrame; i < endFrame; i++) {
    const x = (i * hopSize / sampleRate) * pxPerSec - scrollX;
    const amp = energy[i] * mid * 0.9;
    if (firstX === null) {
      firstX = x;
      ctx.moveTo(x, mid - amp);
    } else {
      ctx.lineTo(x, mid - amp);
    }
  }

  // Bottom edge (right to left)
  for (let i = endFrame - 1; i >= startFrame; i--) {
    const x = (i * hopSize / sampleRate) * pxPerSec - scrollX;
    const amp = energy[i] * mid * 0.9;
    ctx.lineTo(x, mid + amp);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

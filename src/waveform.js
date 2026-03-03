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
 * Allocate a frame-level speech energy cache for the full audio duration.
 * Energy values are raw RMS (not normalized) — normalize at render time via maxEnergy.
 */
export function initSpeechCache(audioBuffer, windowSize = 1024, hopSize = 256) {
  const totalFrames = Math.max(0, Math.floor((audioBuffer.length - windowSize) / hopSize) + 1);
  return {
    energy: new Float32Array(totalFrames),
    computed: new Uint8Array(totalFrames),
    maxEnergy: 0,
    totalFrames,
    hopSize,
    sampleRate: audioBuffer.sampleRate,
    windowSize,
  };
}

/**
 * Process speech energy in chunks with progress reporting and smart caching.
 * Bandpass-filters 300–3400 Hz, computes windowed RMS per hop frame.
 * Mutates cache in-place. Skips already-computed frames.
 *
 * @param {AudioBuffer} audioBuffer
 * @param {number} startTime - region start in seconds
 * @param {number} endTime - region end in seconds
 * @param {object} cache - from initSpeechCache, mutated in-place
 * @param {object} opts - { onChunkDone, signal, chunkDuration }
 */
export async function computeSpeechEnergyChunked(audioBuffer, startTime, endTime, cache, { onChunkDone, signal, chunkDuration = 15 } = {}) {
  const { hopSize, sampleRate, windowSize, totalFrames } = cache;
  const channel = audioBuffer.getChannelData(0);
  const FILTER_PAD = 4096;

  // Convert time range to frame range
  const startFrame = Math.max(0, Math.floor(startTime * sampleRate / hopSize));
  const endFrame = Math.min(totalFrames, Math.ceil(endTime * sampleRate / hopSize));
  if (startFrame >= endFrame) return;

  // Find uncomputed gaps within the requested range
  const gaps = [];
  let gapStart = null;
  for (let i = startFrame; i < endFrame; i++) {
    if (!cache.computed[i]) {
      if (gapStart === null) gapStart = i;
    } else if (gapStart !== null) {
      gaps.push([gapStart, i]);
      gapStart = null;
    }
  }
  if (gapStart !== null) gaps.push([gapStart, endFrame]);

  if (gaps.length === 0) return; // fully cached

  // Break gaps into chunks of chunkDuration seconds
  const framesPerChunk = Math.ceil(chunkDuration * sampleRate / hopSize);
  const chunks = [];
  for (const [gs, ge] of gaps) {
    for (let f = gs; f < ge; f += framesPerChunk) {
      chunks.push([f, Math.min(f + framesPerChunk, ge)]);
    }
  }

  let completed = 0;
  for (const [chunkStartFrame, chunkEndFrame] of chunks) {
    if (signal?.aborted) return;

    // Sample range this chunk covers (including windowSize tail for last frame's RMS window)
    const sampleStart = chunkStartFrame * hopSize;
    const sampleEnd = Math.min((chunkEndFrame - 1) * hopSize + windowSize, audioBuffer.length);
    const chunkSamples = sampleEnd - sampleStart;

    // Left padding: use real audio samples from before sampleStart (zero-pad only at t=0)
    const padSamples = Math.min(FILTER_PAD, sampleStart);
    const paddedStart = sampleStart - padSamples;
    const paddedLength = padSamples + chunkSamples;

    // Create padded AudioBuffer and copy real samples
    const chunkBuffer = new AudioBuffer({ length: paddedLength, sampleRate, numberOfChannels: 1 });
    const chunkChannel = chunkBuffer.getChannelData(0);
    chunkChannel.set(channel.subarray(paddedStart, paddedStart + paddedLength));

    // Bandpass filter via OfflineAudioContext
    const offline = new OfflineAudioContext(1, paddedLength, sampleRate);
    const source = offline.createBufferSource();
    source.buffer = chunkBuffer;

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

    // Compute RMS on valid region (skip padding)
    for (let f = chunkStartFrame; f < chunkEndFrame; f++) {
      const localOffset = padSamples + (f - chunkStartFrame) * hopSize;
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        const s = filtered[localOffset + j];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / windowSize);
      cache.energy[f] = rms;
      cache.computed[f] = 1;
      if (rms > cache.maxEnergy) cache.maxEnergy = rms;
    }

    completed++;
    onChunkDone?.({ completedChunks: completed, totalChunks: chunks.length });
  }
}

/**
 * Render speech energy overlay as a symmetric filled envelope on a canvas.
 * Energy values are raw RMS — normalized at render time by maxEnergy.
 */
export function renderSpeechOverlay(ctx, cache, viewStart, viewEnd, pxPerSec, width, height, opacity) {
  const { energy, hopSize, sampleRate, maxEnergy, totalFrames } = cache;
  if (!maxEnergy || !totalFrames) return;

  const mid = height / 2;
  const scrollX = viewStart * pxPerSec;

  const startFrame = Math.max(0, Math.floor(viewStart * sampleRate / hopSize) - 1);
  const endFrame = Math.min(totalFrames, Math.ceil(viewEnd * sampleRate / hopSize) + 1);

  if (startFrame >= endFrame) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#FF4444';
  ctx.beginPath();

  // Top edge (left to right)
  let started = false;
  for (let i = startFrame; i < endFrame; i++) {
    const x = (i * hopSize / sampleRate) * pxPerSec - scrollX;
    const amp = (energy[i] / maxEnergy) * mid * 0.9;
    if (!started) {
      ctx.moveTo(x, mid - amp);
      started = true;
    } else {
      ctx.lineTo(x, mid - amp);
    }
  }

  // Bottom edge (right to left)
  for (let i = endFrame - 1; i >= startFrame; i--) {
    const x = (i * hopSize / sampleRate) * pxPerSec - scrollX;
    const amp = (energy[i] / maxEnergy) * mid * 0.9;
    ctx.lineTo(x, mid + amp);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

import { useState, useRef, useCallback } from 'react';
import { generateWaveformData } from '../waveform.js';

export default function useAudio(videoRef) {
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [waveformData, setWaveformData] = useState(null);
  const [duration, setDuration] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);

  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const playStartRef = useRef(null);
  const playOffsetRef = useRef(null);
  const animFrameRef = useRef(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const loadAudio = useCallback(async (file) => {
    const ctx = getAudioContext();
    const arrayBuf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    setAudioBuffer(decoded);
    setDuration(decoded.duration);
    setWaveformData(generateWaveformData(decoded, 256));
  }, [getAudioContext]);

  const stopPlayback = useCallback(() => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    // Read current playheadTime via ref trick: we store it before starting
    const currentPlayhead = playOffsetRef.current ?? 0;
    source.start(0, currentPlayhead);
    audioSourceRef.current = source;
    playStartRef.current = ctx.currentTime;

    setIsPlaying(true);
    source.onended = () => setIsPlaying(false);

    const animate = () => {
      const elapsed = ctx.currentTime - playStartRef.current;
      const currentTime = playOffsetRef.current + elapsed;
      setPlayheadTime(currentTime);
      if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.1) {
        videoRef.current.currentTime = currentTime;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [audioBuffer, getAudioContext, videoRef]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      const ctx = getAudioContext();
      const elapsed = ctx.currentTime - playStartRef.current;
      const newTime = playOffsetRef.current + elapsed;
      setPlayheadTime(newTime);
      playOffsetRef.current = newTime;
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, startPlayback, stopPlayback, getAudioContext]);

  // Keep playOffsetRef in sync with external setPlayheadTime calls
  const setPlayheadTimeWrapped = useCallback((val) => {
    if (typeof val === 'function') {
      setPlayheadTime((prev) => {
        const next = val(prev);
        playOffsetRef.current = next;
        return next;
      });
    } else {
      playOffsetRef.current = val;
      setPlayheadTime(val);
    }
  }, []);

  return {
    audioBuffer, waveformData, duration, setDuration,
    isPlaying, playheadTime, setPlayheadTime: setPlayheadTimeWrapped,
    loadAudio, togglePlayback, stopPlayback,
  };
}

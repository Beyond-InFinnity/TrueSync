import { useRef, useCallback } from 'react';

const HISTORY_LIMIT = 50;

export default function useHistory(setEvents, setTracks) {
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  const pushHistory = useCallback((eventsSnapshot, tracksSnapshot) => {
    const entry = {
      events: eventsSnapshot.map(ev => ({ ...ev })),
      tracks: tracksSnapshot ? tracksSnapshot.map(t => ({ ...t })) : null,
    };
    const history = historyRef.current;
    history.splice(historyIndexRef.current + 1);
    history.push(entry);
    if (history.length > HISTORY_LIMIT) {
      history.splice(0, history.length - HISTORY_LIMIT);
    }
    historyIndexRef.current = history.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const entry = historyRef.current[historyIndexRef.current];
    setEvents(entry.events.map(ev => ({ ...ev })));
    if (entry.tracks) setTracks(entry.tracks.map(t => ({ ...t })));
  }, [setEvents, setTracks]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const entry = historyRef.current[historyIndexRef.current];
    setEvents(entry.events.map(ev => ({ ...ev })));
    if (entry.tracks) setTracks(entry.tracks.map(t => ({ ...t })));
  }, [setEvents, setTracks]);

  const initHistory = useCallback((events, tracks) => {
    historyRef.current = [{
      events: events.map(ev => ({ ...ev })),
      tracks: tracks ? tracks.map(t => ({ ...t })) : null,
    }];
    historyIndexRef.current = 0;
  }, []);

  return { pushHistory, undo, redo, initHistory };
}

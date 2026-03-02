import { useState, useRef, useEffect, useCallback } from 'react';

export default function useDrag({ events, selectedEvents, setSelectedEvents, setEvents, pxPerSec, getAffectedEvents, pushHistory, trackOrder, visibleTracks, tracks }) {
  const [dragState, setDragState] = useState(null);
  const dragStartedRef = useRef(false);

  const handleEventMouseDown = useCallback((e, eventId, mode) => {
    e.stopPropagation();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    const ev = events.find((ev) => ev._id === eventId);
    if (!ev) return;

    // Ctrl/Cmd+click: toggle in selection, no drag
    if (ctrlOrCmd) {
      setSelectedEvents((s) => {
        const ns = new Set(s);
        ns.has(eventId) ? ns.delete(eventId) : ns.add(eventId);
        return ns;
      });
      return;
    }

    // Shift+click: range select, no drag
    if (e.shiftKey) {
      setSelectedEvents((prev) => {
        const allIds = [...prev, eventId];
        const allEvts = allIds.map(id => events.find(ev => ev._id === id)).filter(Boolean);
        const rangeStart = Math.min(...allEvts.map(ev => ev._start));
        const rangeEnd = Math.max(...allEvts.map(ev => ev._end));
        const trackNames = [...new Set(allEvts.map(ev => ev._style))];
        const trackIndices = trackNames.map(n => trackOrder.indexOf(n)).filter(i => i !== -1);
        const minTrack = Math.min(...trackIndices);
        const maxTrack = Math.max(...trackIndices);
        const tracksInRange = trackOrder.slice(minTrack, maxTrack + 1);
        const visTrackNames = new Set(visibleTracks.map(t => t.name));
        const ns = new Set();
        for (const evt of events) {
          if (!visTrackNames.has(evt._style)) continue;
          if (!tracksInRange.includes(evt._style)) continue;
          if (evt._end > rangeStart && evt._start < rangeEnd) {
            ns.add(evt._id);
          }
        }
        return ns;
      });
      return;
    }

    // Build snapshots map for all participating events
    let pendingSelectId = null;
    let activeSelection = selectedEvents;
    if (!selectedEvents.has(eventId)) {
      activeSelection = new Set([eventId]);
      setSelectedEvents(activeSelection);
    } else {
      pendingSelectId = eventId;
    }

    const snapshots = {};
    if (mode === 'resizeStart' || mode === 'resizeEnd') {
      // Edge resize only affects the dragged event
      const evt = events.find(e => e._id === eventId);
      if (evt) snapshots[eventId] = { origStart: evt._start, origEnd: evt._end };
    } else {
      const affected = getAffectedEvents(eventId);
      const participants = new Set([...activeSelection, ...affected]);
      for (const id of participants) {
        const evt = events.find(e => e._id === id);
        if (evt) snapshots[id] = { origStart: evt._start, origEnd: evt._end };
      }
    }
    const preEditSnapshot = events.map(ev => ({ ...ev }));
    dragStartedRef.current = false;
    setDragState({ mode, eventId, startX: e.clientX, snapshots, preEditSnapshot, pendingSelectId });
  }, [events, selectedEvents, setSelectedEvents, getAffectedEvents, trackOrder, visibleTracks]);

  useEffect(() => {
    if (!dragState) return;
    const handleMouseMove = (e) => {
      if (!dragStartedRef.current) {
        if (Math.abs(e.clientX - dragState.startX) < 4) return;
        dragStartedRef.current = true;
      }
      const deltaTime = (e.clientX - dragState.startX) / pxPerSec;
      setEvents((evts) => evts.map((ev) => {
        const snapshot = dragState.snapshots[ev._id];
        if (!snapshot) return ev;
        if (dragState.mode === 'move') {
          return { ...ev, _start: snapshot.origStart + deltaTime, _end: snapshot.origEnd + deltaTime };
        }
        if (dragState.mode === 'resizeStart' && ev._id === dragState.eventId) {
          return { ...ev, _start: Math.min(snapshot.origStart + deltaTime, snapshot.origEnd - 0.01) };
        }
        if (dragState.mode === 'resizeEnd' && ev._id === dragState.eventId) {
          return { ...ev, _end: Math.max(snapshot.origEnd + deltaTime, snapshot.origStart + 0.01) };
        }
        return ev;
      }));
    };
    const handleMouseUp = () => {
      if (dragStartedRef.current && dragState.preEditSnapshot) {
        pushHistory(dragState.preEditSnapshot, tracks);
      }
      if (!dragStartedRef.current && dragState.pendingSelectId) {
        setSelectedEvents(new Set([dragState.pendingSelectId]));
      }
      setDragState(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, pxPerSec, pushHistory, setEvents, setSelectedEvents, tracks]);

  return { dragState, handleEventMouseDown };
}

import { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ClientDB } from '../db/client-db';
import { OperationQueue } from '../sync/op-queue';
import { FocusSession, StudentState } from '../types';

interface Return {
  activeSession: FocusSession | null;
  timeRemaining: number;
  graceCountdown: number | null;
  sessions: FocusSession[];
  startSession: (targetMinutes: number) => void;
  giveUp: () => void;
  clearSession: () => void;
  wasResumed: boolean;
  studentState: StudentState;
}

export function useFocusSession(db: ClientDB, queue: OperationQueue, deviceId: string): Return {
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [graceCountdown, setGraceCountdown] = useState<number | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [wasResumed, setWasResumed] = useState(false);
  const [studentState, setStudentState] = useState<StudentState>(db.getStudentState());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkpointRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionRef = useRef<FocusSession | null>(null);
  const graceActiveRef = useRef(false);

  const clearAllTimers = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
    if (checkpointRef.current) { clearInterval(checkpointRef.current); checkpointRef.current = null; }
  };

  const completeSession = useCallback((sessionId: string, status: 'success' | 'failed', failReason?: string) => {
    const session = db.getSession(sessionId);
    if (!session) return;
    const updated: FocusSession = {
      ...session, status,
      completed_at: Date.now(),
      ...(failReason ? { fail_reason: failReason as any } : {}),
    };
    db.saveSession(updated);
    setActiveSession(updated);
    activeSessionRef.current = updated;

    clearAllTimers();
    db.clearSessionCheckpoint();
    graceActiveRef.current = false;
    setGraceCountdown(null);

    if (status === 'success') {
      queue.enqueue('SESSION_SUCCESS', { session_id: sessionId, target_minutes: session.target_minutes, started_at: session.started_at });
      // Optimistic local reward (server is authoritative and reconciles on next pull)
      const state = db.getStudentState();
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      let streak = state.streak_days;
      if (state.last_focus_date === yesterday) streak += 1;
      else if (state.last_focus_date !== today) streak = 1;
      const newState = { ...state, coins: state.coins + 50, streak_days: streak, focus_minutes_today: state.last_focus_date === today ? state.focus_minutes_today + session.target_minutes : session.target_minutes, last_focus_date: today };
      db.setStudentState(newState);
      setStudentState(newState);
      db.saveSession({ ...updated, reward_granted: true });
      setActiveSession({ ...updated, reward_granted: true });
    } else {
      queue.enqueue('SESSION_FAIL', { session_id: sessionId, target_minutes: session.target_minutes, started_at: session.started_at, fail_reason: failReason });
    }
    setSessions(db.getAllSessions());
  }, [db, queue]);

  // Run the countdown for a session (used by both fresh start and crash-resume).
  const runTimer = useCallback((sessionId: string, startRemaining: number, targetMinutes: number) => {
    clearAllTimers();
    setTimeRemaining(startRemaining);
    let remaining = startRemaining;

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        clearAllTimers();
        completeSession(sessionId, 'success');
      }
    }, 1000);

    // Checkpoint every 10s so a refresh/crash can resume (or fail) accurately.
    checkpointRef.current = setInterval(() => {
      db.setSessionCheckpoint({
        session_id: sessionId,
        target_minutes: targetMinutes,
        started_at: activeSessionRef.current?.started_at ?? Date.now(),
        elapsed_seconds: targetMinutes * 60 - remaining,
        checkpoint_at: Date.now(),
      });
    }, 10000);
  }, [db, completeSession]);

  const giveUp = useCallback(() => {
    if (!activeSessionRef.current || activeSessionRef.current.status !== 'running') return;
    completeSession(activeSessionRef.current.session_id, 'failed', 'give_up');
  }, [completeSession]);

  const startSession = useCallback((targetMinutes: number) => {
    setWasResumed(false);
    const sessionId = uuidv4();
    const session: FocusSession = {
      session_id: sessionId, student_id: 'student-001', device_id: deviceId,
      target_minutes: targetMinutes, started_at: Date.now(),
      status: 'running', reward_granted: false, notified: false,
    };
    db.saveSession(session);
    setActiveSession(session);
    activeSessionRef.current = session;
    graceActiveRef.current = false;
    setGraceCountdown(null);

    // Write an immediate checkpoint so even a crash in the first 10s can recover.
    db.setSessionCheckpoint({
      session_id: sessionId, target_minutes: targetMinutes,
      started_at: session.started_at, elapsed_seconds: 0, checkpoint_at: Date.now(),
    });

    queue.enqueue('SESSION_START', { session_id: sessionId, target_minutes: targetMinutes, started_at: session.started_at });
    runTimer(sessionId, targetMinutes * 60, targetMinutes);
  }, [db, queue, deviceId, runTimer]);

  // Crash recovery: on mount, resume a live session or auto-fail an expired one.
  useEffect(() => {
    const cp = db.getSessionCheckpoint();
    if (!cp) return;
    const session = db.getSession(cp.session_id);
    if (!session || session.status !== 'running') { db.clearSessionCheckpoint(); return; }

    const secondsSince = (Date.now() - cp.checkpoint_at) / 1000;
    const elapsed = cp.elapsed_seconds + secondsSince;
    const remaining = Math.floor(cp.target_minutes * 60 - elapsed);

    setActiveSession(session);
    activeSessionRef.current = session;

    if (remaining > 0) {
      setWasResumed(true);
      runTimer(cp.session_id, remaining, cp.target_minutes);
    } else {
      // Timer would have ended while the app was closed. Per the rules, leaving
      // the session counts as abandoned — auto-fail, don't grant a reward.
      completeSession(cp.session_id, 'failed', 'app_switch');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // App-switch detection: 5s grace, then auto-fail.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (!activeSessionRef.current || activeSessionRef.current.status !== 'running') return;
      if (document.hidden) {
        if (graceActiveRef.current) return;
        graceActiveRef.current = true;
        let g = 5;
        setGraceCountdown(g);
        graceRef.current = setInterval(() => {
          g -= 1;
          setGraceCountdown(g);
          if (g <= 0) {
            if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
            graceActiveRef.current = false;
            if (activeSessionRef.current?.status === 'running') {
              completeSession(activeSessionRef.current.session_id, 'failed', 'app_switch');
            }
          }
        }, 1000);
      } else {
        if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
        graceActiveRef.current = false;
        setGraceCountdown(null);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [completeSession]);

  useEffect(() => {
    setSessions(db.getAllSessions());
    setStudentState(db.getStudentState());
  }, [db]);

  // Clean up every timer when the hook unmounts.
  useEffect(() => clearAllTimers, []);

  const clearSession = useCallback(() => {
    clearAllTimers();
    db.clearSessionCheckpoint();
    setActiveSession(null);
    activeSessionRef.current = null;
    setWasResumed(false);
    setTimeRemaining(0);
    setGraceCountdown(null);
    setSessions(db.getAllSessions());
    setStudentState(db.getStudentState());
  }, [db]);

  return { activeSession, timeRemaining, graceCountdown, sessions, startSession, giveUp, clearSession, wasResumed, studentState };
}

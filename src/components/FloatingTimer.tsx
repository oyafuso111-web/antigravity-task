import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../store/useTaskStore';

import floatingTimerCssUrl from './FloatingTimer.css?url';

// ─── helpers ──────────────────────────────────────────────
const formatTime = (totalSeconds: number): string => {
  const negative = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return negative ? `-${base}` : base;
};

const playNotificationBeep = (win: Window) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = win as any;
    const AudioCtx = w.AudioContext || w.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.30);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.7);
    osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.85);
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 1.0);
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.7);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.3);
    osc2.start(ctx.currentTime + 0.7);
    osc2.stop(ctx.currentTime + 1.3);
  } catch {
    // Silently ignore
  }
};

// ─── PiP API types ────────────────────────────────────────
interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
}
interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  window: Window | null;
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

// ─── Window dimensions ────────────────────────────────────
const PIP_FULL_W = 340;
const PIP_FULL_H = 240;
const PIP_MINI_W = 220;
const PIP_MINI_H = 48;

// ─── component ────────────────────────────────────────────
export function FloatingTimer() {
  const {
    activeTimerTaskId,
    timerStartTimestamp,
    timerTick,
    tasks,
    pauseTimer,
  } = useTaskStore();

  const [minimised, setMinimised] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState<number | null>(null);
  const [countdownPreset, setCountdownPreset] = useState<number | null>(null);
  const hasNotifiedRef = useRef(false);

  const pipWindowRef = useRef<Window | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  // Generation counter: bump to trigger window re-creation
  const [windowGen, setWindowGen] = useState(0);

  // Reset countdown on task change
  useEffect(() => {
    setCountdownTarget(null);
    setCountdownPreset(null);
    hasNotifiedRef.current = false;
  }, [activeTimerTaskId]);

  // ── Derived values ──
  const task = tasks.find((t) => t.id === activeTimerTaskId);
  const elapsedFromStart =
    timerStartTimestamp != null
      ? Math.floor((timerTick - timerStartTimestamp) / 1000)
      : 0;
  const countdownRemaining =
    countdownTarget != null ? countdownTarget - elapsedFromStart : null;
  const isOvertime = countdownRemaining != null && countdownRemaining < 0;

  // ── Window lifecycle (single effect) ──
  useEffect(() => {
    // Close existing window first
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
    }
    pipWindowRef.current = null;
    containerRef.current = null;
    setPortalReady(false);

    // Don't open if no active timer
    if (!activeTimerTaskId || !task) return;

    let cancelled = false;

    const openWindow = async () => {
      const w = minimised ? PIP_MINI_W : PIP_FULL_W;
      const h = minimised ? PIP_MINI_H : PIP_FULL_H;

      let win: Window | null = null;

      // Try Document PiP first
      if (window.documentPictureInPicture) {
        try {
          win = await window.documentPictureInPicture.requestWindow({
            width: w,
            height: h,
            disallowReturnToOpener: true,
          });
        } catch {
          // fall through
        }
      }

      // Fallback: window.open
      if (!win) {
        const left = window.screenX + window.outerWidth - w - 32;
        const top = window.screenY + window.outerHeight - h - 80;
        win = window.open(
          '',
          'antigravity-mini-timer',
          `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`,
        );
        if (win) win.document.title = 'Mini Timer';
      }

      if (cancelled || !win) return;

      // Setup document
      win.document.documentElement.style.cssText = 'margin:0;padding:0;overflow:hidden';
      win.document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:transparent';

      const link = win.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = floatingTimerCssUrl;
      win.document.head.appendChild(link);

      const fontLink = win.document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@600;700&display=swap';
      win.document.head.appendChild(fontLink);

      const container = win.document.createElement('div');
      container.id = 'floating-timer-root';
      win.document.body.appendChild(container);

      pipWindowRef.current = win;
      containerRef.current = container;

      // Handle user closing
      const onClose = () => {
        if (cancelled) return;
        pipWindowRef.current = null;
        containerRef.current = null;
        setPortalReady(false);
      };
      win.addEventListener('pagehide', onClose);
      win.addEventListener('beforeunload', onClose);

      setPortalReady(true);
    };

    openWindow();

    return () => {
      cancelled = true;
    };
    // windowGen triggers re-creation when minimise toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimerTaskId, windowGen]);

  // ── Minimise toggle → bump generation to re-create window ──
  const handleMinimise = useCallback(() => {
    setMinimised(true);
    setWindowGen((g) => g + 1);
  }, []);

  const handleExpand = useCallback(() => {
    setMinimised(false);
    setWindowGen((g) => g + 1);
  }, []);

  // Update title
  useEffect(() => {
    const win = pipWindowRef.current;
    if (!win || win.closed || !task) return;
    const ds = countdownRemaining != null ? countdownRemaining : elapsedFromStart;
    try {
      win.document.title = `${formatTime(ds)} – ${task.title}`;
    } catch { /* closed */ }
  }, [timerTick, task, countdownRemaining, elapsedFromStart]);

  // Notification trigger
  useEffect(() => {
    if (countdownRemaining !== null && countdownRemaining <= 0 && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      const targetWin = pipWindowRef.current && !pipWindowRef.current.closed ? pipWindowRef.current : window;
      playNotificationBeep(targetWin);
    }
  }, [countdownRemaining]);

  // ── Handlers ──
  const handlePreset = useCallback(
    (minutes: number) => {
      if (countdownPreset === minutes) {
        setCountdownTarget(null);
        setCountdownPreset(null);
        hasNotifiedRef.current = false;
        return;
      }
      setCountdownTarget(elapsedFromStart + minutes * 60);
      setCountdownPreset(minutes);
      hasNotifiedRef.current = false;
    },
    [elapsedFromStart, countdownPreset],
  );

  const cancelCountdown = useCallback(() => {
    setCountdownTarget(null);
    setCountdownPreset(null);
    hasNotifiedRef.current = false;
  }, []);

  const handleStop = useCallback(() => {
    pauseTimer();
  }, [pauseTimer]);

  // ── Guard ──
  if (!activeTimerTaskId || !task || !portalReady || !containerRef.current) {
    return null;
  }

  const displaySeconds = countdownRemaining != null ? countdownRemaining : elapsedFromStart;
  const displayLabel = countdownRemaining != null
    ? isOvertime ? 'OVERTIME' : `${countdownPreset}min タイマー`
    : 'ELAPSED';

  return createPortal(
    <div
      className={`floating-timer ft-popup-mode${minimised ? ' ft-minimised' : ''}`}
      onClick={minimised ? handleExpand : undefined}
      id="floating-timer"
    >
      {/* Mini pill display */}
      <div className="ft-mini-display">
        <span className="ft-mini-dot" />
        <span className="ft-mini-task-name" title={task.title}>
          {task.title}
        </span>
        <span className="ft-mini-time">{formatTime(displaySeconds)}</span>
      </div>

      {/* Full body */}
      <div className="ft-body">
        <div className="ft-header">
          <span className="ft-task-name" title={task.title}>
            {task.title}
          </span>
          <div className="ft-header-actions">
            <button
              className="ft-icon-btn"
              onClick={handleMinimise}
              title="最小化"
              aria-label="最小化"
            >
              ─
            </button>
          </div>
        </div>

        <div className="ft-time-display">
          <div className={`ft-time-value${isOvertime ? ' ft-overtime' : ''}`}>
            {formatTime(displaySeconds)}
          </div>
          <div className="ft-time-label">{displayLabel}</div>
        </div>

        <div className="ft-presets">
          {[5, 10, 15, 25].map((m) => (
            <button
              key={m}
              className={`ft-preset-btn${countdownPreset === m ? ' ft-preset-active' : ''}`}
              onClick={() => handlePreset(m)}
            >
              {m}分
            </button>
          ))}
        </div>

        <div className="ft-controls">
          {countdownTarget != null && (
            <button className="ft-cancel-timer-btn" onClick={cancelCountdown}>
              ✕ リセット
            </button>
          )}
          <button className="ft-stop-btn" onClick={handleStop}>
            ■ 停止
          </button>
        </div>
      </div>
    </div>,
    containerRef.current,
  );
}

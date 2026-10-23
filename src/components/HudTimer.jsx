import { useState, useEffect } from "react";

// Thời lượng chuẩn từng phase (khớp 1:1 với server/gameEngine.js & gameController.js)
const PHASE_DURATIONS_SEC = {
  night_guard: 20,
  night_wolf: 30,
  night_witch: 25,
  night_seer: 20,
  day_reveal: 5,
  day_discuss: 180,
  day_nominate: 30,
  day_defense: 60,
  day_final_vote: 30,
  day_no_nomination: 4,
};

/**
 * Tách riêng đồng hồ tổng thời gian ván đấu để KHÔNG làm PlayingView & Canvas 3D re-render mỗi 1 giây.
 */
export function HudGameClock({ gameStartedAt }) {
  const [gameTimeStr, setGameTimeStr] = useState("00:00");

  useEffect(() => {
    if (!gameStartedAt) {
      setGameTimeStr("00:00");
      return;
    }
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - gameStartedAt) / 1000));
      const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
      const s = (elapsed % 60).toString().padStart(2, "0");
      setGameTimeStr(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameStartedAt]);

  return <div className="game-time">⏱ {gameTimeStr}</div>;
}

/**
 * Đồng hồ đếm ngược từng Phase (hiển thị cả ban đêm cho người đang ngủ để biết ván vẫn đang chạy).
 */
export function HudPhaseCountdown({ phaseEndsAt, isNight, isMyTurn, hasWinner }) {
  const [leftSec, setLeftSec] = useState(null);

  useEffect(() => {
    if (!phaseEndsAt || hasWinner) {
      setLeftSec(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
      setLeftSec(left);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phaseEndsAt, hasWinner]);

  if (leftSec === null || hasWinner) return null;

  const urgent = leftSec <= 8 && leftSec > 0;
  const label = leftSec <= 0
    ? "Chuyển lượt..."
    : isNight && !isMyTurn
      ? `🌙 Chờ ${leftSec}s`
      : `${leftSec}s`;

  return (
    <span
      className="phase-timer"
      style={
        isNight && !isMyTurn
          ? {
              background: "rgba(99,102,241,0.22)",
              borderColor: "rgba(129,140,248,0.55)",
              color: "#c7d2fe",
              animation: "none",
            }
          : urgent
            ? { background: "rgba(239,68,68,0.38)", borderColor: "#f87171", color: "#fff" }
            : undefined
      }
    >
      {label}
    </span>
  );
}

/**
 * Thanh tiến trình thời gian ở dưới HUD (chia chuẩn theo thời lượng thật của từng Phase thay vì chia cứng /60).
 */
export function HudPhaseProgressBar({ phaseEndsAt, nightDayPhase, hasWinner }) {
  const [pct, setPct] = useState(100);

  useEffect(() => {
    if (!phaseEndsAt || hasWinner) {
      setPct(0);
      return;
    }
    const baseDurMs = (PHASE_DURATIONS_SEC[nightDayPhase] || 30) * 1000;
    const initialSpanMs = Math.max(baseDurMs, phaseEndsAt - Date.now());

    const tick = () => {
      const leftMs = Math.max(0, phaseEndsAt - Date.now());
      const nextPct = Math.max(0, Math.min(100, (leftMs / initialSpanMs) * 100));
      setPct(nextPct);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phaseEndsAt, nightDayPhase, hasWinner]);

  if (!phaseEndsAt || hasWinner) return null;

  return (
    <div className="timer-progress-bar">
      <div className="timer-progress-fill" style={{ width: `${pct}%`, transition: "width 0.25s linear" }} />
    </div>
  );
}

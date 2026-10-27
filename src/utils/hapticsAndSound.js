// =============================================================================
// RUNG XÚC GIÁC ZERO-LEAK (CHỐT #7 & #13) & ÂM THANH LỬA TRẠI / CHUÔNG THÁP 0 KB
// - TUYỆT ĐỐI CẤM rung khi bị Sói cắn / trúng độc ban đêm (0% lộ thông tin vật lý!)
// - Chỉ rung ở 4 khoảnh khắc hợp lệ: Tới lượt của chính mình, 6s đếm ngược lượt mình,
//   Bình minh ló dạng (đồng loạt), và Pháp trường / Đạn bạc Thợ Săn.
// - Tự động try/catch an toàn 100% trên iOS Safari (nơi navigator.vibrate = undefined).
// =============================================================================

const ALLOWED_HAPTIC_PATTERNS = {
  my_turn: [38, 55, 65],
  countdown_urgent: [24],
  dawn_reveal: [30, 45, 30],
  tribunal: [55, 40, 85],
  ui_tap: [12],
};

let lastHapticAtMs = 0;

export function safeHaptic(eventKey) {
  // Chốt #7: Chặn cứng mọi mã sự kiện ngoài danh sách an toàn Zero-Leak!
  const pattern = ALLOWED_HAPTIC_PATTERNS[eventKey];
  if (!pattern) return false;

  const now = Date.now();
  if (now - lastHapticAtMs < 350) return false;
  lastHapticAtMs = now;

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function" &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      return Boolean(navigator.vibrate(pattern));
    }
  } catch {
    // Chốt #13: iOS Safari / WebView khóa quyền rung -> im lặng tuyệt đối không crash
  }
  return false;
}

// ── Bộ tổng hợp Âm thanh Không gian Lửa Trại & Chuông Tháp Bắc Âu (0 KB WebAudio) ──
let hearthCtx = null;
let crackleTimer = null;
let masterHearthGain = null;

function ensureHearthContext() {
  if (typeof window === "undefined") return null;
  if (hearthCtx) return hearthCtx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    hearthCtx = new AudioCtx();
    masterHearthGain = hearthCtx.createGain();
    masterHearthGain.gain.value = 0.16;
    masterHearthGain.connect(hearthCtx.destination);
    return hearthCtx;
  } catch {
    return null;
  }
}

export function resumeSpatialAudioIfNeeded() {
  if (!hearthCtx) return;
  try {
    if (hearthCtx.state === "suspended") {
      hearthCtx.resume().catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function playNordicTowerBell() {
  const ctx = ensureHearthContext();
  if (!ctx || !masterHearthGain) return;
  try {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const partials = [
      { freq: 220, gain: 0.22, dur: 1.8, type: "triangle" },
      { freq: 440, gain: 0.12, dur: 1.4, type: "sine" },
      { freq: 659.25, gain: 0.08, dur: 1.05, type: "sine" },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(p.gain, now + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
      osc.connect(g);
      g.connect(masterHearthGain);
      osc.start(now);
      osc.stop(now + p.dur + 0.04);
    }
  } catch {
    // ignore
  }
}

function triggerSingleEmberPop() {
  if (!hearthCtx || !masterHearthGain || hearthCtx.state !== "running") return;
  try {
    const now = hearthCtx.currentTime;
    const dur = 0.025 + Math.random() * 0.035;
    const sampleCount = Math.max(64, Math.floor(hearthCtx.sampleRate * dur));
    const buffer = hearthCtx.createBuffer(1, sampleCount, hearthCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const env = Math.pow(1 - i / sampleCount, 2.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = hearthCtx.createBufferSource();
    src.buffer = buffer;

    const filter = hearthCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 + Math.random() * 1600;
    filter.Q.value = 1.8;

    const g = hearthCtx.createGain();
    g.gain.value = 0.05 + Math.random() * 0.06;

    src.connect(filter);
    filter.connect(g);
    g.connect(masterHearthGain);
    src.start(now);
  } catch {
    // ignore
  }
}

export function startBonfireCrackling() {
  if (crackleTimer) return;
  ensureHearthContext();
  const scheduleNext = () => {
    crackleTimer = window.setTimeout(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        triggerSingleEmberPop();
      }
      if (crackleTimer) scheduleNext();
    }, 320 + Math.random() * 950);
  };
  scheduleNext();
}

export function stopBonfireCrackling() {
  if (crackleTimer) {
    clearTimeout(crackleTimer);
    crackleTimer = null;
  }
}

// SFX utility -- Universe-aware sound effects (Classic Nordic / Office KPI / School Bell)
// Normal sound ON by default; 100% muted when user toggles Mute button!

import { playNordicTowerBell } from "../utils/hapticsAndSound.js";

const cache = {};
let sfxMuted = false;
let currentUniverseId = "classic";
let synthCtx = null;

function getSynthCtx() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!synthCtx) {
    try {
      synthCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (synthCtx.state === "suspended") {
    synthCtx.resume().catch(() => {});
  }
  return synthCtx;
}

function playSynthTone(freqStart, freqEnd, durSec = 0.22, type = "sine", gainVal = 0.14, delaySec = 0) {
  if (sfxMuted) return;
  const ctx = getSynthCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freqStart), t0);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + durSec);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainVal, t0 + Math.min(0.025, durSec * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  } catch {
    // ignore audio synth quirks
  }
}

function playMp3(src, volume = 0.7) {
  if (sfxMuted) return;
  try {
    if (!cache[src]) {
      cache[src] = new Audio(src);
    }
    const audio = cache[src].cloneNode();
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    // ignore missing sfx file
  }
}

export const SFX = {
  setMuted: (muted) => {
    sfxMuted = Boolean(muted);
  },
  isMuted: () => sfxMuted,
  setUniverse: (uId) => {
    currentUniverseId = uId === "office" || uId === "school" ? uId : "classic";
  },
  vote: () => {
    if (sfxMuted) return;
    if (currentUniverseId === "office") {
      // Tiếng cộp đóng mộc duyệt / gửi biểu quyết
      playSynthTone(240, 110, 0.14, "triangle", 0.16, 0);
      playSynthTone(660, 880, 0.12, "sine", 0.08, 0.05);
      return;
    }
    if (currentUniverseId === "school") {
      // Tiếng gõ bảng con / bút tích
      playSynthTone(520, 680, 0.13, "triangle", 0.14, 0);
      return;
    }
    playMp3("/audio/sfx_vote.mp3", 0.6);
  },
  death: () => {
    if (sfxMuted) return;
    if (currentUniverseId === "office") {
      // Tiếng đóng mộc đỏ CẮT KPI đanh gọn
      playSynthTone(185, 68, 0.28, "triangle", 0.22, 0);
      playSynthTone(370, 185, 0.22, "sine", 0.11, 0.06);
      return;
    }
    if (currentUniverseId === "school") {
      // Tiếng gõ thước kẻ gỗ + còi nhắc nhở nhẹ
      playSynthTone(620, 310, 0.16, "triangle", 0.18, 0);
      playSynthTone(784, 587, 0.24, "sine", 0.12, 0.08);
      return;
    }
    playMp3("/audio/sfx_death.mp3", 0.7);
  },
  bell: () => {
    if (sfxMuted) return;
    if (currentUniverseId === "office") {
      // Tiếng chuông Ting-Ting họp văn phòng hiện đại
      playSynthTone(587.33, 587.33, 0.22, "sine", 0.13, 0);
      playSynthTone(880, 880, 0.32, "sine", 0.14, 0.12);
      return;
    }
    if (currentUniverseId === "school") {
      // Tiếng chuông reng vào tiết học đường
      playSynthTone(659.25, 659.25, 0.18, "triangle", 0.14, 0);
      playSynthTone(783.99, 783.99, 0.18, "triangle", 0.14, 0.11);
      playSynthTone(1046.5, 1046.5, 0.3, "sine", 0.13, 0.22);
      return;
    }
    playNordicTowerBell();
    playMp3("/audio/sfx_bell.mp3", 0.75);
  },
  winVillage: () => {
    if (sfxMuted) return;
    if (currentUniverseId !== "classic") {
      playSynthTone(523.25, 523.25, 0.22, "sine", 0.14, 0);
      playSynthTone(659.25, 659.25, 0.22, "sine", 0.14, 0.12);
      playSynthTone(783.99, 783.99, 0.24, "sine", 0.14, 0.24);
      playSynthTone(1046.5, 1046.5, 0.48, "triangle", 0.16, 0.36);
      return;
    }
    playMp3("/audio/sfx_win_village.mp3", 0.8);
  },
  winWolf: () => {
    if (sfxMuted) return;
    if (currentUniverseId !== "classic") {
      // Âm hiệu kịch tính hài hước (0% tiếng Sói hú!)
      playSynthTone(392, 349.23, 0.24, "triangle", 0.15, 0);
      playSynthTone(329.63, 261.63, 0.32, "triangle", 0.16, 0.18);
      playSynthTone(220, 196, 0.45, "sine", 0.16, 0.38);
      return;
    }
    playMp3("/audio/sfx_win_wolf.mp3", 0.8);
  },
  select: () => {
    if (sfxMuted) return;
    if (currentUniverseId !== "classic") {
      playSynthTone(740, 920, 0.08, "sine", 0.08, 0);
      return;
    }
    playMp3("/audio/sfx_select.mp3", 0.5);
  },
  hangdrum: () => {
    if (sfxMuted) return;
    if (currentUniverseId !== "classic") {
      playSynthTone(293.66, 220, 0.28, "triangle", 0.13, 0);
      return;
    }
    playMp3("/audio/sfx_hang.mp3", 0.7);
  },
};

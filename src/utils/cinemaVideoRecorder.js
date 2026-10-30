/**
 * BỘ QUAY VIDEO PHIM ĐIỆN ẢNH NỘI BỘ (ZERO-POPUP 2D CINEMA COMPOSITOR + WEBAUDIO SYNTH):
 * - Ghép trực tiếp khung hình WebGL 3D (<Canvas preserveDrawingBuffer>) với Dải Phụ Đề Điện Ảnh Letterbox 16:9 (1280x720 @ 30fps).
 * - Ẩn sạch 100% nút bấm điều khiển UI khỏi file Video xuất ra để người xem tập trung trọn vẹn vào câu chuyện.
 * - Tổng hợp âm thanh nền & hiệu ứng điện ảnh bằng WebAudio API (MediaStreamAudioDestinationNode) -> Có tiếng sống động mà KHÔNG bật Popup xin quyền chia sẻ màn hình!
 */

let sharedAudioEngine = null;

export function getCinemaAudioEngine() {
  if (typeof window === "undefined") return null;
  if (sharedAudioEngine) return sharedAudioEngine;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    const ctx = new AudioCtx();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.75;

    const speakerGain = ctx.createGain();
    speakerGain.gain.value = 0.48;

    const recordDest = ctx.createMediaStreamDestination();
    masterGain.connect(speakerGain);
    speakerGain.connect(ctx.destination);
    masterGain.connect(recordDest);

    // Kênh giọng đọc MC Clone riêng biệt: vừa phát ra loa cực nét (0.95) vừa trộn thẳng vào luồng thu Video MP4/WebM!
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1.0;
    const voiceSpeakerGain = ctx.createGain();
    voiceSpeakerGain.gain.value = 0.95;
    const voiceRecordGain = ctx.createGain();
    voiceRecordGain.gain.value = 0.95;
    voiceGain.connect(voiceSpeakerGain);
    voiceSpeakerGain.connect(ctx.destination);
    voiceGain.connect(voiceRecordGain);
    voiceRecordGain.connect(recordDest);

    let isSpeakerMuted = false;
    let currentVoiceRate = 1.5;
    let activeVoiceSource = null;
    let activeVoiceAudio = null;
    let activeVoiceUrl = null;
    let activeVoiceMediaNode = null;
    let activeFallbackAudio = null;
    let activeFallbackUrl = null;
    let lastPlayBlockedByGesture = false;

    const normalizeVoiceRate = (rate) => {
      const n = Number(rate);
      return Math.min(3.0, Math.max(0.75, Number.isFinite(n) && n > 0 ? n : currentVoiceRate || 1.5));
    };

    const applyPitchPreservedRate = (audio, rate) => {
      if (!audio) return;
      try {
        if ("preservesPitch" in audio) audio.preservesPitch = true;
        if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = true;
        if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;
      } catch {
        // ignore browser-specific rate quirks
      }
    };

    const cleanupMediaVoiceAudio = () => {
      if (activeVoiceAudio) {
        try {
          activeVoiceAudio.onplaying = null;
          activeVoiceAudio.onended = null;
          activeVoiceAudio.onerror = null;
          activeVoiceAudio.pause();
          activeVoiceAudio.removeAttribute("src");
        } catch {
          // ignore
        }
        activeVoiceAudio = null;
      }
      if (activeVoiceMediaNode) {
        try {
          activeVoiceMediaNode.disconnect();
        } catch {
          // ignore
        }
        activeVoiceMediaNode = null;
      }
      if (activeVoiceUrl) {
        try {
          URL.revokeObjectURL(activeVoiceUrl);
        } catch {
          // ignore
        }
        activeVoiceUrl = null;
      }
    };

    const cleanupFallbackAudio = () => {
      if (activeFallbackAudio) {
        try {
          activeFallbackAudio.onplaying = null;
          activeFallbackAudio.onended = null;
          activeFallbackAudio.onerror = null;
          activeFallbackAudio.pause();
          activeFallbackAudio.removeAttribute("src");
        } catch {
          // ignore
        }
        activeFallbackAudio = null;
      }
      if (activeFallbackUrl) {
        try {
          URL.revokeObjectURL(activeFallbackUrl);
        } catch {
          // ignore
        }
        activeFallbackUrl = null;
      }
    };

    const stopVoice = () => {
      if (activeVoiceSource) {
        try {
          activeVoiceSource.onended = null;
          activeVoiceSource.stop();
          activeVoiceSource.disconnect();
        } catch {
          // ignore already stopped
        }
        activeVoiceSource = null;
      }
      cleanupMediaVoiceAudio();
      cleanupFallbackAudio();
    };

    const setPlaybackRate = (nextRate) => {
      currentVoiceRate = normalizeVoiceRate(nextRate);
      applyPitchPreservedRate(activeVoiceAudio, currentVoiceRate);
      applyPitchPreservedRate(activeFallbackAudio, currentVoiceRate);
    };

    const playFallbackHtmlAudio = (arrayBuffer, safeRate) =>
      new Promise((resolve) => {
        try {
          const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.preload = "auto";
          applyPitchPreservedRate(audio, safeRate);
          audio.volume = isSpeakerMuted ? 0 : 0.95;
          activeFallbackAudio = audio;
          activeFallbackUrl = url;

          let settled = false;
          const finish = (ok) => {
            if (settled) return;
            settled = true;
            if (activeFallbackAudio === audio) {
              cleanupFallbackAudio();
            } else {
              try {
                URL.revokeObjectURL(url);
              } catch {
                // ignore
              }
            }
            resolve(ok);
          };

          audio.onplaying = () => {
            lastPlayBlockedByGesture = false;
          };
          audio.onended = () => finish(true);
          audio.onerror = () => finish(false);
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((err) => {
              if (err?.name === "NotAllowedError" || ctx.state !== "running") {
                lastPlayBlockedByGesture = true;
              }
              finish(false);
            });
          }
        } catch {
          resolve(false);
        }
      });

    const playVoiceArrayBuffer = async (arrayBuffer, playbackRate = currentVoiceRate) => {
      if (!arrayBuffer || arrayBuffer.byteLength < 500) return false;
      stopVoice();
      const safeRate = normalizeVoiceRate(playbackRate);
      currentVoiceRate = safeRate;

      try {
        if (ctx.state !== "running") {
          await Promise.race([
            ctx.resume().catch(() => {}),
            new Promise((r) => setTimeout(r, 180)),
          ]);
        }

        if (ctx.state === "running" && typeof ctx.createMediaElementSource === "function") {
          lastPlayBlockedByGesture = false;
          return await new Promise((resolve) => {
            let url = null;
            let mediaNode = null;
            try {
              const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
              url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.preload = "auto";
              audio.volume = 1.0;
              applyPitchPreservedRate(audio, safeRate);

              mediaNode = ctx.createMediaElementSource(audio);
              mediaNode.connect(voiceGain);

              activeVoiceAudio = audio;
              activeVoiceUrl = url;
              activeVoiceMediaNode = mediaNode;

              let settled = false;
              const finish = (ok) => {
                if (settled) return;
                settled = true;
                if (activeVoiceAudio === audio) {
                  cleanupMediaVoiceAudio();
                } else {
                  try {
                    mediaNode?.disconnect();
                  } catch {
                    // ignore
                  }
                  if (url) {
                    try {
                      URL.revokeObjectURL(url);
                    } catch {
                      // ignore
                    }
                  }
                }
                resolve(ok);
              };

              audio.onplaying = () => {
                lastPlayBlockedByGesture = false;
              };
              audio.onended = () => finish(true);
              audio.onerror = () => finish(false);
              const playPromise = audio.play();
              if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch((err) => {
                  if (err?.name === "NotAllowedError") {
                    lastPlayBlockedByGesture = true;
                  }
                  finish(false);
                });
              }
            } catch {
              try {
                mediaNode?.disconnect();
              } catch {
                // ignore
              }
              if (url) {
                try {
                  URL.revokeObjectURL(url);
                } catch {
                  // ignore
                }
              }
              resolve(false);
            }
          });
        }
      } catch {
        // Fallback sang HTMLAudioElement bên dưới nếu WebAudio bị khóa hoặc lỗi khởi tạo
      }

      return await playFallbackHtmlAudio(arrayBuffer, safeRate);
    };

    // Đệm âm trầm Bắc Âu rất nhẹ (giữ luồng AudioTrack của MediaRecorder luôn thông suốt không bị ngắt frame câm)
    const droneOsc = ctx.createOscillator();
    const droneFilter = ctx.createBiquadFilter();
    const droneGain = ctx.createGain();
    droneOsc.type = "triangle";
    droneOsc.frequency.value = 55;
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 140;
    droneGain.gain.value = 0.0001;
    droneOsc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(masterGain);
    droneOsc.start();

    const setAmbientActive = (active) => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      droneGain.gain.cancelScheduledValues(now);
      droneGain.gain.setTargetAtTime(active ? 0.032 : 0.0001, now, 0.35);
    };

    const setSpeakerMuted = (muted) => {
      isSpeakerMuted = Boolean(muted);
      speakerGain.gain.value = muted ? 0 : 0.48;
      voiceSpeakerGain.gain.value = muted ? 0 : 0.95;
      if (activeFallbackAudio) {
        activeFallbackAudio.volume = muted ? 0 : 0.95;
      }
    };

    const playTone = (freqStart, freqEnd, durationSec, type = "sine", peakGain = 0.16, delaySec = 0) => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const t0 = ctx.currentTime + delaySec;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(24, freqStart), t0);
      if (freqEnd && freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), t0 + durationSec);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peakGain, t0 + Math.min(0.04, durationSec * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + durationSec + 0.03);
    };

    const triggerBeatSound = (cueKey = "story", universeId = "classic") => {
      try {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        if (universeId === "office") {
          switch (cueKey) {
            case "reveal_wave":
              playTone(392, 392, 0.45, "sine", 0.12, 0);
              playTone(587.33, 587.33, 0.55, "sine", 0.12, 0.12);
              playTone(783.99, 783.99, 0.75, "triangle", 0.11, 0.24);
              break;
            case "wolf_aim":
            case "wolf_whisper":
              playTone(320, 240, 0.22, "triangle", 0.08, 0);
              break;
            case "wolf_attack":
              // Tiếng cộp đóng Mộc Đỏ CẮT KPI đanh gọn
              playTone(180, 68, 0.28, "triangle", 0.19, 0);
              playTone(440, 220, 0.22, "sine", 0.11, 0.06);
              break;
            case "guard_aim":
            case "guard_block":
              playTone(587.33, 880, 0.48, "sine", 0.14, 0);
              break;
            case "witch_save":
              playTone(523.25, 783.99, 0.45, "sine", 0.13, 0);
              break;
            case "witch_poison":
              playTone(349.23, 196, 0.42, "triangle", 0.13, 0);
              break;
            case "seer_scan":
              // Bíp quét IP Wi-Fi Matrix
              playTone(880, 1174.66, 0.14, "sine", 0.1, 0);
              playTone(1174.66, 1318.5, 0.18, "sine", 0.1, 0.14);
              break;
            case "mvp_crown":
              playTone(523.25, 523.25, 0.55, "sine", 0.13, 0);
              playTone(659.25, 659.25, 0.55, "sine", 0.13, 0.12);
              playTone(783.99, 783.99, 0.65, "sine", 0.13, 0.24);
              playTone(1046.5, 1046.5, 0.9, "triangle", 0.14, 0.36);
              break;
            default:
              playTone(440, 523.25, 0.25, "sine", 0.07, 0);
              break;
          }
          return;
        }
        if (universeId === "school") {
          switch (cueKey) {
            case "reveal_wave":
              // Tiếng chuông vào tiết rộn ràng
              playTone(659.25, 659.25, 0.22, "triangle", 0.12, 0);
              playTone(783.99, 783.99, 0.22, "triangle", 0.12, 0.12);
              playTone(1046.5, 1046.5, 0.45, "sine", 0.12, 0.24);
              break;
            case "wolf_aim":
            case "wolf_whisper":
              playTone(480, 360, 0.2, "triangle", 0.08, 0);
              break;
            case "wolf_attack":
              // Tiếng gõ thước kẻ gỗ lên bàn + bút tích Sổ Đầu Bài
              playTone(640, 290, 0.18, "triangle", 0.17, 0);
              playTone(880, 587.33, 0.24, "sine", 0.11, 0.08);
              break;
            case "guard_aim":
            case "guard_block":
              playTone(523.25, 783.99, 0.42, "triangle", 0.13, 0);
              break;
            case "seer_scan":
              // Còi/đèn Sao Đỏ
              playTone(783.99, 987.77, 0.22, "sine", 0.11, 0);
              break;
            case "mvp_crown":
              playTone(523.25, 659.25, 0.35, "triangle", 0.13, 0);
              playTone(783.99, 1046.5, 0.75, "sine", 0.14, 0.18);
              break;
            default:
              playTone(523.25, 587.33, 0.22, "sine", 0.07, 0);
              break;
          }
          return;
        }
        switch (cueKey) {
          case "reveal_wave":
            playTone(196, 196, 1.1, "triangle", 0.14, 0);
            playTone(293.66, 293.66, 1.15, "sine", 0.12, 0.12);
            playTone(392, 392, 1.3, "sine", 0.11, 0.25);
            break;
          case "wolf_aim":
          case "wolf_whisper":
            playTone(82, 54, 0.65, "sawtooth", 0.07, 0);
            break;
          case "wolf_attack":
            playTone(155, 38, 0.55, "sawtooth", 0.18, 0);
            playTone(420, 95, 0.28, "triangle", 0.12, 0.05);
            break;
          case "guard_aim":
            playTone(330, 440, 0.5, "triangle", 0.1, 0);
            break;
          case "guard_block":
            playTone(523.25, 523.25, 0.75, "triangle", 0.16, 0);
            playTone(783.99, 783.99, 0.85, "sine", 0.14, 0.04);
            break;
          case "witch_save":
            playTone(392, 392, 0.45, "sine", 0.11, 0);
            playTone(493.88, 493.88, 0.45, "sine", 0.11, 0.11);
            playTone(587.33, 587.33, 0.65, "sine", 0.13, 0.22);
            break;
          case "witch_poison":
            playTone(311.13, 207.65, 0.72, "triangle", 0.13, 0);
            break;
          case "seer_scan":
            playTone(659.25, 659.25, 0.75, "sine", 0.11, 0);
            playTone(987.77, 987.77, 0.9, "sine", 0.09, 0.1);
            break;
          case "cursed_transform":
          case "tough_guy_endure":
            playTone(110, 220, 0.85, "sawtooth", 0.12, 0);
            break;
          case "day_point":
            playTone(246.94, 196, 0.45, "triangle", 0.11, 0);
            break;
          case "day_tribunal":
            playTone(98, 46, 0.82, "triangle", 0.18, 0);
            playTone(196, 146.8, 0.65, "sine", 0.1, 0.08);
            break;
          case "mvp_crown":
            playTone(261.63, 261.63, 1.3, "triangle", 0.14, 0);
            playTone(329.63, 329.63, 1.3, "sine", 0.12, 0.12);
            playTone(392.0, 392.0, 1.4, "sine", 0.12, 0.24);
            playTone(523.25, 523.25, 1.6, "sine", 0.14, 0.36);
            break;
          default:
            playTone(220, 246.94, 0.4, "sine", 0.06, 0);
            break;
        }
      } catch {
        // ignore audio errors
      }
    };

    sharedAudioEngine = {
      ctx,
      recordStream: recordDest.stream,
      setAmbientActive,
      setSpeakerMuted,
      triggerBeatSound,
      playVoiceArrayBuffer,
      stopVoice,
      setPlaybackRate,
      wasBlockedByAutoplay: () => lastPlayBlockedByGesture,
      clearAutoplayBlockFlag: () => {
        lastPlayBlockedByGesture = false;
      },
    };
    return sharedAudioEngine;
  } catch {
    return null;
  }
}

/**
 * Mở khóa sớm WebAudio Context ngay từ cú click đầu tiên của người chơi ở Sảnh Chờ / Vào Bàn,
 * đảm bảo khi sang Phim Kể Chuyện cuối game `ctx.state === "running"` phát tiếng tức thì 100%!
 */
export function unlockCinemaAudioEngine() {
  const eng = getCinemaAudioEngine();
  if (eng?.ctx && eng.ctx.state !== "running") {
    try {
      eng.ctx
        .resume()
        .then(() => {
          eng.clearAutoplayBlockFlag?.();
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  } else {
    eng?.clearAutoplayBlockFlag?.();
  }
  return eng;
}

function pickSupportedRecorderMime() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return null;
  }
  const candidates = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mimeType: "video/mp4", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  for (const item of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(item.mimeType)) {
        return item;
      }
    } catch {
      // continue
    }
  }
  return { mimeType: "", ext: "webm" };
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines.slice(0, 3);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function startCinemaStoryRecording({ getOverlayState, aspectMode = "16:9" } = {}) {
  const supported = pickSupportedRecorderMime();
  if (!supported) {
    throw new Error("Trình duyệt này không hỗ trợ MediaRecorder để quay video.");
  }

  const sourceCanvas = document.querySelector(".werewolf-stage-3d canvas");
  if (!sourceCanvas) {
    throw new Error("Không tìm thấy khung hình sân khấu 3D để ghi hình.");
  }

  const isVertical = aspectMode === "9:16";
  const outWidth = isVertical ? 720 : 1280;
  const outHeight = isVertical ? 1280 : 720;
  const compCanvas = document.createElement("canvas");
  compCanvas.width = outWidth;
  compCanvas.height = outHeight;
  const ctx = compCanvas.getContext("2d", { alpha: false });

  const audioEngine = getCinemaAudioEngine();
  audioEngine?.setAmbientActive(true);

  let rafId = null;
  let stopped = false;
  const startedAtMs = performance.now();

  const renderCompositeFrame = () => {
    if (stopped) return;

    // 1. Nền rạp tối điện ảnh
    ctx.fillStyle = "#050814";
    ctx.fillRect(0, 0, outWidth, outHeight);

    // 2. Chép khung hình 3D tỷ lệ Cover chuẩn (16:9 Ngang hoặc 9:16 Dọc TikTok/Reels/Shorts)
    const sw = sourceCanvas.width || outWidth;
    const sh = sourceCanvas.height || outHeight;
    if (sw > 0 && sh > 0) {
      const scale = Math.max(outWidth / sw, outHeight / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (outWidth - dw) * 0.5;
      const dy = (outHeight - dh) * (isVertical ? 0.46 : 0.5);
      try {
        ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
      } catch {
        // ignore transient resize frame
      }
    }

    // 3. Dải Vignette Letterbox Trên & Dưới (Bố cục Phim Điện Ảnh Sạch — Không vẽ bất kỳ nút bấm UI nào!)
    const topBarH = isVertical ? 150 : 86;
    const botBarH = isVertical ? 320 : 175;

    const topGrad = ctx.createLinearGradient(0, 0, 0, topBarH);
    topGrad.addColorStop(0, "rgba(3, 6, 17, 0.84)");
    topGrad.addColorStop(1, "rgba(3, 6, 17, 0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, outWidth, topBarH);

    const botGrad = ctx.createLinearGradient(0, outHeight - botBarH, 0, outHeight);
    botGrad.addColorStop(0, "rgba(3, 6, 17, 0)");
    botGrad.addColorStop(0.48, "rgba(3, 6, 17, 0.76)");
    botGrad.addColorStop(1, "rgba(3, 6, 17, 0.96)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, outHeight - botBarH, outWidth, botBarH);

    const state = getOverlayState?.() || {};
    const fontStack = "'Segoe UI', Roboto, system-ui, sans-serif";

    // 4. Nhãn Chương & Huy hiệu Kết Quả + Đóng dấu thương hiệu theo Vũ trụ
    const watermarkLabel = state.brandWatermark || "🐺 Ma Sói 3D • masoi.hiepd5.com";
    if (isVertical) {
      // Bố cục dọc TikTok 9:16: Thương hiệu ở đỉnh giữa + Nhãn chương xếp gọn không đè UI TikTok bên phải
      ctx.font = `800 20px ${fontStack}`;
      ctx.fillStyle = "#fde047";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(watermarkLabel, outWidth * 0.5, 42);

      if (state.winnerBanner) {
        ctx.font = `700 17px ${fontStack}`;
        const winW = Math.min(outWidth - 64, ctx.measureText(state.winnerBanner).width + 30);
        ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
        drawRoundedRect(ctx, (outWidth - winW) * 0.5, 68, winW, 34, 17);
        ctx.fill();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(state.winnerBanner, outWidth * 0.5, 85);
      }

      if (state.chapterTag) {
        ctx.font = `700 15px ${fontStack}`;
        ctx.fillStyle = "#93c5fd";
        ctx.fillText(state.chapterTag, outWidth * 0.5, 122);
      }
    } else {
      if (state.chapterTag) {
        ctx.font = `700 16px ${fontStack}`;
        const tagW = ctx.measureText(state.chapterTag).width + 26;
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        drawRoundedRect(ctx, 28, 22, tagW, 34, 17);
        ctx.fill();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = "#fde68a";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(state.chapterTag, 41, 39);
      }

      if (state.winnerBanner) {
        ctx.font = `700 15px ${fontStack}`;
        const winText = state.winnerBanner;
        const winW = ctx.measureText(winText).width + 26;
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        drawRoundedRect(ctx, outWidth - winW - 28, 22, winW, 34, 17);
        ctx.fill();
        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(winText, outWidth - 41, 39);
      }

      // Đóng dấu thương hiệu tinh tế góc dưới phải cho bản ngang 16:9
      ctx.font = `700 13.5px ${fontStack}`;
      ctx.fillStyle = "rgba(253, 224, 71, 0.78)";
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(watermarkLabel, outWidth - 24, outHeight - 12);
    }

    // 5. Bóng Thoại Mật Đàm Sói / Lời Tranh Biện Nhân Vật (nếu cảnh hiện tại có thoại)
    if (state.dialogueText) {
      ctx.font = `700 ${isVertical ? 19 : 18}px ${fontStack}`;
      const maxDlgW = isVertical ? outWidth - 96 : 760;
      const dlgLines = wrapLines(ctx, state.dialogueText, maxDlgW);
      const boxH = dlgLines.length * 25 + 18;
      const boxW = Math.min(
        isVertical ? outWidth - 64 : 820,
        Math.max(...dlgLines.map((l) => ctx.measureText(l).width), 180) + 38
      );
      const bx = (outWidth - boxW) * 0.5;
      const by = outHeight - (isVertical ? 260 : 168) - boxH;

      ctx.fillStyle = state.isWolfWhisper
        ? "rgba(127, 29, 29, 0.9)"
        : "rgba(15, 23, 42, 0.88)";
      drawRoundedRect(ctx, bx, by, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = state.isWolfWhisper
        ? "rgba(252, 165, 165, 0.72)"
        : "rgba(253, 224, 71, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = state.isWolfWhisper ? "#fee2e2" : "#fef9c3";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      dlgLines.forEach((line, idx) => {
        ctx.fillText(line, outWidth * 0.5, by + 20 + idx * 25);
      });
    }

    // 6. Phụ đề Câu Chuyện Điện Ảnh Chính Giữa Đáy Khung Hình
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    if (state.title) {
      ctx.font = `800 ${isVertical ? 24 : 23}px ${fontStack}`;
      ctx.fillStyle = "#fde047";
      const titleLines = wrapLines(ctx, state.title, outWidth - (isVertical ? 76 : 140)).slice(0, 2);
      const titleBaseY = isVertical
        ? outHeight - (titleLines.length > 1 ? 196 : 168)
        : outHeight - 86;
      titleLines.forEach((tl, idx) => {
        ctx.fillText(tl, outWidth * 0.5, titleBaseY + idx * 28);
      });
    }

    if (state.narration) {
      ctx.font = `600 ${isVertical ? 19.5 : 18.5}px ${fontStack}`;
      ctx.fillStyle = "#f8fafc";
      const subLines = wrapLines(ctx, state.narration, outWidth - (isVertical ? 84 : 150));
      const maxSubLines = isVertical ? 3 : 2;
      const subStartY = isVertical ? outHeight - 122 : outHeight - 54;
      subLines.slice(0, maxSubLines).forEach((line, idx) => {
        ctx.fillText(line, outWidth * 0.5, subStartY + idx * 26);
      });
    }
    ctx.restore();

    // Thanh tiến độ mảnh 3px sát mép dưới video
    if (typeof state.progressRatio === "number") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.fillRect(0, outHeight - 3, outWidth, 3);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(0, outHeight - 3, outWidth * Math.max(0, Math.min(1, state.progressRatio)), 3);
    }

    rafId = window.requestAnimationFrame(renderCompositeFrame);
  };

  renderCompositeFrame();

  const canvasStream = compCanvas.captureStream(30);
  const combinedTracks = [...canvasStream.getVideoTracks()];
  if (audioEngine?.recordStream) {
    audioEngine.recordStream.getAudioTracks().forEach((t) => combinedTracks.push(t));
  }
  const mixedStream = new MediaStream(combinedTracks);

  const recorderOpts = { videoBitsPerSecond: 4_500_000 };
  if (supported.mimeType) recorderOpts.mimeType = supported.mimeType;

  const recorder = new MediaRecorder(mixedStream, recorderOpts);
  const chunks = [];

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  let resolveStop = null;
  const donePromise = new Promise((resolve) => {
    resolveStop = resolve;
  });

  recorder.onstop = () => {
    stopped = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    canvasStream.getTracks().forEach((t) => t.stop());

    const finalMime = recorder.mimeType || supported.mimeType || "video/webm";
    const ext = finalMime.includes("mp4") ? "mp4" : supported.ext || "webm";
    const blob = new Blob(chunks, { type: finalMime });
    const url = URL.createObjectURL(blob);
    const durationSec = Math.max(1, Math.round((performance.now() - startedAtMs) / 1000));

    resolveStop({
      url,
      blob,
      mimeType: finalMime,
      ext,
      aspectMode: isVertical ? "9:16" : "16:9",
      durationSec,
      createdAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    });
  };

  recorder.start(250);

  return {
    stop: () => {
      if (stopped) return donePromise;
      stopped = true;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      return donePromise;
    },
    donePromise,
  };
}

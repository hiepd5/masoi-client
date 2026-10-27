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

    let activeVoiceSource = null;
    const decodedVoiceCache = new WeakMap();

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
    };

    const playVoiceArrayBuffer = async (arrayBuffer, playbackRate = 1) => {
      if (!arrayBuffer || arrayBuffer.byteLength < 500) return false;
      stopVoice();
      try {
        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }
        let audioBuffer = decodedVoiceCache.get(arrayBuffer);
        if (!audioBuffer) {
          audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
          decodedVoiceCache.set(arrayBuffer, audioBuffer);
        }
        return await new Promise((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = audioBuffer;
          src.playbackRate.value = Math.min(1.5, Math.max(0.7, Number(playbackRate) || 1));
          src.connect(voiceGain);
          activeVoiceSource = src;
          src.onended = () => {
            if (activeVoiceSource === src) activeVoiceSource = null;
            try {
              src.disconnect();
            } catch {
              // ignore
            }
            resolve(true);
          };
          src.start(0);
        });
      } catch {
        return false;
      }
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
      speakerGain.gain.value = muted ? 0 : 0.48;
      voiceSpeakerGain.gain.value = muted ? 0 : 0.95;
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

    const triggerBeatSound = (cueKey = "story") => {
      try {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
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
    };
    return sharedAudioEngine;
  } catch {
    return null;
  }
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

export function startCinemaStoryRecording({ getOverlayState }) {
  const supported = pickSupportedRecorderMime();
  if (!supported) {
    throw new Error("Trình duyệt này không hỗ trợ MediaRecorder để quay video.");
  }

  const sourceCanvas = document.querySelector(".werewolf-stage-3d canvas");
  if (!sourceCanvas) {
    throw new Error("Không tìm thấy khung hình sân khấu 3D để ghi hình.");
  }

  const outWidth = 1280;
  const outHeight = 720;
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

    // 2. Chép khung hình 3D tỷ lệ Cover chuẩn 16:9 sắc nét
    const sw = sourceCanvas.width || outWidth;
    const sh = sourceCanvas.height || outHeight;
    if (sw > 0 && sh > 0) {
      const scale = Math.max(outWidth / sw, outHeight / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (outWidth - dw) * 0.5;
      const dy = (outHeight - dh) * 0.5;
      try {
        ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
      } catch {
        // ignore transient resize frame
      }
    }

    // 3. Dải Vignette Letterbox Trên & Dưới (Bố cục Phim Điện Ảnh Sạch — Không vẽ bất kỳ nút bấm UI nào!)
    const topGrad = ctx.createLinearGradient(0, 0, 0, 86);
    topGrad.addColorStop(0, "rgba(3, 6, 17, 0.78)");
    topGrad.addColorStop(1, "rgba(3, 6, 17, 0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, outWidth, 86);

    const botGrad = ctx.createLinearGradient(0, outHeight - 175, 0, outHeight);
    botGrad.addColorStop(0, "rgba(3, 6, 17, 0)");
    botGrad.addColorStop(0.52, "rgba(3, 6, 17, 0.72)");
    botGrad.addColorStop(1, "rgba(3, 6, 17, 0.94)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, outHeight - 175, outWidth, 175);

    const state = getOverlayState?.() || {};
    const fontStack = "'Segoe UI', Roboto, system-ui, sans-serif";

    // 4. Nhãn Chương góc trên trái & Huy hiệu kết quả góc trên phải
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

    // 5. Bóng Thoại Mật Đàm Sói / Lời Tranh Biện Nhân Vật (nếu cảnh hiện tại có thoại)
    if (state.dialogueText) {
      ctx.font = `700 18px ${fontStack}`;
      const dlgLines = wrapLines(ctx, state.dialogueText, 760);
      const boxH = dlgLines.length * 24 + 18;
      const boxW = Math.min(
        820,
        Math.max(...dlgLines.map((l) => ctx.measureText(l).width), 180) + 38
      );
      const bx = (outWidth - boxW) * 0.5;
      const by = outHeight - 168 - boxH;

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
        ctx.fillText(line, outWidth * 0.5, by + 20 + idx * 24);
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
      ctx.font = `800 23px ${fontStack}`;
      ctx.fillStyle = "#fde047";
      ctx.fillText(state.title, outWidth * 0.5, outHeight - 86);
    }

    if (state.narration) {
      ctx.font = `600 18.5px ${fontStack}`;
      ctx.fillStyle = "#f8fafc";
      const subLines = wrapLines(ctx, state.narration, outWidth - 150);
      subLines.slice(0, 2).forEach((line, idx) => {
        ctx.fillText(line, outWidth * 0.5, outHeight - 54 + idx * 25);
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

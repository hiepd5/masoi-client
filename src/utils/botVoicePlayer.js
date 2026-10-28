import { useCallback, useEffect, useRef, useState } from "react";

const MAX_BOT_QUEUE = 3;
const POST_MC_BREATH_MS = 350;

/**
 * Động cơ phát giọng nói thu sẵn cho 4 nhân cách AI Bot (Bản Lề V4.3):
 * - Thứ tự ưu tiên tuyệt đối trên Loa:
 *   1. Giọng MC Quản Trò (`isMcSpeakingNow`) — Đợi MC dứt câu + 350ms nghỉ lấy hơi mới phát giọng Bot.
 *   2. Mic Người Chơi Thật (`humanSpeakingIds`) — Tự động hạ âm lượng Bot về 0.48x khi có người mở mic nói.
 *   3. Giọng AI Bot Thu Sẵn (`/audio/bots/<personaId>/<clipId>.mp3` — 0% trùng giọng MC `b5d182f3`).
 * - Xuất `activeBotSpeakingId` để vòng ghế 3D của đúng AI Bot phát sóng âm trực quan trên sân khấu!
 */
export function useBotVoicePlayer({
  enabled = true,
  isMcSpeakingNow = false,
  humanSpeakingIds = [],
  activePhase = "",
  hasWinner = false,
  mutedSenderIds = null,
} = {}) {
  const [activeBotSpeakingId, setActiveBotSpeakingId] = useState(null);
  const queueRef = useRef([]);
  const currentAudioRef = useRef(null);
  const currentMetaRef = useRef(null);
  const pumpTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);

  const enabledRef = useRef(enabled);
  const mcSpeakingRef = useRef(isMcSpeakingNow);
  const humanSpeakingRef = useRef(humanSpeakingIds);
  const phaseRef = useRef(activePhase);
  const winnerRef = useRef(hasWinner);
  const mutedRef = useRef(mutedSenderIds);
  const lastMcEndedAtRef = useRef(0);

  enabledRef.current = enabled;
  humanSpeakingRef.current = humanSpeakingIds;
  phaseRef.current = activePhase;
  winnerRef.current = hasWinner;
  mutedRef.current = mutedSenderIds;

  const computeTargetVolume = useCallback((isWhisper = false) => {
    const baseVol = isWhisper ? 0.78 : 0.86;
    if (mcSpeakingRef.current) return 0.22;
    if (Array.isArray(humanSpeakingRef.current) && humanSpeakingRef.current.length > 0) {
      return 0.48;
    }
    return baseVol;
  }, []);

  const clearTimers = useCallback(() => {
    if (pumpTimerRef.current) {
      clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const stopCurrentAudio = useCallback(
    (smoothMs = 0) => {
      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      const audio = currentAudioRef.current;
      currentAudioRef.current = null;
      currentMetaRef.current = null;
      setActiveBotSpeakingId(null);
      if (!audio) return;

      if (smoothMs <= 0) {
        try {
          audio.pause();
        } catch {}
        return;
      }

      const startVol = audio.volume || 0.8;
      const steps = 5;
      const stepMs = Math.max(16, Math.round(smoothMs / steps));
      let cur = 0;
      fadeTimerRef.current = setInterval(() => {
        cur += 1;
        try {
          audio.volume = Math.max(0, startVol * (1 - cur / steps));
          if (cur >= steps) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
            audio.pause();
          }
        } catch {
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
      }, stepMs);
    },
    []
  );

  const stopAllBotVoices = useCallback(() => {
    clearTimers();
    queueRef.current = [];
    stopCurrentAudio(0);
  }, [clearTimers, stopCurrentAudio]);

  const schedulePump = useCallback((delayMs = 40) => {
    if (pumpTimerRef.current) {
      clearTimeout(pumpTimerRef.current);
    }
    pumpTimerRef.current = setTimeout(() => {
      pumpTimerRef.current = null;
      if (!enabledRef.current || winnerRef.current) {
        queueRef.current = [];
        return;
      }
      if (currentAudioRef.current) return;

      if (mcSpeakingRef.current) {
        return;
      }

      const sinceMcEnd = Date.now() - lastMcEndedAtRef.current;
      if (lastMcEndedAtRef.current > 0 && sinceMcEnd < POST_MC_BREATH_MS) {
        schedulePump(POST_MC_BREATH_MS - sinceMcEnd + 25);
        return;
      }

      // Lọc bỏ các câu thoại đã thuộc về pha cũ hoặc của ghế bị người chơi tắt tiếng
      while (queueRef.current.length > 0) {
        const candidate = queueRef.current.shift();
        if (!candidate?.botAudioUrl) continue;
        if (mutedRef.current?.[candidate.senderId]) continue;
        if (
          candidate.phaseTag &&
          phaseRef.current &&
          candidate.phaseTag !== phaseRef.current
        ) {
          continue;
        }

        const audio = new Audio(candidate.botAudioUrl);
        audio.preload = "auto";
        audio.preservesPitch = true;
        audio.volume = computeTargetVolume(candidate.isWhisper);
        currentAudioRef.current = audio;
        currentMetaRef.current = candidate;
        setActiveBotSpeakingId(candidate.senderId || null);

        const finish = () => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
            currentMetaRef.current = null;
            setActiveBotSpeakingId(null);
            schedulePump(220);
          }
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
        return;
      }
    }, Math.max(0, delayMs));
  }, [computeTargetVolume]);

  const enqueueBotVoice = useCallback(
    ({ senderId, botAudioUrl, phaseTag = "", isWhisper = false } = {}) => {
      if (!enabledRef.current || winnerRef.current) return;
      if (!botAudioUrl || typeof botAudioUrl !== "string") return;
      if (!botAudioUrl.startsWith("/audio/bots/") || botAudioUrl.includes("b5d182f3")) return;
      if (senderId && mutedRef.current?.[senderId]) return;

      if (queueRef.current.length >= MAX_BOT_QUEUE) {
        queueRef.current.shift();
      }
      queueRef.current.push({
        senderId: senderId || null,
        botAudioUrl,
        phaseTag: phaseTag || phaseRef.current || "",
        isWhisper: Boolean(isWhisper),
      });
      schedulePump(60);
    },
    [schedulePump]
  );

  // Theo dõi trạng thái MC đang nói: hạ âm nếu đang phát dở cùng pha, và kích hoạt phát tiếp sau 350ms khi MC vừa dứt lời!
  useEffect(() => {
    const wasSpeaking = mcSpeakingRef.current;
    mcSpeakingRef.current = isMcSpeakingNow;
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = computeTargetVolume(currentMetaRef.current?.isWhisper);
    }
    if (wasSpeaking && !isMcSpeakingNow) {
      lastMcEndedAtRef.current = Date.now();
      schedulePump(POST_MC_BREATH_MS + 20);
    } else if (!isMcSpeakingNow && !currentAudioRef.current && queueRef.current.length > 0) {
      schedulePump(80);
    }
  }, [isMcSpeakingNow, computeTargetVolume, schedulePump]);

  // Auto-ducking theo Mic người chơi thật
  useEffect(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = computeTargetVolume(currentMetaRef.current?.isWhisper);
    }
  }, [humanSpeakingIds, computeTargetVolume]);

  // Khi chuyển sang pha mới: ngắt mượt 220ms câu Bot của pha cũ để nhường sân cho MC mở pha mới
  useEffect(() => {
    if (!activePhase) return;
    queueRef.current = queueRef.current.filter(
      (item) => !item.phaseTag || item.phaseTag === activePhase
    );
    if (
      currentAudioRef.current &&
      currentMetaRef.current?.phaseTag &&
      currentMetaRef.current.phaseTag !== activePhase
    ) {
      stopCurrentAudio(220);
    }
  }, [activePhase, stopCurrentAudio]);

  // Tắt sạch ngay khi Kết Game hoặc người dùng bấm tắt tiếng AI Bot
  useEffect(() => {
    if (!enabled || hasWinner) {
      stopAllBotVoices();
    }
  }, [enabled, hasWinner, stopAllBotVoices]);

  useEffect(() => () => stopAllBotVoices(), [stopAllBotVoices]);

  return {
    enqueueBotVoice,
    activeBotSpeakingId,
    stopAllBotVoices,
  };
}

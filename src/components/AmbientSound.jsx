import { useEffect, useRef } from "react";
import {
  startBonfireCrackling,
  stopBonfireCrackling,
  resumeSpatialAudioIfNeeded,
} from "../utils/hapticsAndSound.js";

// Ambient sound system — loop âm thanh theo phase + tiếng củi nổ lửa trại Bắc Âu 0 KB
// Files cần: /audio/ambient_night.mp3, /audio/ambient_day.mp3, /audio/ambient_tense.mp3
// Nếu file không tồn tại -> silent fail (không crash)

export default function AmbientSound({ isNight, isTense, enabled }) {
  const audioRef = useRef(null);
  const currentSrcRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      stopBonfireCrackling();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      currentSrcRef.current = null;
      return;
    }

    startBonfireCrackling();

    const src = isTense
      ? "/audio/ambient_tense.mp3"
      : isNight
      ? "/audio/ambient_night.mp3"
      : "/audio/ambient_day.mp3";

    if (currentSrcRef.current === src) return; // already playing
    currentSrcRef.current = src;

    // Fade out current
    if (audioRef.current) {
      const old = audioRef.current;
      let vol = old.volume;
      const fadeOut = setInterval(() => {
        vol = Math.max(0, vol - 0.05);
        old.volume = vol;
        if (vol <= 0) {
          clearInterval(fadeOut);
          old.pause();
        }
      }, 50);
    }

    // Fade in new
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    audio.play().catch(() => {}); // silent fail if file missing

    let vol = 0;
    const fadeIn = setInterval(() => {
      vol = Math.min(0.18, vol + 0.01); // max volume 18% — subtle background
      if (audioRef.current === audio) audio.volume = vol;
      if (vol >= 0.18) clearInterval(fadeIn);
    }, 80);

    return () => {
      clearInterval(fadeIn);
    };
  }, [isNight, isTense, enabled]);

  // Chốt #12: Tự động nối lại âm thanh nền khi quay lại từ cuộc gọi Zalo / Điện thoại
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && enabled) {
        resumeSpatialAudioIfNeeded();
        audioRef.current?.play?.().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      stopBonfireCrackling();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      currentSrcRef.current = null;
    };
  }, []);

  return null; // no UI
}

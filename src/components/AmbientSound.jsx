import { useEffect, useRef } from 'react';

// Ambient sound system -- loop am thanh theo phase
// Files can: /audio/ambient_night.mp3, /audio/ambient_day.mp3, /audio/ambient_tense.mp3
// Neu file khong ton tai -> silent fail (khong crash)

export default function AmbientSound({ isNight, isTense, enabled }) {
  const audioRef = useRef(null);
  const currentSrcRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    const src = isTense
      ? '/audio/ambient_tense.mp3'
      : isNight
      ? '/audio/ambient_night.mp3'
      : '/audio/ambient_day.mp3';

    if (currentSrcRef.current === src) return; // already playing
    currentSrcRef.current = src;

    // Fade out current
    if (audioRef.current) {
      const old = audioRef.current;
      let vol = old.volume;
      const fadeOut = setInterval(() => {
        vol = Math.max(0, vol - 0.05);
        old.volume = vol;
        if (vol <= 0) { clearInterval(fadeOut); old.pause(); }
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
      vol = Math.min(0.18, vol + 0.01); // max volume 18% -- subtle background
      if (audioRef.current === audio) audio.volume = vol;
      if (vol >= 0.18) clearInterval(fadeIn);
    }, 80);

    return () => {
      clearInterval(fadeIn);
    };
  }, [isNight, isTense, enabled]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return null; // no UI
}

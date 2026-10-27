// SFX utility -- play one-shot sound effects + Nordic bronze tower bell synth
// Silent fail if file missing

import { playNordicTowerBell } from "../utils/hapticsAndSound.js";

const cache = {};

function play(src, volume = 0.7) {
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
  vote: () => play("/audio/sfx_vote.mp3", 0.6),
  death: () => play("/audio/sfx_death.mp3", 0.7),
  bell: () => {
    playNordicTowerBell();
    play("/audio/sfx_bell.mp3", 0.75);
  },
  winVillage: () => play("/audio/sfx_win_village.mp3", 0.8),
  winWolf: () => play("/audio/sfx_win_wolf.mp3", 0.8),
  select: () => play("/audio/sfx_select.mp3", 0.5),
  hangdrum: () => play("/audio/sfx_hang.mp3", 0.7),
};

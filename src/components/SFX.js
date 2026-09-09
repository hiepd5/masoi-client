// SFX utility -- play one-shot sound effects
// Silent fail if file missing

const cache = {};

function play(src, volume = 0.7) {
  try {
    if (!cache[src]) {
      cache[src] = new Audio(src);
    }
    const audio = cache[src].cloneNode();
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch (e) {}
}

export const SFX = {
  vote:      () => play('/audio/sfx_vote.mp3', 0.6),
  death:     () => play('/audio/sfx_death.mp3', 0.7),
  bell:      () => play('/audio/sfx_bell.mp3', 0.8),   // khi den luot minh
  winVillage:() => play('/audio/sfx_win_village.mp3', 0.8),
  winWolf:   () => play('/audio/sfx_win_wolf.mp3', 0.8),
  select:    () => play('/audio/sfx_select.mp3', 0.5),
  hangdrum:  () => play('/audio/sfx_hang.mp3', 0.7),   // khi bi treo co
};

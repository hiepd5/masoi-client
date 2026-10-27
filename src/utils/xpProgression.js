// =============================================================================
// HỆ THỐNG CẤP ĐỘ CỔ NGỮ BẮC ÂU, CHUỖI LỬA TRẠI & NHIỆM VỤ NGÀY (V4.1)
// - Khung Giờ Vàng 20:00–23:00 UTC+7 tính theo đồng hồ Server (Chốt #9: x2 XP)
// - Chống cộng trùng XP khi F5 màn hình EndGameRecap (Idempotent theo matchKey)
// - Sẵn sàng đồng bộ lên cột DB User ở phiên bản Tài khoản tiếp theo
// =============================================================================

const STORAGE_KEY = "ws_nordic_progression_v41";

export const NORDIC_RANKS = [
  { minLevel: 1, title: "Tân Binh Làng Sương", badge: "🪵", borderHex: "#94a3b8" },
  { minLevel: 3, title: "Tuần Đêm Rừng Thông", badge: "🌲", borderHex: "#38bdf8" },
  { minLevel: 6, title: "Kỵ Sĩ Cổ Ngữ", badge: "🛡️", borderHex: "#818cf8" },
  { minLevel: 10, title: "Thợ Săn Huyết Nguyệt", badge: "🏹", borderHex: "#f59e0b" },
  { minLevel: 15, title: "Hiền Giả Bắc Âu", badge: "🔮", borderHex: "#c084fc" },
  { minLevel: 20, title: "Bá Chủ Cổ Ngữ", badge: "👑", borderHex: "#facc15" },
];

export const DAILY_QUEST_DEFS = [
  { id: "quest_play_1", label: "🔥 Tham gia 1 ván Ma Sói", target: 1, rewardXp: 40 },
  { id: "quest_act_vote", label: "🗳️ Bỏ phiếu / Hành động đêm", target: 1, rewardXp: 45 },
  { id: "quest_win_or_bet", label: "🏆 Thắng ván hoặc Đoán trúng Cõi Âm", target: 1, rewardXp: 65 },
];

function computeFallbackUtc7DateKey() {
  const shifted = new Date(Date.now() + 7 * 3600 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isYesterdayKey(prevKey, todayKey) {
  if (!prevKey || !todayKey || prevKey === todayKey) return false;
  const tPrev = Date.parse(`${prevKey}T00:00:00Z`);
  const tToday = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(tPrev) || !Number.isFinite(tToday)) return false;
  const diffDays = Math.round((tToday - tPrev) / (24 * 3600 * 1000));
  return diffDays === 1;
}

export function getXpLevelMeta(totalXp = 0) {
  const safeXp = Math.max(0, Math.floor(Number(totalXp) || 0));
  // Mỗi cấp độ cần 180 + (lv - 1) * 40 XP -> lên cấp đầu rất nhanh, tạo hưng phấn giữ chân User!
  let level = 1;
  let remaining = safeXp;
  let neededForNext = 180;

  while (remaining >= neededForNext && level < 99) {
    remaining -= neededForNext;
    level += 1;
    neededForNext = 180 + (level - 1) * 40;
  }

  let rank = NORDIC_RANKS[0];
  for (const r of NORDIC_RANKS) {
    if (level >= r.minLevel) rank = r;
  }

  return {
    totalXp: safeXp,
    level,
    xpInLevel: remaining,
    xpForNextLevel: neededForNext,
    progressPct: Math.min(100, Math.round((remaining / Math.max(1, neededForNext)) * 100)),
    rankTitle: rank.title,
    rankBadge: rank.badge,
    rankBorderHex: rank.borderHex,
  };
}

function loadRawState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (raw && typeof raw === "object") return raw;
  } catch {
    // ignore
  }
  return {};
}

function saveRawState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function getPlayerProgressionState(serverDateKey = null) {
  const dateKey = serverDateKey || computeFallbackUtc7DateKey();
  const raw = loadRawState();

  const totalXp = Math.max(0, Number(raw.totalXp) || 0);
  const matchesPlayed = Math.max(0, Number(raw.matchesPlayed) || 0);
  const winsCount = Math.max(0, Number(raw.winsCount) || 0);
  const streakDays = Math.max(0, Number(raw.streakDays) || 0);
  const lastActiveDateKey = raw.lastActiveDateKey || null;

  const questProgress =
    raw.questDateKey === dateKey && raw.quests && typeof raw.quests === "object"
      ? raw.quests
      : {};

  const quests = DAILY_QUEST_DEFS.map((def) => {
    const cur = Math.min(def.target, Math.max(0, Number(questProgress[def.id]?.count) || 0));
    const claimed = Boolean(questProgress[def.id]?.claimed);
    return {
      ...def,
      count: cur,
      completed: cur >= def.target,
      claimed,
    };
  });

  return {
    ...getXpLevelMeta(totalXp),
    matchesPlayed,
    winsCount,
    streakDays,
    lastActiveDateKey,
    dateKey,
    quests,
  };
}

export function awardMatchXp({
  matchKey,
  didWin = false,
  ghostBetBonusXp = 0,
  serverGoldenHour = null,
  didActOrVote = true,
} = {}) {
  const dateKey = serverGoldenHour?.serverDateKey || computeFallbackUtc7DateKey();
  const raw = loadRawState();
  const awardedKeys = Array.isArray(raw.awardedMatchKeys) ? raw.awardedMatchKeys : [];

  if (matchKey && awardedKeys.includes(matchKey)) {
    const existingSummary = raw.lastAwardSummary?.matchKey === matchKey ? raw.lastAwardSummary : null;
    return {
      alreadyAwarded: true,
      summary: existingSummary || {
        matchKey,
        gainedXp: 0,
        goldenMultiplier: serverGoldenHour?.active ? 2 : 1,
        completedQuestLabels: [],
      },
      progression: getPlayerProgressionState(dateKey),
    };
  }

  const prevLevel = getXpLevelMeta(raw.totalXp || 0).level;
  const baseMatchXp = 65 + (didWin ? 55 : 0) + (didActOrVote ? 15 : 0);
  const goldenMultiplier = serverGoldenHour?.active ? 2 : 1;
  const multipliedMatchXp = baseMatchXp * goldenMultiplier;

  // Cập nhật chuỗi ngày đăng nhập chơi (Streak tính theo ngày Server UTC+7 — Chốt #9)
  let nextStreak = Math.max(1, Number(raw.streakDays) || 0);
  if (raw.lastActiveDateKey !== dateKey) {
    if (isYesterdayKey(raw.lastActiveDateKey, dateKey)) {
      nextStreak = (Number(raw.streakDays) || 0) + 1;
    } else {
      nextStreak = 1;
    }
  }

  // Cập nhật 3 nhiệm vụ ngày
  const prevQuests =
    raw.questDateKey === dateKey && raw.quests && typeof raw.quests === "object"
      ? { ...raw.quests }
      : {};

  let questBonusXp = 0;
  const completedQuestLabels = [];

  const bumpQuest = (questId, delta) => {
    if (delta <= 0) return;
    const def = DAILY_QUEST_DEFS.find((q) => q.id === questId);
    if (!def) return;
    const curObj = prevQuests[questId] || { count: 0, claimed: false };
    const nextCount = Math.min(def.target, (Number(curObj.count) || 0) + delta);
    const newlyClaimed = !curObj.claimed && nextCount >= def.target;
    if (newlyClaimed) {
      questBonusXp += def.rewardXp;
      completedQuestLabels.push(def.label);
    }
    prevQuests[questId] = {
      count: nextCount,
      claimed: Boolean(curObj.claimed || newlyClaimed),
    };
  };

  bumpQuest("quest_play_1", 1);
  if (didActOrVote) bumpQuest("quest_act_vote", 1);
  if (didWin || Number(ghostBetBonusXp) > 0) bumpQuest("quest_win_or_bet", 1);

  const safeGhostBonus = Math.max(0, Number(ghostBetBonusXp) || 0);
  const totalGainedXp = multipliedMatchXp + safeGhostBonus + questBonusXp;
  const nextTotalXp = Math.max(0, Number(raw.totalXp) || 0) + totalGainedXp;
  const nextMeta = getXpLevelMeta(nextTotalXp);

  const summary = {
    matchKey: matchKey || `match_${Date.now()}`,
    gainedXp: totalGainedXp,
    baseMatchXp,
    goldenMultiplier,
    ghostBetBonusXp: safeGhostBonus,
    questBonusXp,
    completedQuestLabels,
    leveledUp: nextMeta.level > prevLevel,
    newLevel: nextMeta.level,
    streakDays: nextStreak,
  };

  const nextState = {
    totalXp: nextTotalXp,
    matchesPlayed: (Number(raw.matchesPlayed) || 0) + 1,
    winsCount: (Number(raw.winsCount) || 0) + (didWin ? 1 : 0),
    streakDays: nextStreak,
    lastActiveDateKey: dateKey,
    questDateKey: dateKey,
    quests: prevQuests,
    awardedMatchKeys: matchKey ? [...awardedKeys.slice(-29), matchKey] : awardedKeys,
    lastAwardSummary: summary,
  };

  saveRawState(nextState);

  return {
    alreadyAwarded: false,
    summary,
    progression: getPlayerProgressionState(dateKey),
  };
}

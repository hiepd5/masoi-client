export const PLAYABLE_ROLE_KEYS = [
  "wolf",
  "alpha_wolf",
  "guard",
  "witch",
  "seer",
  "hunter",
  "cupid",
  "mayor",
  "tough_guy",
  "cursed",
  "tanner",
  "villager",
];

export function isWolfTeamRole(role) {
  return role === "wolf" || role === "alpha_wolf";
}

export const ROLES_CONFIG = {
  wolf: {
    label: "Sói",
    emoji: "🐺",
    color: "#ef4444",
    thumbGradient: "linear-gradient(145deg, #450a0a 0%, #991b1b 55%, #dc2626 100%)",
    shortSkill: "Săn 1 dân mỗi đêm",
    team: "wolf",
    description: "Mỗi đêm, hãy bí mật chọn 1 người dân để tiêu diệt. Che giấu danh tính của bạn!",
    wakePhase: "night_wolf",
    actionBanner: { icon: "🐺", color: "#ef4444", text: "Cùng bầy sói thống nhất chọn 1 con mồi. Click vào người đó!" },
    wakeAudio: "wolf_wake.mp3",
  },
  guard: {
    label: "Bảo Vệ",
    emoji: "🛡️",
    color: "#3b82f6",
    thumbGradient: "linear-gradient(145deg, #0f172a 0%, #1d4ed8 58%, #38bdf8 100%)",
    shortSkill: "Chặn đòn Sói (không trùng đêm)",
    team: "village",
    description: "Mỗi đêm, bảo vệ 1 người khỏi bị Sói tấn công. Không được trùng 2 đêm liên tiếp.",
    wakePhase: "night_guard",
    actionBanner: { icon: "🛡️", color: "#3b82f6", text: "Chọn 1 người để bảo vệ đêm nay. Không được chọn trùng đêm trước!" },
    wakeAudio: "guard_wake.mp3",
  },
  witch: {
    label: "Phù Thủy",
    emoji: "🧪",
    color: "#8b5cf6",
    thumbGradient: "linear-gradient(145deg, #2e1065 0%, #6d28d9 55%, #c084fc 100%)",
    shortSkill: "1 Bình Cứu · 1 Bình Độc",
    team: "village",
    description: "Bạn có 1 bình cứu và 1 bình độc. Dùng chúng vào thời điểm thích hợp.",
    wakePhase: "night_witch",
    actionBanner: { icon: "🧪", color: "#8b5cf6", text: "Có người bị sói tấn công. Bạn có muốn cứu không? Hoặc dùng bình độc?" },
    wakeAudio: "witch_wake.mp3",
    wakeAudioNoDeath: "witch_wake_nodeath.mp3",
  },
  seer: {
    label: "Tiên Tri",
    emoji: "🔮",
    color: "#6366f1",
    thumbGradient: "linear-gradient(145deg, #1e1b4b 0%, #4338ca 55%, #818cf8 100%)",
    shortSkill: "Soi phe Sói mỗi đêm",
    team: "village",
    description: "Mỗi đêm, bạn có thể kiểm tra bí mật 1 người xem họ có phải Sói không.",
    wakePhase: "night_seer",
    actionBanner: { icon: "🔮", color: "#6366f1", text: "Click vào 1 người để soi. Đỏ = Sói 🔴 — Xanh = Người tốt 🔵" },
    wakeAudio: "seer_wake.mp3",
  },
  tanner: {
    label: "Chán Đời",
    emoji: "💀",
    color: "#9ca3af",
    thumbGradient: "linear-gradient(145deg, #1f2937 0%, #4b5563 58%, #9ca3af 100%)",
    shortSkill: "Bị treo cổ → Thắng riêng",
    team: "neutral",
    description: "Bạn muốn bị treo cổ! Thắng riêng nếu làng quyết định treo cổ bạn.",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: null,
  },
  tough_guy: {
    label: "Người Cứng Cỏi",
    emoji: "💪",
    color: "#f97316",
    thumbGradient: "linear-gradient(145deg, #431407 0%, #c2410c 58%, #fb923c 100%)",
    shortSkill: "Trụ thêm 1 ngày sau khi bị cắn",
    team: "village",
    description: "Nếu bị Sói cắn ban đêm, bạn không chết ngay mà sống sót qua ngày hôm sau, đến đêm tiếp theo mới gục ngã.",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: null,
  },
  cursed: {
    label: "Kẻ Bị Nguyền",
    emoji: "🌑",
    color: "#64748b",
    thumbGradient: "linear-gradient(145deg, #0f172a 0%, #334155 52%, #991b1b 100%)",
    shortSkill: "Bị Sói cắn → Hóa thành Sói",
    team: "village",
    description: "Ban đầu là Dân Làng. Nếu bị Sói cắn ban đêm, bạn không chết mà dòng máu Sói thức tỉnh, biến bạn thành Sói từ đêm tiếp theo!",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: null,
  },
  villager: {
    label: "Nông Dân",
    emoji: "👨‍🌾",
    color: "#eab308",
    thumbGradient: "linear-gradient(145deg, #422006 0%, #a16207 58%, #facc15 100%)",
    shortSkill: "Suy luận & bỏ phiếu tìm Sói",
    team: "village",
    description: "Quan sát, suy luận và thuyết phục mọi người tìm ra Sói!",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: null,
  },
  hunter: {
    label: "Thợ Săn",
    emoji: "🏹",
    color: "#10b981",
    thumbGradient: "linear-gradient(145deg, #064e3b 0%, #059669 55%, #34d399 100%)",
    shortSkill: "Chết bắn 1 đạn bạc kéo theo",
    team: "village",
    description: "Khi ngã xuống (bị Sói cắn, treo cổ hoặc vỡ tim), bạn được bắn 1 phát đạn bạc cuối cùng kéo theo 1 người bất kỳ!",
    wakePhase: null,
    actionBanner: { icon: "🏹", color: "#10b981", text: "Hơi thở cuối cùng! Chọn 1 mục tiêu để bắn phát đạn bạc trả thù!" },
    wakeAudio: "hunter_revenge.mp3",
  },
  cupid: {
    label: "Thần Tình Yêu",
    emoji: "💘",
    color: "#ec4899",
    thumbGradient: "linear-gradient(145deg, #500724 0%, #be185d 55%, #f472b6 100%)",
    shortSkill: "Đêm 1 ghép đôi sinh tử",
    team: "village",
    description: "Đêm đầu tiên, bắn mũi tên tơ hồng kết nối 2 người thành Đôi Tình Nhân sinh tử có nhau (khác phe thành Phe Cặp Đôi).",
    wakePhase: "night_cupid",
    actionBanner: { icon: "💘", color: "#ec4899", text: "Chọn 2 người bất kỳ để kết duyên sinh tử bằng mũi tên tơ hồng!" },
    wakeAudio: "cupid_wake.mp3",
  },
  alpha_wolf: {
    label: "Sói Đầu Đàn",
    emoji: "🐺👑",
    color: "#dc2626",
    thumbGradient: "linear-gradient(145deg, #3b0764 0%, #991b1b 52%, #ef4444 100%)",
    shortSkill: "Đồng hóa 1 nạn nhân thành Sói",
    team: "wolf",
    description: "Thủ lĩnh bầy Sói uy dũng! Có 1 quyền Huyết Nguyệt biến con mồi đêm đó thành đồng loại Ma Sói thay vì giết.",
    wakePhase: "night_wolf",
    actionBanner: { icon: "🐺👑", color: "#dc2626", text: "Chọn săn mồi cùng đàn hoặc bật Huyết Nguyệt đồng hóa (1 lần/ván)!" },
    wakeAudio: "wolf_wake.mp3",
  },
  mayor: {
    label: "Trưởng Làng",
    emoji: "👑",
    color: "#f59e0b",
    thumbGradient: "linear-gradient(145deg, #451a03 0%, #b45309 55%, #fbbf24 100%)",
    shortSkill: "Công bố Quyền Trượng → Phiếu x2",
    team: "village",
    description: "Bậc uy quyền đứng đầu ngôi làng. Khi giơ Quyền Trượng công bố thân phận ban ngày, lá phiếu biểu quyết của bạn được tính gấp đôi (x2)!",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: "mayor_reveal.mp3",
  },
  villager_female: {
    label: "Thôn Nữ",
    emoji: "🧣",
    color: "#eab308",
    team: "village",
    description: "Người dân bản làng Bắc Âu chân chất — cùng suy luận vạch trần bầy Sói!",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: null,
  },
  villager_elder: {
    label: "Bô Lão",
    emoji: "🧙‍♂️",
    color: "#eab308",
    team: "village",
    description: "Bậc cao niên giàu kinh nghiệm của ngôi làng — quan sát và dẫn dắt suy luận!",
    wakePhase: null,
    actionBanner: null,
    wakeAudio: null,
  },
};


export const ROLE_LABELS       = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.label]));
export const ROLE_EMOJIS       = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.emoji]));
export const ROLE_COLORS       = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.color]));
export const ROLE_DESCRIPTIONS = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.description]));

// Số lượng Sói chuẩn theo số người chơi
export function calculateWolfCount(totalPlayers) {
  if (totalPlayers <= 8) return 2; // 6-8 người
  if (totalPlayers <= 10) return 3; // 9-10 người
  if (totalPlayers <= 12) return 4; // 11-12 người
  if (totalPlayers <= 15) return 4; // 13-15 người
  return 5; // 16-18 người
}

// Sinh cấu hình vai trò mặc định (Preset Cân Bằng)
export function generateDefaultRoles(totalPlayers) {
  const count = Math.max(6, totalPlayers || 6);
  const wolfCount = calculateWolfCount(count);
  const seerCount = 1;
  const guardCount = 1;
  const witchCount = 1;
  const toughGuyCount = count >= 6 ? 1 : 0;
  const cursedCount = count >= 7 ? 1 : 0;
  const tannerCount = count >= 8 ? 1 : 0;

  const specialCount = wolfCount + seerCount + guardCount + witchCount + toughGuyCount + cursedCount + tannerCount;
  const villagerCount = Math.max(0, count - specialCount);

  return {
    wolf: wolfCount,
    alpha_wolf: 0,
    seer: seerCount,
    guard: guardCount,
    witch: witchCount,
    hunter: 0,
    cupid: 0,
    mayor: 0,
    tough_guy: toughGuyCount,
    cursed: cursedCount,
    tanner: tannerCount,
    villager: villagerCount,
  };
}

// Sinh cấu hình Mở Rộng V3.3 (Thợ Săn · Thần Tình Yêu · Sói Đầu Đàn · Trưởng Làng) cân bằng cho 6..18 người
export function generateExpandedV33Roles(totalPlayers) {
  const count = Math.max(6, totalPlayers || 6);
  const totalWolves = calculateWolfCount(count);
  const alphaWolfCount = 1;
  const wolfCount = Math.max(0, totalWolves - alphaWolfCount);

  let remaining = count - totalWolves;
  const take = (want = 1) => {
    const got = Math.min(want, Math.max(0, remaining));
    remaining -= got;
    return got;
  };

  const seerCount = take(1);
  const hunterCount = take(1);
  const cupidCount = take(1);
  const mayorCount = take(1);
  const guardCount = take(1);
  const witchCount = take(1);
  const tannerCount = count >= 10 ? take(1) : 0;
  const cursedCount = count >= 12 ? take(1) : 0;
  const toughGuyCount = count >= 13 ? take(1) : 0;
  const villagerCount = Math.max(0, remaining);

  return {
    wolf: wolfCount,
    alpha_wolf: alphaWolfCount,
    seer: seerCount,
    guard: guardCount,
    witch: witchCount,
    hunter: hunterCount,
    cupid: cupidCount,
    mayor: mayorCount,
    tough_guy: toughGuyCount,
    cursed: cursedCount,
    tanner: tannerCount,
    villager: villagerCount,
  };
}



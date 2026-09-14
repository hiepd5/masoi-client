export const ROLES_CONFIG = {
  wolf: {
    label: "Sói",
    emoji: "🐺",
    color: "#ef4444",
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
    team: "village",
    description: "Quan sát, suy luận và thuyết phục mọi người tìm ra Sói!",
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
    seer: seerCount,
    guard: guardCount,
    witch: witchCount,
    tough_guy: toughGuyCount,
    cursed: cursedCount,
    tanner: tannerCount,
    villager: villagerCount,
  };
}


/**
 * ROLES_CONFIG — Config t?p trung cho t?t c? vai trong Ma Sói Online
 * Thêm vai m?i: ch? c?n thêm 1 entry ? dây + handler server tuong ?ng
 */

export const ROLES_CONFIG = {
  wolf: {
    label:       "Sói",
    emoji:       "??",
    color:       "#ef4444",
    team:        "wolf",
    description: "M?i dêm, hãy bí m?t ch?n 1 ngu?i dân d? tiêu di?t. Che gi?u danh tính c?a b?n!",
    wakePhase:   "night_wolf",
    actionBanner: { icon: "??", color: "#ef4444", text: "Cùng b?y sói th?ng nh?t ch?n 1 con m?i. Click vào ngu?i dó!" },
    wakeAudio:   "wolf_wake.mp3",
    winCondition: "S? Sói = Dân còn s?ng",
  },
  guard: {
    label:       "B?o V?",
    emoji:       "???",
    color:       "#3b82f6",
    team:        "village",
    description: "M?i dêm, b?o v? 1 ngu?i kh?i b? Sói t?n công. Không du?c trùng 2 dêm liên ti?p.",
    wakePhase:   "night_guard",
    actionBanner: { icon: "???", color: "#3b82f6", text: "Ch?n 1 ngu?i d? b?o v? dêm nay. Không du?c ch?n trùng dêm tru?c!" },
    wakeAudio:   "guard_wake.mp3",
    winCondition: "Cùng phe Dân",
  },
  witch: {
    label:       "Phù Th?y",
    emoji:       "??",
    color:       "#8b5cf6",
    team:        "village",
    description: "B?n có 1 bình c?u và 1 bình d?c. Dùng chúng vào th?i di?m thích h?p.",
    wakePhase:   "night_witch",
    actionBanner: { icon: "??", color: "#8b5cf6", text: "Có ngu?i b? sói t?n công. B?n có mu?n c?u không? Ho?c dùng bình d?c?" },
    wakeAudioNoDeath: "witch_wake_nodeath.mp3",
    wakeAudio:   "witch_wake.mp3",
    winCondition: "Cùng phe Dân",
  },
  seer: {
    label:       "Tiên Tri",
    emoji:       "??",
    color:       "#6366f1",
    team:        "village",
    description: "M?i dêm, b?n có th? ki?m tra bí m?t 1 ngu?i xem h? có ph?i Sói không.",
    wakePhase:   "night_seer",
    actionBanner: { icon: "??", color: "#6366f1", text: "Click vào 1 ngu?i d? soi. Ð? = Sói ?? — Xanh = Ngu?i t?t ??" },
    wakeAudio:   "seer_wake.mp3",
    winCondition: "Cùng phe Dân",
  },
  tanner: {
    label:       "Chán Ð?i",
    emoji:       "??",
    color:       "#9ca3af",
    team:        "neutral",
    description: "B?n mu?n b? treo c?! Th?ng riêng n?u làng quy?t d?nh treo c? b?n.",
    wakePhase:   null,
    actionBanner: null,
    wakeAudio:   null,
    winCondition: "B? làng treo c?",
  },
  villager: {
    label:       "Nông Dân",
    emoji:       "?????",
    color:       "#eab308",
    team:        "village",
    description: "Quan sát, suy lu?n và thuy?t ph?c m?i ngu?i tìm ra Sói!",
    wakePhase:   null,
    actionBanner: null,
    wakeAudio:   null,
    winCondition: "Cùng phe Dân",
  },
};

// Derived helpers — import thay cho các const r?i rác trong component
export const ROLE_LABELS       = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.label]));
export const ROLE_EMOJIS       = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.emoji]));
export const ROLE_COLORS       = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.color]));
export const ROLE_DESCRIPTIONS = Object.fromEntries(Object.entries(ROLES_CONFIG).map(([k, v]) => [k, v.description]));

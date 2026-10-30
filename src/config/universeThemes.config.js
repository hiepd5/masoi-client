// =============================================================================
// HỆ SINH THÁI 3 VŨ TRỤ V4.6 (1 ENGINE 3D — 3 KHÔNG GIAN CHƠI ĐỘC LẬP)
// 1. classic : 🐺 Ma Sói Huyền Huyễn (Bản gốc 100% chuẩn mực)
// 2. office  : 💼 Công Sở: Đại Chiến Bảng Lương (Sếp Vi Hành vs Nhân Viên — 0% Bạo lực)
// 3. school  : 🎒 Học Đường: Đại Chiến Sổ Đầu Bài (Cô Chủ Nhiệm vs Bàn Cuối — 0% Bạo lực)
// =============================================================================

import { ROLES_CONFIG } from "./roles.config.js";

export const UNIVERSE_IDS = ["classic", "office", "school"];

export function sanitizeUniverseId(raw) {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "office" || clean === "congso" || clean === "work") return "office";
  if (clean === "school" || clean === "hocduong" || clean === "class") return "school";
  return "classic";
}

export const normalizeUniverseId = sanitizeUniverseId;

export function resolveInitialLobbyUniverse() {
  if (typeof window === "undefined") return "classic";
  try {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode") || params.get("universe");
    if (urlMode) {
      const parsed = sanitizeUniverseId(urlMode);
      localStorage.setItem("ws_universe_id", parsed);
      return parsed;
    }
    const saved = localStorage.getItem("ws_universe_id");
    return sanitizeUniverseId(saved);
  } catch {
    return "classic";
  }
}

export function savePreferredUniverseId(universeId) {
  const clean = sanitizeUniverseId(universeId);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("ws_universe_id", clean);
    } catch {
      // ignore storage quota
    }
  }
  return clean;
}

const EXCEL_FAVICON_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#107c41"/><rect x="14" y="14" width="36" height="36" rx="4" fill="#ffffff" opacity="0.18"/><path d="M20 20h24v6H20zm0 10h24v6H20zm0 10h24v6H20z" fill="#ecfdf5"/><text x="18" y="45" font-family="Arial,sans-serif" font-weight="900" font-size="24" fill="#ffffff">X</text></svg>`
  );

const STUDY_PDF_FAVICON_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/><path d="M18 12h20l10 10v30a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="#eff6ff"/><path d="M38 12v10h10" fill="#bfdbfe"/><rect x="22" y="28" width="20" height="4" rx="2" fill="#2563eb"/><rect x="22" y="36" width="20" height="4" rx="2" fill="#2563eb"/><rect x="22" y="44" width="14" height="4" rx="2" fill="#60a5fa"/></svg>`
  );

export const UNIVERSE_THEMES = {
  classic: {
    id: "classic",
    tabIcon: "🐺",
    shortTab: "Ma Sói 3D",
    tabBadge: "Huyền Huyễn",
    crestEmoji: "🐺",
    brandTitle: "MA SÓI ONLINE 3D",
    brandSub: "Làng Đêm Huyết Nguyệt • Suy Luận & Đàm Thoại 3D",
    identityLabel: "👤 Định Danh Thợ Săn Đêm",
    namePlaceholder: "Nhập biệt danh của bạn...",
    heroCtaMain: "🔥 VÀO CHƠI NGAY",
    heroCtaSub: "Ghép bàn 1-chạm • Tự bù ghế trống bằng AI",
    showcaseTagline: "12 vai 3D điện ảnh",
    soloCardTitle: "⚡ Đấu AI Solo",
    soloCardSub: "8 ghế • Tự chọn vai",
    roomPlaceholder: "Tên bàn (VD: Hội Sói Đêm Khuya)...",
    browserTitle: "📡 Sảnh Làng Trực Tuyến",
    emptyCrest: "🌕🐺",
    emptyHeadline: "Đêm yên tĩnh — chưa có bàn công khai nào đang mở",
    emptySubtext: "Khởi động ngay ván đấu 3D cùng 7 AI Bot biết suy luận hoặc lập bàn mới rủ hội bạn vào!",
    rulesModalTitle: "📖 Cẩm Nang 12 Vai Ma Sói 3D",
    accentHex: "#f59e0b",
    accentSecondaryHex: "#ef4444",
    panelBorderRgba: "rgba(217, 164, 65, 0.34)",
    backdropKeyartUrl: "/backgrounds/home_keyart_v44.webp",
    defaultScenePresetId: "nordic_village_v3",
    silentByDefault: false,
    stealthDisguise: {
      enabled: false,
      tabTitle: "Ma Sói Online 3D — Suy Luận & Đàm Thoại",
      faviconDataUri: null,
      bossKeyShort: null,
      bossKeyMode: null,
    },
    randomNames: [
      "Rồng Lửa", "Bóng Đêm", "Sói Xám", "Ánh Sao", "Hổ Phách",
      "Mây Trắng", "Cáo Vàng", "Bão Tố", "Ngọc Bích", "Sấm Sét",
    ],
    factions: {
      wolf: "🐺 Phe Sói",
      village: "🛡️ Phe Dân Làng",
      neutral: "💀 Độc Lập",
      lovers: "💘 Cặp Đôi",
    },
    voteLabels: {
      wolfCountIcon: "🐺",
      villageCountIcon: "👥",
      hangBtn: "🪢 Treo Cổ",
      spareBtn: "🕊️ Tha Sống",
      nominateConfirm: "Đề cử ghế nóng",
      wolfConfirm: "Chốt cắn mồi",
      seerWolfBadge: "🔴 SÓI",
      seerGoodBadge: "🔵 Tốt",
      mayorChip: "👑x2",
    },
    quickDebateChips: [
      "🛡️ Mình là Dân chuẩn!",
      "🔮 Chức năng tối qua báo tin đi!",
      "🐺 Ghế này lập luận mâu thuẫn quá!",
      "🗳️ Gom phiếu đưa lên ghế nóng thử!",
      "⏳ Bình tĩnh nghe biện hộ kỹ đã!",
    ],
    phaseLabels: {
      role_reveal: "🎭 Nhận Vai Định Mệnh",
      night_cupid: "💘 Thần Tình Yêu Se Duyên",
      night_guard: "🌙 Bảo Vệ Thức Dậy",
      night_wolf: "🌙 Đêm Sói Săn Mồi",
      night_witch: "🌙 Phù Thủy Hành Động",
      night_seer: "🌙 Tiên Tri Nhìn Xa",
      hunter_revenge: "🏹 Hơi Thở Cuối Của Thợ Săn",
      day_reveal: "☀️ Bình Minh",
      day_discuss: "☀️ Thảo Luận",
      day_nominate: "🗳️ Đề Cử",
      day_defense: "⚖️ Biện Hộ",
      day_final_vote: "🪢 Bỏ Phiếu Cuối",
      day_no_nomination: "☀️ Không Có Đề Cử",
    },
    phaseShortLabels: {
      role_reveal: "🎭 Nhận vai",
      night_cupid: "🌙 Đêm • Ghép đôi",
      night_guard: "🌙 Đêm • Bảo Vệ",
      night_wolf: "🌙 Đêm • Sói săn",
      night_witch: "🌙 Đêm • Phù Thủy",
      night_seer: "🌙 Đêm • Tiên Tri",
      hunter_revenge: "🏹 Đạn Bạc Cuối",
      day_reveal: "🌅 Bình minh",
      day_discuss: "☀️ Thảo luận",
      day_nominate: "🗳️ Đề cử",
      day_defense: "⚖️ Biện hộ",
      day_final_vote: "🪢 Pháp trường",
    },
    actionBanners: {
      role_reveal: { icon: "🎭", color: "#eab308", text: "Ghi nhớ kỹ thân phận bí mật của bạn trước khi màn đêm đầu tiên buông xuống!" },
      night_cupid: { icon: "💘", color: "#ec4899", text: "Đêm đầu tiên: Click chọn 2 người trên vòng ghế để kết duyên sinh tử!" },
      night_guard: { icon: "🛡️", color: "#3b82f6", text: "Chọn 1 người để bảo vệ đêm nay. Không được chọn trùng đêm trước!" },
      night_wolf: { icon: "🐺", color: "#ef4444", text: "Cùng bầy sói thống nhất chọn 1 con mồi. Click vào người đó!" },
      night_witch: { icon: "🧪", color: "#8b5cf6", text: "Có người bị sói tấn công. Bạn có muốn cứu không? Hoặc dùng bình độc?" },
      night_witch_nd: { icon: "🧪", color: "#8b5cf6", text: "Đêm nay sói không tấn công ai. Bạn có muốn dùng bình độc không?" },
      night_seer: { icon: "🔮", color: "#6366f1", text: "Click vào 1 người để soi. Đỏ = Sói 🔴 — Xanh = Người tốt 🔵" },
      hunter_revenge: { icon: "🏹", color: "#e11d48", text: "Hơi thở cuối! Click vào 1 người còn sống để bắn viên đạn bạc trả thù!" },
      day_reveal: { icon: "☀️", color: "#f59e0b", text: "Bình minh ló dạng. Xem có ai bị tấn công đêm qua không..." },
      day_discuss: { icon: "💬", color: "#10b981", text: "Thảo luận để tìm Sói! Nêu nghi ngờ, chia sẻ thông tin." },
      day_nominate: { icon: "🗳️", color: "#f59e0b", text: "Click vào người bạn nghi là Sói để đề cử. Ai đủ phiếu sẽ lên ghế nóng!" },
      day_defense: { icon: "⚖️", color: "#f97316", text: "Lắng nghe bị cáo tự bào chữa trước khi bỏ phiếu." },
      day_final_vote: { icon: "🪢", color: "#ef4444", text: "Quyết định: Treo Cổ hay Tha? Nhấn nút để bỏ phiếu." },
      day_no_nomination: { icon: "😮‍💨", color: "#6b7280", text: "Không ai bị đề cử. Cả làng được sống thêm 1 ngày." },
    },
    roles: {},
  },

  office: {
    id: "office",
    tabIcon: "💼",
    shortTab: "Công Sở",
    tabBadge: "Săn Sếp • HOT",
    crestEmoji: "💼",
    brandTitle: "ĐẠI CHIẾN BẢNG LƯƠNG 3D",
    brandSub: "Phòng Họp Kính Tầng 18 • Tìm Nick Sếp Nằm Vùng & Bảo Vệ Lương Tháng 13",
    identityLabel: "🪪 Thẻ Nhân Viên Group Trà Chiều",
    namePlaceholder: "Nhập biệt danh công sở (VD: Minh KPI)...",
    heroCtaMain: "💼 VÀO HỌP TRÀ CHIỀU",
    heroCtaSub: "Ghép bàn Công Sở 1-chạm • Có nút Im Lặng 1-Chạm + Phím Esc Excel",
    showcaseTagline: "12 chức danh 3D Anime vui nhộn",
    soloCardTitle: "⚡ Họp Thử Với AI",
    soloCardSub: "8 ghế xoay • Tự chọn vai",
    roomPlaceholder: "Tên group (VD: Hội Trà Chiều Tầng 18)...",
    browserTitle: "🏢 Phòng Họp Công Sở Đang Mở",
    emptyCrest: "💼📊",
    emptyHeadline: "Chưa có Phòng Họp Công Sở nào đang mở công khai",
    emptySubtext: "Mở ngay 1 phòng họp 3D tầng 18 cùng 7 đồng nghiệp AI hoặc gửi mã bàn rủ team công ty giải lao 5 phút!",
    rulesModalTitle: "📖 Sổ Tay 12 Chức Danh: Đại Chiến Bảng Lương 3D",
    accentHex: "#38bdf8",
    accentSecondaryHex: "#10b981",
    panelBorderRgba: "rgba(56, 189, 248, 0.38)",
    backdropKeyartUrl: "/backgrounds/concept_space_office_anime.jpg",
    defaultScenePresetId: "preset_office_penthouse_3d",
    silentByDefault: false,
    stealthDisguise: {
      enabled: true,
      tabTitle: "Bao_cao_KPI_Quy_3_Final_v2.xlsx - Excel Online",
      faviconDataUri: EXCEL_FAVICON_SVG,
      bossKeyShort: "📊 Excel (Esc)",
      bossKeyMode: "excel",
      patrolAlertTitle: "🚨 TIẾNG GIÀY SẾP ĐI NGANG HÀNH LANG!",
      patrolAlertSub: "Bấm ngay phím [Esc] hoặc nút [📊 Excel] góc trên phải để bật bảng KPI ngụy trang!",
    },
    randomNames: [
      "Minh KPI", "Vy Kế Toán", "Tuấn FixBug", "Lan Trà Sữa", "Hoàng Sale",
      "Thảo HR", "Khoa Design", "Linh Content", "Đạt Intern", "Huy DevOps",
    ],
    factions: {
      wolf: "👔 Phe Sếp Vi Hành",
      village: "💼 Hội Nhân Viên",
      neutral: "🏖️ Săn Đền Bù",
      lovers: "🧋 Chung Hợp Đồng",
    },
    voteLabels: {
      wolfCountIcon: "👔",
      villageCountIcon: "💼",
      hangBtn: "📤 Mời Ra Group",
      spareBtn: "🤝 Giữ Lại Phòng",
      nominateConfirm: "Đưa lên kiểm điểm",
      wolfConfirm: "Gạch sạch lương",
      seerWolfBadge: "🔴 SẾP",
      seerGoodBadge: "🔵 Nhân viên",
      mayorChip: "🏅x2",
    },
    quickDebateChips: [
      "💼 Mình nhân viên quèn chạy deadline thật mà!",
      "💻 IT tối qua quét IP Wi-Fi ra ai chưa?",
      "👔 Giọng điệu ghế này giống Sếp tổng lắm!",
      "📊 Đưa lên bàn kiểm điểm check KPI thử đi!",
      "🧋 Bình tĩnh nghe đồng nghiệp giải trình đã!",
    ],
    phaseLabels: {
      role_reveal: "🪪 Nhận Thẻ Nhân Viên Bí Mật",
      night_cupid: "🧋 Bà Tám Ghép Đôi Hợp Đồng",
      night_guard: "🛡️ Team Lead Bảo Lãnh KPI",
      night_wolf: "👔 Sếp Vi Hành Gạch Bảng Lương",
      night_witch: "🧮 Kế Toán Cộng/Trừ Chuyên Cần",
      night_seer: "💻 Nhân Viên IT Quét IP Wi-Fi",
      hunter_revenge: "📁 Senior Tung Email CC Toàn Công Ty",
      day_reveal: "☀️ Công Bố Bảng Lương Sáng",
      day_discuss: "☕ Họp Trà Chiều Săn Nick Sếp",
      day_nominate: "🗳️ Đề Cử Kiểm Điểm KPI",
      day_defense: "🎤 Giải Trình Trước Phòng Họp",
      day_final_vote: "📤 Biểu Quyết Mời Khỏi Group",
      day_no_nomination: "☕ Không Ai Bị Kiểm Điểm",
    },
    phaseShortLabels: {
      role_reveal: "🪪 Nhận thẻ",
      night_cupid: "🌙 Ghép hợp đồng",
      night_guard: "🌙 Bảo lãnh KPI",
      night_wolf: "🌙 Sếp cắt lương",
      night_witch: "🌙 Chuyên cần",
      night_seer: "🌙 IT soi IP",
      hunter_revenge: "📁 Email CC",
      day_reveal: "☀️ Bảng lương",
      day_discuss: "☕ Họp trà chiều",
      day_nominate: "🗳️ Đề cử",
      day_defense: "🎤 Giải trình",
      day_final_vote: "📤 Chốt sổ",
    },
    actionBanners: {
      role_reveal: { icon: "🪪", color: "#38bdf8", text: "Xem kỹ chức danh bí mật của bạn! Bấm [Esc] bất cứ lúc nào để bung bảng Excel ngụy trang 0.05s!" },
      night_cupid: { icon: "🧋", color: "#ec4899", text: "Ca đầu tiên: Chọn 2 đồng nghiệp trên ghế xoay để ghép Chung Hợp Đồng (1 người nghỉ là nghỉ đôi)!" },
      night_guard: { icon: "🛡️", color: "#3b82f6", text: "Chọn 1 đồng nghiệp để ký Bảo Lãnh KPI tối nay (chặn Sếp trừ lương, không trùng 2 tối)!" },
      night_wolf: { icon: "👔", color: "#ef4444", text: "Cùng hội Sếp chọn 1 nhân viên để gạch sạch lương tháng này!" },
      night_witch: { icon: "🧮", color: "#10b981", text: "Có người vừa bị Sếp trừ sạch lương! Dùng [+ Cộng Chuyên Cần] cứu đói hay [- Trừ Chuyên Cần]?" },
      night_witch_nd: { icon: "🧮", color: "#10b981", text: "Tối nay Sếp chưa gạch lương ai. Bạn có muốn dùng [- Trừ Chuyên Cần] với kẻ khả nghi không?" },
      night_seer: { icon: "💻", color: "#06b6d4", text: "Click 1 ghế để quét IP Wi-Fi: Đỏ = Máy Sếp 🔴 — Xanh = Nhân viên 🔵" },
      hunter_revenge: { icon: "📁", color: "#e11d48", text: "Bị bay bảng lương! Chọn 1 ghế trong 15s để tung Email CC toàn công ty kéo theo!" },
      day_reveal: { icon: "☀️", color: "#f59e0b", text: "Bảng lương sáng nay vừa cập nhật! Xem ai bị trừ lương tối qua..." },
      day_discuss: { icon: "☕", color: "#10b981", text: "Giờ trà chiều! Thảo luận tìm ra nick clone của Sếp nằm vùng bảo vệ lương tháng 13!" },
      day_nominate: { icon: "🗳️", color: "#38bdf8", text: "Click vào người bạn nghi là Sếp để đưa lên bàn giải trình KPI!" },
      day_defense: { icon: "🎤", color: "#f97316", text: "Lắng nghe đồng nghiệp mở mic giải trình trước khi chốt phiếu." },
      day_final_vote: { icon: "📤", color: "#ef4444", text: "Biểu quyết phòng họp: Mời Ra Khỏi Group hay Giữ Lại?" },
      day_no_nomination: { icon: "😮‍💨", color: "#6b7280", text: "Không ai bị kiểm điểm hôm nay. Bảng lương tạm yên ổn thêm 1 ngày!" },
    },
    roles: {
      wolf: {
        label: "Sếp Vi Hành",
        emoji: "👔",
        color: "#ef4444",
        shortSkill: "Trừ sạch lương 1 người mỗi tối",
        description: "Lập nick clone trà trộn vào group nhân viên! Mỗi tối bí mật gạch sạch bảng lương tháng này của 1 người.",
      },
      alpha_wolf: {
        label: "Chủ Tịch Tập Đoàn",
        emoji: "👑",
        color: "#dc2626",
        shortSkill: "Phong bì tăng lương mua chuộc về phe Sếp",
        description: "Trùm cuối tầng 18! Có 1 đặc quyền trao 'Phong Bì Tăng Lương Ngầm' biến nạn nhân tối đó thành Trợ Lý Phe Sếp.",
      },
      guard: {
        label: "Trưởng Nhóm (Team Lead)",
        emoji: "🛡️",
        color: "#3b82f6",
        shortSkill: "Ký Bảo Lãnh KPI chặn Sếp trừ lương",
        description: "Mỗi tối ký xác nhận hoàn thành KPI giúp 1 đồng nghiệp không bị Sếp gạch lương (không bảo lãnh trùng 2 tối liên tiếp).",
      },
      witch: {
        label: "Chị Kế Toán Trưởng",
        emoji: "🧮",
        color: "#10b981",
        shortSkill: "+Cộng Chuyên Cần cứu · -Trừ Phụ Cấp",
        description: "Nắm giữ két sắt công ty! Có 1 quyền [+ Cộng Tiền Chuyên Cần] cứu người vừa bị trừ lương và 1 quyền [- Gạch Phụ Cấp] kẻ khả nghi.",
      },
      seer: {
        label: "Nhân Viên IT",
        emoji: "💻",
        color: "#06b6d4",
        shortSkill: "Quét IP Wi-Fi ra Máy Sếp hay Nhân Viên",
        description: "Mỗi tối bật terminal quét địa chỉ IP của 1 ghế để biết rõ đó là 🔴 Máy Sếp hay 🔵 Nhân Viên chính hiệu.",
      },
      hunter: {
        label: "Senior Giữ Pass Server",
        emoji: "📁",
        color: "#10b981",
        shortSkill: "Bay lương → Tung Email CC kéo theo 1 người",
        description: "Nắm giữ mật khẩu hệ thống! Nếu bị cắt lương hoặc mời ra khỏi group, có 15s bấm gửi Email CC kéo 1 người bay lương cùng!",
      },
      cupid: {
        label: "Bà Tám Phòng Trà Nước",
        emoji: "🧋",
        color: "#ec4899",
        shortSkill: "Tối đầu ghép Đôi Bạn Chung Hợp Đồng",
        description: "Tối đầu tiên ghép 2 người thành Đôi Bạn Chung Hợp Đồng — 1 người bị mời ra là người kia nộp đơn nghỉ theo luôn!",
      },
      mayor: {
        label: "Chủ Tịch Công Đoàn",
        emoji: "🏅",
        color: "#f59e0b",
        shortSkill: "Đập Con Dấu Công Đoàn → Phiếu x2",
        description: "Đại diện tiếng nói anh em! Khi giơ Con Dấu Công Đoàn công bố thân phận ban ngày, lá phiếu biểu quyết của bạn tính gấp đôi (x2)!",
      },
      tough_guy: {
        label: "Chiến Thần Quỹ Đen",
        emoji: "☕",
        color: "#f97316",
        shortSkill: "Ví phụ dày → Bị trừ lương vẫn trụ thêm 1 ngày",
        description: "Có sẵn thu nhập tay trái! Nếu bị Sếp gạch lương tối nay vẫn bình thản đi họp hết trọn ngày mai rồi mới nghỉ.",
      },
      cursed: {
        label: "Thực Tập Sinh Cơ Hội",
        emoji: "🌱",
        color: "#64748b",
        shortSkill: "Bị Sếp nhắm trừ lương → Quay xe theo phe Sếp",
        description: "Ban đầu thuộc Hội Nhân Viên. Nhưng nếu tối đó bị Sếp nhắm gạch lương, liền nhanh trí xin làm Trợ Lý Mật cho Sếp luôn!",
      },
      tanner: {
        label: "Thánh Săn Đền Bù",
        emoji: "🏖️",
        color: "#f43f5e",
        shortSkill: "Lừa cả phòng vote đuổi → Ôm 6 tháng lương đi Phú Quốc",
        description: "Đang chán việc nhưng không muốn tự viết đơn! Thắng độc lập ngay lập tức nếu lừa được cả phòng họp vote mời mình ra!",
      },
      villager: {
        label: "Nhân Viên Văn Phòng",
        emoji: "💼",
        color: "#eab308",
        shortSkill: "Soi KPI & bỏ phiếu tìm nick clone Sếp",
        description: "Họp trà chiều tỉnh táo, phân tích từng câu nói để vạch mặt Sếp nằm vùng và bảo vệ trọn vẹn thưởng Tết!",
      },
      villager_female: {
        label: "Chuyên Viên Truyền Thông",
        emoji: "👩‍💼",
        color: "#eab308",
        shortSkill: "Phân tích tâm lý phòng họp",
        description: "Nhân sự nhạy bén của tòa nhà — cùng đồng nghiệp tìm ra Sếp nằm vùng!",
      },
      villager_elder: {
        label: "Cố Vấn Thâm Niên",
        emoji: "🧑‍💼",
        color: "#eab308",
        shortSkill: "Kinh nghiệm đọc vị kỳ cựu",
        description: "Bậc tiền bối hiểu rõ từng chiêu thức cắt giảm KPI — dẫn dắt phòng họp chiến thắng!",
      },
    },
  },

  school: {
    id: "school",
    tabIcon: "🎒",
    shortTab: "Học Đường",
    tabBadge: "Sổ Đầu Bài • GEN Z",
    crestEmoji: "🎒",
    brandTitle: "ĐẠI CHIẾN SỔ ĐẦU BÀI 3D",
    brandSub: "Lớp Học Hoàng Hôn • Lật Tẩy Nick Cô Chủ Nhiệm & Giữ Cờ Thi Đua Tuần",
    identityLabel: "🎫 Thẻ Thành Viên Hội Bàn Cuối",
    namePlaceholder: "Nhập biệt danh lớp (VD: Nam Bàn Cuối)...",
    heroCtaMain: "🎒 VÀO NHÓM BÀN CUỐI",
    heroCtaSub: "Ghép lớp 1-chạm • Có nút Im Lặng 1-Chạm + Phím Esc Đề Cương PDF",
    showcaseTagline: "12 vai Học Đường 3D Anime cực lầy",
    soloCardTitle: "⚡ Ra Chơi Cùng AI",
    soloCardSub: "8 bàn học • Tự chọn vai",
    roomPlaceholder: "Tên nhóm lớp (VD: Hội Bàn Cuối 12A1)...",
    browserTitle: "🏫 Các Lớp Học Đang Mở Giờ Ra Chơi",
    emptyCrest: "🎒📒",
    emptyHeadline: "Chưa có Nhóm Lớp nào đang mở công khai giờ ra chơi",
    emptySubtext: "Mở ngay Lớp Học Hoàng Hôn 3D cùng 7 bạn học AI hoặc gửi mã bàn cho đám bạn cùng lớp giải trí 5 phút!",
    rulesModalTitle: "📖 Sổ Tay 12 Vai Học Đường: Đại Chiến Sổ Đầu Bài 3D",
    accentHex: "#fb923c",
    accentSecondaryHex: "#f43f5e",
    panelBorderRgba: "rgba(251, 146, 60, 0.4)",
    backdropKeyartUrl: "/backgrounds/concept_space_school_anime.jpg",
    defaultScenePresetId: "preset_school_sunset_3d",
    silentByDefault: false,
    stealthDisguise: {
      enabled: true,
      tabTitle: "De_cuong_on_tap_Toan_HK2_Chuan.pdf - Tài liệu học tập",
      faviconDataUri: STUDY_PDF_FAVICON_SVG,
      bossKeyShort: "📘 Đề cương (Esc)",
      bossKeyMode: "pdf",
      patrolAlertTitle: "🚨 BÓNG GIÁM THỊ LƯỚT QUA CỬA SỔ HÀNH LANG!",
      patrolAlertSub: "Bấm ngay phím [Esc] hoặc nút [📘 Đề cương] góc trên phải để mở tài liệu ôn tập!",
    },
    randomNames: [
      "Nam Bàn Cuối", "Linh Trà Sữa", "Khoa Học Bá", "Vy Sao Đỏ", "Minh Ngủ Gật",
      "Thảo Văn Nghệ", "Tuấn Căng-Tin", "Ngọc Bí Thư", "Đạt Chép Bài", "Mai Bàn Đầu",
    ],
    factions: {
      wolf: "👩‍🏫 Phe Giáo Viên Vi Hành",
      village: "🎒 Hội Học Sinh",
      neutral: "🧋 Thèm Đi Căng-Tin",
      lovers: "💌 Đôi Bạn Cùng Bàn",
    },
    voteLabels: {
      wolfCountIcon: "👩‍🏫",
      villageCountIcon: "🎒",
      hangBtn: "🚪 Mời Ra Hành Lang",
      spareBtn: "🙌 Giữ Ngồi Lại Lớp",
      nominateConfirm: "Mời lên bục giảng",
      wolfConfirm: "Ghi Sổ Đầu Bài",
      seerWolfBadge: "🔴 GIÁO VIÊN",
      seerGoodBadge: "🔵 Bạn cùng lớp",
      mayorChip: "⭐x2",
    },
    quickDebateChips: [
      "🎒 Tui bàn cuối chính hiệu, tối qua ôn bài ngủ quên!",
      "🎽 Sao Đỏ tuần này soi thẻ ra ai chưa?",
      "👩‍🏫 Văn phong câu này y hệt Cô Chủ Nhiệm luôn!",
      "📒 Đề cử lên bục giảng hỏi bài thử là lộ ngay!",
      "🧋 Khoan mời nhầm kẻo trúng Thánh Thèm Đi Căng-Tin đó!",
    ],
    phaseLabels: {
      role_reveal: "🎫 Xem Thẻ Học Sinh Bí Mật",
      night_cupid: "💌 Bà Mối Xếp Đôi Bạn Cùng Bàn",
      night_guard: "🙋 Lớp Phó Xin Phép Đỡ Lời",
      night_wolf: "👩‍🏫 Cô Chủ Nhiệm Ghi Sổ Đầu Bài",
      night_witch: "📒 Thư Ký Cộng Điểm / Bút Đỏ",
      night_seer: "🎽 Sao Đỏ Trực Tuần Soi Thẻ",
      hunter_revenge: "📢 Chiến Thần 'Thưa Cô Bạn Kia Cũng...'",
      day_reveal: "☀️ Công Bố Sổ Đầu Bài Đầu Tiết",
      day_discuss: "🎒 Tám Chuyện Giờ Ra Chơi",
      day_nominate: "🗳️ Chỉ Tay Mời Lên Bục Giảng",
      day_defense: "🎤 Thanh Minh Trước Cả Lớp",
      day_final_vote: "🚪 Biểu Quyết Mời Khỏi Nhóm Lớp",
      day_no_nomination: "☀️ Cả Lớp Bao Che Nhau",
    },
    phaseShortLabels: {
      role_reveal: "🎫 Nhận thẻ",
      night_cupid: "🌙 Đôi bạn",
      night_guard: "🌙 Đỡ lời",
      night_wolf: "🌙 Ghi sổ đỏ",
      night_witch: "🌙 Thư ký",
      night_seer: "🌙 Sao Đỏ soi",
      hunter_revenge: "📢 Thưa cô!",
      day_reveal: "☀️ Đầu tiết",
      day_discuss: "🎒 Ra chơi",
      day_nominate: "🗳️ Đề cử",
      day_defense: "🎤 Thanh minh",
      day_final_vote: "🚪 Chốt phiếu",
    },
    actionBanners: {
      role_reveal: { icon: "🎫", color: "#fb923c", text: "Ghi nhớ vai trò của bạn trong lớp! Bấm [Esc] bất cứ lúc nào để mở Đề Cương PDF 0.05s!" },
      night_cupid: { icon: "💌", color: "#ec4899", text: "Tiết đầu tiên: Chọn 2 bạn để ghép thành Đôi Bạn Cùng Bàn (1 người ra hành lang là đi đôi)!" },
      night_guard: { icon: "🙋", color: "#3b82f6", text: "Chọn 1 bạn xin phép 'Đi bê vở giúp trường' để tránh bị ghi Sổ Đầu Bài tối nay!" },
      night_wolf: { icon: "👩‍🏫", color: "#ef4444", text: "Chọn 1 học sinh ồn ào để ghi tên vào Sổ Đầu Bài & hạ hạnh kiểm tuần này!" },
      night_witch: { icon: "📒", color: "#8b5cf6", text: "Có bạn vừa bị ghi Sổ Đầu Bài! Dùng [+ Điểm Phát Biểu] gỡ tên hay [- Bút Đỏ Trừ Thi Đua]?" },
      night_witch_nd: { icon: "📒", color: "#8b5cf6", text: "Tối nay chưa ai bị ghi sổ. Bạn có muốn dùng [- Bút Đỏ] phạt trực nhật kẻ khả nghi không?" },
      night_seer: { icon: "🎽", color: "#06b6d4", text: "Giơ kính lúp soi thẻ 1 ghế: Đỏ = Giáo Viên 🔴 — Xanh = Bạn Cùng Lớp 🔵" },
      hunter_revenge: { icon: "📢", color: "#e11d48", text: "'Thưa cô bạn kia cũng nói chuyện ạ!' — Chọn nhanh 1 người trong 15s kéo lên đứng bảng chung!" },
      day_reveal: { icon: "☀️", color: "#f59e0b", text: "Trống vào tiết! Mở Sổ Đầu Bài xem tối qua ai bị gọi tên..." },
      day_discuss: { icon: "🎒", color: "#10b981", text: "Giờ ra chơi 15 phút! Cùng suy luận tìm ra nick clone của Cô Chủ Nhiệm!" },
      day_nominate: { icon: "🗳️", color: "#fb923c", text: "Click vào người bạn nghi là Giáo Viên nằm vùng để mời lên bục giảng!" },
      day_defense: { icon: "🎤", color: "#f97316", text: "Nghe bạn trên bục giảng thanh minh trước khi cả lớp giơ tay biểu quyết." },
      day_final_vote: { icon: "🚪", color: "#ef4444", text: "Cả lớp biểu quyết: Mời Ra Khỏi Nhóm Lớp hay Giữ Ngồi Lại?" },
      day_no_nomination: { icon: "😮‍💨", color: "#6b7280", text: "Không ai bị mời lên bảng. Cả lớp giữ nguyên đội hình sang tiết sau!" },
    },
    roles: {
      wolf: {
        label: "Cô Chủ Nhiệm Vi Hành",
        emoji: "👩‍🏫",
        color: "#ef4444",
        shortSkill: "Ghi Sổ Đầu Bài 1 bạn mỗi tối",
        description: "Lập nick clone vào group chat bàn cuối! Mỗi tối âm thầm ghi tên 1 học sinh vào Sổ Đầu Bài khiến bạn đó bay màu.",
      },
      alpha_wolf: {
        label: "Thầy Giám Thị",
        emoji: "🕶️",
        color: "#dc2626",
        shortSkill: "Suất cộng điểm thu phục về phe Trường",
        description: "Nghiêm khắc nhất hành lang! Có 1 quyền trao 'Suất Cộng Điểm Tuyển Thẳng' thu phục học sinh tối đó làm tai mắt cho Trường.",
      },
      guard: {
        label: "Lớp Phó Đỡ Lời",
        emoji: "🙋",
        color: "#3b82f6",
        shortSkill: "Xin phép bê vở chặn ghi Sổ Đầu Bài",
        description: "Mỗi tối nhanh trí xin phép 'Bạn ấy đi bê tập vở giúp trường ạ!' bảo vệ 1 người khỏi bị ghi sổ (không trùng 2 tối).",
      },
      witch: {
        label: "Thư Ký Sổ Đầu Bài",
        emoji: "📒",
        color: "#8b5cf6",
        shortSkill: "+Điểm Phát Biểu cứu · -Bút Đỏ phạt",
        description: "Giữ quyển Sổ Đầu Bài trên bàn đầu! Có 1 lần [+ Cộng Điểm Phát Biểu] gỡ tên cứu bạn và 1 lần [- Bút Đỏ] trừ thi đua kẻ khả nghi.",
      },
      seer: {
        label: "Sao Đỏ Trực Tuần",
        emoji: "🎽",
        color: "#06b6d4",
        shortSkill: "Soi thẻ biết Nick Giáo Viên hay Học Sinh",
        description: "Đeo băng đỏ sao vàng đi kiểm tra! Mỗi tối soi thẻ 1 ghế biết ngay là 🔴 Giáo Viên nằm vùng hay 🔵 Bạn Cùng Lớp.",
      },
      hunter: {
        label: "Chiến Thần 'Thưa Cô'",
        emoji: "📢",
        color: "#10b981",
        shortSkill: "Bị ghi sổ → Chỉ tay kéo 1 bạn đứng bảng chung",
        description: "Không bao giờ chịu phạt một mình! Khi bị ghi sổ hoặc mời ra, có 15s hô vang 'Thưa cô bạn kia cũng...' kéo 1 người đi cùng!",
      },
      cupid: {
        label: "Bà Mối Bàn Cuối",
        emoji: "💌",
        color: "#ec4899",
        shortSkill: "Tối đầu xếp Đôi Bạn Cùng Bàn",
        description: "Phóng máy bay giấy hồng ghép 2 người thành Đôi Bạn Cùng Bàn — 1 người bị mời ra hành lang là người kia xách ghế đi theo!",
      },
      mayor: {
        label: "Lớp Trưởng Gương Mẫu",
        emoji: "⭐",
        color: "#f59e0b",
        shortSkill: "Giơ Huy Hiệu Liên Đội → Phiếu x2",
        description: "Uy tín nhất lớp! Khi giơ Huy Hiệu Liên Đội công bố thân phận ban ngày, lá phiếu biểu quyết của bạn tính gấp đôi (x2)!",
      },
      tough_guy: {
        label: "Học Bá Dư Điểm 10",
        emoji: "📚",
        color: "#f97316",
        shortSkill: "Rổ điểm cộng dày → Trụ thêm trọn 1 ngày",
        description: "Tích lũy cả xấp điểm 10 miệng! Nếu tối nay lỡ bị ghi Sổ Đầu Bài vẫn lấy điểm cộng gánh qua hết ngày mai.",
      },
      cursed: {
        label: "Tổ Trưởng Ngầm",
        emoji: "🤓",
        color: "#64748b",
        shortSkill: "Bị Cô gọi riêng → Nhập hội Giáo Viên",
        description: "Ban đầu ngồi hội bàn cuối. Nhưng nếu tối đó bị Cô Chủ Nhiệm gọi riêng liền giác ngộ chuyển sang phe Giáo Viên!",
      },
      tanner: {
        label: "Thánh Thèm Đi Căng-Tin",
        emoji: "🧋",
        color: "#f43f5e",
        shortSkill: "Lừa cả lớp đuổi ra → Xuống Căng-tin thắng ngay!",
        description: "Bụng đói cồn cào thèm trà sữa trân châu! Thắng độc lập ngay lập tức nếu diễn khéo để cả lớp vote mời mình ra khỏi phòng!",
      },
      villager: {
        label: "Học Sinh Bàn Cuối",
        emoji: "🎒",
        color: "#eab308",
        shortSkill: "Suy luận tìm nick clone Giáo Viên",
        description: "Tinh quái, đoàn kết giờ ra chơi để phát hiện nick clone của Thầy Cô và bảo vệ danh hiệu Lớp Tiên Tiến!",
      },
      villager_female: {
        label: "Nữ Sinh Văn Nghệ",
        emoji: "🎀",
        color: "#eab308",
        shortSkill: "Khuấy động giờ ra chơi",
        description: "Thành viên năng nổ của lớp — cùng hội bàn cuối truy tìm nick Giáo Viên!",
      },
      villager_elder: {
        label: "Đàn Anh Khối Trên",
        emoji: "🏀",
        color: "#eab308",
        shortSkill: "Kinh nghiệm né Sổ Đầu Bài",
        description: "Đàn anh dày dạn kinh nghiệm trường lớp — dẫn dắt cả lớp giữ vững Cờ Thi Đua!",
      },
    },
  },
};

export function getUniverseTheme(universeId = "classic") {
  const uid = sanitizeUniverseId(universeId);
  return UNIVERSE_THEMES[uid] || UNIVERSE_THEMES.classic;
}

export function getUniverseRoleMeta(roleKey, universeId = "classic") {
  const base = ROLES_CONFIG[roleKey] || ROLES_CONFIG.villager;
  const uid = sanitizeUniverseId(universeId);
  if (uid === "classic") return base;
  const override = UNIVERSE_THEMES[uid]?.roles?.[roleKey];
  if (!override) return base;
  return {
    ...base,
    ...override,
  };
}

export function getUniverseRoleLabel(roleKey, universeId = "classic") {
  if (!roleKey) return "";
  return getUniverseRoleMeta(roleKey, universeId)?.label || ROLES_CONFIG[roleKey]?.label || roleKey;
}

export function getUniverseRoleEmoji(roleKey, universeId = "classic") {
  if (!roleKey) return "🎭";
  return getUniverseRoleMeta(roleKey, universeId)?.emoji || ROLES_CONFIG[roleKey]?.emoji || "🎭";
}

export function getUniverseRoleDescription(roleKey, universeId = "classic") {
  if (!roleKey) return "";
  return (
    getUniverseRoleMeta(roleKey, universeId)?.description ||
    ROLES_CONFIG[roleKey]?.description ||
    ""
  );
}

export function getUniverseRulesList(universeId = "classic") {
  const orderedKeys = [
    "wolf",
    "alpha_wolf",
    "guard",
    "seer",
    "witch",
    "hunter",
    "cupid",
    "mayor",
    "tough_guy",
    "cursed",
    "tanner",
    "villager",
  ];
  return orderedKeys.map((key) => {
    const meta = getUniverseRoleMeta(key, universeId);
    return {
      key,
      name: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      shortSkill: meta.shortSkill,
      desc: meta.description,
    };
  });
}

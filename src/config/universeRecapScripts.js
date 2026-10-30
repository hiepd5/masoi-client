// =============================================================================
// TỪ ĐIỂN KỊCH BẢN PHIM KỂ CHUYỆN & NHÃN 3D ĐỘC LẬP 3 KHÔNG GIAN (V4.6.1)
// - Classic: 100% Ma Sói Bắc Âu Huyền Huyễn nguyên bản
// - Office : 100% Đại Chiến Bảng Lương (0% từ vựng máu me / cắn / treo cổ / ma)
// - School : 100% Đại Chiến Sổ Đầu Bài (0% từ vựng bạo lực / chết chóc / pháp trường)
// =============================================================================

import { sanitizeUniverseId, getUniverseRoleLabel } from "./universeThemes.config.js";

export const UNIVERSE_RECAP_WINNER_CONFIG = {
  classic: {
    wolf: {
      emoji: "🐺",
      title: "Phe Sói Chiến Thắng!",
      subtitle: "Bóng tối đã hoàn toàn nuốt chửng ngôi làng...",
      themeClass: "wolf",
    },
    village: {
      emoji: "🏆",
      title: "Phe Dân Chiến Thắng!",
      subtitle: "Ánh sáng công lý đã xua tan nanh vuốt bóng đêm!",
      themeClass: "village",
    },
    tanner: {
      emoji: "💀",
      title: "Chán Đời Chiến Thắng!",
      subtitle: "Kẻ chán sống đã thực hiện được tâm nguyện trên giá treo cổ!",
      themeClass: "tanner",
    },
    lovers: {
      emoji: "💘",
      title: "Cặp Đôi Định Mệnh Chiến Thắng!",
      subtitle: "Tình yêu vượt qua ranh giới Sói và Dân, nắm tay nhau sống sót đến cuối cùng!",
      themeClass: "village",
    },
  },
  office: {
    wolf: {
      emoji: "👔",
      title: "Phe Sếp Vi Hành Chiến Thắng!",
      subtitle: "Ban Giám Đốc chốt sổ cắt sạch quỹ thưởng — cả văn phòng ngậm ngùi tăng ca!",
      themeClass: "wolf",
    },
    village: {
      emoji: "💼",
      title: "Hội Nhân Viên Bảo Toàn Trọn Lương Tháng 13!",
      subtitle: "Toàn bộ nick ẩn danh của Ban Giám Đốc đã bị lật tẩy khỏi phòng họp!",
      themeClass: "village",
    },
    tanner: {
      emoji: "🏖️",
      title: "Thánh Săn Đền Bù Thắng Ngoạn Mục!",
      subtitle: "Khéo léo để cả phòng mời nghỉ việc, ẵm trọn gói đền bù 6 tháng lương đi Phú Quốc!",
      themeClass: "tanner",
    },
    lovers: {
      emoji: "🧋",
      title: "Liên Minh Trà Sữa Thắng Tuyệt Đối!",
      subtitle: "Đôi bạn chung hợp đồng bọc lót hoàn hảo qua mọi đợt rà soát KPI tới phút chót!",
      themeClass: "village",
    },
  },
  school: {
    wolf: {
      emoji: "👩‍🏫",
      title: "Phe Giáo Viên Vi Hành Chiến Thắng!",
      subtitle: "Sổ Đầu Bài kín tên — hội bàn cuối chính thức nhận vé mời phụ huynh cuối tuần!",
      themeClass: "wolf",
    },
    village: {
      emoji: "🎒",
      title: "Hội Học Sinh Giữ Vững Cờ Thi Đua Nhất Tuần!",
      subtitle: "Mọi tài khoản ẩn danh của Cô Chủ Nhiệm và Giám Thị đều đã bị phát hiện!",
      themeClass: "village",
    },
    tanner: {
      emoji: "🧋",
      title: "Thánh Thèm Căng-Tin Thắng Tuyệt Đối!",
      subtitle: "Diễn sâu để cả lớp mời ra ngoài, ung dung chuồn thẳng xuống căng-tin uống trà sữa!",
      themeClass: "tanner",
    },
    lovers: {
      emoji: "💌",
      title: "Đôi Bạn Cùng Tiến Chiến Thắng!",
      subtitle: "Hai bạn bàn cuối nhắc bài ăn ý, cùng nhau vượt qua mọi đợt kiểm tra đột xuất!",
      themeClass: "village",
    },
  },
};

export const UNIVERSE_RECAP_UI_LABELS = {
  classic: {
    brandWatermark: "🐺 Ma Sói Online 3D • masoi.hiepd5.com",
    recPillText: "PHIM KỂ CHUYỆN",
    cardsHeading: "🎭 Chân Tướng Cả Làng",
    loverCardTag: "💘 Cặp Đôi Định Mệnh",
    aliveStatus: "🟢 Sống sót",
    deadStatus: "👻 Tử nạn",
    mvpSectionTag: "🏆 NGÔI SAO XUẤT SẮC NHẤT VÁN ĐẤU",
    ghostXpTemplate: "🔮 +{xp} XP Tiên Tri Âm Giới!",
    shareTitle: "🐺 Highlight Ma Sói Online 3D",
    shareText: "Xem lại cú lừa đỉnh cao tại Ngôi Làng Ma Sói 3D: https://masoi.hiepd5.com!",
  },
  office: {
    brandWatermark: "💼 Đại Chiến Bảng Lương 3D • masoi.hiepd5.com",
    recPillText: "BĂNG GHI HÌNH PHÒNG HỌP",
    cardsHeading: "🪪 Hồ Sơ Nhân Sự Toàn Phòng",
    loverCardTag: "🧋 Liên Minh Chung Hợp Đồng",
    aliveStatus: "🟢 Giữ trọn KPI",
    deadStatus: "📦 Bàn giao việc",
    mvpSectionTag: "🏆 NHÂN SỰ XUẤT SẮC NHẤT KỲ HỌP",
    ghostXpTemplate: "☕ +{xp} XP Tổ Hóng Pantry!",
    shareTitle: "💼 Highlight Đại Chiến Bảng Lương 3D",
    shareText: "Xem màn đấu trí bảo vệ lương thưởng cực căng tại https://masoi.hiepd5.com!",
  },
  school: {
    brandWatermark: "🎒 Đại Chiến Sổ Đầu Bài 3D • masoi.hiepd5.com",
    recPillText: "NHẬT KÝ TIẾT SINH HOẠT",
    cardsHeading: "📒 Sơ Đồ Chỗ Ngồi Cả Lớp",
    loverCardTag: "💌 Đôi Bạn Cùng Tiến",
    aliveStatus: "🟢 Giữ điểm tốt",
    deadStatus: "🙇 Tự kiểm điểm",
    mvpSectionTag: "🏆 GƯƠNG MẶT TIÊU BIỂU NHẤT LỚP",
    ghostXpTemplate: "🧋 +{xp} XP Hội Hóng Hành Lang!",
    shareTitle: "🎒 Highlight Đại Chiến Sổ Đầu Bài 3D",
    shareText: "Xem pha lật kèo Sổ Đầu Bài cười nghiêng ngả tại https://masoi.hiepd5.com!",
  },
};

export function getUniverseRecapUi(universeId = "classic") {
  const uid = sanitizeUniverseId(universeId);
  return UNIVERSE_RECAP_UI_LABELS[uid] || UNIVERSE_RECAP_UI_LABELS.classic;
}

export function getUniverseRecapWinnerConfig(universeId = "classic", winner = "village") {
  const uid = sanitizeUniverseId(universeId);
  const normWinner = winner === "wolves" ? "wolf" : winner;
  const table = UNIVERSE_RECAP_WINNER_CONFIG[uid] || UNIVERSE_RECAP_WINNER_CONFIG.classic;
  return table[normWinner] || table.village;
}

/**
 * Sinh trọn bộ câu chữ & nhãn 3D nguyên bản 100% cho từng nhịp phim EndGameRecap.
 * Trả về `null` khi `universeId === "classic"` để giữ nguyên từng dấu chấm phẩy của Ma Sói gốc.
 */
export function formatUniverseRecapBeat(universeId, beatKey, ctx = {}) {
  const uid = sanitizeUniverseId(universeId);
  if (uid === "classic") return null;

  const {
    dayNum = 1,
    actorName = "Người chơi",
    targetName = "Mục tiêu",
    prevName = "Người trước",
    partnerName = "Đồng đội",
    chatText = "",
    switched = false,
    isWolfResult = false,
    isWolfSpeaker = false,
    isCollectiveVote = false,
    isHanged = false,
    isTannerWin = false,
    roleLabel = "Thành viên",
    mvpName = "",
    mvpDescription = "",
    winTitle = "",
    winSubtitle = "",
  } = ctx;

  if (uid === "office") {
    switch (beatKey) {
      case "opening_reveal":
        return {
          tag: "💼 MỞ BĂNG HỌP TỔNG KẾT",
          title: "Khi Thẻ Nhân Viên Mở Khóa Sau Giờ Chốt Bảng Lương",
          narration:
            "Đèn phòng họp Penthouse bật sáng. Hãy cùng tua lại camera nội bộ để xem ai mới thực sự là Sếp Vi Hành đứng sau đợt rà soát KPI vừa qua!",
        };
      case "guard_pick":
        return {
          tag: `🌙 CA TỐI ${dayNum} • GÓC NHÌN TEAM LEAD`,
          title: `Team Lead ${actorName} Bật Tường Lửa Bảo Lãnh KPI Cho ${targetName}`,
          narration: `Giữa ca trực tối ${dayNum}, Team Lead ${actorName} âm thầm dựng màn hình Tường Lửa Xanh ký duyệt bảo toàn chỉ tiêu cho ${targetName}.`,
          actorBadge: "🛡️ KÝ BẢO LÃNH KPI",
          targetBadge: "🛡️ ĐƯỢC CHE CHỞ KPI",
        };
      case "wolf_aim":
        return {
          tag: `🌙 CA TỐI ${dayNum} • GÓC NHÌN SẾP VI HÀNH`,
          title: switched
            ? `Sếp ${actorName} Đổi Mục Tiêu Soi Hồ Sơ Từ ${prevName} Sang ${targetName}`
            : `Sếp ${actorName} Mở Hồ Sơ Đỏ Ngắm Cắt Thưởng ${targetName}`,
          narration: switched
            ? `Sau một thoáng cân nhắc bảng chấm công của ${prevName}, Sếp ${actorName} xoay con dấu đỏ chuyển thẳng sang vị trí của ${targetName}.`
            : `Trong văn phòng tĩnh lặng, Sếp ${actorName} gõ nhẹ lên tập hồ sơ KPI và nhắm con dấu đỏ về phía bàn làm việc của ${targetName}.`,
          actorBadge: switched ? "👔 ĐỔI HỒ SƠ!" : "👔 SOI BẢNG LƯƠNG",
          targetBadge: "🎯 ĐANG BỊ RÀ SOÁT",
          prevBadge: "😮‍💨 THOÁT ĐỢT DUYỆT",
        };
      case "wolf_chat":
        return {
          tag: `🌙 CA TỐI ${dayNum} • HỌP KÍN BAN GIÁM ĐỐC`,
          title: `Tin Nhắn Mật Của Sếp ${actorName} Trong Nhóm Điều Hành`,
          narration: `Sếp ${actorName} nhắn riêng với hội đồng quản trị: "${chatText}"`,
          dialogueSpeaker: `👔 ${actorName}`,
          dialogueText: chatText ? `👔 ${actorName}: "${chatText}"` : null,
          actorBadge: "👔 MẬT ĐÀM SẾP",
        };
      case "wolf_strike":
        return {
          tag: `🌙 CA TỐI ${dayNum} • ĐẠI CẢNH ĐÓNG MỘC CẮT KPI`,
          title: `Ban Giám Đốc Đồng Loạt Giáng Mộc Đỏ Cắt Thưởng ${targetName}!`,
          narration: `Cao trào ca tối ${dayNum}! Từ góc quay toàn cảnh phòng họp, con dấu đỏ khổng lồ CẮT KPI giáng thẳng xuống bàn của ${targetName}!`,
          actorBadge: "👔 CHỐT CẮT KPI!",
          targetBadge: "📉 MẤT THƯỞNG THÁNG!",
        };
      case "shield_block":
        return {
          tag: `🌙 CA TỐI ${dayNum} • TƯỜNG LỬA KPI CHẶN ĐÒN`,
          title: `Tường Lửa Của Team Lead ${actorName} Đẩy Bật Mộc Đỏ, Giữ Lương Cho ${targetName}!`,
          narration: `Đúng giây phút con dấu cắt thưởng giáng xuống, màn hình Tường Lửa APPROVED của ${actorName} bật sáng đẩy lùi Sếp, bảo toàn 100% lương cho ${targetName}!`,
          actorBadge: "🛡️ TƯỜNG LỬA BẢO LÃNH!",
          targetBadge: "✨ GIỮ NGUYÊN BẢNG LƯƠNG!",
        };
      case "witch_save":
        return {
          tag: `🌙 CA TỐI ${dayNum} • GÓC NHÌN KẾ TOÁN TRƯỞNG`,
          title: `Kế Toán Trưởng ${actorName} Duyệt Thưởng Nóng Phục Hồi Lương Cho ${targetName}`,
          narration: `Thấy ${targetName} vừa bị gạch thưởng trong đêm, Kế Toán Trưởng ${actorName} lập tức tung Thẻ Thưởng Chuyên Cần kéo bảng lương trở lại nguyên vẹn!`,
          actorBadge: "💳 DUYỆT THƯỞNG NÓNG!",
          targetBadge: "💚 PHỤC HỒI 100% KPI!",
        };
      case "witch_poison":
        return {
          tag: `🌙 CA TỐI ${dayNum} • GÓC NHÌN KẾ TOÁN TRƯỞNG`,
          title: `Kế Toán Trưởng ${actorName} Xuất Phiếu Khấu Trừ Lương Với ${targetName}`,
          narration: `Bằng nghiệp vụ kiểm toán sắc bén, Kế Toán Trưởng ${actorName} phóng thẳng lệnh Khấu Trừ Chuyên Cần sang bàn của ${targetName}!`,
          actorBadge: "🪙 LỆNH KHẤU TRỪ!",
          targetBadge: "📉 TRỪ SẠCH PHỤ CẤP!",
        };
      case "seer_scan":
        return {
          tag: `🌙 CA TỐI ${dayNum} • GÓC NHÌN NHÂN VIÊN IT`,
          title: isWolfResult
            ? `Nhân Viên IT ${actorName} Quét Trúng IP Quản Trị Của Sếp ${targetName}!`
            : `Nhân Viên IT ${actorName} Xác Thực IP Đồng Nghiệp Chuẩn Của ${targetName}`,
          narration: isWolfResult
            ? `Tia quét mạng nội bộ của IT ${actorName} lập tức báo động đỏ khi chạm vào máy ${targetName} — tài khoản Sếp Vi Hành đã lộ diện!`
            : `Nhân Viên IT ${actorName} kiểm tra log truy cập của ${targetName} và xác nhận đây là nhân viên gương mẫu chuẩn 100%.`,
          actorBadge: "💻 QUÉT LOG IP",
          targetBadge: isWolfResult ? "🔴 IP SẾP VI HÀNH!" : "🔵 IP NHÂN VIÊN CHUẨN",
        };
      case "cursed_turn":
        return {
          tag: `🌙 CA TỐI ${dayNum} • QUYẾT ĐỊNH THĂNG CHỨC NGẦM`,
          title: `Bước Ngoặt Phòng Họp — Thực Tập Sinh ${targetName} Đeo Thẻ VIP Nhập Phe Sếp!`,
          narration: `Ngay sau đợt duyệt lương tối nay, ${targetName} bất ngờ chỉnh lại cà-vạt, nhận quyết định bổ nhiệm ngầm và chính thức đứng về phe Ban Giám Đốc!`,
          targetBadge: "🪪➡️👔 LÊN CHỨC SẾP!",
        };
      case "tough_endure":
        return {
          tag: `🌙 CA TỐI ${dayNum} • BẢN LĨNH QUỸ DỰ PHÒNG`,
          title: `Chiến Thần Quỹ Đen ${targetName} Nâng Ly Cà Phê Vượt Đợt Cắt Lương`,
          narration: `Dù bị đóng mộc cắt KPI trong đêm, nguồn quỹ dự phòng dồi dào vẫn giúp ${targetName} ung dung trụ vững thêm trọn một ngày làm việc!`,
          targetBadge: "☕ BẬT QUỸ DỰ PHÒNG!",
        };
      case "night_death":
        return {
          tag: `☀️ SÁNG NGÀY ${dayNum} • BẢN TIN NHÂN SỰ`,
          title: `Email Đầu Giờ Sáng — ${targetName} Tạm Rời Dự Án Sau Ca Tối`,
          narration: `Chuông thang máy vừa reo sáng ngày ${dayNum}, cả phòng ngỡ ngàng nhận thông báo ${targetName} đã bị gạch tên khỏi danh sách thưởng và chuyển sang bàn chờ.`,
          targetBadge: "📦 BÀN GIAO DỰ ÁN",
        };
      case "peaceful_dawn":
        return {
          tag: `☀️ SÁNG NGÀY ${dayNum} • BẢNG LƯƠNG BÌNH YÊN`,
          title: `Buổi Sáng Thứ Hai Rực Rỡ — Bảng Lương Toàn Phòng Nguyên Vẹn`,
          narration: `Ánh nắng sớm chiếu qua khung kính Penthouse — tuyệt vời thay, ca tối thứ ${dayNum} khép lại mà không một ai bị trừ thưởng!`,
        };
      case "village_chat":
        return {
          tag: `☕ NGÀY ${dayNum} • TRANH LUẬN GIỜ TRÀ CHIỀU`,
          title: isWolfSpeaker
            ? `Sếp ${actorName} Điềm Nhiên Đóng Vai Nhân Viên Giữa Phòng Họp`
            : `${actorName} Phân Tích Bảng Chấm Công Trước Toàn Phòng`,
          narration: `${actorName} phát biểu giữa cuộc họp: "${chatText}"`,
          actorBadge: isWolfSpeaker ? "👔 SẾP DIỄN SÂU" : "💬 PHÁT BIỂU KPI",
        };
      case "day_nominate":
        return {
          tag: isCollectiveVote
            ? `🗳️ NGÀY ${dayNum} • TOÀN PHÒNG ĐỀ CỬ KIỂM ĐIỂM`
            : `🗳️ NGÀY ${dayNum} • ĐỀ CỬ CÁ NHÂN`,
          title: switched
            ? `${actorName} Đổi Ý Phút Chót, Chuyển Phiếu Nghi Vấn Sang ${targetName}!`
            : isCollectiveVote
              ? `Áp Lực Cả Phòng Họp Dồn Thẳng Về Bàn Của ${targetName}`
              : `${actorName} Mở Màn Chất Vấn, Đề Cử Kiểm Tra ${targetName}`,
          narration: isCollectiveVote
            ? `Góc máy mở rộng toàn phòng họp khi hàng loạt cánh tay đồng loạt đề nghị rà soát tài khoản của ${targetName}!`
            : switched
              ? `Giữa cuộc họp căng thẳng, ${actorName} rút lại nghi vấn với ${prevName} và chỉ thẳng sang ${targetName}!`
              : `Từ ghế ngồi của mình, ${actorName} giơ tay đề nghị đưa ${targetName} lên bàn giải trình KPI.`,
          actorBadge: switched ? "👉 ĐỔI ĐỀ CỬ!" : "👉 ĐỀ NGHỊ RÀ SOÁT",
          targetBadge: "⚖️ LÊN GHẾ GIẢI TRÌNH",
        };
      case "day_defense":
        return {
          tag: `🎤 NGÀY ${dayNum} • GIẢI TRÌNH TRƯỚC PHÒNG HỌP`,
          title: `${targetName} Mở Mic Bảo Vệ Bảng Chấm Công Của Mình`,
          narration: `Trước ánh nhìn săm soi của toàn bộ đồng nghiệp, ${targetName} bình tĩnh trình bày bằng chứng để giữ chỗ trong group dự án.`,
          targetBadge: "🎤 ĐANG GIẢI TRÌNH KPI",
        };
      case "day_verdict":
        return {
          tag: `⚖️ NGÀY ${dayNum} • BIỂU QUYẾT NHÂN SỰ TOÀN PHÒNG`,
          title: isHanged
            ? isTannerWin
              ? `Cú Lừa Đền Bù — ${targetName} (${roleLabel}) Ôm Trọn 6 Tháng Lương Nghỉ Việc!`
              : `Chốt Biên Bản Họp — Mời ${targetName} (${roleLabel}) Bàn Giao Công Việc!`
            : `Phòng Họp Đồng Thuận Giữ ${targetName} Ở Lại Dự Án`,
          narration: isHanged
            ? isTannerWin
              ? `Tưởng rằng vừa loại được Sếp, nào ngờ ${targetName} tung phong bì đền bù nhảy mừng rỡ — đây chính là Thánh Săn Đền Bù!`
              : `Đa số thẻ đỏ HR đã giơ lên! ${targetName} ôm thùng carton lưu niệm rời phòng họp, lộ diện chức danh thật là ${roleLabel}!`
            : `Những phiếu xanh tín nhiệm chiếm ưu thế tuyệt đối, ${targetName} thở phào ngồi lại ghế tiếp tục chiến đấu vì thưởng quý!`,
          voteHangBadge: "🟥 MỜI RA!",
          voteSpareBadge: "🟩 GIỮ LẠI!",
          targetBadge: isHanged
            ? isTannerWin
              ? "🏖️ ĂN ĐỀN BÙ 6 THÁNG!"
              : "📦 BÀN GIAO VIỆC!"
            : "🤝 GIỮ LẠI PHÒNG!",
        };
      case "cupid_link":
        return {
          tag: `🌙 CA TỐI ${dayNum} • BÀ TÁM GHÉP LIÊN MINH`,
          title: `Bà Tám ${actorName} Kết Nối Hợp Đồng Trà Sữa Cho ${targetName} & ${partnerName}`,
          narration: `Ngay ca trực đầu tiên, Bà Tám ${actorName} đã se duyên đồng minh thân thiết, gắn chặt quyền lợi thưởng quý của ${targetName} và ${partnerName}!`,
          actorBadge: "🧋 SE DUYÊN ĐỒNG NGHIỆP!",
          targetBadge: "🧋 CHUNG HỢP ĐỒNG",
        };
      case "alpha_convert":
        return {
          tag: `🌙 CA TỐI ${dayNum} • CHỦ TỊCH TRAO THẺ VIP`,
          title: `Chủ Tịch ${actorName} Bổ Nhiệm Ngầm ${targetName} Vào Hội Đồng Sếp!`,
          narration: `Thay vì cắt thưởng, Chủ Tịch Tập Đoàn ${actorName} trao tận tay Thẻ Đỏ VIP kéo ${targetName} sang phe Ban Giám Đốc ngay trong đêm!`,
          actorBadge: "👑 TRAO THẺ VIP!",
          targetBadge: "🪪➡️👔 GIA NHẬP PHE SẾP!",
        };
      case "lover_heartbreak":
        return {
          tag: `🧋 NGÀY ${dayNum} • ĐỒNG CHÍ CHUNG HỢP ĐỒNG`,
          title: `Giữ Trọn Chữ Tín — ${targetName} Nộp Đơn Nghỉ Phép Đi Cùng ${actorName}!`,
          narration: `Thấy người bạn đồng hành ${actorName} vừa rời cuộc họp, ${targetName} lập tức gấp laptop xin nghỉ phép đi du lịch chung luôn cho trọn tình đồng nghiệp!`,
          targetBadge: "🧋 NGHỈ PHÉP CÙNG BẠN!",
        };
      case "hunter_shot":
        return {
          tag: `✈️ NGÀY ${dayNum} • TUYỆT CHIÊU EMAIL CC TOÀN CÔNG TY`,
          title: `Senior ${actorName} Phóng Email CC All Kéo ${targetName} (${roleLabel}) Rời Họp Chung!`,
          narration: `Trước khi đóng thùng bàn giao máy, Senior ${actorName} bấm gửi chiếc tàu bay Email CC toàn công ty kéo thẳng ${targetName} bàn giao việc cùng mình!`,
          actorBadge: "✈️ EMAIL CC ALL!",
          targetBadge: "📉 DÍNH CC BAY KPI!",
        };
      case "mayor_reveal":
        return {
          tag: `🏅 NGÀY ${dayNum} • CHỦ TỊCH CÔNG ĐOÀN LÊN TIẾNG`,
          title: `${actorName} Giơ Cao Cúp Vàng Công Đoàn — Nhân Đôi Sức Nặng Phiếu Bầu (x2)!`,
          narration: `Giữa cuộc họp quyết liệt, ${actorName} đặt Cúp Công Đoàn lên bàn khẳng định uy tín — mọi phiếu biểu quyết từ nay được tính hệ số x2!`,
          actorBadge: "🏅 CÚP CÔNG ĐOÀN X2!",
        };
      case "mvp_finale":
        return {
          tag: "🏆 CHƯƠNG CUỐI • VINH DANH NHÂN SỰ",
          title: mvpName
            ? `Ngôi Sao Xuất Sắc Nhất Phòng Họp: ${mvpName} (${roleLabel})`
            : winTitle || "Khép Lại Kỳ Họp Bảng Lương",
          narration: mvpName
            ? `Khép lại màn đấu trí công sở mãn nhãn, danh hiệu MVP thuộc về ${mvpName}. ${mvpDescription}`
            : winSubtitle || "Cuộc họp tổng kết đã khép lại!",
          mvpBadge: "👑 MVP PHÒNG HỌP!",
        };
      default:
        return null;
    }
  }

  // ==================== VŨ TRỤ HỌC ĐƯỜNG (`school`) ====================
  switch (beatKey) {
    case "opening_reveal":
      return {
        tag: "🎒 MỞ SỔ SINH HOẠT LỚP",
        title: "Khi Phù Hiệu Thật Lộ Diện Sau Tiếng Trống Tan Trường",
        narration:
          "Nắng chiều hoàng hôn phủ vàng sân trường. Hãy cùng tua lại toàn bộ giờ ra chơi để xem ai mới là Cô Chủ Nhiệm và Giám Thị vi hành trong lớp!",
      };
    case "guard_pick":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • GÓC NHÌN LỚP PHÓ`,
        title: `Lớp Phó ${actorName} Chuẩn Bị Bảng Phấn Đỡ Lời Cho ${targetName}`,
        narration: `Trong tiết tự học ${dayNum}, Lớp Phó Học Tập ${actorName} lặng lẽ ghi chú bảo lãnh trực nhật để che chở cho bàn của ${targetName}.`,
        actorBadge: "📚 ĐỠ LỜI GIÚP BẠN",
        targetBadge: "📚 ĐƯỢC BẢO LÃNH",
      };
    case "wolf_aim":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • GÓC NHÌN CÔ CHỦ NHIỆM`,
        title: switched
          ? `Cô Chủ Nhiệm ${actorName} Đổi Hướng Tuần Tra Từ ${prevName} Sang ${targetName}`
          : `Cô Chủ Nhiệm ${actorName} Cầm Thước Gỗ Ngắm Sổ Chỗ Của ${targetName}`,
        narration: switched
          ? `Sau một nhịp dừng chân cạnh bàn ${prevName}, ${actorName} khẽ xoay cây thước gỗ chuyển ánh nhìn nghiêm nghị sang bàn của ${targetName}.`
          : `Giữa lớp học im phăng phắc, ${actorName} mở Sổ Đầu Bài và hướng đầu thước kiểm tra về phía bàn của ${targetName}.`,
        actorBadge: switched ? "👩‍🏫 ĐỔI BÀN KIỂM TRA!" : "👩‍🏫 TUẦN TRA LỚP",
        targetBadge: "🎯 ĐANG BỊ ĐỂ Ý",
        prevBadge: "😮‍💨 THOÁT GHI SỔ",
      };
    case "wolf_chat":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • TRAO ĐỔI TỔ GIÁO VIÊN`,
        title: `Lời Nhắn Riêng Của ${actorName} Trong Sổ Trực Ban`,
        narration: `${actorName} trao đổi nhỏ cùng tổ giám thị: "${chatText}"`,
        dialogueSpeaker: `👩‍🏫 ${actorName}`,
        dialogueText: chatText ? `👩‍🏫 ${actorName}: "${chatText}"` : null,
        actorBadge: "👩‍🏫 HỘI Ý GIÁO VIÊN",
      };
    case "wolf_strike":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • ĐẠI CẢNH GÕ THƯỚC GHI SỔ ĐẦU BÀI`,
        title: `Tổ Giáo Viên Đồng Loạt Gõ Thước Ghi Tên ${targetName} Vào Sổ Đầu Bài!`,
        narration: `Khoảnh khắc căng nhất tiết ${dayNum}! Khung hình mở rộng toàn lớp học khi tiếng thước gỗ vang lên chốt tên ${targetName} vào Sổ Đầu Bài!`,
        actorBadge: "👩‍🏫 GÕ THƯỚC GHI SỔ!",
        targetBadge: "📒 VÀO SỔ ĐẦU BÀI!",
      };
    case "shield_block":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • LỚP PHÓ ĐỠ LỜI NGOẠN MỤC`,
        title: `Bảng Xanh Đỡ Lời Của Lớp Phó ${actorName} Cứu ${targetName} Thoát Ghi Sổ!`,
        narration: `Đúng lúc bút đỏ sắp hạ xuống, Lớp Phó ${actorName} đứng bật dậy giơ Bảng Xanh xác nhận ${targetName} đang đi bê vở giúp lớp, giữ sạch điểm thi đua!`,
        actorBadge: "📚 EM THƯA CÔ ĐỠ LỜI!",
        targetBadge: "✨ GIỮ SẠCH SỔ ĐẦU BÀI!",
      };
    case "witch_save":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • GÓC NHÌN THƯ KÝ`,
        title: `Thư Ký ${actorName} Tặng Hoa Điểm 10 Gỡ Điểm Phạt Cho ${targetName}`,
        narration: `Thấy ${targetName} sắp bị hạ bậc thi đua, Thư Ký ${actorName} nhanh tay cộng ngay một Bông Hoa Điểm 10 phát biểu để cứu bạn ngoạn mục!`,
        actorBadge: "🌸 TẶNG HOA ĐIỂM 10!",
        targetBadge: "💚 GỠ SẠCH ĐIỂM TRỪ!",
      };
    case "witch_poison":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • GÓC NHÌN THƯ KÝ`,
        title: `Thư Ký ${actorName} Ghi Chú Nhắc Nhở Thi Đua Với ${targetName}`,
        narration: `Không bỏ lọt nghi vấn nào, Thư Ký Sổ Đầu Bài ${actorName} phóng thẳng phiếu trừ điểm trật tự sang bàn của ${targetName}!`,
        actorBadge: "📒 GHI PHIẾU NHẮC NHỞ!",
        targetBadge: "📉 TRỪ ĐIỂM THI ĐUA!",
      };
    case "seer_scan":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • GÓC NHÌN SAO ĐỎ`,
        title: isWolfResult
          ? `Sao Đỏ ${actorName} Rọi Đèn Phát Hiện Nick Giáo Viên Của ${targetName}!`
          : `Sao Đỏ ${actorName} Kiểm Tra Thấy Phù Hiệu Học Sinh Ngoan Của ${targetName}`,
        narration: isWolfResult
          ? `Chùm đèn kiểm tra của Sao Đỏ ${actorName} vừa rọi qua bàn ${targetName} lập tức phát tín hiệu cảnh báo — một nick Giáo Viên Vi Hành đã lộ diện!`
          : `Sao Đỏ ${actorName} rọi đèn kiểm tra phù hiệu bàn của ${targetName} và xác nhận đây là thành viên hội học sinh chính hiệu.`,
        actorBadge: "🔦 RỌI PHÙ HIỆU",
        targetBadge: isWolfResult ? "🔴 NICK GIÁO VIÊN!" : "🔵 HỌC SINH NGOAN",
      };
    case "cursed_turn":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • ĐEO BĂNG ĐỎ TRỰC BAN`,
        title: `Cú Quay Xe Bàn Cuối — Tổ Trưởng ${targetName} Đeo Băng Đỏ Nhập Phe Giám Thị!`,
        narration: `Sau lượt kiểm tra tối nay, ${targetName} bất ngờ rút băng đỏ trực ban từ ngăn bàn đeo lên tay, chính thức đứng về phe Giáo Viên!`,
        targetBadge: "🎽➡️👩‍🏫 NHẬP PHE GIÁM THỊ!",
      };
    case "tough_endure":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • ĐẶC QUYỀN HỌC BÁ`,
        title: `Học Bá ${targetName} Giơ Xấp Bài Điểm 10 Đỡ Lượt Ghi Sổ`,
        narration: `Nhờ thành tích học tập chói sáng, Học Bá ${targetName} được miễn trừ nhắc nhở lần đầu và tự tin ngồi lại lớp thêm một tiết nữa!`,
        targetBadge: "💯 MIỄN TRỪ ĐIỂM 10!",
      };
    case "night_death":
      return {
        tag: `☀️ TIẾT ${dayNum} • THÔNG BÁO ĐẦU GIỜ`,
        title: `Trống Vào Tiết Vang Lên — ${targetName} Bị Mời Ra Hành Lang Trực Tự Quản`,
        narration: `Khi tiếng trống báo giờ vang khắp sân trường, cả lớp ngỡ ngàng thấy tên ${targetName} nằm trong Sổ Đầu Bài và phải tạm rời nhóm thảo luận.`,
        targetBadge: "📒 RA HÀNH LANG TRỰC",
      };
    case "peaceful_dawn":
      return {
        tag: `☀️ TIẾT ${dayNum} • CẢ LỚP GIỮ VỮNG CỜ ĐỎ`,
        title: `Tiết Học Mới Tươi Vui — Không Một Ai Bị Ghi Tên Vào Sổ`,
        narration: `Nắng vàng chiếu qua khung cửa sổ lớp học — tuyệt vời thay, giờ truy bài thứ ${dayNum} trôi qua êm đẹp với 100% quân số nguyên vẹn!`,
      };
    case "village_chat":
      return {
        tag: `🎒 TIẾT ${dayNum} • BÀN TÁN GIỜ RA CHƠI`,
        title: isWolfSpeaker
          ? `${actorName} Khéo Léo Hòa Nhập Như Học Sinh Bàn Cuối Thực Thụ`
          : `${actorName} Sôi Nổi Suy Luận Giữa Lớp Học`,
        narration: `${actorName} lên tiếng trước cả lớp: "${chatText}"`,
        actorBadge: isWolfSpeaker ? "👩‍🏫 ĐÓNG VAI HỌC SINH" : "💬 PHÁT BIỂU SÔI NỔI",
      };
    case "day_nominate":
      return {
        tag: isCollectiveVote
          ? `🗳️ TIẾT ${dayNum} • CẢ LỚP ĐỒNG LOẠT ĐỀ CỬ`
          : `🗳️ TIẾT ${dayNum} • GIƠ TAY PHÁT BIỂU`,
        title: switched
          ? `${actorName} Bất Ngờ Đổi Ý, Chuyển Mũi Nghi Vấn Sang ${targetName}!`
          : isCollectiveVote
            ? `Cả Lớp Đồng Loạt Hướng Ánh Nhìn Nghi Ngờ Về Bàn Của ${targetName}`
            : `${actorName} Xung Phong Đề Cử Mời ${targetName} Lên Bục Giải Thích`,
        narration: isCollectiveVote
          ? `Toàn cảnh lớp học rộn ràng khi hàng loạt cánh tay giơ cao đề nghị kiểm tra thân phận thật của ${targetName}!`
          : switched
            ? `Giữa giờ sinh hoạt sôi nổi, ${actorName} rút lại ý kiến về ${prevName} và chỉ sang bàn của ${targetName}!`
            : `Từ dãy bàn của mình, ${actorName} đứng dậy giơ tay đề nghị mời ${targetName} lên bục giảng giải thích.`,
        actorBadge: switched ? "👉 ĐỔI ĐỀ CỬ!" : "🙋 GIƠ TAY ĐỀ CỬ",
        targetBadge: "⚖️ LÊN BỤC GIẢNG",
      };
    case "day_defense":
      return {
        tag: `🎤 TIẾT ${dayNum} • THANH MINH TRÊN BỤC GIẢNG`,
        title: `${targetName} Bình Tĩnh Trình Bày Trước Toàn Thể Lớp Học`,
        narration: `Đứng trước bảng xanh và hàng chục ánh mắt bạn bè, ${targetName} tự tin giải thích để chứng minh mình thuộc hội học sinh bàn cuối.`,
        targetBadge: "🎤 ĐANG THANH MINH",
      };
    case "day_verdict":
      return {
        tag: `⚖️ TIẾT ${dayNum} • BIỂU QUYẾT TẬP THỂ LỚP`,
        title: isHanged
          ? isTannerWin
            ? `Đúng Ý Nguyện — ${targetName} (${roleLabel}) Tung Tăng Phóng Thẳng Xuống Căng-Tin!`
            : `Cả Lớp Chốt Phiếu — Mời ${targetName} (${roleLabel}) Khoanh Tay Tự Kiểm Điểm!`
          : `Cả Lớp Bao Che Thành Công, Giữ ${targetName} Ngồi Lại Bàn`,
        narration: isHanged
          ? isTannerWin
            ? `Cả lớp vừa biểu quyết mời ra ngoài thì ${targetName} giơ ly trà sữa reo vang — bạn ấy chính là Thánh Thèm Căng-Tin mong được nghỉ tiết bấy lâu!`
            : `Những tấm bảng con đồng loạt giơ cao! ${targetName} bước lên bục khoanh tay tự kiểm điểm, lộ diện vai trò thật là ${roleLabel}!`
          : `Tinh thần đoàn kết lan khắp lớp học, đa số phiếu xanh đồng ý giữ ${targetName} ở lại tiếp tục giờ ra chơi!`,
        voteHangBadge: "🟥 MỜI RA!",
        voteSpareBadge: "🟩 GIỮ LẠI!",
        targetBadge: isHanged
          ? isTannerWin
            ? "🧋 XUỐNG CĂNG-TIN!"
            : "🙇 TỰ KIỂM ĐIỂM!"
          : "🙌 Ở LẠI LỚP!",
      };
    case "cupid_link":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • BÀ MỐI GỬI THƯ TAY`,
        title: `Bà Mối ${actorName} Ghép Đôi Bạn Cùng Tiến Cho ${targetName} & ${partnerName}`,
        narration: `Một bức thư tay xinh xắn từ bàn cuối của ${actorName} đã gắn kết ${targetName} và ${partnerName} thành Đôi Bạn Cùng Bàn có phúc cùng hưởng!`,
        actorBadge: "💌 GỬI THƯ GHÉP ĐÔI!",
        targetBadge: "💌 ĐÔI BẠN CÙNG BÀN",
      };
    case "alpha_convert":
      return {
        tag: `🌙 GIỜ TRUY BÀI ${dayNum} • THẦY GIÁM THỊ TUYỂN QUÂN`,
        title: `Thầy Giám Thị ${actorName} Trao Băng Đỏ Tuyển Ngầm ${targetName}!`,
        narration: `Thay vì ghi tên vào sổ, Thầy Giám Thị ${actorName} bí mật trao phù hiệu trực ban kéo ${targetName} về phe Giáo Viên ngay trong tiết tự học!`,
        actorBadge: "🕶️ TRAO BĂNG TRỰC BAN!",
        targetBadge: "🎽➡️👩‍🏫 NHẬP PHE GIÁO VIÊN!",
      };
    case "lover_heartbreak":
      return {
        tag: `💌 TIẾT ${dayNum} • TÌNH BẠN CÙNG BÀN`,
        title: `Có Phúc Cùng Hưởng — ${targetName} Xách Cặp Ra Hành Lang Đứng Cùng ${actorName}!`,
        narration: `Không nỡ để cậu bạn cùng bàn ${actorName} đứng hành lang một mình, ${targetName} hào hiệp bước ra chịu phạt chung cho trọn tình đôi bạn thân!`,
        targetBadge: "💌 ĐỨNG PHẠT CÙNG BẠN!",
      };
    case "hunter_shot":
      return {
        tag: `📢 TIẾT ${dayNum} • TUYỆT CHIÊU EM THƯA CÔ BẠN KIA CŨNG VẬY`,
        title: `${actorName} Bắc Loa Phóng Thanh Kéo ${targetName} (${roleLabel}) Lên Bảng Chung!`,
        narration: `Trước khi bước ra hành lang, Chiến Thần Thưa Cô ${actorName} dõng dạc chỉ điểm kéo luôn ${targetName} vào danh sách kiểm điểm cùng mình!`,
        actorBadge: "📢 EM THƯA CÔ!",
        targetBadge: "📒 BỊ KÉO LÊN BẢNG!",
      };
    case "mayor_reveal":
      return {
        tag: `⭐ TIẾT ${dayNum} • LỚP TRƯỞNG LỘ DIỆN`,
        title: `${actorName} Giơ Cao Cờ Đỏ Sao Thi Đua — Nhân Đôi Lá Phiếu Lớp Trưởng (x2)!`,
        narration: `Giữa tiết sinh hoạt sôi nổi, Lớp Trưởng ${actorName} giơ cao Huy Hiệu Sao Thi Đua — mọi lá phiếu biểu quyết từ nay được tính gấp đôi!`,
        actorBadge: "⭐ LỚP TRƯỞNG X2!",
      };
    case "mvp_finale":
      return {
        tag: "🏆 CHƯƠNG CUỐI • TUYÊN DƯƠNG DƯỚI CỜ",
        title: mvpName
          ? `Gương Mặt Xuất Sắc Nhất Tiết Sinh Hoạt: ${mvpName} (${roleLabel})`
          : winTitle || "Khép Lại Tiết Sinh Hoạt Lớp",
        narration: mvpName
          ? `Tiếng trống tan trường vang lên rộn rã, danh hiệu Ngôi Sao Lớp Học thuộc về ${mvpName}. ${mvpDescription}`
          : winSubtitle || "Tiết sinh hoạt lớp đã khép lại trọn vẹn!",
        mvpBadge: "👑 NGÔI SAO LỚP HỌC!",
      };
    default:
      return null;
  }
}

/**
 * Chuyển hóa trọn vẹn 1 nhịp Phim Kể Chuyện (`beat`) sang kịch bản & nhãn 3D nguyên bản
 * của Không Gian tương ứng (`office` / `school`), bảo toàn 100% `classic` gốc!
 */
export function localizeBeatForUniverse(
  beat,
  { universeId = "classic", players = [], awards = [], winner = "village" } = {}
) {
  const uid = sanitizeUniverseId(universeId);
  if (!beat || uid === "classic") return beat;

  const playerById = {};
  players.forEach((p) => {
    if (p?.id) playerById[p.id] = p;
  });
  const nameOf = (id, fallback = "Thành viên") =>
    (id && playerById[id]?.name) || fallback;

  const nextActorStates = {};
  Object.entries(beat.actorStates || {}).forEach(([pid, st]) => {
    nextActorStates[pid] = { ...st };
  });
  const setBadge = (pid, text) => {
    if (pid && nextActorStates[pid] && text) {
      nextActorStates[pid].badgeText = text;
    }
  };

  const cue = beat.vfxCue || null;
  const vfxType = cue?.vfxType || null;
  const dayNum = beat.day || 1;

  // 1. Mở màn
  if (beat.id === "beat_reveal_all" || beat.kind === "reveal") {
    const u = formatUniverseRecapBeat(uid, "opening_reveal", { dayNum });
    return u ? { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates } : beat;
  }

  // 2. Chương cuối MVP
  if (beat.id === "beat_mvp_finale" || beat.kind === "mvp") {
    const mvpAward = awards.find((a) => a.id === "mvp") || awards[0] || null;
    const mvpId = mvpAward?.playerId || beat.lookAtSeatId || null;
    const winCfg = getUniverseRecapWinnerConfig(uid, winner);
    const roleLabel = mvpAward?.role ? getUniverseRoleLabel(mvpAward.role, uid) : "";
    const u = formatUniverseRecapBeat(uid, "mvp_finale", {
      mvpName: mvpAward?.name || "",
      mvpDescription: mvpAward?.description || "",
      roleLabel,
      winTitle: winCfg.title,
      winSubtitle: winCfg.subtitle,
    });
    if (!u) return beat;
    setBadge(mvpId, u.mvpBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  // 3. Các cảnh có vfxCue định danh 1:1
  if (vfxType === "guard_aim") {
    const u = formatUniverseRecapBeat(uid, "guard_pick", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "wolf_aim") {
    const switched = Boolean(cue.prevTargetId && cue.prevTargetId !== cue.targetId);
    const u = formatUniverseRecapBeat(uid, "wolf_aim", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
      prevName: nameOf(cue.prevTargetId),
      switched,
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    if (switched && cue.prevTargetId) setBadge(cue.prevTargetId, u.prevBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "wolf_whisper") {
    const chatText = nextActorStates[cue.sourceId]?.replayChatBubble || "";
    const u = formatUniverseRecapBeat(uid, "wolf_chat", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      chatText,
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    return {
      ...beat,
      tag: u.tag,
      title: u.title,
      narration: u.narration,
      dialogueSpeaker: u.dialogueSpeaker,
      dialogueText: u.dialogueText,
      actorStates: nextActorStates,
    };
  }

  if (vfxType === "wolf_attack") {
    const packIds = Array.isArray(cue.coActorIds) && cue.coActorIds.length > 0
      ? cue.coActorIds
      : cue.sourceId
        ? [cue.sourceId]
        : [];
    const u = formatUniverseRecapBeat(uid, "wolf_strike", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    packIds.forEach((wid) => setBadge(wid, u.actorBadge));
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "guard_block") {
    const u = formatUniverseRecapBeat(uid, "shield_block", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "witch_save") {
    const u = formatUniverseRecapBeat(uid, "witch_save", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "witch_poison") {
    const u = formatUniverseRecapBeat(uid, "witch_poison", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "seer_scan") {
    const u = formatUniverseRecapBeat(uid, "seer_scan", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
      isWolfResult: Boolean(cue.isWolfResult),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "cursed_transform") {
    const u = formatUniverseRecapBeat(uid, "cursed_turn", {
      dayNum,
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "tough_guy_endure") {
    const u = formatUniverseRecapBeat(uid, "tough_endure", {
      dayNum,
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "cupid_link") {
    const u = formatUniverseRecapBeat(uid, "cupid_link", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
      partnerName: nameOf(cue.secondaryTargetId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    if (cue.secondaryTargetId) setBadge(cue.secondaryTargetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "alpha_convert") {
    const u = formatUniverseRecapBeat(uid, "alpha_convert", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "lover_heartbreak") {
    const u = formatUniverseRecapBeat(uid, "lover_heartbreak", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
    });
    if (!u) return beat;
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "hunter_shot") {
    const targetRole = nextActorStates[cue.targetId]?.overrideRole || playerById[cue.targetId]?.role || "villager";
    const u = formatUniverseRecapBeat(uid, "hunter_shot", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
      roleLabel: getUniverseRoleLabel(targetRole, uid),
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "mayor_reveal") {
    const u = formatUniverseRecapBeat(uid, "mayor_reveal", {
      dayNum,
      actorName: nameOf(cue.sourceId || beat.lookAtSeatId),
    });
    if (!u) return beat;
    setBadge(cue.sourceId || beat.lookAtSeatId, u.actorBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "day_point") {
    const switched = Boolean(cue.prevTargetId && cue.prevTargetId !== cue.targetId);
    const isCollectiveVote = beat.cameraShot?.shotType === "high_tribunal";
    const u = formatUniverseRecapBeat(uid, "day_nominate", {
      dayNum,
      actorName: nameOf(cue.sourceId),
      targetName: nameOf(cue.targetId),
      prevName: nameOf(cue.prevTargetId),
      switched,
      isCollectiveVote,
    });
    if (!u) return beat;
    setBadge(cue.sourceId, u.actorBadge);
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (vfxType === "day_tribunal") {
    const isHanged = Boolean(cue.isHanged);
    const defRole = nextActorStates[cue.targetId]?.overrideRole || playerById[cue.targetId]?.role || "villager";
    const isTannerWin = isHanged && defRole === "tanner";
    const u = formatUniverseRecapBeat(uid, "day_verdict", {
      dayNum,
      targetName: nameOf(cue.targetId),
      isHanged,
      isTannerWin,
      roleLabel: getUniverseRoleLabel(defRole, uid),
    });
    if (!u) return beat;
    Object.entries(cue.votesDetail || {}).forEach(([vid, dec]) => {
      if (vid !== cue.targetId) {
        setBadge(vid, dec === "hang" ? u.voteHangBadge : u.voteSpareBadge);
      }
    });
    setBadge(cue.targetId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  // 4. Các cảnh không có vfxCue (night_death, peaceful_dawn, village_chat, day_defense)
  if (beat.kind === "dawn") {
    const badgedDeadIds = Object.keys(nextActorStates).filter((pid) => Boolean(nextActorStates[pid]?.badgeText));
    if (beat.lookAtSeatId || badgedDeadIds.length > 0) {
      const deadList = badgedDeadIds.length > 0 ? badgedDeadIds : [beat.lookAtSeatId];
      const deadNames = deadList.map((pid) => nameOf(pid)).join(", ");
      const u = formatUniverseRecapBeat(uid, "night_death", {
        dayNum,
        targetName: deadNames,
      });
      if (!u) return beat;
      deadList.forEach((pid) => setBadge(pid, u.targetBadge));
      return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
    }
    const u = formatUniverseRecapBeat(uid, "peaceful_dawn", { dayNum });
    return u ? { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates } : beat;
  }

  if (beat.kind === "day" && beat.lookAtSeatId) {
    const st = nextActorStates[beat.lookAtSeatId] || {};
    const roleNow = st.overrideRole || playerById[beat.lookAtSeatId]?.role || "villager";
    const isWolfSpeaker = roleNow === "wolf" || roleNow === "alpha_wolf";
    const u = formatUniverseRecapBeat(uid, "village_chat", {
      dayNum,
      actorName: nameOf(beat.lookAtSeatId),
      chatText: st.replayChatBubble || "",
      isWolfSpeaker,
    });
    if (!u) return beat;
    setBadge(beat.lookAtSeatId, u.actorBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  if (beat.kind === "tribunal" && beat.lookAtSeatId) {
    const u = formatUniverseRecapBeat(uid, "day_defense", {
      dayNum,
      targetName: nameOf(beat.lookAtSeatId),
    });
    if (!u) return beat;
    setBadge(beat.lookAtSeatId, u.targetBadge);
    return { ...beat, tag: u.tag, title: u.title, narration: u.narration, actorStates: nextActorStates };
  }

  return beat;
}

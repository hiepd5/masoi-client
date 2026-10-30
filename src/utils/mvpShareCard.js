// =============================================================================
// BỘ KẾT XUẤT THẺ ẢNH CHIẾN TÍCH MVP 1080x1350 (DARK NORDIC ARCANE SHARE CARD)
// - Vẽ 100% bằng HTML5 Canvas nội bộ (0 KB thư viện ngoài, xuất PNG tức thì ~30ms)
// - Hỗ trợ Web Share API (navigator.share) trên điện thoại + Tải ảnh PNG 1-Click
// - Đóng dấu thương hiệu: "🐺 Ma Sói Online 3D • masoi.hiepd5.com"
// =============================================================================

import { ROLE_LABELS } from "../config/roles.config.js";
import { sanitizeUniverseId, getUniverseRoleLabel } from "../config/universeThemes.config.js";

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const UNIVERSE_SHARE_THEMES = {
  classic: {
    brandHeader: "🌕 MA SÓI ONLINE 3D • NGÔI LÀNG CỔ NGỮ",
    rosterTitle: "📜 SỔ TỬ THẦN — LẬT MỞ THÂN PHẬN:",
    deadEmoji: "💀",
    footerCallout: "🐺 Chơi ngay trên Web & Điện thoại: masoi.hiepd5.com",
    shareTitle: "🐺 Chiến Tích Ma Sói Online 3D",
    shareText: "Vào làng Ma Sói 3D suy luận cùng mình tại https://masoi.hiepd5.com!",
    winners: {
      village: {
        headline: "PHE DÂN LÀNG CHIẾN THẮNG!",
        subline: "Bình minh Bắc Âu xua tan bóng tối bầy Sói",
        accent: "#38bdf8",
        glow: "rgba(56, 189, 248, 0.32)",
      },
      wolves: {
        headline: "BẦY SÓI THỐNG TRỊ ĐÊM TRĂNG!",
        subline: "Tiếng hú Huyết Nguyệt vang vọng khắp rừng thông",
        accent: "#f87171",
        glow: "rgba(239, 68, 68, 0.34)",
      },
      tanner: {
        headline: "KẺ CHÁN ĐỜI ĐỘC BÁ PHÁP TRƯỜNG!",
        subline: "Cú lừa thế kỷ đánh bại cả Dân Làng lẫn Bầy Sói",
        accent: "#fbbf24",
        glow: "rgba(251, 191, 36, 0.34)",
      },
      lovers: {
        headline: "CẶP ĐÔI ĐỊNH MỆNH BẤT TỬ!",
        subline: "Tơ hồng Thần Tình Yêu vượt lên mọi phe phái",
        accent: "#f472b6",
        glow: "rgba(244, 114, 182, 0.34)",
      },
    },
  },
  office: {
    brandHeader: "💼 ĐẠI CHIẾN BẢNG LƯƠNG 3D • PHÒNG HỌP PENTHOUSE",
    rosterTitle: "🪪 HỒ SƠ CHỨC DANH TOÀN PHÒNG HỌP:",
    deadEmoji: "📦",
    footerCallout: "💼 Giải trí công sở trên Web & Điện thoại: masoi.hiepd5.com",
    shareTitle: "💼 Chiến Tích Đại Chiến Bảng Lương 3D",
    shareText: "Vào phòng họp 3D săn Sếp bảo vệ lương thưởng tại https://masoi.hiepd5.com!",
    winners: {
      village: {
        headline: "HỘI NHÂN VIÊN GIỮ TRỌN LƯƠNG THÁNG 13!",
        subline: "Lật tẩy sạch tài khoản ẩn danh của Ban Giám Đốc",
        accent: "#38bdf8",
        glow: "rgba(56, 189, 248, 0.32)",
      },
      wolves: {
        headline: "PHE SẾP VI HÀNH CHỐT CẮT QUỸ THƯỞNG!",
        subline: "Con dấu đỏ KPI thống lĩnh toàn bộ bàn họp",
        accent: "#f59e0b",
        glow: "rgba(245, 158, 11, 0.34)",
      },
      tanner: {
        headline: "THÁNH SĂN ĐỀN BÙ ẴM TRỌN 6 THÁNG LƯƠNG!",
        subline: "Đỉnh cao diễn xuất xách vali bay thẳng đi Phú Quốc",
        accent: "#fbbf24",
        glow: "rgba(251, 191, 36, 0.34)",
      },
      lovers: {
        headline: "LIÊN MINH TRÀ SỮA BẤT BẠI PHÒNG HỌP!",
        subline: "Đôi bạn chung hợp đồng vượt qua mọi đợt rà soát KPI",
        accent: "#f472b6",
        glow: "rgba(244, 114, 182, 0.34)",
      },
    },
  },
  school: {
    brandHeader: "🎒 ĐẠI CHIẾN SỔ ĐẦU BÀI 3D • LỚP HỌC HOÀNG HÔN",
    rosterTitle: "📒 SƠ ĐỒ VAI TRÒ THÀNH VIÊN TRONG LỚP:",
    deadEmoji: "🙇",
    footerCallout: "🎒 Chơi cùng hội bạn trên Web & Điện thoại: masoi.hiepd5.com",
    shareTitle: "🎒 Chiến Tích Đại Chiến Sổ Đầu Bài 3D",
    shareText: "Vào lớp học 3D bảo vệ Cờ Thi Đua cùng tụi mình tại https://masoi.hiepd5.com!",
    winners: {
      village: {
        headline: "HỘI HỌC SINH GIỮ VỮNG CỜ THI ĐUA!",
        subline: "Phát hiện trọn bộ nick ẩn danh của Cô Chủ Nhiệm & Giám Thị",
        accent: "#38bdf8",
        glow: "rgba(56, 189, 248, 0.32)",
      },
      wolves: {
        headline: "TỔ GIÁO VIÊN KHÓA CHẶT SỔ ĐẦU BÀI!",
        subline: "Hội bàn cuối chính thức nhận vé mời phụ huynh cuối tuần",
        accent: "#f43f5e",
        glow: "rgba(244, 63, 94, 0.34)",
      },
      tanner: {
        headline: "THÁNH THÈM CĂNG-TIN CHUỒN TIẾT THÀNH CÔNG!",
        subline: "Màn kịch xuất thần để chạy thẳng xuống uống trà sữa",
        accent: "#fbbf24",
        glow: "rgba(251, 191, 36, 0.34)",
      },
      lovers: {
        headline: "ĐÔI BẠN CÙNG TIẾN CHIẾN THẮNG RỰC RỠ!",
        subline: "Nhắc bài ăn ý vượt qua mọi bài kiểm tra đột xuất",
        accent: "#f472b6",
        glow: "rgba(244, 114, 182, 0.34)",
      },
    },
  },
};

export async function generateMvpShareCardBlob({
  winner = "village",
  universeId = "classic",
  players = [],
  awards = [],
  progression = null,
  xpSummary = null,
  roomCode = "MASOI",
  myPlayerName = "",
} = {}) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = "'Segoe UI', Roboto, system-ui, sans-serif";
  const uid = sanitizeUniverseId(universeId);
  const uPack = UNIVERSE_SHARE_THEMES[uid] || UNIVERSE_SHARE_THEMES.classic;
  const normWinner = winner === "wolf" ? "wolves" : winner;
  const theme = uPack.winners[normWinner] || uPack.winners.village;

  // 1. Nền Chàm Đêm Bắc Âu + Hào Quang Cổ Ngữ
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#050914");
  bg.addColorStop(0.5, "#0b1329");
  bg.addColorStop(1, "#050811");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const halo = ctx.createRadialGradient(W * 0.5, 290, 30, W * 0.5, 290, 520);
  halo.addColorStop(0, theme.glow);
  halo.addColorStop(1, "rgba(5, 9, 20, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, 860);

  // Khung viền Vàng Cổ Ngữ Đôi
  ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 34, 34, W - 68, H - 68, 34);
  ctx.stroke();

  ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 26);
  ctx.stroke();

  // 2. Tiêu đề thương hiệu phía trên
  ctx.textAlign = "center";
  ctx.fillStyle = "#fde68a";
  ctx.font = `800 28px ${font}`;
  ctx.fillText(uPack.brandHeader, W * 0.5, 118);

  ctx.fillStyle = "#94a3b8";
  ctx.font = `600 21px ${font}`;
  ctx.fillText(`Bàn #${roomCode} • ${players.length} Ghế Sân Khấu 3D`, W * 0.5, 156);

  // 3. Đại tự kết quả trận đấu
  ctx.fillStyle = theme.accent;
  ctx.font = `900 46px ${font}`;
  ctx.fillText(theme.headline, W * 0.5, 250);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = `600 25px ${font}`;
  ctx.fillText(theme.subline, W * 0.5, 298);

  // 4. Bảng Vinh Danh Ngôi Sao Ván Đấu (Top 3 Awards)
  const topAwards = Array.isArray(awards) && awards.length > 0
    ? awards.slice(0, 3)
    : players.slice(0, 3).map((p, idx) => ({
        icon: idx === 0 ? "👑" : idx === 1 ? "🔥" : "⭐",
        title: idx === 0 ? "Ngôi Sao Ván Đấu" : "Gương Mặt Nổi Bật",
        playerName: p.name,
        desc: `Vai trò: ${uid === "classic" ? ROLE_LABELS[p.role] || "Dân Làng" : getUniverseRoleLabel(p.role, uid)}`,
      }));

  let curY = 356;
  ctx.textAlign = "left";
  for (const aw of topAwards) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
    drawRoundedRect(ctx, 84, curY, W - 168, 148, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(250, 204, 21, 0.36)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `48px ${font}`;
    ctx.fillText(aw.icon || "🏆", 118, curY + 90);

    ctx.fillStyle = "#fde047";
    ctx.font = `800 27px ${font}`;
    ctx.fillText(`${aw.title || "Vinh Danh"} — ${aw.playerName || "Ẩn danh"}`, 198, curY + 62);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `500 22px ${font}`;
    ctx.fillText(String(aw.desc || "").slice(0, 62), 198, curY + 106);

    curY += 170;
  }

  // 5. Lưới Thân Phận Toàn Bàn (Tối đa 12 ghế tóm tắt)
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  drawRoundedRect(ctx, 84, 885, W - 168, 235, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#c7d2fe";
  ctx.font = `800 23px ${font}`;
  ctx.fillText(uPack.rosterTitle, 114, 930);

  const previewPlayers = players.slice(0, 12);
  previewPlayers.forEach((p, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const px = 114 + col * 292;
    const py = 972 + row * 36;
    const roleLabel =
      uid === "classic"
        ? ROLE_LABELS[p.role] || "Nông Dân"
        : getUniverseRoleLabel(p.role, uid);
    ctx.fillStyle = p.alive ? "#f8fafc" : "#94a3b8";
    ctx.font = `600 19px ${font}`;
    ctx.fillText(
      `${p.alive ? "🟢" : uPack.deadEmoji} ${String(p.name || "").slice(0, 11)} (${roleLabel})`,
      px,
      py
    );
  });

  // 6. Huy hiệu Cấp Độ & Chiến Tích Cá Nhân
  if (progression) {
    ctx.fillStyle = "rgba(30, 41, 59, 0.88)";
    drawRoundedRect(ctx, 84, 1142, W - 168, 92, 20);
    ctx.fill();
    ctx.strokeStyle = progression.rankBorderHex || "#eab308";
    ctx.lineWidth = 2;
    ctx.stroke();

    const heroLabel = myPlayerName ? `${myPlayerName} • ` : "";
    ctx.fillStyle = "#fef08a";
    ctx.font = `800 24px ${font}`;
    ctx.fillText(
      `${progression.rankBadge} ${heroLabel}Lv.${progression.level} ${progression.rankTitle}`,
      116,
      1197
    );

    if (xpSummary?.gainedXp > 0) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#4ade80";
      ctx.font = `800 24px ${font}`;
      const x2Tag = xpSummary.goldenMultiplier > 1 ? " (🌕 X2 GIỜ VÀNG!)" : "";
      ctx.fillText(`+${xpSummary.gainedXp} XP${x2Tag}`, W - 116, 1197);
    }
  }

  // 7. Đóng dấu thương hiệu Viral mời bạn vào chơi ngay
  ctx.textAlign = "center";
  ctx.fillStyle = "#fde047";
  ctx.font = `800 26px ${font}`;
  ctx.fillText(uPack.footerCallout, W * 0.5, 1288);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không thể xuất ảnh PNG."));
      },
      "image/png",
      0.95
    );
  });
}

export async function shareOrDownloadMvpCard(blob, roomCode = "MASOI", universeId = "classic") {
  const uid = sanitizeUniverseId(universeId);
  const uPack = UNIVERSE_SHARE_THEMES[uid] || UNIVERSE_SHARE_THEMES.classic;
  const fileName = `MaSoi3D_MVP_${roomCode}_${Date.now().toString(36).slice(-4)}.png`;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File !== "undefined") {
      const file = new File([blob], fileName, { type: "image/png" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: uPack.shareTitle,
          text: uPack.shareText,
          files: [file],
        });
        return { shared: true, downloaded: false };
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return { shared: false, downloaded: false, cancelled: true };
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { shared: false, downloaded: true };
}

import { useState } from "react";
import {
  normalizeUniverseId,
  getUniverseRoleEmoji,
  getUniverseRoleLabel,
} from "../config/universeThemes.config.js";
import "./DevSandbox.css";

const ROLE_KEYS = [
  null,
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

function getSkillPreviewButtons(uId) {
  if (uId === "office") {
    return [
      { actionType: "wolf_pounce", label: "👔 Mộc KPI" },
      { actionType: "guard_intercept", label: "🛡️ Tường Lửa" },
      { actionType: "witch_elixir_cast", label: "💳 Thưởng Nóng" },
      { actionType: "witch_poison_throw", label: "🪙 Khấu Trừ" },
      { actionType: "seer_divine_cast", label: "💻 Quét IP" },
      { actionType: "hunter_last_shot", label: "✈️ Email CC" },
      { actionType: "cupid_love_arrow", label: "🧋 Ghép Đôi" },
      { actionType: "alpha_blood_convert", label: "👑 Thẻ VIP" },
      { actionType: "mayor_decree_slam", label: "🏅 Cúp x2" },
      { actionType: "cursed_twist_howl", label: "🪪 Lên Sếp" },
      { actionType: "gallows_walk_hang", label: "📦 Thùng Carton" },
      { actionType: "gallows_walk_tanner_win", label: "🏖️ Ăn Đền Bù" },
    ];
  }
  if (uId === "school") {
    return [
      { actionType: "wolf_pounce", label: "👩‍🏫 Gõ Thước" },
      { actionType: "guard_intercept", label: "📚 Đỡ Lời" },
      { actionType: "witch_elixir_cast", label: "🌸 Điểm 10" },
      { actionType: "witch_poison_throw", label: "📒 Ghi Sổ" },
      { actionType: "seer_divine_cast", label: "🔦 Đèn Sao Đỏ" },
      { actionType: "hunter_last_shot", label: "📢 Loa Thưa Cô" },
      { actionType: "cupid_love_arrow", label: "💌 Thư Tay" },
      { actionType: "alpha_blood_convert", label: "🕶️ Băng Đỏ" },
      { actionType: "mayor_decree_slam", label: "⭐ Cờ Đỏ x2" },
      { actionType: "cursed_twist_howl", label: "🎽 Quay Xe" },
      { actionType: "gallows_walk_hang", label: "🙇 Kiểm Điểm" },
      { actionType: "gallows_walk_tanner_win", label: "🧋 Ra Căng-Tin" },
    ];
  }
  return [
    { actionType: "wolf_pounce", label: "🐺 Sói Vồ" },
    { actionType: "guard_intercept", label: "🛡️ Khiên Đỡ" },
    { actionType: "witch_elixir_cast", label: "💚 Tiên Dược" },
    { actionType: "witch_poison_throw", label: "☠️ Ném Độc" },
    { actionType: "seer_divine_cast", label: "🔮 Soi Bài" },
    { actionType: "hunter_last_shot", label: "🏹 Bắn Nỏ" },
    { actionType: "cupid_love_arrow", label: "💘 Tơ Hồng" },
    { actionType: "alpha_blood_convert", label: "🩸 Đồng Hóa" },
    { actionType: "mayor_decree_slam", label: "👑 Trượng x2" },
    { actionType: "cursed_twist_howl", label: "🌑 Hóa Sói" },
    { actionType: "gallows_walk_hang", label: "🪢 Pháp Trường" },
    { actionType: "gallows_walk_tanner_win", label: "💀 Chán Đời" },
  ];
}

function getRecapButtons(uId) {
  if (uId === "office") {
    return [
      { winner: "village", label: "💼 NV Thắng", cls: "dev-btn-success" },
      { winner: "wolf", label: "👔 Sếp Thắng", cls: "dev-btn-danger" },
      { winner: "tanner", label: "🏖️ Đền Bù Thắng", cls: "dev-btn-accent" },
      { winner: "lovers", label: "🧋 Cặp Đôi Thắng", cls: "dev-btn-accent" },
    ];
  }
  if (uId === "school") {
    return [
      { winner: "village", label: "🎒 HS Thắng", cls: "dev-btn-success" },
      { winner: "wolf", label: "👩‍🏫 GV Thắng", cls: "dev-btn-danger" },
      { winner: "tanner", label: "🧋 Căng-Tin Thắng", cls: "dev-btn-accent" },
      { winner: "lovers", label: "💌 Cùng Bàn Thắng", cls: "dev-btn-accent" },
    ];
  }
  return [
    { winner: "village", label: "🏆 Dân Thắng", cls: "dev-btn-success" },
    { winner: "wolf", label: "🐺 Sói Thắng", cls: "dev-btn-danger" },
    { winner: "tanner", label: "💀 Chán Đời Thắng", cls: "dev-btn-accent" },
    { winner: "lovers", label: "💘 Cặp Đôi Thắng", cls: "dev-btn-accent" },
  ];
}

export default function DevSandbox({ socketRef, room }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  if (!import.meta.env.DEV || !room) return null;

  const uId = normalizeUniverseId(room.universeId);
  const botCount = (room.players || []).filter((p) => p.isBot).length;
  const totalCount = (room.players || []).length;
  const isLobby = room.phase === "lobby";
  const isPlaying = room.phase === "playing";
  const isEnded = room.phase === "ended";
  const subPhase = room.game?.nightDayPhase || room.phase;
  const autoBot = room.devSandbox?.autoBot !== false;
  const activeRole = isPlaying ? room.game?.myRole : (room.devSandbox?.forcedRole ?? null);
  const skillButtons = getSkillPreviewButtons(uId);
  const recapButtons = getRecapButtons(uId);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? "" : prev));
    }, 2600);
  }

  function emitDev(event, payload, okMsg) {
    socketRef.current?.emit(event, payload, (res) => {
      if (res?.ok) {
        if (okMsg) notify(typeof okMsg === "function" ? okMsg(res) : okMsg);
      } else if (res?.error) {
        notify(`⚠️ ${res.error}`);
      }
    });
  }

  function triggerLiveSkillPreview(actionType, label) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("ws:dev-preview-choreo", {
        detail: { actionType, durationMs: 3600 },
      })
    );
    notify(`🎬 Đang diễn 3D: ${label}`);
  }

  function openStandaloneChoreoStudio() {
    if (typeof window === "undefined") return;
    window.open(`/?choreo=1&mode=${uId}`, "_blank", "noopener,noreferrer");
  }

  const rootPosClass = isLobby ? "in-room-lobby" : isEnded ? "in-ended" : "in-match";

  if (!open) {
    return (
      <div className={`dev-sandbox-root ${rootPosClass}`}>
        <button
          type="button"
          className="dev-sandbox-pill"
          onClick={() => setOpen(true)}
          title="Mở bảng điều khiển Test nhanh (Chỉ hiện ở Local)"
        >
          <span>🛠️ Dev</span>
          <span className="dev-pill-badge">
            {isLobby ? `${totalCount}/6 (${botCount}🤖)` : isEnded ? "🎬 Recap" : subPhase}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`dev-sandbox-root ${rootPosClass}`}>
      <div className="dev-sandbox-panel">
        <div className="dev-panel-header">
          <div className="dev-panel-title">🛠️ Dev Test Lab V4.6.1</div>
          <div className="dev-header-actions">
            <button
              type="button"
              className={`dev-btn dev-btn-autobot ${autoBot ? "on" : "off"}`}
              onClick={() =>
                emitDev("dev:toggleAutoBot", {}, (r) =>
                  r.autoBot ? "🤖 Đã BẬT Bot tự chạy" : "⏸️ Đã TẮT Bot tự chạy"
                )
              }
              title="Bật/Tắt Bot tự hành động ban đêm"
            >
              {autoBot ? "🤖 Auto: BẬT" : "⏸️ Auto: TẮT"}
            </button>
            <button
              type="button"
              className="dev-btn dev-btn-close"
              onClick={() => setOpen(false)}
              title="Thu gọn"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 0. Chuyển Nóng 3 Không Gian 1-Click */}
        <div className="dev-section">
          <div className="dev-section-label">0. Chuyển Nóng Không Gian (1-Click)</div>
          <div className="dev-universe-grid">
            {[
              { id: "classic", label: "🐺 Ma Sói" },
              { id: "office", label: "💼 Công Sở" },
              { id: "school", label: "🎒 Học Đường" },
            ].map((u) => (
              <button
                key={u.id}
                type="button"
                className={`dev-btn dev-role-chip ${uId === u.id ? "active" : ""}`}
                onClick={() =>
                  emitDev("dev:setUniverse", { universeId: u.id }, `🌐 Đã chuyển sang ${u.label}`)
                }
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1. Test Nhanh Kỹ Năng 3D & Studio Soi Khớp */}
        {!isEnded && (
          <div className="dev-section">
            <div className="dev-section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>1. Diễn Thử Kỹ Năng 3D Tại Bàn</span>
              <button
                type="button"
                className="dev-btn dev-btn-studio-mini"
                onClick={openStandaloneChoreoStudio}
                title="Mở Studio Soi Khớp 0%->100% ở tab mới"
              >
                🎬 Studio /?choreo=1 ↗
              </button>
            </div>
            <div className="dev-roles-grid">
              {skillButtons.map((b) => (
                <button
                  key={b.actionType}
                  type="button"
                  className="dev-btn dev-role-chip"
                  onClick={() => triggerLiveSkillPreview(b.actionType, b.label)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. Test Tức Thì 4 Lời Kết & Phim Điện Ảnh Cuối Trận (< 0.5s) */}
        <div className="dev-section">
          <div className="dev-section-label">
            2. Test Ngay 4 Lời Kết & Phim Recap (&lt; 0.5s)
          </div>
          <div className="dev-recap-grid">
            {recapButtons.map((rb) => (
              <button
                key={rb.winner}
                type="button"
                className={`dev-btn ${rb.cls} dev-recap-chip`}
                onClick={() =>
                  emitDev(
                    "dev:simulateRecap",
                    { winner: rb.winner },
                    `🎬 Đã mở phim kết thúc: ${rb.label}`
                  )
                }
              >
                {rb.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Quản lý Bot ở Lobby */}
        {isLobby && (
          <div className="dev-section">
            <div className="dev-section-label">
              3. Bot Lấp Phòng ({totalCount} ghế • {botCount} Bot)
            </div>
            <div className="dev-row">
              <button
                type="button"
                className="dev-btn dev-btn-accent"
                disabled={totalCount >= 6}
                onClick={() =>
                  emitDev("dev:addBots", { fillToMin: true }, (r) => `✅ Đã bơm đủ ${r.total} ghế!`)
                }
              >
                ⚡ Đủ 6 Ghế
              </button>
              <button
                type="button"
                className="dev-btn"
                disabled={totalCount >= 18}
                onClick={() => emitDev("dev:addBots", { count: 1 }, "➕ Đã thêm 1 Bot")}
              >
                +1 Bot
              </button>
              <button
                type="button"
                className="dev-btn"
                disabled={totalCount >= 18}
                onClick={() => emitDev("dev:addBots", { count: 3 }, "➕ Đã thêm 3 Bot")}
              >
                +3 Bot
              </button>
              <button
                type="button"
                className="dev-btn dev-btn-danger"
                disabled={botCount === 0}
                onClick={() => emitDev("dev:clearBots", {}, "🗑️ Đã xóa hết Bot")}
              >
                Xóa Bot
              </button>
            </div>
          </div>
        )}

        {/* 4. Ép vai theo đúng tên Không Gian */}
        {!isEnded && (
          <div className="dev-section">
            <div className="dev-section-label">
              {isPlaying ? "3. Đổi Nóng Vai Trong Trận" : "4. Ép Vai Cho Tôi Khi Vào Trận"}
            </div>
            <div className="dev-roles-grid">
              {ROLE_KEYS.map((roleKey) => {
                const isSelected = activeRole === roleKey;
                const label = roleKey
                  ? `${getUniverseRoleEmoji(roleKey, uId)} ${getUniverseRoleLabel(roleKey, uId)}`
                  : "🎲 Ngẫu nhiên";
                return (
                  <button
                    key={roleKey || "random"}
                    type="button"
                    className={`dev-btn dev-role-chip ${isSelected ? "active" : ""}`}
                    disabled={isPlaying && roleKey === null}
                    title={label}
                    onClick={() =>
                      emitDev(
                        "dev:forceRole",
                        { role: roleKey },
                        roleKey ? `🎭 Đã khóa vai: ${label}` : "🎲 Đã về chia vai ngẫu nhiên"
                      )
                    }
                  >
                    <span className="dev-chip-truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Điều khiển Tua Phase & Bot Vote khi đang trong trận */}
        {isPlaying && (
          <div className="dev-section">
            <div className="dev-section-label">
              4. Điều Khiển Ván Đấu ({subPhase})
            </div>
            <button
              type="button"
              className="dev-btn dev-btn-skip"
              onClick={() =>
                emitDev("dev:skipPhase", {}, (r) => `⏩ Đã tua: ${r.fromPhase} → ${r.toPhase}`)
              }
            >
              ⏩ Tua Qua Phase Hiện Tại
            </button>

            {subPhase === "day_discuss" && (
              <div className="dev-row">
                <button
                  type="button"
                  className="dev-btn dev-btn-accent"
                  onClick={() => emitDev("dev:botVote", { action: "skip_discuss" }, "⏭️ Toàn bộ Bot đã đồng ý Skip")}
                >
                  ⏭️ Bot Đồng Ý Bỏ Qua Thảo Luận
                </button>
              </div>
            )}

            {subPhase === "day_nominate" && (
              <div className="dev-row">
                <button
                  type="button"
                  className="dev-btn dev-btn-accent"
                  onClick={() => emitDev("dev:botVote", { action: "nominate_me" }, "🎯 Đàn Bot đã đề cử bạn!")}
                >
                  🎯 Bot Đề Cử Tôi
                </button>
                <button
                  type="button"
                  className="dev-btn dev-btn-danger"
                  onClick={() =>
                    emitDev("dev:botVote", { action: "nominate_wolf" }, (r) => `🎯 Bot đã đề cử ${r.targetName}!`)
                  }
                >
                  {uId === "office"
                    ? "👔 Bot Đề Cử Sếp"
                    : uId === "school"
                      ? "👩‍🏫 Bot Đề Cử GV"
                      : "🐺 Bot Đề Cử Sói"}
                </button>
              </div>
            )}

            {subPhase === "day_final_vote" && (
              <div className="dev-row">
                <button
                  type="button"
                  className="dev-btn dev-btn-danger"
                  onClick={() => emitDev("dev:botVote", { action: "vote_hang" }, "🟥 Toàn bộ Bot đã chốt Mời Ra!")}
                >
                  {uId === "classic" ? "🪢 Bot Vote Treo Cổ" : "🟥 Bot Vote Mời Ra"}
                </button>
                <button
                  type="button"
                  className="dev-btn dev-btn-success"
                  onClick={() => emitDev("dev:botVote", { action: "vote_spare" }, "🟩 Toàn bộ Bot đã chọn Giữ Lại!")}
                >
                  {uId === "classic" ? "🕊️ Bot Vote Tha" : "🟩 Bot Vote Giữ Lại"}
                </button>
              </div>
            )}
          </div>
        )}

        {toast && <div className="dev-toast">{toast}</div>}
      </div>
    </div>
  );
}

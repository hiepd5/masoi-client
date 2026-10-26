import { useState } from "react";
import "./DevSandbox.css";

const ROLE_OPTIONS = [
  { id: null,         label: "🎲 Ngẫu nhiên" },
  { id: "wolf",       label: "🐺 Sói" },
  { id: "alpha_wolf", label: "🐺👑 Sói Đầu Đàn" },
  { id: "guard",      label: "🛡️ Bảo Vệ" },
  { id: "witch",      label: "🧪 Phù Thủy" },
  { id: "seer",       label: "🔮 Tiên Tri" },
  { id: "hunter",     label: "🏹 Thợ Săn" },
  { id: "cupid",      label: "💘 Tình Yêu" },
  { id: "mayor",      label: "👑 Trưởng Làng" },
  { id: "tough_guy",  label: "💪 Cứng Cỏi" },
  { id: "cursed",     label: "🩸 Bị Nguyền" },
  { id: "tanner",     label: "💀 Chán Đời" },
  { id: "villager",   label: "👨‍🌾 Nông Dân" },
];

export default function DevSandbox({ socketRef, room }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  if (!import.meta.env.DEV || !room) return null;

  const botCount = (room.players || []).filter((p) => p.isBot).length;
  const totalCount = (room.players || []).length;
  const isLobby = room.phase === "lobby";
  const isPlaying = room.phase === "playing";
  const subPhase = room.game?.nightDayPhase || room.phase;
  const autoBot = room.devSandbox?.autoBot !== false;
  const activeRole = isPlaying ? room.game?.myRole : (room.devSandbox?.forcedRole ?? null);

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

  if (!open) {
    return (
      <div className="dev-sandbox-root">
        <button
          type="button"
          className="dev-sandbox-pill"
          onClick={() => setOpen(true)}
          title="Mở bảng điều khiển Test nhanh (Chỉ hiện ở Local)"
        >
          <span>🛠️ Dev</span>
          <span className="dev-pill-badge">
            {isLobby ? `${totalCount}/6 (${botCount}🤖)` : subPhase}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="dev-sandbox-root">
      <div className="dev-sandbox-panel">
        <div className="dev-panel-header">
          <div className="dev-panel-title">🛠️ Dev Sandbox (Local)</div>
          <div className="dev-header-actions">
            <button
              type="button"
              className={`dev-btn dev-btn-autobot ${autoBot ? "on" : "off"}`}
              onClick={() =>
                emitDev("dev:toggleAutoBot", {}, (r) =>
                  r.autoBot ? "🤖 Đã BẬT Bot tự chạy đêm" : "⏸️ Đã TẮT Bot tự chạy đêm"
                )
              }
              title="Bật để Bot tự cắn/gác/soi và tự lướt nhanh qua lượt đêm của Bot"
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

        {/* Quản lý Bot ở Lobby */}
        <div className="dev-section">
          <div className="dev-section-label">
            1. Bot Lấp Phòng ({totalCount} người • {botCount} Bot)
          </div>
          <div className="dev-row">
            <button
              type="button"
              className="dev-btn dev-btn-accent"
              disabled={!isLobby || totalCount >= 6}
              onClick={() =>
                emitDev("dev:addBots", { fillToMin: true }, (r) => `✅ Đã bơm đủ ${r.total} người!`)
              }
            >
              ⚡ Đủ 6 Người
            </button>
            <button
              type="button"
              className="dev-btn"
              disabled={!isLobby || totalCount >= 18}
              onClick={() => emitDev("dev:addBots", { count: 1 }, "➕ Đã thêm 1 Bot")}
            >
              +1 Bot
            </button>
            <button
              type="button"
              className="dev-btn"
              disabled={!isLobby || totalCount >= 18}
              onClick={() => emitDev("dev:addBots", { count: 3 }, "➕ Đã thêm 3 Bot")}
            >
              +3 Bot
            </button>
            <button
              type="button"
              className="dev-btn dev-btn-danger"
              disabled={!isLobby || botCount === 0}
              onClick={() => emitDev("dev:clearBots", {}, "🗑️ Đã xóa hết Bot")}
            >
              Xóa Bot
            </button>
          </div>
        </div>

        {/* Ép vai */}
        <div className="dev-section">
          <div className="dev-section-label">
            2. {isPlaying ? "Đổi Nóng Vai Ngay Trong Trận" : "Ép Vai Cho Tôi Khi Vào Trận"}
          </div>
          <div className="dev-roles-grid">
            {ROLE_OPTIONS.map((r) => {
              const isSelected = activeRole === r.id;
              return (
                <button
                  key={r.id || "random"}
                  type="button"
                  className={`dev-btn dev-role-chip ${isSelected ? "active" : ""}`}
                  disabled={isPlaying && r.id === null}
                  onClick={() =>
                    emitDev(
                      "dev:forceRole",
                      { role: r.id },
                      r.id ? `🎭 Đã khóa vai: ${r.label}` : "🎲 Đã về chia vai ngẫu nhiên"
                    )
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Điều khiển Tua Phase & Bot Vote khi đang trong trận */}
        {isPlaying && (
          <div className="dev-section">
            <div className="dev-section-label">
              3. Điều Khiển Ván Đấu ({subPhase})
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
                  onClick={() => emitDev("dev:botVote", { action: "nominate_me" }, "🎯 Đàn Bot đã đề cử bạn lên Ghế Nóng!")}
                >
                  🎯 Bot Đề Cử Tôi
                </button>
                <button
                  type="button"
                  className="dev-btn dev-btn-danger"
                  onClick={() =>
                    emitDev("dev:botVote", { action: "nominate_wolf" }, (r) => `🐺 Bot đã đề cử ${r.targetName}!`)
                  }
                >
                  🐺 Bot Đề Cử Sói
                </button>
              </div>
            )}

            {subPhase === "day_final_vote" && (
              <div className="dev-row">
                <button
                  type="button"
                  className="dev-btn dev-btn-danger"
                  onClick={() => emitDev("dev:botVote", { action: "vote_hang" }, "🪢 Toàn bộ Bot đã chọn TREO CỔ!")}
                >
                  🪢 Bot Vote Treo Cổ
                </button>
                <button
                  type="button"
                  className="dev-btn dev-btn-success"
                  onClick={() => emitDev("dev:botVote", { action: "vote_spare" }, "🕊️ Toàn bộ Bot đã chọn THA!")}
                >
                  🕊️ Bot Vote Tha
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

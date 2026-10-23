import { useState } from "react";

const EMOJIS = ["😱", "🤔", "🐺", "👍", "❓", "😂"];

/**
 * Nút thả cảm xúc thu gọn ở góc dưới bên phải sân khấu (38x38px):
 * Không chiếm chiều cao khung hình; bấm vào mới bung khay 6 Emoji và tự đóng sau khi chọn.
 */
export default function EmojiReactions({ socketRef, myName }) {
  const [open, setOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  function sendReaction(emoji) {
    if (cooldown) return;
    socketRef.current?.emit("reaction", { emoji, name: myName });
    setCooldown(true);
    setOpen(false);
    setTimeout(() => setCooldown(false), 3000);
  }

  return (
    <div className="emoji-fab-wrap">
      {open && (
        <div className="emoji-popover-tray">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`emoji-btn-mini ${cooldown ? "cooldown" : ""}`}
              onClick={() => sendReaction(e)}
              title={cooldown ? "Chờ 3 giây..." : `Thả ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`emoji-fab-trigger ${open ? "active" : ""} ${cooldown ? "cooldown" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={cooldown ? "Đang hồi cảm xúc (3s)..." : "Thả biểu cảm nhanh"}
      >
        {cooldown ? "⏳" : "😊"}
      </button>
    </div>
  );
}

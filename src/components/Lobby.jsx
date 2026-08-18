import { useState } from "react";

const RANDOM_NAMES = [
  "Rồng Lửa", "Bóng Đêm", "Sói Xám", "Ánh Sao", "Hổ Phách",
  "Mây Trắng", "Cáo Vàng", "Bão Tố", "Ngọc Bích", "Sấm Sét",
];

function suggestName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

export default function Lobby({ socketRef, onJoined }) {
  const [name, setName] = useState(() => sessionStorage.getItem("ws_name") || "");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function persistName(n) {
    sessionStorage.setItem("ws_name", n);
  }

  function handleCreateRoom() {
    setError("");
    const finalName = name.trim() || suggestName();
    setLoading(true);
    persistName(finalName);
    socketRef.current.emit("room:create", {}, (res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error || "Không thể tạo phòng.");
        return;
      }
      socketRef.current.emit("room:rename", { newName: finalName }, () => {
        onJoined(res.roomCode);
      });
    });
  }

  function handleJoinRoom() {
    setError("");
    if (!roomCode.trim()) {
      setError("Vui lòng nhập mã phòng.");
      return;
    }
    const finalName = name.trim() || suggestName();
    setLoading(true);
    persistName(finalName);
    socketRef.current.emit(
      "room:join",
      { roomCode: roomCode.trim().toUpperCase(), name: finalName },
      (res) => {
        setLoading(false);
        if (!res.ok) {
          setError(res.error || "Không thể vào phòng.");
          return;
        }
        onJoined(res.roomCode);
      }
    );
  }

  return (
    <div className="card">
      <h1>🐺 Ma Sói Online</h1>
      <p className="subtitle">Chơi cùng bạn bè từ xa</p>

      <label>Tên của bạn</label>
      <input
        type="text"
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nhập tên bạn muốn hiển thị..."
        autoFocus
      />

      {error && <div className="error">{error}</div>}

      <button className="btn-primary" onClick={handleCreateRoom} disabled={loading}>
        Tạo phòng mới
      </button>

      <div className="divider">— hoặc —</div>

      <label>Mã phòng</label>
      <input
        value={roomCode}
        maxLength={5}
        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        placeholder="VD: A3F9K"
      />
      <button className="btn-secondary" onClick={handleJoinRoom} disabled={loading}>
        Vào phòng
      </button>
    </div>
  );
}


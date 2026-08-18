import { useState } from "react";

const TEAM_NAMES = [
  "Tiểu Hiệp",
  "Long Hải",
  "Thanh huyền",
  "Kim Cúc",
  "Thanh Hiếu",
  "An Đì",
  "Yến",
  "Bích",
  "Nam",
  "Hưng Nghẹo",
];

function suggestDefaultName() {
  return TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)];
}

export default function Lobby({ socketRef, onJoined }) {
  const [name, setName] = useState(() => sessionStorage.getItem("ws_name") || suggestDefaultName());
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function persistName(n) {
    sessionStorage.setItem("ws_name", n);
  }

  function handleCreateRoom() {
    setError("");
    setLoading(true);
    persistName(name);
    socketRef.current.emit("room:create", {}, (res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error || "Không thể tạo phòng.");
        return;
      }
      // Đổi tên ngay sau khi tạo, vì room:create chưa nhận tên tuỳ chỉnh
      socketRef.current.emit("room:rename", { newName: name }, () => {
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
    setLoading(true);
    persistName(name);
    socketRef.current.emit(
      "room:join",
      { roomCode: roomCode.trim().toUpperCase(), name },
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
      <select
        value={name}
        onChange={(e) => setName(e.target.value)}
      >
        {TEAM_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

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

import { useState } from "react";
import { saveSession } from "../hooks/useSocket.js";

const RANDOM_NAMES = [
  "Rồng Lửa", "Bóng Đêm", "Sói Xám", "Ánh Sao", "Hổ Phách",
  "Mây Trắng", "Cáo Vàng", "Bão Tố", "Ngọc Bích", "Sấm Sét",
];

const AVATAR_SEEDS = [
  'wolf','fox','bear','dragon','witch','guard','seer','farmer',
  'ninja','ghost','knight','wizard','hunter','monk','sage',
  'rogue','bard','paladin','ranger','druid'
];

function suggestName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

export default function Lobby({ socketRef, onJoined }) {
  const [name, setName] = useState(() => sessionStorage.getItem("ws_name") || "");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(
    () => sessionStorage.getItem('ws_avatar') || AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)]
  );

  function persistName(n) {
    sessionStorage.setItem("ws_name", n);
  }

  function persistAvatar(seed) {
    sessionStorage.setItem('ws_avatar', seed);
    setSelectedAvatar(seed);
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
      socketRef.current.emit("room:rename", { newName: finalName, avatarSeed: selectedAvatar }, (renameRes) => {
        if (res.playerId) {
          sessionStorage.setItem("ws_playerId", res.playerId);
          saveSession(res.roomCode, res.sessionToken || '', res.playerId, finalName);
        }
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
      { roomCode: roomCode.trim().toUpperCase(), name: finalName, avatarSeed: selectedAvatar },
      (res) => {
        setLoading(false);
        if (!res.ok) {
          setError(res.error || "Không thể vào phòng.");
          return;
        }
        if (res.playerId) {
          sessionStorage.setItem("ws_playerId", res.playerId);
          saveSession(res.roomCode, res.sessionToken || '', res.playerId, finalName);
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

      {/* Avatar Picker */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Chọn avatar:</p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
          maxHeight: 180,
          overflowY: 'auto',
          padding: 4,
        }}>
          {AVATAR_SEEDS.map(seed => (
            <img
              key={seed}
              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
              alt={seed}
              onClick={() => persistAvatar(seed)}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 12,
                cursor: 'pointer',
                border: selectedAvatar === seed ? '2px solid #f59e0b' : '2px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.08)',
                transition: 'all 0.15s',
                transform: selectedAvatar === seed ? 'scale(1.1)' : 'scale(1)',
                boxShadow: selectedAvatar === seed ? '0 0 12px rgba(245,158,11,0.6)' : 'none',
              }}
            />
          ))}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
          Avatar đang chọn: {selectedAvatar}
        </p>
      </div>

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

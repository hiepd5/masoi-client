import { useEffect, useState } from "react";
import PlayingView from "./PlayingView.jsx";

export default function Room({ socketRef, roomCode, roomData, onLeave }) {
  const room = roomData;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [mcLog, setMcLog] = useState([]);
  const myId = sessionStorage.getItem("ws_playerId") || socketRef.current?.id;

  useEffect(() => {
    const socket = socketRef.current;
    
    socket.on("mc:message", (msg) => {
      let type = "mc";
      if (msg.includes("không qua khỏi") || msg.includes("bị treo cổ") || msg.includes("chết")) type = "death";
      else if (msg.includes("không ai chết") || msg.includes("được tha")) type = "save";
      
      setMcLog(prev => [...prev, { text: msg, type }]);
    });

    socket.on("village:chat", ({ senderName, message }) => {
      setMcLog(prev => [...prev, { text: `${senderName}: ${message}`, type: "player" }]);
    });

    return () => {
      socket.off("mc:message");
      socket.off("village:chat");
    };
  }, [socketRef]);

  function copyRoomCode() {
    navigator.clipboard?.writeText(roomCode);
  }

  function handleLeave() {
    socketRef.current.emit("room:leave");
    onLeave();
  }

  function handleRename() {
    setError("");
    socketRef.current.emit("room:rename", { newName: nameInput }, (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditingName(false);
    });
  }

  function handleStartGame() {
    setError("");
    socketRef.current.emit("game:start", {}, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Không thể bắt đầu game.");
      }
    });
  }

  if (!room) {
    return (
      <div className="card">
        <p className="status-text">Đang tải phòng...</p>
      </div>
    );
  }

  const me = room.players.find((p) => p.id === myId);

  if (room.phase === "playing" || room.phase === "ended") {
    return (
      <PlayingView 
        room={room} 
        socketRef={socketRef} 
        mcLog={mcLog} 
      />
    );
  }

  return (
    <div className="card">
      <h1>Phòng chờ</h1>
      <div className="room-code" onClick={copyRoomCode} title="Bấm để copy">
        {room.code}
      </div>
      <p className="status-text" style={{ marginTop: -12, marginBottom: 20 }}>
        Chia sẻ mã này cho bạn bè ({room.players.length}/18 người)
      </p>

      <div className="player-list">
        {room.players.map((p) => (
          <div className="player-row" key={p.id}>
            <img src={p.avatar} alt={p.name} />
            <span className="player-name">{p.name}</span>
            {p.isHost && <span className="host-tag">Chủ phòng</span>}
            {p.id === myId && <span className="you-tag">Bạn</span>}
          </div>
        ))}
      </div>

      {!editingName ? (
        <button
          className="btn-secondary"
          onClick={() => {
            setNameInput(me?.name || "");
            setEditingName(true);
          }}
        >
          Đổi tên hiển thị
        </button>
      ) : (
        <>
          <input
            value={nameInput}
            maxLength={20}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Tên mới"
          />
          {error && <div className="error">{error}</div>}
          <button className="btn-primary" onClick={handleRename}>
            Lưu tên
          </button>
          <button className="btn-secondary" onClick={() => setEditingName(false)}>
            Huỷ
          </button>
        </>
      )}

      {me?.isHost && (
        <button
          className="btn-primary"
          onClick={handleStartGame}
          disabled={room.players.length < 6}
          title={room.players.length < 6 ? "Cần tối thiểu 6 người để bắt đầu" : ""}
        >
          Bắt đầu game {room.players.length < 6 ? `(cần ≥6 người)` : ""}
        </button>
      )}

      {error && <div className="error">{error}</div>}

      <button className="btn-secondary" onClick={handleLeave}>
        Rời phòng
      </button>
    </div>
  );
}

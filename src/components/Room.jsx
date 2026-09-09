import { useEffect, useRef, useState } from "react";
import PlayingView from "./PlayingView.jsx";

export default function Room({ socketRef, roomCode, roomData, onLeave }) {
  const room = roomData;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [mcLog, setMcLog] = useState([]);
  const [mcVoiceEnabled, setMcVoiceEnabled] = useState(true);
  const lastSpokenRef = useRef(-1);
  const myId = sessionStorage.getItem("ws_playerId") || socketRef.current?.id;

  useEffect(() => {
    const socket = socketRef.current;
    
    // Chỉ MC messages vào mcLog — village:chat được xử lý trong PlayingView
    socket.on("mc:message", (msg) => {
      let type = "mc";
      if (msg.includes("không qua khỏi") || msg.includes("bị treo cổ") || msg.includes("chết")) type = "death";
      else if (msg.includes("không ai chết") || msg.includes("được tha")) type = "save";
      setMcLog(prev => [...prev, { text: msg, type }]);
    });

    return () => {
      socket.off("mc:message");
    };
  }, [socketRef]);

  // Speak MC messages via TTS (giọng nữ tiếng Việt)
  useEffect(() => {
    if (!mcVoiceEnabled) return;
    if (mcLog.length === 0) return;
    const newMessages = mcLog.slice(lastSpokenRef.current + 1).filter(m => m.type !== 'player');
    if (newMessages.length === 0) { lastSpokenRef.current = mcLog.length - 1; return; }

    function speakAll() {
      const voices = window.speechSynthesis.getVoices();
      const viVoices = voices.filter(v => v.lang.startsWith('vi'));
      // Ưu tiên giọng nữ: tìm theo tên hoặc lấy voice thứ hai nếu có
      const femaleVoice = viVoices.find(v =>
        v.name.toLowerCase().includes('female') ||
        v.name.includes('Thu') ||
        v.name.includes('Hoa') ||
        v.name.toLowerCase().includes('google vi') ||
        v.name.toLowerCase().includes('nam linh')
      ) || viVoices[viVoices.length > 1 ? 1 : 0]; // fallback: voice cuối thường là nữ

      newMessages.forEach((msg, i) => {
        setTimeout(() => {
          if (!window.speechSynthesis) return;
          window.speechSynthesis.cancel(); // hủy bất kỳ lời nói đang chạy
          const utter = new SpeechSynthesisUtterance(msg.text || msg);
          utter.lang = 'vi-VN';
          utter.rate = 0.85;
          utter.pitch = 1.3;  // pitch cao hơn = nghe nữ hơn
          utter.volume = 0.85;
          if (femaleVoice) utter.voice = femaleVoice;
          window.speechSynthesis.speak(utter);
        }, i * 800);
      });
    }

    // voices có thể chưa load xong → chờ
    if (window.speechSynthesis.getVoices().length > 0) {
      speakAll();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', speakAll, { once: true });
    }

    lastSpokenRef.current = mcLog.length - 1;
  }, [mcLog, mcVoiceEnabled]);

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
        mcVoiceEnabled={mcVoiceEnabled}
        setMcVoiceEnabled={setMcVoiceEnabled}
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

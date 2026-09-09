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

    function pickBestViVoice(voices) {
      const vi = voices.filter(v => v.lang === 'vi-VN' || v.lang === 'vi');
      // Danh sách ưu tiên: Microsoft Neural (Edge/Chrome Windows) > Google > bất kỳ
      const preferred = [
        'Microsoft HoaiMy Online (Natural)',   // Edge female neural — tốt nhất
        'Microsoft NamMinh Online (Natural)',   // Edge male neural
        'Microsoft HoaiMy',
        'Microsoft NamMinh',
        'Google Tiếng Việt',
        'Google Vietnamese',
        'Google vi',
      ];
      for (const name of preferred) {
        const found = vi.find(v => v.name.includes(name));
        if (found) return found;
      }
      // Fallback: lấy voice có "online" trong tên (thường là neural)
      const online = vi.find(v => v.name.toLowerCase().includes('online'));
      if (online) return online;
      // Cuối cùng: lấy voice đầu tiên của tiếng Việt
      return vi[0] || null;
    }

    function speakAll() {
      const voices = window.speechSynthesis.getVoices();
      const bestVoice = pickBestViVoice(voices);

      // Đọc từng tin nhắn — không cancel giữa chừng, dùng queue
      window.speechSynthesis.cancel();
      newMessages.forEach((msg, i) => {
        const utter = new SpeechSynthesisUtterance(msg.text || msg);
        utter.lang = 'vi-VN';
        utter.rate = 0.82;   // chậm hơn một chút, kịch tính hơn
        utter.pitch = 0.95;  // pitch tự nhiên, không cần cao giả nữ
        utter.volume = 0.9;
        if (bestVoice) utter.voice = bestVoice;
        // Thêm delay nhỏ giữa các tin nhắn bằng cách dùng onend
        if (i === 0) {
          window.speechSynthesis.speak(utter);
        } else {
          const prev = new SpeechSynthesisUtterance(' ');
          prev.lang = 'vi-VN';
          prev.volume = 0;
          window.speechSynthesis.speak(prev);
          window.speechSynthesis.speak(utter);
        }
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

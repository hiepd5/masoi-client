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

  // ============ AUDIO: MiniMax MP3 + TTS fallback ============
  const currentAudioRef = useRef(null);

  // Map câu MC tĩnh → file MP3 đã thu âm
  const AUDIO_MAP = [
    { pattern: /Đêm đầu tiên buông xuống/,     file: 'game_start.mp3' },
    { pattern: /Bảo Vệ đã ngủ lại.*Sói ơi/,   file: 'wolf_wake.mp3' },
    { pattern: /Sói đã ngủ lại.*Phù Thủy/,     file: 'witch_wake.mp3' },
    { pattern: /Phù Thủy đã ngủ lại.*Tiên Tri/,file: 'seer_wake.mp3' },
    { pattern: /Đêm qua không ai chết/,         file: 'no_death.mp3' },
    { pattern: /Mời cả làng đề cử/,             file: 'begin_nominate.mp3' },
    { pattern: /Không ai bị đề cử/,             file: 'no_nominee.mp3' },
    { pattern: /Treo cổ hay Tha/,               file: 'begin_vote.mp3' },
    { pattern: /Bảo Vệ ơi.*thức dậy/,          file: 'night_starts.mp3' },
    { pattern: /Phe Sói chiến thắng/,           file: 'wolf_wins.mp3' },
    { pattern: /Phe Dân chiến thắng/,           file: 'village_wins.mp3' },
    { pattern: /Chán Đời.*thắng/,               file: 'tanner_wins.mp3' },
    { pattern: /Cả làng thảo luận/,             file: 'begin_discuss.mp3' },
  ];

  function findAudioFile(text) {
    for (const { pattern, file } of AUDIO_MAP) {
      if (pattern.test(text)) return `/audio/${file}`;
    }
    return null; // câu động (có tên người chơi) → dùng TTS
  }

  function playMp3(src) {
    return new Promise((resolve) => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      const audio = new Audio(src);
      audio.volume = 0.92;
      currentAudioRef.current = audio;
      audio.onended = resolve;
      audio.onerror = resolve; // file lỗi → tiếp tục không crash
      audio.play().catch(resolve);
    });
  }

  function speakTTS(text, voice) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'vi-VN';
      utter.rate = 0.82;
      utter.pitch = 0.95;
      utter.volume = 0.9;
      if (voice) utter.voice = voice;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  }

  function pickBestViVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    const vi = voices.filter(v => v.lang === 'vi-VN' || v.lang === 'vi');
    const preferred = [
      'Microsoft HoaiMy Online (Natural)',
      'Microsoft NamMinh Online (Natural)',
      'Microsoft HoaiMy', 'Microsoft NamMinh',
      'Google Tiếng Việt', 'Google Vietnamese',
    ];
    for (const name of preferred) {
      const found = vi.find(v => v.name.includes(name));
      if (found) return found;
    }
    return vi.find(v => v.name.toLowerCase().includes('online')) || vi[0] || null;
  }

  useEffect(() => {
    if (!mcVoiceEnabled) return;
    if (mcLog.length === 0) return;
    const newMessages = mcLog.slice(lastSpokenRef.current + 1).filter(m => m.type !== 'player');
    if (newMessages.length === 0) { lastSpokenRef.current = mcLog.length - 1; return; }

    async function playAll() {
      const voice = pickBestViVoice();
      for (const msg of newMessages) {
        const text = msg.text || msg;
        const audioSrc = findAudioFile(text);
        if (audioSrc) {
          await playMp3(audioSrc);        // ✅ File MP3 MiniMax
        } else {
          await speakTTS(text, voice);    // 🔄 TTS cho câu động (tên người)
        }
      }
    }

    // Khởi chạy (đợi voices load nếu cần)
    if (!window.speechSynthesis || window.speechSynthesis.getVoices().length > 0) {
      playAll();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', playAll, { once: true });
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
            
            {me?.isHost && p.id !== myId && (
              <button
                className="btn-kick"
                onClick={() => {
                  if (window.confirm(`Kick ${p.name} khỏi phòng?`)) {
                    socketRef.current.emit('room:kick', { targetId: p.id }, (res) => {
                      if (res && !res.ok) alert(res.error || 'Không kick được.');
                    });
                  }
                }}
                style={{
                  marginLeft: 'auto',
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#fca5a5',
                  borderRadius: 6,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Kick ✕
              </button>
            )}
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

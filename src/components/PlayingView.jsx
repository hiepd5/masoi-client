import { useState, useEffect, useRef } from "react";
import PlayerCircle from "./PlayerCircle.jsx";
import EndGameRecap from "./EndGameRecap.jsx";
import VoiceRoom from "./VoiceRoom.jsx";
import FullscreenButton from "./FullscreenButton.jsx";
import ParticleBackground from "./ParticleBackground.jsx";
import AmbientSound from "./AmbientSound.jsx";
import { SFX } from "./SFX.js";
import EmojiReactions from "./EmojiReactions.jsx";

const ROLE_LABELS = {
  wolf: "Sói",
  seer: "Tiên Tri",
  guard: "Bảo Vệ",
  witch: "Phù Thủy",
  tanner: "Chán Đời",
  villager: "Nông Dân",
};

const ROLE_EMOJIS = { wolf: '🐺', seer: '🔮', guard: '🛡️', witch: '🧪', tanner: '💀', villager: '👨🌾' };

const ROLE_DESCRIPTIONS = {
  wolf: 'Mỗi đêm, hãy bí mật chọn 1 người dân để tiêu diệt. Che giấu danh tính của bạn!',
  seer: 'Mỗi đêm, bạn có thể kiểm tra bí mật 1 người xem họ có phải Sói không.',
  guard: 'Mỗi đêm, bảo vệ 1 người khỏi bị Sói tấn công. Không tự bảo vệ bản thân.',
  witch: 'Bạn có 1 lọ cứu và 1 lọ độc. Dùng chúng vào thời điểm thích hợp.',
  tanner: 'Bạn muốn bị treo cổ! Thắng nếu làng treo cổ bạn.',
  villager: 'Quan sát, suy luận và thuyết phục mọi người tìm ra Sói!',
};

const PHASE_LABELS = {
  night_guard: '🌙 Bảo Vệ Thức Dậy',
  night_wolf: '🌙 Đêm Sói Săn Mồi',
  night_witch: '🌙 Phù Thủy Hành Động',
  night_seer: '🌙 Tiên Tri Nhìn Xa',
  day_reveal: '☀️ Bình Minh',
  day_discuss: '☀️ Thảo Luận',
  day_nominate: '🗳️ Đề Cử',
  day_defense: '⚖️ Biện Hộ',
  day_final_vote: '🪢 Bỏ Phiếu Cuối',
  day_no_nomination: '☀️ Không Có Đề Cử',
};

export default function PlayingView({ room, socketRef, mcLog, mcVoiceEnabled, setMcVoiceEnabled }) {
  const g = room.game;
  // Dùng playerId ổn định (không thay đổi khi reconnect)
  const myPlayerId = sessionStorage.getItem("ws_playerId") || socketRef.current.id;
  const me = room.players.find((p) => p.id === myPlayerId);
  
  const [selectedId, setSelectedId] = useState(null);
  const [wolfChatInput, setWolfChatInput] = useState("");
  const [villageChatInput, setVillageChatInput] = useState("");
  const [localBubbleChatLog, setLocalBubbleChatLog] = useState({});
  const [hasActed, setHasActed] = useState(false);
  const [gameTimeStr, setGameTimeStr] = useState("00:00");
  const [phaseTimeStr, setPhaseTimeStr] = useState("");
  const [recapAnimation, setRecapAnimation] = useState(null);
  const [speakingIds, setSpeakingIds] = useState([]);
  const [showRoleTutorial, setShowRoleTutorial] = useState(false);
  const [chatLog, setChatLog] = useState([]);
  const [mySkipVote, setMySkipVote] = useState(false);
  const [dayNightTransition, setDayNightTransition] = useState(null);
  const [reactions, setReactions] = useState([]);
  // Mobile tab navigation
  const [mobileTab, setMobileTab] = useState('game');   // 'game' | 'chat'
  const [unreadCount, setUnreadCount] = useState(0);    // tin chưa đọc khi ở tab game
  const [newMsgCount, setNewMsgCount] = useState(0);    // tin mới khi không ở cuối chat
  const [isAtBottom, setIsAtBottom] = useState(true);   // có đang ở cuối chat không
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const prevIsNightRef = useRef(null);
  const touchStartXRef = useRef(null);  // swipe gesture



  useEffect(() => {
    if (me?.role && g.dayNumber === 1 && g.nightDayPhase === 'night_guard') {
      setShowRoleTutorial(true);
      const t = setTimeout(() => setShowRoleTutorial(false), 8000);
      return () => clearTimeout(t);
    }
  }, [me?.role]);

  // Smart scroll + unread tracking
  useEffect(() => {
    if (chatLog.length === 0) return;
    // Tăng unread khi đang ở tab game
    if (mobileTab !== 'chat') {
      setUnreadCount(prev => prev + 1);
    }
    // Chỉ auto-scroll nếu đang ở cuối
    if (isAtBottom) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } else {
      setNewMsgCount(prev => prev + 1);
    }
  }, [chatLog]);


  // Timer cho game và phase
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (g.gameStartedAt) {
        const elapsed = Math.floor((now - g.gameStartedAt) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        setGameTimeStr(`${m}:${s}`);
      }

      if (g.phaseEndsAt) {
        const left = Math.max(0, Math.floor((g.phaseEndsAt - now) / 1000));
        setPhaseTimeStr(left > 0 ? `${left}s` : "Hết giờ");
      } else {
        setPhaseTimeStr("");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [g.gameStartedAt, g.phaseEndsAt]);

  // Reset hasActed khi chuyển phase
  useEffect(() => {
    setHasActed(false);
    setSelectedId(null);
    setMySkipVote(false);
  }, [g.nightDayPhase]);

  const isNight = g.nightDayPhase.startsWith("night_");
  const isMyTurn = 
    (g.nightDayPhase === "night_guard" && me?.role === "guard") ||
    (g.nightDayPhase === "night_wolf" && me?.role === "wolf") ||
    (g.nightDayPhase === "night_witch" && me?.role === "witch") ||
    (g.nightDayPhase === "night_seer" && me?.role === "seer");

  // Hiệu ứng chuyển ngày/đêm: mặt trăng đi xuống (đêm) / mặt trời đi lên (ngày)
  useEffect(() => {
    if (prevIsNightRef.current === null) { prevIsNightRef.current = isNight; return; }
    if (prevIsNightRef.current !== isNight) {
      const type = isNight ? 'to-night' : 'to-day';
      setDayNightTransition(type);
      const t = setTimeout(() => setDayNightTransition(null), 2600);
      prevIsNightRef.current = isNight;
      return () => clearTimeout(t);
    }
  }, [isNight]);

  useEffect(() => {
    const handleVillageChat = ({ senderId, senderName, message }) => {
      // Speech bubble overlay on player avatar
      setLocalBubbleChatLog(prev => ({ ...prev, [senderId]: message }));
      setTimeout(() => {
        setLocalBubbleChatLog(prev => {
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      }, 4000);
      // Push to unified chat log
      setChatLog(prev => [...prev, {
        type: 'village',
        senderId,
        senderName,
        text: message,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      }]);
    };

    const handleWolfChat = ({ senderId, message }) => {
      // Speech bubble overlay on player avatar
      setLocalBubbleChatLog(prev => ({ ...prev, [senderId]: message }));
      setTimeout(() => {
        setLocalBubbleChatLog(prev => {
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      }, 4000);
      // Push to unified chat log
      const sender = room.players.find(p => p.id === senderId);
      setChatLog(prev => [...prev, {
        type: 'wolf',
        senderId,
        senderName: sender?.name || 'Sói',
        text: message,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      }]);
    };

    socketRef.current.on("wolf:chat", handleWolfChat);
    socketRef.current.on("village:chat", handleVillageChat);
    return () => {
      socketRef.current.off("wolf:chat", handleWolfChat);
      socketRef.current.off("village:chat", handleVillageChat);
    };
  }, [socketRef, room.players]);

  // Sync mcLog messages into unified chatLog
  useEffect(() => {
    if (mcLog.length === 0) return;
    const last = mcLog[mcLog.length - 1];
    setChatLog(prev => {
      // Avoid duplicates
      const lastInLog = prev.filter(m => m.type === 'mc').slice(-1)[0];
      const lastText = last.text || last;
      if (lastInLog?.text === lastText) return prev;
      return [...prev, {
        type: 'mc',
        text: lastText,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      }];
    });
  }, [mcLog]);

  // SFX: death / win sounds triggered by chatLog changes
  useEffect(() => {
    if (chatLog.length === 0) return;
    const last = chatLog[chatLog.length - 1];
    if (last?.type === 'death') SFX.death();
    if (last?.type === 'mc' && last?.text?.includes('chiến thắng')) {
      if (last.text.includes('Phe Sói')) SFX.winWolf();
      else SFX.winVillage();
    }
  }, [chatLog]);

  // SFX: bell when it becomes my turn
  useEffect(() => {
    if (isMyTurn) SFX.bell();
  }, [isMyTurn]);

  // Emoji reactions: listen for broadcasts and auto-remove after 2.5s
  useEffect(() => {
    const handleReaction = (reaction) => {
      const id = Date.now() + Math.random();
      setReactions(prev => [...prev, { ...reaction, id }]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, 2500);
    };
    socketRef.current.on('reaction:broadcast', handleReaction);
    return () => {
      socketRef.current.off('reaction:broadcast', handleReaction);
    };
  }, [socketRef]);

  function handleAction() {
    if (!selectedId && g.nightDayPhase !== "night_witch") return;

    if (g.nightDayPhase === "night_guard") {
      SFX.vote();
      socketRef.current.emit("action:guardProtect", { targetId: selectedId }, () => setHasActed(true));
    } else if (g.nightDayPhase === "night_wolf") {
      SFX.select();
      socketRef.current.emit("action:wolfPick", { targetId: selectedId }); // Sói có thể đổi lại liên tục nên ko setHasActed
    } else if (g.nightDayPhase === "night_witch") {
      // Witch action is handled separately via specific buttons
    } else if (g.nightDayPhase === "night_seer") {
      SFX.select();
      socketRef.current.emit("action:seerCheck", { targetId: selectedId }, () => setHasActed(true));
    } else if (g.nightDayPhase === "day_nominate") {
      SFX.vote();
      socketRef.current.emit("action:nominationVote", { targetId: selectedId }, () => setHasActed(true));
    }
  }

  function handleWitch(save, poisonTargetId) {
    socketRef.current.emit("action:witchDecide", { save, poisonTargetId }, () => setHasActed(true));
  }

  function handleWolfChat(e) {
    e.preventDefault();
    if (!wolfChatInput.trim()) return;
    socketRef.current.emit("action:wolfChat", { message: wolfChatInput });
    setLocalBubbleChatLog(prev => ({ ...prev, [me.id]: wolfChatInput }));
    setWolfChatInput("");
    setTimeout(() => {
      setLocalBubbleChatLog(prev => {
        const next = {...prev};
        delete next[me.id];
        return next;
      });
    }, 4000); // clear after 4s
  }

  function handleVillageChat(e) {
    e.preventDefault();
    if (!villageChatInput.trim()) return;
    socketRef.current.emit("action:villageChat", { message: villageChatInput });
    setLocalBubbleChatLog(prev => ({ ...prev, [me.id]: villageChatInput }));
    setVillageChatInput("");
    setTimeout(() => {
      setLocalBubbleChatLog(prev => {
        const next = {...prev};
        delete next[me.id];
        return next;
      });
    }, 4000);
  }

  const showPhaseTimer = (!isNight || isMyTurn) && !g.winner; // Ngày ai cũng thấy, đêm chỉ ai đến lượt mới thấy

  if (g.winner && !g.history) {
    return <div className="playing-view-container"><div className="waiting-text">Đang tải dữ liệu tổng kết...</div></div>;
  }

  const roleBgClass = isNight && me?.role ? `role-bg-${me.role}` : "";

  return (
    <div className={`playing-view-container ${isNight && !g.winner ? 'night-mode' : 'day-mode'} ${roleBgClass}`}>
      <AmbientSound
        isNight={isNight}
        isTense={g.nightDayPhase === 'day_final_vote'}
        enabled={mcVoiceEnabled}
      />
      
      {/* Top HUD bar */}
      <div className="phase-header">
        <div className="hud-left">
          <div className="game-time">⏱ {gameTimeStr}</div>
          <h2 className="phase-title">{g.winner ? 'Trò Chơi Kết Thúc' : `Ngày ${g.dayNumber} — ${PHASE_LABELS[g.nightDayPhase] || g.nightDayPhase}`}</h2>
        </div>
        <div className="hud-center">
          <span className="role-badge">
            {ROLE_EMOJIS[me?.role]} {me?.role ? ROLE_LABELS[me.role] : 'Chết'}
          </span>
          {showPhaseTimer && phaseTimeStr && (
            <span className="phase-timer">{phaseTimeStr}</span>
          )}
        </div>
        <div className="hud-right">
          {setMcVoiceEnabled && (
            <button
              className="btn-mc-voice"
              onClick={() => setMcVoiceEnabled(prev => !prev)}
              title={mcVoiceEnabled ? 'Tắt giọng MC' : 'Bật giọng MC'}
            >
              {mcVoiceEnabled ? '🔊 MC' : '🔇 MC'}
            </button>
          )}
          <FullscreenButton />
        </div>
      </div>

      {/* Tab bar — chỉ hiện trên mobile portrait */}
      <div className="mobile-tab-bar">
        <button
          className={`tab-btn ${mobileTab === 'game' ? 'active' : ''}`}
          onClick={() => setMobileTab('game')}
        >
          🎮 Trò Chơi
        </button>
        <button
          className={`tab-btn ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => { setMobileTab('chat'); setUnreadCount(0); setNewMsgCount(0); }}
        >
          💬 Chat
          {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
        </button>
      </div>

      {/* Main 2-column layout */}
      <div
        className="game-layout"
        onTouchStart={e => { touchStartXRef.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (!touchStartXRef.current) return;
          const dx = e.changedTouches[0].clientX - touchStartXRef.current;
          if (Math.abs(dx) > 60) {
            if (dx < 0) { setMobileTab('chat'); setUnreadCount(0); setNewMsgCount(0); }
            else { setMobileTab('game'); }
          }
          touchStartXRef.current = null;
        }}
      >
        
        {/* LEFT: Player circle + actions */}
        <div className={`game-left ${mobileTab === 'game' ? 'tab-active' : 'tab-hidden'}`} style={{ position: 'relative' }}>
          <ParticleBackground isNight={isNight} />
          <PlayerCircle 
            players={room.players} 
            me={me}
            phase={g.nightDayPhase}
            myRole={me?.role}
            onSelectPlayer={(id) => { SFX.select(); setSelectedId(id); }}
            selectedPlayerId={selectedId}
            wolfVictimId={g.witchInfo?.victimId}
            nightDeaths={g.nightDeaths}
            wolfPicksVisible={g.wolfPicksVisible}
            wolfChatLog={localBubbleChatLog}
            seerLastResult={me?.role === "seer" ? g.seerLastResult : null}
            nominationVotes={g.nominationVotes}
            finalVotes={g.finalVotes}
            defendantId={g.phase === "day_final_vote" ? g.hotSeatQueue[g.hotSeatIndex] : null}
            recapAnimation={recapAnimation}
            wolfTeammates={g.wolfTeammates || []}
            speakingIds={speakingIds}
            reactions={reactions}
          />
          
          {/* Action buttons - moved here */}
          {!g.winner && me?.alive && (
            <div className="action-panel">
              {/* Giao diện cho các Phase Ban Đêm */}
              {isNight && (
                isMyTurn ? (
                  hasActed && g.nightDayPhase !== "night_wolf" ? (
                    <div className="waiting-text">Đã ghi nhận lựa chọn! Đang chờ thời gian kết thúc...</div>
                  ) : (
                    <>
                      {g.nightDayPhase === "night_witch" ? (
                        <div className="witch-actions">
                          <p>Có người bị cắn! Bạn làm gì?</p>
                          <button className="btn-save" disabled={g.witchInfo?.usedSave} onClick={() => handleWitch(true, null)}>Cứu</button>
                          <button className="btn-skip" onClick={() => handleWitch(false, null)}>Bỏ qua / Không cứu</button>
                          <div style={{marginTop: 10}}>
                            <button className="btn-poison" disabled={g.witchInfo?.usedPoison || !selectedId} onClick={() => handleWitch(false, selectedId)}>
                              {selectedId ? "Đầu độc người đã chọn" : "Chọn 1 người để đầu độc"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button className="btn-primary btn-action" disabled={!selectedId} onClick={handleAction}>
                            Xác nhận hành động
                          </button>
                          {g.nightDayPhase === "night_seer" && g.seerLastResult && (
                            <div className="status-text" style={{marginTop: 8}}>
                              Lần soi gần nhất: Người này là <b>{g.seerLastResult.result === "wolf" ? "SÓI" : "DÂN"}</b>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )
                ) : (
                  <div className="waiting-text">Màn đêm tĩnh lặng. Bạn đang ngủ...</div>
                )
              )}

              {/* Giao diện cho các Phase Ban Ngày (ai cũng thao tác được) */}
              {!isNight && (
                <>
                  {g.nightDayPhase === "day_discuss" && (
                    <>
                      <button className="btn-secondary" onClick={() => socketRef.current.emit("action:voteExtendDiscussion", { wantExtend: true })}>
                        +2 Phút Thảo Luận
                      </button>
                      {me?.alive && (
                        <div className="skip-discuss-panel">
                          <button
                            className={`btn-skip-discuss ${mySkipVote ? 'skip-voted' : ''}`}
                            onClick={() => {
                              socketRef.current.emit('action:skipDiscussion', {}, (res) => {
                                if (res?.ok) setMySkipVote(prev => !prev);
                              });
                            }}
                          >
                            {mySkipVote ? '⏭️ Rút phiếu' : '⏭️ Bỏ qua thảo luận'}
                          </button>
                          {g.skipDiscussVotes && (
                            <span className="skip-progress">
                              {Object.keys(g.skipDiscussVotes).length}/{room.players.filter(p => p.alive).length} đồng ý
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {g.nightDayPhase === "day_nominate" && (
                    <button className="btn-primary" disabled={!selectedId} onClick={handleAction}>
                      {hasActed ? "Đổi người đề cử" : "Bỏ phiếu đề cử"}
                    </button>
                  )}

                  {g.nightDayPhase === "day_final_vote" && (
                    <div className="final-vote-actions">
                      <p>Phán xét: {room.players.find(p => p.id === g.hotSeatQueue[g.hotSeatIndex])?.name}</p>
                      <button 
                        className={`btn-kill ${g.finalVotes && g.finalVotes[me.id] === "hang" ? "voted-active" : ""} ${g.finalVotes && g.finalVotes[me.id] === "spare" ? "voted-dim" : ""}`} 
                        disabled={!!(g.finalVotes && g.finalVotes[me.id])}
                        onClick={() => { SFX.vote(); socketRef.current.emit("action:finalVote", { decision: "hang" }, () => setHasActed(true)); }}
                      >
                        ⚔️ Treo cổ {g.finalVotes && g.finalVotes[me.id] === "hang" && " ✓"}
                      </button>
                      <button 
                        className={`btn-save ${g.finalVotes && g.finalVotes[me.id] === "spare" ? "voted-active" : ""} ${g.finalVotes && g.finalVotes[me.id] === "hang" ? "voted-dim" : ""}`} 
                        disabled={!!(g.finalVotes && g.finalVotes[me.id])}
                        onClick={() => { SFX.vote(); socketRef.current.emit("action:finalVote", { decision: "spare" }, () => setHasActed(true)); }}
                      >
                        🕊️ Tha {g.finalVotes && g.finalVotes[me.id] === "spare" && " ✓"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Emoji Reactions */}
              <EmojiReactions socketRef={socketRef} myName={me?.name} />

            </div>
          )}
        </div>

        {/* RIGHT: Chat + Voice */}
        <div className={`game-right ${mobileTab === 'chat' ? 'tab-active' : 'tab-hidden'}`}>
          {!g.winner && (
            <VoiceRoom 
              socketRef={socketRef} 
              isNight={isNight} 
              myRole={me?.role} 
              wolfTeammates={g.wolfTeammates || []} 
              onSpeakingChange={setSpeakingIds}
            />
          )}
          
          <div className="mc-chat-panel">
            {/* Chat messages */}
            <div
              className="chat-messages"
              ref={chatContainerRef}
              onScroll={e => {
                const el = e.target;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                setIsAtBottom(atBottom);
                if (atBottom) setNewMsgCount(0);
              }}
            >
              {chatLog.map((msg, i) => (
                <div key={i} className={`chat-msg chat-msg-${msg.type} ${msg.senderId === me?.id ? 'chat-msg-mine' : ''}`}>

                  {/* MC announcement */}
                  {msg.type === 'mc' && (
                    <div className={`chat-mc-bubble ${msg.text?.includes('không qua khỏi') || msg.text?.includes('treo cổ') ? 'mc-death' : ''} ${msg.text?.includes('chiến thắng') ? 'mc-win' : ''}`}>
                      <span className="chat-mc-icon">
                        {msg.text?.includes('không qua khỏi') || msg.text?.includes('treo cổ') ? '💀' :
                         msg.text?.includes('chiến thắng') ? '🏆' :
                         msg.text?.includes('Sói') && msg.text?.includes('thức dậy') ? '🐺' :
                         msg.text?.includes('Tiên Tri') ? '🔮' :
                         msg.text?.includes('Phù Thủy') ? '🧙' :
                         msg.text?.includes('sáng') ? '☀️' : '📜'}
                      </span>
                      <div className="chat-mc-content">
                        <span className="chat-mc-text">{msg.text}</span>
                        <span className="chat-time">{msg.time}</span>
                      </div>
                    </div>
                  )}

                  {/* Player chat bubble */}
                  {(msg.type === 'village' || msg.type === 'wolf') && (
                    <div className={`chat-player-bubble ${msg.senderId === me?.id ? 'mine' : 'others'} ${msg.type === 'wolf' ? 'wolf-msg' : ''}`}>
                      {msg.senderId !== me?.id && (
                        <div className="chat-sender-row">
                          <span className="chat-sender-avatar">{msg.type === 'wolf' ? '🐺' : '👤'}</span>
                          <span className="chat-sender-name">{msg.senderName}</span>
                          <span className="chat-time">{msg.time}</span>
                        </div>
                      )}
                      <div className="chat-bubble-body">
                        <span className="chat-text">{msg.text}</span>
                      </div>
                      {msg.senderId === me?.id && (
                        <span className="chat-time chat-time-mine">{msg.time}</span>
                      )}
                    </div>
                  )}

                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Nút scroll xuống khi có tin mới */}
            {newMsgCount > 0 && (
              <button
                className="scroll-to-bottom-btn"
                onClick={() => {
                  chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setNewMsgCount(0);
                  setIsAtBottom(true);
                }}
              >
                ↓ {newMsgCount} tin mới
              </button>
            )}
            
            {/* Chat inputs — sticky bottom */}
            <div className="chat-input-area">
              {isNight && me?.role === "wolf" && (
                <form onSubmit={handleWolfChat} className="chat-input-form wolf-input">
                  <input 
                    className="chat-input"
                    placeholder="🐺 Chat bầy sói..." 
                    value={wolfChatInput}
                    onChange={e => setWolfChatInput(e.target.value)}
                  />
                  <button type="submit" className="btn-send wolf-send">➤</button>
                </form>
              )}
              {!isNight && me?.alive && (
                <form onSubmit={handleVillageChat} className="chat-input-form village-input">
                  <input 
                    className="chat-input"
                    placeholder="💬 Thảo luận..." 
                    value={villageChatInput}
                    onChange={e => setVillageChatInput(e.target.value)}
                  />
                  <button type="submit" className="btn-send village-send">➤</button>
                </form>
              )}
            </div>
          </div>
        </div>

      </div>


      {/* EndGame overlay stays full width */}
      {g.winner && g.history && (
        <EndGameRecap 
          history={g.history} 
          isHost={me?.isHost} 
          onRestart={() => socketRef.current.emit("room:restart")}
          onAnimate={setRecapAnimation} 
        />
      )}
      
      {/* Tutorial overlay if any */}
      {showRoleTutorial && me?.role && (
        <div className="role-tutorial-overlay" onClick={() => setShowRoleTutorial(false)}>
          <div className="role-tutorial-card">
            <div className="role-tutorial-emoji">{ROLE_EMOJIS[me.role] || '🎭'}</div>
            <h2>Bạn là {ROLE_LABELS[me.role]}</h2>
            <p>{ROLE_DESCRIPTIONS[me.role]}</p>
            <button className="btn-primary" onClick={() => setShowRoleTutorial(false)}>Hiểu rồi!</button>
          </div>
        </div>
      )}

      {/* Hiệu ứng chuyển Ngày/Đêm — mặt trời đi lên / mặt trăng đi xuống */}
      {dayNightTransition && (
        <div className={`day-night-transition transition-${dayNightTransition}`}>
          <div className="transition-emoji">
            {dayNightTransition === 'to-night' ? '🌙' : '☀️'}
          </div>
        </div>
      )}
    </div>
  );
}

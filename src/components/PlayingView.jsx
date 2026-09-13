import { useState, useEffect, useRef } from "react";
import PlayerCircle from "./PlayerCircle.jsx";
import EndGameRecap from "./EndGameRecap.jsx";
import VoiceRoom from "./VoiceRoom.jsx";
import FullscreenButton from "./FullscreenButton.jsx";
import ParticleBackground from "./ParticleBackground.jsx";
import AmbientSound from "./AmbientSound.jsx";
import { SFX } from "./SFX.js";
import EmojiReactions from "./EmojiReactions.jsx";

import { ROLE_LABELS, ROLE_EMOJIS, ROLE_DESCRIPTIONS } from '../config/roles.config.js';


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

// Banner ngữ cảnh — dẫn dắt người chơi biết phải làm gì
const ACTION_BANNERS = {
  night_guard:     { icon:'🛡️', color:'#3b82f6', text:'Chọn 1 người để bảo vệ đêm nay. Không được chọn trùng đêm trước!' },
  night_wolf:      { icon:'🐺', color:'#ef4444', text:'Cùng bầy sói thống nhất chọn 1 con mồi. Click vào người đó!' },
  night_witch:     { icon:'🧪', color:'#8b5cf6', text:'Có người bị sói tấn công. Bạn có muốn cứu không? Hoặc dùng bình độc?' },
  night_witch_nd:  { icon:'🧪', color:'#8b5cf6', text:'Đêm nay sói không tấn công ai. Bạn có muốn dùng bình độc không?' },
  night_seer:      { icon:'🔮', color:'#6366f1', text:'Click vào 1 người để soi. Đỏ = Sói 🔴 — Xanh = Người tốt 🔵' },
  day_reveal:      { icon:'☀️', color:'#f59e0b', text:'Bình minh ló dạng. Xem có ai bị tấn công đêm qua không...' },
  day_discuss:     { icon:'💬', color:'#10b981', text:'Thảo luận để tìm Sói! Nêu nghi ngờ, chia sẻ thông tin.' },
  day_nominate:    { icon:'🗳️', color:'#f59e0b', text:'Click vào người bạn nghi là Sói để đề cử. Ai đủ phiếu sẽ lên ghế nóng!' },
  day_defense:     { icon:'⚖️', color:'#f97316', text:'Lắng nghe bị cáo tự bào chữa trước khi bỏ phiếu.' },
  day_final_vote:  { icon:'🪢', color:'#ef4444', text:'Quyết định: Treo Cổ hay Tha? Nhấn nút để bỏ phiếu.' },
  day_no_nomination:{ icon:'😮‍💨', color:'#6b7280', text:'Không ai bị đề cử. Cả làng được sống thêm 1 ngày.' },
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
  // Tutorial 3 bước: 0=ẩn, 1/2/3=bước đang hiện
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialSeconds, setTutorialSeconds] = useState(7);
  const [chatLog, setChatLog] = useState([]);
  const [mySkipVote, setMySkipVote] = useState(false);
  const [dayNightTransition, setDayNightTransition] = useState(null);
  const [reactions, setReactions] = useState([]);
  // Seer history log — nhớ kết quả soi qua các đêm
  const [seerHistory, setSeerHistory] = useState([]);
  // Dead player overlay
  const [showDeadOverlay, setShowDeadOverlay] = useState(false);
  const prevAliveRef = useRef(true);
  // Mobile tab navigation
  const [mobileTab, setMobileTab] = useState('game');
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const prevIsNightRef = useRef(null);
  const touchStartXRef = useRef(null);

  // Tutorial 3 bước — hiện khi game bắt đầu
  useEffect(() => {
    if (me?.role && g.dayNumber === 1 && g.nightDayPhase === 'night_guard') {
      setTutorialStep(1);
      setTutorialSeconds(7);
    }
  }, [me?.role]);

  // Đếm ngược từng bước tutorial
  useEffect(() => {
    if (tutorialStep === 0) return;
    const durations = [0, 7, 8, 5]; // bước 1=7s, 2=8s, 3=5s
    const dur = durations[tutorialStep] || 7;
    setTutorialSeconds(dur);
    const interval = setInterval(() => {
      setTutorialSeconds(s => {
        if (s <= 1) {
          clearInterval(interval);
          // Tự sang bước tiếp hoặc ẩn
          setTutorialStep(prev => prev >= 3 ? 0 : prev + 1);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tutorialStep]);

  // Seer history: lưu kết quả soi mỗi đêm
  useEffect(() => {
    if (me?.role === 'seer' && g.seerLastResult) {
      const targetPlayer = room.players.find(p => p.id === g.seerLastResult.targetId);
      if (!targetPlayer) return;
      setSeerHistory(prev => {
        const alreadyHas = prev.some(h => h.targetId === g.seerLastResult.targetId && h.day === g.dayNumber);
        if (alreadyHas) return prev;
        return [...prev, {
          day: g.dayNumber,
          targetId: g.seerLastResult.targetId,
          targetName: targetPlayer.name,
          result: g.seerLastResult.result,
        }];
      });
    }
  }, [g.seerLastResult?.targetId]);

  // Dead overlay: hiện 1 lần khi người chơi vừa chết
  useEffect(() => {
    const isAliveNow = me?.alive !== false;
    if (prevAliveRef.current === true && !isAliveNow) {
      setShowDeadOverlay(true);
    }
    prevAliveRef.current = isAliveNow ?? true;
  }, [me?.alive]);


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

  // --- Computed: Action Banner ---
  const getActionBanner = () => {
    if (!me?.alive || g.winner) return null;
    const phase = g.nightDayPhase;
    if (isNight && !isMyTurn) return null; // đêm: chỉ hiện cho người đến lượt
    if (phase === 'night_witch') {
      return g.wolfVictimId ? ACTION_BANNERS.night_witch : ACTION_BANNERS.night_witch_nd;
    }
    return ACTION_BANNERS[phase] || null;
  };
  const actionBanner = getActionBanner();

  // --- Computed: live Sói/Dân count ---
  const alivePlayers = room.players.filter(p => p.alive);
  const aliveWolfCount  = g.roleCounts ? Math.max(0,
    alivePlayers.filter(p => g.wolfTeammates?.includes(p.id) || p.role === 'wolf').length
  ) : (g.wolfTeammates?.filter(id => room.players.find(p => p.id===id)?.alive).length ?? '?');
  const aliveVillageCount = alivePlayers.length - (typeof aliveWolfCount === 'number' ? aliveWolfCount : 0);

  // --- Computed: final vote tally ---
  const hangCount  = g.finalVotes ? Object.values(g.finalVotes).filter(v => v==='hang').length  : 0;
  const spareCount = g.finalVotes ? Object.values(g.finalVotes).filter(v => v==='spare').length : 0;
  const totalAlive = alivePlayers.length;
  const hangNeeded = Math.floor(totalAlive / 2) + 1;


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
      <div className={`phase-header phase-${g.nightDayPhase ? g.nightDayPhase.split('_')[0] : 'default'}`}>
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
          {/* Live Sói/Dân counter */}
          <div className="hud-score">
            <span className="hud-wolf">🐺 {aliveWolfCount}</span>
            <span className="hud-vs">vs</span>
            <span className="hud-village">👥 {aliveVillageCount}</span>
          </div>
          {setMcVoiceEnabled && (
            <button
              className="btn-mc-voice"
              onClick={() => setMcVoiceEnabled(prev => !prev)}
              title={mcVoiceEnabled ? 'Tắt giọng MC' : 'Bật giọng MC'}
            >
              {mcVoiceEnabled ? '🔊' : '🔇'}
            </button>
          )}
          <FullscreenButton />
        </div>
      </div>

      {/* Action Banner — hướng dẫn ngữ cảnh */}
      {actionBanner && !g.winner && (
        <div
          className={`action-banner ${hasActed ? 'action-banner-done' : ''}`}
          style={{ '--banner-color': actionBanner.color }}
        >
          <span className="action-banner-icon">{actionBanner.icon}</span>
          <span className="action-banner-text">
            {hasActed
              ? `✅ Đã ghi nhận lựa chọn! Đang chờ phase tiếp theo...`
              : actionBanner.text}
          </span>
        </div>
      )}

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
        <div className={`game-left ${mobileTab === 'game' ? 'tab-active' : 'tab-hidden'} ${isNight ? 'bg-night' : 'bg-day'}`} style={{ position: 'relative' }}>
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
                          {/* Trạng thái 2 bình */}
                          <div className="witch-potion-status">
                            <div className={`potion-badge ${g.witchInfo?.usedSave ? 'potion-used' : 'potion-available'}`}>
                              {g.witchInfo?.usedSave ? '🔴' : '💚'} Bình Cứu: {g.witchInfo?.usedSave ? 'ĐÃ DÙNG' : 'CÒN'}
                            </div>
                            <div className={`potion-badge ${g.witchInfo?.usedPoison ? 'potion-used' : 'potion-available'}`}>
                              {g.witchInfo?.usedPoison ? '🔴' : '☠️'} Bình Độc: {g.witchInfo?.usedPoison ? 'ĐÃ DÙNG' : 'CÒN'}
                            </div>
                          </div>
                          {/* Nút hành động */}
                          {g.witchInfo?.victimId ? (
                            <p className="witch-victim-text">⚠️ Có người vừa bị tấn công!</p>
                          ) : (
                            <p className="witch-victim-text">😮‍💨 Đêm nay không ai bị cắn</p>
                          )}
                          <div className="witch-btn-row">
                            {g.witchInfo?.victimId && (
                              <button className="btn-save" disabled={g.witchInfo?.usedSave} onClick={() => handleWitch(true, null)}>
                                💚 Cứu
                              </button>
                            )}
                            <button className="btn-skip" onClick={() => handleWitch(false, null)}>
                              ⏭️ Bỏ qua
                            </button>
                          </div>
                          {!g.witchInfo?.usedPoison && (
                            <button className="btn-poison" disabled={!selectedId} onClick={() => handleWitch(false, selectedId)}>
                              ☠️ {selectedId ? 'Đầu độc người đã chọn' : 'Chọn 1 người để đầu độc'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <button className="btn-primary btn-action" disabled={!selectedId} onClick={handleAction}>
                            Xác nhận hành động
                          </button>
                          {/* Seer: hiện kết quả vừa soi + lịch sử các đêm */}
                          {g.nightDayPhase === "night_seer" && (
                            <div className="seer-panel">
                              {g.seerLastResult && (
                                <div className={`seer-result-badge ${g.seerLastResult.result === 'wolf' ? 'seer-wolf' : 'seer-human'}`}>
                                  {g.seerLastResult.result === 'wolf' ? '🔴 SÓI!' : '🔵 Người tốt'}
                                </div>
                              )}
                              {seerHistory.length > 0 && (
                                <div className="seer-history">
                                  <div className="seer-history-title">🔮 Lịch sử soi:</div>
                                  {seerHistory.map((h, i) => (
                                    <div key={i} className={`seer-history-row ${h.result === 'wolf' ? 'sh-wolf' : 'sh-human'}`}>
                                      <span className="sh-day">Đêm {h.day}</span>
                                      <span className="sh-name">{h.targetName}</span>
                                      <span className="sh-result">{h.result === 'wolf' ? '🔴 SÓI' : '🔵 Tốt'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                      <p className="vote-defendant">
                        ⚖️ Phán xét: <strong>{room.players.find(p => p.id === g.hotSeatQueue[g.hotSeatIndex])?.name}</strong>
                      </p>

                      {/* Nút vote */}
                      <div className="vote-btn-row">
                        <button
                          className={`btn-kill ${g.finalVotes?.[me.id] === 'hang' ? 'voted-active' : g.finalVotes?.[me.id] ? 'voted-dim' : ''}`}
                          disabled={!!(g.finalVotes?.[me.id])}
                          onClick={() => { SFX.vote(); socketRef.current.emit("action:finalVote", { decision: "hang" }, () => setHasActed(true)); }}
                        >
                          🪢 Treo Cổ {g.finalVotes?.[me.id] === 'hang' && '✓'}
                        </button>
                        <button
                          className={`btn-save ${g.finalVotes?.[me.id] === 'spare' ? 'voted-active' : g.finalVotes?.[me.id] ? 'voted-dim' : ''}`}
                          disabled={!!(g.finalVotes?.[me.id])}
                          onClick={() => { SFX.vote(); socketRef.current.emit("action:finalVote", { decision: "spare" }, () => setHasActed(true)); }}
                        >
                          🕊️ Tha {g.finalVotes?.[me.id] === 'spare' && '✓'}
                        </button>
                      </div>

                      {/* Thanh tỉ lệ real-time */}
                      {hangCount + spareCount > 0 && (
                        <div className="vote-tally">
                          <div className="vote-tally-row">
                            <span className="tally-label tally-hang">🪢 {hangCount}</span>
                            <div className="tally-bar-bg">
                              <div className="tally-bar-hang"
                                   style={{ width: `${(hangCount / (hangCount + spareCount)) * 100}%` }} />
                            </div>
                            <span className="tally-label tally-spare">{spareCount} 🕊️</span>
                          </div>
                          <div className="tally-hint">
                            {hangCount >= hangNeeded
                              ? '🪢 Đủ phiếu treo cổ!'
                              : `Cần thêm ${hangNeeded - hangCount} phiếu Treo để xử tử`}
                          </div>
                        </div>
                      )}
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

                  {/* Player chat bubble — Zalo style */}
                  {(msg.type === 'village' || msg.type === 'wolf') && (() => {
                    const isMine = msg.senderId === me?.id;
                    const senderPlayer = room.players.find(p => p.id === msg.senderId);
                    const avatarSrc = senderPlayer?.avatar || '/icon-192.png';
                    return (
                      <div className={`chat-player-bubble ${isMine ? 'mine' : 'others'} ${msg.type === 'wolf' ? 'wolf-msg' : ''}`}>
                        {/* Avatar trái — người khác */}
                        {!isMine && (
                          <img src={avatarSrc} className="chat-avatar-img" alt={msg.senderName}
                               onError={e => { e.target.src = '/icon-192.png'; }} />
                        )}
                        <div className="chat-content-col">
                          {/* Tên + thời gian (trên bubble) */}
                          {!isMine && (
                            <div className="chat-header-row">
                              {msg.type === 'wolf' && <span className="wolf-tag">🐺</span>}
                              <span className="chat-sender-name">{msg.senderName}</span>
                              <span className="chat-time">{msg.time}</span>
                            </div>
                          )}
                          {/* Bubble */}
                          <div className="chat-bubble-body">
                            <span className="chat-text">{msg.text}</span>
                          </div>
                          {/* Thời gian phía mình */}
                          {isMine && (
                            <span className="chat-time chat-time-mine">{msg.time}</span>
                          )}
                        </div>
                        {/* Avatar phải — mình */}
                        {isMine && (
                          <img src={me?.avatar || '/icon-192.png'} className="chat-avatar-img" alt="Bạn"
                               onError={e => { e.target.src = '/icon-192.png'; }} />
                        )}
                      </div>
                    );
                  })()}

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
          players={room.players}
          winner={g.winner}
        />
      )}
      
      {/* Tutorial 3 bước — overlay khi game bắt đầu */}
      {tutorialStep > 0 && me?.role && (
        <div className="role-tutorial-overlay">
          <div className="role-tutorial-card tutorial-3step">

            {/* Step indicator */}
            <div className="tutorial-steps-bar">
              {[1,2,3].map(s => (
                <div key={s} className={`tutorial-step-dot ${tutorialStep === s ? 'active' : tutorialStep > s ? 'done' : ''}`} />
              ))}
            </div>

            {/* Bước 1: Vai của bạn */}
            {tutorialStep === 1 && (
              <div className="tutorial-step-content">
                <div className="role-tutorial-emoji">{ROLE_EMOJIS[me.role] || '🎭'}</div>
                <h2>Bạn là <span style={{ color: '#f59e0b' }}>{ROLE_LABELS[me.role]}</span></h2>
                <p className="tutorial-team">Phe: {me.role === 'wolf' ? '🐺 Sói' : me.role === 'tanner' ? '💀 Trung Lập' : '👥 Dân Làng'}</p>
              </div>
            )}

            {/* Bước 2: Nhiệm vụ */}
            {tutorialStep === 2 && (
              <div className="tutorial-step-content">
                <div className="role-tutorial-emoji">📋</div>
                <h2>Nhiệm vụ của bạn</h2>
                <p className="tutorial-desc">{ROLE_DESCRIPTIONS[me.role]}</p>
              </div>
            )}

            {/* Bước 3: Ván này có ai */}
            {tutorialStep === 3 && (
              <div className="tutorial-step-content">
                <div className="role-tutorial-emoji">🎮</div>
                <h2>Ván này có</h2>
                <div className="tutorial-role-counts">
                  {g.roleCounts && Object.entries(g.roleCounts)
                    .filter(([, c]) => c > 0)
                    .map(([r, c]) => (
                      <div key={r} className={`role-count-chip ${r === me.role ? 'role-count-mine' : ''}`}>
                        {ROLE_EMOJIS[r]} {ROLE_LABELS[r]} × {c}
                        {r === me.role && ' (Bạn!)'}
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Progress bar + nút */}
            <div className="tutorial-footer">
              <div className="tutorial-progress-bar">
                <div className="tutorial-progress-fill"
                     style={{ width: `${(tutorialSeconds / ([0,7,8,5][tutorialStep] || 7)) * 100}%` }} />
              </div>
              <div className="tutorial-btn-row">
                <span className="tutorial-seconds">{tutorialSeconds}s</span>
                {tutorialStep < 3 ? (
                  <button className="btn-primary tutorial-btn"
                          onClick={() => setTutorialStep(s => s + 1)}>
                    Tiếp ▶
                  </button>
                ) : (
                  <button className="btn-primary tutorial-btn"
                          onClick={() => setTutorialStep(0)}>
                    Bắt đầu! ✓
                  </button>
                )}
                <button className="tutorial-skip-btn" onClick={() => setTutorialStep(0)}>Skip</button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Dead Player — Spectator overlay */}
      {showDeadOverlay && (
        <div className="dead-overlay">
          <div className="dead-overlay-card">
            <div className="dead-overlay-emoji">💀</div>
            <h2>Bạn đã rời ván đấu</h2>
            <p>Bạn có thể <strong>xem tiếp</strong> nhưng không được tiết lộ thông tin cho người còn sống.</p>
            <button className="btn-primary" onClick={() => setShowDeadOverlay(false)}>
              👁️ Xem tiếp
            </button>
          </div>
        </div>
      )}

      {/* Spectator banner — sticky khi đang xem sau khi chết */}
      {me && !me.alive && !showDeadOverlay && !g.winner && (
        <div className="spectator-banner">
          👁️ QUAN SÁT — Bạn thấy tất cả nhưng không nói được
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

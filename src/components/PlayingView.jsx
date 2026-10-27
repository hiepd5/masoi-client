import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import PlayerCircle from "./PlayerCircle.jsx";
import EndGameRecap from "./EndGameRecap.jsx";
import VoiceRoom from "./VoiceRoom.jsx";
import FullscreenButton from "./FullscreenButton.jsx";
import ParticleBackground from "./ParticleBackground.jsx";
import AmbientSound from "./AmbientSound.jsx";
import { SFX } from "./SFX.js";
import EmojiReactions from "./EmojiReactions.jsx";
import { HudGameClock, HudPhaseCountdown, HudPhaseProgressBar } from "./HudTimer.jsx";

import { ROLE_LABELS, ROLE_EMOJIS, ROLE_DESCRIPTIONS, isWolfTeamRole } from '../config/roles.config.js';
import VillageBackdrop from './VillageBackdrop.jsx';
import Scene3DErrorBoundary from '../3d/components/Scene3DErrorBoundary.jsx';
import { isDevArchitectAllowed } from '../3d/editor/defaultVillageLayout.js';

const WerewolfScene3D = lazy(() => import("../3d/scene/WerewolfScene3D.jsx"));


const PHASE_LABELS = {
  night_cupid: '💘 Thần Tình Yêu Se Duyên',
  night_guard: '🌙 Bảo Vệ Thức Dậy',
  night_wolf: '🌙 Đêm Sói Săn Mồi',
  night_witch: '🌙 Phù Thủy Hành Động',
  night_seer: '🌙 Tiên Tri Nhìn Xa',
  hunter_revenge: '🏹 Hơi Thở Cuối Của Thợ Săn',
  day_reveal: '☀️ Bình Minh',
  day_discuss: '☀️ Thảo Luận',
  day_nominate: '🗳️ Đề Cử',
  day_defense: '⚖️ Biện Hộ',
  day_final_vote: '🪢 Bỏ Phiếu Cuối',
  day_no_nomination: '☀️ Không Có Đề Cử',
};

// Banner ngữ cảnh — dẫn dắt người chơi biết phải làm gì
const ACTION_BANNERS = {
  night_cupid:     { icon:'💘', color:'#ec4899', text:'Đêm đầu tiên: Click chọn 2 người trên vòng ghế để kết duyên sinh tử!' },
  night_guard:     { icon:'🛡️', color:'#3b82f6', text:'Chọn 1 người để bảo vệ đêm nay. Không được chọn trùng đêm trước!' },
  night_wolf:      { icon:'🐺', color:'#ef4444', text:'Cùng bầy sói thống nhất chọn 1 con mồi. Click vào người đó!' },
  night_witch:     { icon:'🧪', color:'#8b5cf6', text:'Có người bị sói tấn công. Bạn có muốn cứu không? Hoặc dùng bình độc?' },
  night_witch_nd:  { icon:'🧪', color:'#8b5cf6', text:'Đêm nay sói không tấn công ai. Bạn có muốn dùng bình độc không?' },
  night_seer:      { icon:'🔮', color:'#6366f1', text:'Click vào 1 người để soi. Đỏ = Sói 🔴 — Xanh = Người tốt 🔵' },
  hunter_revenge:  { icon:'🏹', color:'#e11d48', text:'Hơi thở cuối! Click vào 1 người còn sống để bắn viên đạn bạc trả thù!' },
  day_reveal:      { icon:'☀️', color:'#f59e0b', text:'Bình minh ló dạng. Xem có ai bị tấn công đêm qua không...' },
  day_discuss:     { icon:'💬', color:'#10b981', text:'Thảo luận để tìm Sói! Nêu nghi ngờ, chia sẻ thông tin.' },
  day_nominate:    { icon:'🗳️', color:'#f59e0b', text:'Click vào người bạn nghi là Sói để đề cử. Ai đủ phiếu sẽ lên ghế nóng!' },
  day_defense:     { icon:'⚖️', color:'#f97316', text:'Lắng nghe bị cáo tự bào chữa trước khi bỏ phiếu.' },
  day_final_vote:  { icon:'🪢', color:'#ef4444', text:'Quyết định: Treo Cổ hay Tha? Nhấn nút để bỏ phiếu.' },
  day_no_nomination:{ icon:'😮‍💨', color:'#6b7280', text:'Không ai bị đề cử. Cả làng được sống thêm 1 ngày.' },
};


export default function PlayingView({
  room,
  socketRef,
  mcLog,
  mcVoiceEnabled,
  setMcVoiceEnabled,
  onLeave = null,
  voicePregening = false,
  voicePregenProgress = { done: 0, total: 0 },
  vsServerOffline = false,
  vsStatusReady = false,
  vsStatusChecking = false,
  onRecheckVoice = null,
  voiceRecheckTick = 0,
}) {
  const g = room.game;
  // Dùng playerId ổn định (không thay đổi khi reconnect)
  const myPlayerId = sessionStorage.getItem("ws_playerId") || socketRef.current.id;
  const me = room.players.find((p) => p.id === myPlayerId);
  
  const [selectedId, setSelectedId] = useState(null);
  const [cupidTargets, setCupidTargets] = useState([]);
  const [wolfChatInput, setWolfChatInput] = useState("");
  const [villageChatInput, setVillageChatInput] = useState("");
  const [localBubbleChatLog, setLocalBubbleChatLog] = useState({});
  const [hasActed, setHasActed] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("ws_view_mode") || "3d");
  const [openArchitectCounter, setOpenArchitectCounter] = useState(0);
  const canOpenArchitect = isDevArchitectAllowed();
  const [recapAnimation, setRecapAnimation] = useState(null);
  const [recapStageState, setRecapStageState] = useState(null);
  const [liveMicroChoreo, setLiveMicroChoreo] = useState(null);
  const microChoreoTimerRef = useRef(null);
  const [speakingIds, setSpeakingIds] = useState([]);

  // Kích hoạt hoạt cảnh ngắn 3D + VFX ngay trên màn hình người thực hiện (100% Zero-Leak — không phát sang máy người khác!)
  const triggerMyMicroChoreo = useCallback(
    (actionType, targetId = null, durationMs = 2800, secondaryTargetId = null) => {
      if (!me?.id || !actionType) return;
      if (microChoreoTimerRef.current) {
        clearTimeout(microChoreoTimerRef.current);
      }
      const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
      const token = `${nowPerf}_${Math.random()}`;
      setLiveMicroChoreo({
        token,
        actorId: me.id,
        actionType,
        targetId,
        secondaryTargetId,
        startedAtPerfMs: nowPerf,
        durationMs,
      });
      microChoreoTimerRef.current = setTimeout(() => {
        setLiveMicroChoreo((prev) => (prev?.token === token ? null : prev));
      }, durationMs + 90);
    },
    [me?.id]
  );
  const handleSpeakingChange = useCallback((nextIds) => {
    setSpeakingIds((prev) => {
      if (prev.length === nextIds.length && prev.every((id, idx) => id === nextIds[idx])) {
        return prev;
      }
      return nextIds;
    });
  }, []);
  // Tutorial 3 bước: 0=ẩn, 1/2/3=bước đang hiện
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialSeconds, setTutorialSeconds] = useState(7);
  const [chatLog, setChatLog] = useState([]);
  const [mySkipVote, setMySkipVote] = useState(false);
  const [dayNightTransition, setDayNightTransition] = useState(null);
  const [reactions, setReactions] = useState([]);
  // Seer history log — nhớ kết quả soi qua các đêm
  const [seerHistory, setSeerHistory] = useState([]);
  const [showSeerPopover, setShowSeerPopover] = useState(false);
  const [actionFeedback, setActionFeedback] = useState("");
  // Dead player overlay
  const [showDeadOverlay, setShowDeadOverlay] = useState(false);
  const [showPostGameChat, setShowPostGameChat] = useState(false);
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

  const isMyHunterRevenge = g.nightDayPhase === "hunter_revenge" && g.hunterPendingId === me?.id;

  // Tutorial 3 bước — hiện khi game bắt đầu (kể cả khi mở màn bằng Đêm 1 của Cupid)
  useEffect(() => {
    if (me?.role && g.dayNumber === 1 && (g.nightDayPhase === 'night_cupid' || g.nightDayPhase === 'night_guard')) {
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

  // Dead overlay: hiện 1 lần khi người chơi vừa chết (hoãn lại nếu là Thợ Săn đang gồng hơi thở cuối bắn trả thù!)
  useEffect(() => {
    const isAliveOrHoldingBreath = me?.alive !== false || isMyHunterRevenge;
    if (prevAliveRef.current === true && !isAliveOrHoldingBreath && !g.winner) {
      setShowDeadOverlay(true);
    }
    prevAliveRef.current = isAliveOrHoldingBreath ?? true;
  }, [me?.alive, isMyHunterRevenge, g.winner]);

  // Ngay khi Kết Game (g.winner): tự động dẹp sạch mọi popup che khuất để mở Rạp Chiếu Replay Không Gian Thật 100vw!
  useEffect(() => {
    if (g.winner) {
      setShowDeadOverlay(false);
      setTutorialStep(0);
      setSpeakingIds((prev) => (prev.length ? [] : prev));
    } else {
      setShowPostGameChat(false);
    }
  }, [g.winner]);


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


  function toggleViewMode() {
    setViewMode((prev) => {
      const next = prev === "3d" ? "2d" : "3d";
      localStorage.setItem("ws_view_mode", next);
      return next;
    });
  }

  // Reset hasActed & hoạt cảnh ngắn khi chuyển phase
  useEffect(() => {
    setHasActed(false);
    setSelectedId(null);
    setCupidTargets([]);
    setMySkipVote(false);
    setShowSeerPopover(false);
    setActionFeedback("");
    setLiveMicroChoreo(null);
    if (microChoreoTimerRef.current) {
      clearTimeout(microChoreoTimerRef.current);
      microChoreoTimerRef.current = null;
    }
  }, [g.nightDayPhase]);

  const isNight = g.nightDayPhase.startsWith("night_");
  const isMyTurn =
    (g.nightDayPhase === "night_cupid" && me?.role === "cupid") ||
    (g.nightDayPhase === "night_guard" && me?.role === "guard") ||
    (g.nightDayPhase === "night_wolf" && isWolfTeamRole(me?.role)) ||
    (g.nightDayPhase === "night_witch" && me?.role === "witch") ||
    (g.nightDayPhase === "night_seer" && me?.role === "seer") ||
    isMyHunterRevenge;

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

  function flashActionFeedback(msg) {
    setActionFeedback(msg);
    setTimeout(() => {
      setActionFeedback((prev) => (prev === msg ? "" : prev));
    }, 2800);
  }

  function handleSelectSeat(id) {
    if (!id) {
      setSelectedId(null);
      return;
    }
    if (g.nightDayPhase === "night_cupid" && me?.role === "cupid" && me?.alive && !hasActed) {
      const clickedPlayer = room.players.find((p) => p.id === id);
      if (!clickedPlayer?.alive) return;
      SFX.select();
      setCupidTargets((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length < 2) return [...prev, id];
        return [prev[1], id];
      });
      return;
    }
    SFX.select();
    setSelectedId(id);
  }

  function handleCupidConfirm() {
    if (cupidTargets.length !== 2) return;
    const [firstId, secondId] = cupidTargets;
    SFX.vote();
    socketRef.current.emit("action:cupidLink", { targetIds: [firstId, secondId] }, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
        return;
      }
      triggerMyMicroChoreo("cupid_love_arrow", firstId, 3200, secondId);
      setHasActed(true);
    });
  }

  function handleAlphaToggle() {
    const nextEnabled = !Boolean(g.alphaWolfInfo?.convertTonight);
    SFX.select();
    socketRef.current.emit("action:wolfAlphaToggle", { enabled: nextEnabled }, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
        return;
      }
      if (res?.alphaConvertTonight) {
        triggerMyMicroChoreo("alpha_blood_convert", selectedId || me?.id, 2600);
        flashActionFeedback("🩸 Đã BẬT Huyết Nguyệt: Con mồi đêm nay sẽ hóa thành Sói!");
      } else {
        flashActionFeedback("🐺 Đã tắt Huyết Nguyệt — chuyển về cắn hạ sát bình thường.");
      }
    });
  }

  function handleMayorReveal() {
    SFX.bell();
    socketRef.current.emit("action:mayorReveal", {}, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
        return;
      }
      triggerMyMicroChoreo("mayor_decree_slam", me?.id, 2800);
      flashActionFeedback("👑 Đã công bố Quyền Trượng Trưởng Làng — Mọi lá phiếu x2!");
    });
  }

  function handleHunterShoot() {
    if (!selectedId) return;
    const targetNow = selectedId;
    SFX.death();
    socketRef.current.emit("action:hunterShoot", { targetId: targetNow }, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
        return;
      }
      triggerMyMicroChoreo("hunter_last_shot", targetNow, 2800);
      setHasActed(true);
      setSelectedId(null);
    });
  }

  function handleAction() {
    if (!selectedId && g.nightDayPhase !== "night_witch") return;
    const targetNow = selectedId;

    if (g.nightDayPhase === "night_guard") {
      SFX.vote();
      socketRef.current.emit("action:guardProtect", { targetId: targetNow }, (res) => {
        if (res?.error) {
          flashActionFeedback(`⚠️ ${res.error}`);
          return;
        }
        triggerMyMicroChoreo("guard_patrol_cast", targetNow, 2600);
        setHasActed(true);
        setSelectedId(null);
      });
    } else if (g.nightDayPhase === "night_wolf") {
      SFX.select();
      socketRef.current.emit("action:wolfPick", { targetId: targetNow }, (res) => {
        if (res?.error) {
          flashActionFeedback(`⚠️ ${res.error}`);
          return;
        }
        triggerMyMicroChoreo("wolf_pounce", targetNow, 3200);
        setSelectedId(null); // Ẩn nút nổi sau khi chọn (vẫn click lại ghế khác để đổi mục tiêu được)
      });
    } else if (g.nightDayPhase === "night_witch") {
      // Witch action is handled separately via specific buttons
    } else if (g.nightDayPhase === "night_seer") {
      SFX.select();
      socketRef.current.emit("action:seerCheck", { targetId: targetNow }, (res) => {
        if (res?.error) {
          flashActionFeedback(`⚠️ ${res.error}`);
          return;
        }
        triggerMyMicroChoreo("seer_divine_cast", targetNow, 2800);
        setHasActed(true);
        setSelectedId(null);
      });
    } else if (g.nightDayPhase === "hunter_revenge") {
      handleHunterShoot();
    } else if (g.nightDayPhase === "day_nominate") {
      SFX.vote();
      socketRef.current.emit("action:nominationVote", { targetId: targetNow }, (res) => {
        if (res?.error) {
          flashActionFeedback(`⚠️ ${res.error}`);
          return;
        }
        triggerMyMicroChoreo("day_accuse_stand", targetNow, 2100);
        setHasActed(true);
        setSelectedId(null);
      });
    }
  }

  function handleWitch(save, poisonTargetId) {
    const savedVictimId = g.witchInfo?.victimId || null;
    socketRef.current.emit("action:witchDecide", { save, poisonTargetId }, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
        return;
      }
      if (poisonTargetId) {
        triggerMyMicroChoreo("witch_poison_throw", poisonTargetId, 3000);
      } else if (save && savedVictimId) {
        triggerMyMicroChoreo("witch_elixir_cast", savedVictimId, 2800);
      }
      setHasActed(true);
      setSelectedId(null);
    });
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

  // --- Computed: Action Banner ---
  const getActionBanner = () => {
    if ((!me?.alive && !isMyHunterRevenge) || g.winner) return null;
    const phase = g.nightDayPhase;
    if (isNight && !isMyTurn) return null; // đêm: chỉ hiện cho người đến lượt
    if (phase === 'night_witch') {
      return g.witchInfo?.victimId ? ACTION_BANNERS.night_witch : ACTION_BANNERS.night_witch_nd;
    }
    return ACTION_BANNERS[phase] || null;
  };
  const actionBanner = getActionBanner();

  // --- Computed: live Sói/Dân count (Zero-Leak & bao gồm cả Sói Đầu Đàn alpha_wolf) ---
  const alivePlayers = room.players.filter(p => p.alive);
  const canSeeExactWolves = isWolfTeamRole(me?.role) || Boolean(g.winner);
  const configuredWolfTotal = (g.roleCounts?.wolf || 0) + (g.roleCounts?.alpha_wolf || 0);
  const aliveWolfCount = canSeeExactWolves
    ? alivePlayers.filter(p => (p.id === me?.id && isWolfTeamRole(me?.role)) || g.wolfTeammates?.includes(p.id) || isWolfTeamRole(p.role)).length
    : Math.max(1, (configuredWolfTotal || 1) - (g.deadWolfCount || 0));
  const hasCursedMystery = !canSeeExactWolves && ((g.roleCounts?.cursed || 0) > 0 || (g.roleCounts?.alpha_wolf || 0) > 0);
  const aliveVillageCount = Math.max(0, alivePlayers.length - aliveWolfCount);

  const myLoverPartner = g.myLoverPartnerId
    ? room.players.find((p) => p.id === g.myLoverPartnerId) || null
    : null;
  const revealedMayorPlayer = g.mayorRevealedId
    ? room.players.find((p) => p.id === g.mayorRevealedId) || null
    : null;
  const fallenHunterPlayer = g.hunterPendingId
    ? room.players.find((p) => p.id === g.hunterPendingId) || null
    : null;

  // --- Computed: final vote tally (có tính trọng số phiếu x2 của Trưởng Làng đã lộ diện) ---
  const voteWeightOf = (voterId) => (g.mayorRevealedId && g.mayorRevealedId === voterId ? 2 : 1);
  const hangCount = g.finalVotes
    ? Object.entries(g.finalVotes).reduce((sum, [vid, v]) => sum + (v === 'hang' ? voteWeightOf(vid) : 0), 0)
    : 0;
  const spareCount = g.finalVotes
    ? Object.entries(g.finalVotes).reduce((sum, [vid, v]) => sum + (v === 'spare' ? voteWeightOf(vid) : 0), 0)
    : 0;
  const totalAlive = alivePlayers.length;
  const totalVotePool = totalAlive + (revealedMayorPlayer?.alive ? 1 : 0);
  const hangNeeded = Math.floor(totalVotePool / 2) + 1;
  const skipVoteCount = g.skipDiscussVotes ? Object.keys(g.skipDiscussVotes).length : 0;

  // --- Computed: Contextual Action cho cả nút nổi 3D [✓] lẫn Thanh Pill Kính Mờ sát đáy ---
  const selectedPlayer = room.players.find((p) => p.id === selectedId) || null;
  const selectedActionMeta = (() => {
    if ((!me?.alive && !isMyHunterRevenge) || g.winner || !selectedPlayer || !selectedPlayer.alive) return null;
    const phase = g.nightDayPhase;
    const clearFn = () => setSelectedId(null);

    if (phase === "hunter_revenge" && isMyHunterRevenge && !hasActed) {
      return {
        canConfirm: true,
        label: "🏹 Bắn Đạn Bạc",
        accent: "#e11d48",
        onConfirm: handleHunterShoot,
        onClear: clearFn,
      };
    }
    if (phase === "night_guard" && isMyTurn && !hasActed) {
      return { canConfirm: true, label: "🛡️ Bảo vệ", accent: "#2563eb", onConfirm: handleAction, onClear: clearFn };
    }
    if (phase === "night_wolf" && isMyTurn) {
      const isFellowWolf = selectedPlayer.id === me?.id || (g.wolfTeammates || []).includes(selectedPlayer.id);
      if (isFellowWolf) {
        return { canConfirm: false, invalidReason: "Không thể cắn đồng bọn Sói", onClear: clearFn };
      }
      return {
        canConfirm: true,
        label: g.alphaWolfInfo?.convertTonight ? "🩸 Đồng hóa" : "🐺 Cắn",
        accent: g.alphaWolfInfo?.convertTonight ? "#be123c" : "#dc2626",
        onConfirm: handleAction,
        onClear: clearFn,
      };
    }
    if (phase === "night_witch" && isMyTurn && !hasActed && !g.witchInfo?.usedPoison) {
      return {
        canConfirm: true,
        label: "☠️ Đầu độc",
        accent: "#7c3aed",
        onConfirm: () => handleWitch(false, selectedPlayer.id),
        onClear: clearFn,
      };
    }
    if (phase === "night_seer" && isMyTurn && !hasActed) {
      if (selectedPlayer.id === me?.id) {
        return { canConfirm: false, invalidReason: "Hãy chọn người khác để soi", onClear: clearFn };
      }
      return { canConfirm: true, label: "🔮 Soi", accent: "#4f46e5", onConfirm: handleAction, onClear: clearFn };
    }
    if (phase === "day_nominate") {
      if (selectedPlayer.id === me?.id) {
        return { canConfirm: false, invalidReason: "Không tự đề cử chính mình", onClear: clearFn };
      }
      return {
        canConfirm: true,
        label: hasActed ? "🗳️ Đổi đề cử" : "🗳️ Đề cử",
        accent: "#d97706",
        onConfirm: handleAction,
        onClear: clearFn,
      };
    }
    return null;
  })();

  const canRevealMayorNow =
    me?.role === "mayor" &&
    me?.alive &&
    !g.mayorRevealedId &&
    ["day_reveal", "day_discuss", "day_nominate", "day_defense", "day_final_vote"].includes(g.nightDayPhase);


  if (g.winner && !g.history) {
    return <div className="playing-view-container"><div className="waiting-text">Đang tải dữ liệu tổng kết...</div></div>;
  }

  const roleBgClass = isNight && me?.role ? `role-bg-${me.role}` : "";

  return (
    <div className={`playing-view-container ${isNight && !g.winner ? 'night-mode' : 'day-mode'} ${roleBgClass} ${g.winner && viewMode === '3d' ? 'replay-cinema-active' : ''}`}>
      <AmbientSound
        isNight={isNight}
        isTense={g.nightDayPhase === 'day_final_vote' || g.nightDayPhase === 'hunter_revenge'}
        enabled={mcVoiceEnabled}
      />
      
      {/* Top HUD bar */}
      <div className={`phase-header phase-${g.nightDayPhase ? g.nightDayPhase.split('_')[0] : 'default'}`}>
        <div className="hud-left">
          <HudGameClock gameStartedAt={g.gameStartedAt} />
          <h2 className="phase-title">{g.winner ? 'Trò Chơi Kết Thúc' : `Ngày ${g.dayNumber} — ${PHASE_LABELS[g.nightDayPhase] || g.nightDayPhase}`}</h2>
        </div>
        <div className="hud-center">
          <span className="role-badge">
            {ROLE_EMOJIS[me?.role]} {me?.role ? ROLE_LABELS[me.role] : 'Chết'}
          </span>
          {myLoverPartner && (
            <span
              className="role-badge"
              title={`Bạn được kết duyên sinh tử với ${myLoverPartner.name}. Nếu 1 người chết, người kia sẽ chết theo!`}
              style={{
                background: 'rgba(236, 72, 153, 0.22)',
                borderColor: 'rgba(244, 114, 182, 0.65)',
                color: '#fbcfe8',
              }}
            >
              💘 {myLoverPartner.name} {!myLoverPartner.alive ? '💀' : ''}
            </span>
          )}
          {revealedMayorPlayer && (
            <span
              className="role-badge"
              title={`Trưởng Làng ${revealedMayorPlayer.name} đã công bố Quyền Trượng (Lá phiếu x2)`}
              style={{
                background: 'rgba(245, 158, 11, 0.24)',
                borderColor: 'rgba(253, 224, 71, 0.72)',
                color: '#fef08a',
              }}
            >
              👑 {revealedMayorPlayer.id === me?.id ? 'Phiếu x2' : `${revealedMayorPlayer.name} (x2)`}
            </span>
          )}
          <HudPhaseCountdown
            phaseEndsAt={g.phaseEndsAt}
            isNight={isNight}
            isMyTurn={isMyTurn}
            hasWinner={Boolean(g.winner)}
          />
        </div>
        <div className="hud-right">
          {/* Nút Cam Mở Chế Độ Dựng Cảnh D5 Ngay Trong Trận (Chỉ hiện ở Dev/Localhost) */}
          {canOpenArchitect && (
            <button
              type="button"
              className="btn-mc-voice"
              onClick={() => {
                if (viewMode !== '3d') {
                  setViewMode('3d');
                  localStorage.setItem('ws_view_mode', '3d');
                }
                setOpenArchitectCounter((c) => c + 1);
              }}
              title="Mở công cụ sắp xếp ngoại cảnh kiểu D5 Render (3 Mũi tên + Scale X·Y·Z)"
              style={{
                width: 'auto',
                margin: 0,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                borderColor: '#fde047',
                color: '#0f172a',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.45)',
              }}
            >
              🏗️ Dựng Cảnh D5
            </button>
          )}

          {/* Công tắc chuyển tức thì 3D <-> 2D Lite (so sánh 1:1 & cứu máy yếu) */}
          <button
            type="button"
            className="btn-mc-voice"
            onClick={toggleViewMode}
            title="Chuyển đổi tức thì giữa Sân khấu 3D và Vòng tròn 2D cổ điển"
            style={{
              width: 'auto',
              margin: 0,
              fontWeight: 700,
              background: viewMode === '3d' ? 'rgba(245, 158, 11, 0.22)' : 'rgba(255,255,255,0.08)',
              borderColor: viewMode === '3d' ? 'rgba(245, 158, 11, 0.65)' : 'rgba(255,255,255,0.18)',
              color: viewMode === '3d' ? '#fde68a' : '#e2e8f0',
            }}
          >
            {viewMode === '3d' ? '🎮 3D' : '⚡ 2D'}
          </button>

          {/* Live Sói/Dân counter */}
          <div className="hud-score" title={hasCursedMystery ? 'Có vai Kẻ Bị Nguyền hoặc Sói Đầu Đàn trong ván (số Sói có thể tăng nếu đồng hóa)' : 'Số Sói vs Dân ước tính còn sống'}>
            <span className="hud-wolf">🐺 {aliveWolfCount}{hasCursedMystery ? '?' : ''}</span>
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
          {voicePregening && (
            <span
              title={`MC đang chuẩn bị giọng: ${voicePregenProgress.done}/${voicePregenProgress.total}`}
              style={{ fontSize: '0.7rem', color: '#facc15', whiteSpace: 'nowrap' }}
            >
              🎙️ {voicePregenProgress.done}/{voicePregenProgress.total}
            </span>
          )}
          {!voicePregening && mcVoiceEnabled && (
            <button
              type="button"
              onClick={() => onRecheckVoice?.()}
              title={
                vsServerOffline
                  ? 'Máy chủ giọng đọc cá nhân (VoiceStudio) đang tắt — tự động dùng bộ MP3 tĩnh & nhạc nền, 0% giọng tiếng Anh. Bấm để kiểm tra lại ngay!'
                  : 'Máy chủ Voice Clone cá nhân (RTX 3090) đang trực tuyến sẵn sàng — Bấm để làm mới trạng thái'
              }
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                color: vsServerOffline ? '#fecaca' : '#a7f3d0',
                background: vsServerOffline ? 'rgba(127, 29, 29, 0.42)' : 'rgba(6, 78, 59, 0.38)',
                border: vsServerOffline
                  ? '1px solid rgba(248, 113, 113, 0.5)'
                  : '1px solid rgba(52, 211, 153, 0.5)',
                borderRadius: '999px',
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {vsStatusChecking
                ? '⏳ Kiểm tra Voice...'
                : vsServerOffline
                  ? '🔴 Voice Offline (Bấm thử lại)'
                  : vsStatusReady
                    ? '🟢 Voice Clone Sẵn Sàng'
                    : '🟡 Đang kết nối Voice...'}
            </button>
          )}
          <FullscreenButton />
          {onLeave && (
            <button
              type="button"
              className="btn-mc-voice"
              onClick={() => {
                const realHumans = (room.players || []).filter((p) => !p.isBot).length;
                if (!g.winner && me?.alive && realHumans > 1) {
                  if (!window.confirm("Bạn muốn rời khỏi ván đấu đang diễn ra và về Sảnh chính?")) {
                    return;
                  }
                }
                onLeave();
              }}
              title="Rời phòng về Trang chủ danh sách phòng"
              style={{
                width: "auto",
                margin: 0,
                padding: "4px 10px",
                fontWeight: 700,
                fontSize: "0.78rem",
                background: "rgba(239, 68, 68, 0.18)",
                borderColor: "rgba(239, 68, 68, 0.45)",
                color: "#fca5a5",
              }}
            >
              🚪 Rời
            </button>
          )}
        </div>
      </div>

      {/* Timer progress bar (chuẩn hóa thời lượng từng phase, không re-render toàn trang) */}
      <HudPhaseProgressBar
        phaseEndsAt={g.phaseEndsAt}
        nightDayPhase={g.nightDayPhase}
        hasWinner={Boolean(g.winner)}
      />

      {/* Tab bar — chỉ hiện trên mobile portrait */}
      <div className="mobile-tab-bar">
        <button
          className={`tab-btn ${mobileTab === 'game' ? 'active' : ''}`}
          onClick={() => setMobileTab('game')}
        >
          🎮 Vòng Tròn
        </button>
        <button
          className={`tab-btn ${mobileTab === 'action' ? 'active' : ''}`}
          onClick={() => setMobileTab('action')}
        >
          🎭 Hành Động
        </button>
        <button
          className={`tab-btn ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => { setMobileTab('chat'); setUnreadCount(0); setNewMsgCount(0); }}
        >
          💬 Chat
          {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
        </button>
      </div>

      {/* Main 2-column layout (tự mở Full-Screen 100vw Không Gian 3D Thật khi g.winner & !showPostGameChat) */}
      <div
        className={`game-layout ${g.winner && viewMode === "3d" && !showPostGameChat ? "replay-fullscreen-mode" : ""}`}
        onTouchStart={e => { touchStartXRef.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (!touchStartXRef.current) return;
          const dx = e.changedTouches[0].clientX - touchStartXRef.current;
          if (Math.abs(dx) > 60) {
            const tabs = ['game', 'action', 'chat'];
            const cur = tabs.indexOf(mobileTab);
            if (dx < 0 && cur < tabs.length - 1) { const next = tabs[cur + 1]; setMobileTab(next); if (next === 'chat') { setUnreadCount(0); setNewMsgCount(0); } }
            else if (dx > 0 && cur > 0) { setMobileTab(tabs[cur - 1]); }
          }
          touchStartXRef.current = null;
        }}

      >
        
        {/* LEFT: 3D Stage (or 2D Lite fallback) + Floating Compact Glass Pill */}
        <div className={`game-left ${(mobileTab === 'game' || mobileTab === 'action') ? 'tab-active' : 'tab-hidden'} ${isNight ? 'bg-night' : 'bg-day'} ${mobileTab === 'action' ? 'action-tab-mode' : ''}`} style={{ position: 'relative' }}>
          {viewMode === '3d' ? (
            <>
              <Scene3DErrorBoundary
                onFallback2D={() => {
                  setViewMode("2d");
                  localStorage.setItem("ws_view_mode", "2d");
                }}
              >
                <Suspense
                  fallback={
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>
                      🎮 Đang khởi tạo sân khấu 3D...
                    </div>
                  }
                >
                  <WerewolfScene3D
                    players={room.players}
                    me={me}
                    phase={g.nightDayPhase}
                    isNight={isNight}
                    myRole={me?.role}
                    hasWinner={Boolean(g.winner)}
                    onSelectPlayer={handleSelectSeat}
                    selectedPlayerId={selectedId}
                    selectedActionMeta={selectedActionMeta}
                    wolfVictimId={g.witchInfo?.victimId}
                    wolfPicksVisible={g.wolfPicksVisible}
                    wolfChatLog={localBubbleChatLog}
                    seerLastResult={me?.role === "seer" ? g.seerLastResult : null}
                    nominationVotes={g.nominationVotes}
                    finalVotes={g.finalVotes}
                    defendantId={(g.nightDayPhase === "day_defense" || g.nightDayPhase === "day_final_vote") ? g.hotSeatQueue?.[g.hotSeatIndex] : null}
                    wolfTeammates={g.wolfTeammates || []}
                    alphaWolfId={g.alphaWolfInfo?.alphaWolfId || null}
                    mayorRevealedId={g.mayorRevealedId || null}
                    myLoverPartnerId={g.myLoverPartnerId || null}
                    hunterPendingId={g.hunterPendingId || null}
                    cupidSelectedIds={cupidTargets}
                    speakingIds={speakingIds}
                    reactions={reactions}
                    recapStageState={recapStageState}
                    liveMicroChoreo={liveMicroChoreo}
                    scenePresetId={room.scenePresetId}
                    externalOpenArchitectCounter={openArchitectCounter}
                  />
                </Suspense>
              </Scene3DErrorBoundary>
              {/* Spacer đẩy thanh Pill kính mờ xuống sát đáy sân khấu 3D */}
              <div style={{ flex: 1, pointerEvents: 'none' }} />
            </>
          ) : (
            <>
              <VillageBackdrop isNight={isNight} />
              <ParticleBackground isNight={isNight} />
              <PlayerCircle 
                players={room.players} 
                me={me}
                phase={g.nightDayPhase}
                myRole={me?.role}
                onSelectPlayer={handleSelectSeat}
                selectedPlayerId={selectedId}
                wolfVictimId={g.witchInfo?.victimId}
                nightDeaths={g.nightDeaths}
                wolfPicksVisible={g.wolfPicksVisible}
                wolfChatLog={localBubbleChatLog}
                seerLastResult={me?.role === "seer" ? g.seerLastResult : null}
                nominationVotes={g.nominationVotes}
                finalVotes={g.finalVotes}
                defendantId={(g.nightDayPhase === "day_defense" || g.nightDayPhase === "day_final_vote") ? g.hotSeatQueue?.[g.hotSeatIndex] : null}
                recapAnimation={recapAnimation}
                wolfTeammates={g.wolfTeammates || []}
                speakingIds={speakingIds}
                reactions={reactions}
              />
            </>
          )}

          {/* Nút tròn thả cảm xúc 😊 thu gọn ở góc dưới bên phải sân khấu */}
          {!g.winner && me?.alive && (
            <EmojiReactions socketRef={socketRef} myName={me?.name} />
          )}

          {/* Thanh Pill Kính Mờ 1 Hàng Ngang Siêu Gọn (Floating Glass Dock cho cả 3D & 2D + Thợ Săn bắn trả thù) */}
          {!g.winner && (me?.alive || isMyHunterRevenge) && (
            <div className="action-panel compact-floating-dock">
              {/* Popover Lịch sử Tiên Tri (chỉ mở khi bấm nút 🔮 Đã soi) */}
              {showSeerPopover && seerHistory.length > 0 && (
                <div className="seer-popover-card">
                  <div className="seer-popover-header">
                    <span>🔮 Lịch sử soi các đêm</span>
                    <button type="button" className="dock-icon-close" onClick={() => setShowSeerPopover(false)}>✕</button>
                  </div>
                  <div className="seer-popover-list">
                    {seerHistory.map((h, i) => (
                      <div key={i} className={`seer-history-row ${h.result === 'wolf' ? 'sh-wolf' : 'sh-human'}`}>
                        <span className="sh-day">Đêm {h.day}</span>
                        <span className="sh-name">{h.targetName}</span>
                        <span className="sh-result">{h.result === 'wolf' ? '🔴 SÓI' : '🔵 Tốt'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {actionFeedback ? (
                <span className="dock-hint dock-feedback">{actionFeedback}</span>
              ) : g.nightDayPhase === "hunter_revenge" ? (
                /* ================= PHÁP TRƯỜNG / BÌNH MINH: THỢ SĂN BẮN ĐẠN BẠC CUỐI CÙNG ================= */
                <div className="dock-row">
                  {isMyHunterRevenge ? (
                    hasActed ? (
                      <span className="dock-hint dock-done">🏹 Đã bóp cò viên đạn bạc cuối cùng!</span>
                    ) : selectedActionMeta?.canConfirm ? (
                      <>
                        <span className="dock-target-label">
                          🎯 <strong>{selectedPlayer?.name}</strong>
                        </span>
                        <button
                          type="button"
                          className="dock-btn dock-btn-confirm"
                          style={{ background: selectedActionMeta.accent }}
                          onClick={selectedActionMeta.onConfirm}
                        >
                          ✓ {selectedActionMeta.label}
                        </button>
                        <button type="button" className="dock-icon-close" onClick={selectedActionMeta.onClear} title="Bỏ chọn">
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className="dock-hint" style={{ color: '#fda4af' }}>
                        🏹 Hơi thở cuối! Click vào 1 người còn sống trên vòng ghế để bắn trả thù!
                      </span>
                    )
                  ) : (
                    <span className="dock-hint" style={{ color: '#fda4af' }}>
                      🏹 Thợ Săn <strong>{fallenHunterPlayer?.name || ''}</strong> đang giương nỏ ngắm bắn viên đạn bạc cuối cùng...
                    </span>
                  )}
                </div>
              ) : isNight ? (
                /* ================= BAN ĐÊM ================= */
                isMyTurn ? (
                  hasActed && g.nightDayPhase !== "night_wolf" ? (
                    <div className="dock-row">
                      <span className="dock-hint dock-done">✅ Đã ghi nhận lựa chọn! Chờ qua lượt...</span>
                      {g.nightDayPhase === "night_seer" && g.seerLastResult && (
                        <span className={`dock-chip ${g.seerLastResult.result === 'wolf' ? 'chip-danger' : 'chip-info'}`}>
                          {g.seerLastResult.result === 'wolf' ? '🔴 SÓI!' : '🔵 Người tốt'}
                        </span>
                      )}
                      {me?.role === "seer" && seerHistory.length > 0 && (
                        <button
                          type="button"
                          className="dock-btn dock-btn-ghost"
                          onClick={() => setShowSeerPopover((v) => !v)}
                        >
                          🔮 Đã soi ({seerHistory.length})
                        </button>
                      )}
                    </div>
                  ) : g.nightDayPhase === "night_cupid" ? (
                    /* Đêm 1: Thần Tình Yêu chọn 2 người để kết duyên */
                    <div className="dock-row">
                      {cupidTargets.length === 0 ? (
                        <span className="dock-hint">
                          💘 Đêm đầu tiên: Click chọn <strong>2 người</strong> trên vòng ghế để ghép đôi sinh tử!
                        </span>
                      ) : (
                        <>
                          {cupidTargets.map((tid, idx) => {
                            const tp = room.players.find((p) => p.id === tid);
                            return (
                              <span
                                key={tid}
                                className="dock-chip"
                                style={{
                                  background: 'rgba(236, 72, 153, 0.24)',
                                  border: '1px solid rgba(244, 114, 182, 0.65)',
                                  color: '#fbcfe8',
                                }}
                              >
                                💘 #{idx + 1}: {tp?.name || tid}
                              </span>
                            );
                          })}
                          {cupidTargets.length === 2 ? (
                            <button
                              type="button"
                              className="dock-btn dock-btn-confirm"
                              style={{ background: 'linear-gradient(135deg, #ec4899, #db2777)' }}
                              onClick={handleCupidConfirm}
                            >
                              💘 Kết Duyên Sinh Tử
                            </button>
                          ) : (
                            <span className="dock-hint">Chọn thêm 1 người nữa...</span>
                          )}
                          <button
                            type="button"
                            className="dock-icon-close"
                            onClick={() => setCupidTargets([])}
                            title="Chọn lại"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  ) : g.nightDayPhase === "night_witch" ? (
                    <div className="dock-row">
                      <span className="dock-hint">
                        {g.witchInfo?.victimId ? "🩸 Có người bị cắn!" : "😮‍💨 Không ai bị cắn"}
                      </span>
                      {g.witchInfo?.victimId && (
                        <button
                          type="button"
                          className="dock-btn dock-btn-save"
                          disabled={g.witchInfo?.usedSave}
                          onClick={() => handleWitch(true, null)}
                          title={g.witchInfo?.usedSave ? "Đã dùng bình cứu" : "Cứu nạn nhân đêm nay"}
                        >
                          💚 {g.witchInfo?.usedSave ? "Hết cứu" : "Cứu"}
                        </button>
                      )}
                      {!g.witchInfo?.usedPoison ? (
                        selectedPlayer?.alive ? (
                          <button
                            type="button"
                            className="dock-btn dock-btn-poison"
                            onClick={() => handleWitch(false, selectedPlayer.id)}
                          >
                            ☠️ Độc {selectedPlayer.name}
                          </button>
                        ) : (
                          <span className="dock-chip">☠️ Click ghế để độc</span>
                        )
                      ) : (
                        <span className="dock-chip chip-muted">☠️ Hết độc</span>
                      )}
                      <button
                        type="button"
                        className="dock-btn dock-btn-ghost"
                        onClick={() => handleWitch(false, null)}
                      >
                        ⏭️ Bỏ qua
                      </button>
                    </div>
                  ) : (
                    /* Lượt Bảo Vệ / Sói (+ Sói Đầu Đàn) / Tiên Tri */
                    <div className="dock-row">
                      {selectedActionMeta?.canConfirm ? (
                        <>
                          <span className="dock-target-label">
                            🎯 <strong>{selectedPlayer?.name}</strong>
                          </span>
                          <button
                            type="button"
                            className="dock-btn dock-btn-confirm"
                            style={{ background: selectedActionMeta.accent }}
                            onClick={selectedActionMeta.onConfirm}
                          >
                            ✓ {selectedActionMeta.label}
                          </button>
                          <button
                            type="button"
                            className="dock-icon-close"
                            onClick={selectedActionMeta.onClear}
                            title="Bỏ chọn"
                          >
                            ✕
                          </button>
                        </>
                      ) : selectedActionMeta?.invalidReason ? (
                        <>
                          <span className="dock-hint dock-warn">⚠️ {selectedActionMeta.invalidReason}</span>
                          <button type="button" className="dock-icon-close" onClick={selectedActionMeta.onClear}>✕</button>
                        </>
                      ) : (
                        <span className="dock-hint">
                          {actionBanner ? `${actionBanner.icon} ${actionBanner.text}` : "Chọn 1 người trên vòng ghế"}
                        </span>
                      )}

                      {g.nightDayPhase === "night_wolf" && me?.role === "alpha_wolf" && (
                        g.alphaWolfInfo?.usedConvert ? (
                          <span className="dock-chip chip-muted" title="Đã dùng quyền Huyết Nguyệt trong ván này">
                            🩸 Hết Đồng Hóa
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="dock-btn"
                            onClick={handleAlphaToggle}
                            title="1 lần/ván: Biến con mồi bị bầy Sói cắn đêm nay thành Ma Sói thay vì giết chết"
                            style={{
                              background: g.alphaWolfInfo?.convertTonight
                                ? 'linear-gradient(135deg, #e11d48, #9f1239)'
                                : 'rgba(159, 18, 57, 0.25)',
                              border: g.alphaWolfInfo?.convertTonight
                                ? '1px solid #fda4af'
                                : '1px solid rgba(244, 63, 94, 0.5)',
                              color: '#ffe4e6',
                              fontWeight: 800,
                              boxShadow: g.alphaWolfInfo?.convertTonight
                                ? '0 0 14px rgba(225, 29, 72, 0.55)'
                                : 'none',
                            }}
                          >
                            {g.alphaWolfInfo?.convertTonight ? '🩸 Huyết Nguyệt: BẬT' : '🩸 Đồng Hóa (1 lần)'}
                          </button>
                        )
                      )}

                      {me?.role === "seer" && seerHistory.length > 0 && (
                        <button
                          type="button"
                          className="dock-btn dock-btn-ghost"
                          onClick={() => setShowSeerPopover((v) => !v)}
                        >
                          🔮 Đã soi ({seerHistory.length})
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <span className="dock-hint dock-muted">🌙 Màn đêm tĩnh lặng — bạn đang ngủ...</span>
                )
              ) : (
                /* ================= BAN NGÀY ================= */
                <div className="dock-row">
                  {g.nightDayPhase === "day_discuss" && (
                    <>
                      <span className="dock-hint">💬 Thảo luận tìm Sói</span>
                      <button
                        type="button"
                        className="dock-btn dock-btn-ghost"
                        onClick={() => socketRef.current.emit("action:voteExtendDiscussion", { wantExtend: true })}
                      >
                        ⏱️ +2 Phút
                      </button>
                      <button
                        type="button"
                        className={`dock-btn dock-btn-warn ${mySkipVote ? "active" : ""}`}
                        onClick={() => {
                          socketRef.current.emit("action:skipDiscussion", {}, (res) => {
                            if (res?.ok) setMySkipVote((prev) => !prev);
                          });
                        }}
                      >
                        {mySkipVote ? "⏭️ Rút bỏ qua" : "⏭️ Bỏ qua"} ({skipVoteCount}/{totalAlive})
                      </button>
                    </>
                  )}

                  {g.nightDayPhase === "day_nominate" && (
                    selectedActionMeta?.canConfirm ? (
                      <>
                        <span className="dock-target-label">
                          🎯 <strong>{selectedPlayer?.name}</strong>
                        </span>
                        <button
                          type="button"
                          className="dock-btn dock-btn-confirm"
                          style={{ background: selectedActionMeta.accent }}
                          onClick={selectedActionMeta.onConfirm}
                        >
                          ✓ {selectedActionMeta.label}
                        </button>
                        <button type="button" className="dock-icon-close" onClick={selectedActionMeta.onClear} title="Bỏ chọn">
                          ✕
                        </button>
                      </>
                    ) : selectedActionMeta?.invalidReason ? (
                      <>
                        <span className="dock-hint dock-warn">⚠️ {selectedActionMeta.invalidReason}</span>
                        <button type="button" className="dock-icon-close" onClick={selectedActionMeta.onClear}>✕</button>
                      </>
                    ) : (
                      <span className="dock-hint">
                        {hasActed
                          ? "✅ Đã đề cử (click ghế khác nếu muốn đổi phiếu)"
                          : "🗳️ Click vào người đáng nghi trên vòng ghế để đề cử"}
                      </span>
                    )
                  )}

                  {g.nightDayPhase === "day_final_vote" && (
                    <>
                      <span className="dock-target-label">
                        ⚖️ <strong>{room.players.find((p) => p.id === g.hotSeatQueue?.[g.hotSeatIndex])?.name}</strong>:
                      </span>
                      <button
                        type="button"
                        className={`dock-btn dock-btn-kill ${g.finalVotes?.[me.id] === "hang" ? "voted-active" : g.finalVotes?.[me.id] ? "voted-dim" : ""}`}
                        disabled={Boolean(g.finalVotes?.[me.id])}
                        onClick={() => {
                          SFX.vote();
                          const defNow = g.hotSeatQueue?.[g.hotSeatIndex] || null;
                          socketRef.current.emit("action:finalVote", { decision: "hang" }, (res) => {
                            if (!res?.error) {
                              triggerMyMicroChoreo("tribunal_torch_stand", defNow, 2600);
                            }
                            setHasActed(true);
                          });
                        }}
                      >
                        🪢 Treo ({hangCount})
                      </button>
                      <button
                        type="button"
                        className={`dock-btn dock-btn-save ${g.finalVotes?.[me.id] === "spare" ? "voted-active" : g.finalVotes?.[me.id] ? "voted-dim" : ""}`}
                        disabled={Boolean(g.finalVotes?.[me.id])}
                        onClick={() => {
                          SFX.vote();
                          socketRef.current.emit("action:finalVote", { decision: "spare" }, () => setHasActed(true));
                        }}
                      >
                        🕊️ Tha ({spareCount})
                      </button>
                      <span className="dock-chip">
                        {hangCount >= hangNeeded ? "🪢 Đủ phiếu!" : `Cần ${hangNeeded} Treo`}
                      </span>
                    </>
                  )}

                  {(g.nightDayPhase === "day_reveal" ||
                    g.nightDayPhase === "day_defense" ||
                    g.nightDayPhase === "day_no_nomination") && (
                    <span className="dock-hint">
                      {actionBanner ? `${actionBanner.icon} ${actionBanner.text}` : ""}
                    </span>
                  )}

                  {canRevealMayorNow && (
                    <button
                      type="button"
                      className="dock-btn"
                      onClick={handleMayorReveal}
                      title="Lộ diện Trưởng Làng vĩnh viễn và nhân đôi (x2) sức nặng lá phiếu của bạn!"
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b, #b45309)',
                        border: '1px solid #fde047',
                        color: '#fffbeb',
                        fontWeight: 800,
                        boxShadow: '0 2px 12px rgba(245, 158, 11, 0.45)',
                      }}
                    >
                      👑 Công Bố Quyền Trượng (x2)
                    </button>
                  )}

                  {me?.role === "seer" && seerHistory.length > 0 && (
                    <button
                      type="button"
                      className="dock-btn dock-btn-ghost"
                      onClick={() => setShowSeerPopover((v) => !v)}
                    >
                      🔮 ({seerHistory.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Chat + Voice */}
        <div className={`game-right ${mobileTab === 'chat' ? 'tab-active' : 'tab-hidden'}`}>
          {!g.winner && (
            <VoiceRoom 
              socketRef={socketRef} 
              isNight={isNight} 
              myRole={isWolfTeamRole(me?.role) ? "wolf" : me?.role} 
              isAlive={me?.alive}
              myId={me?.id}
              wolfTeammates={g.wolfTeammates || []} 
              onSpeakingChange={handleSpeakingChange}
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
                    <div className={`chat-mc-bubble ${msg.text?.includes('không qua khỏi') || msg.text?.includes('treo cổ') || msg.text?.includes('bắn gục') || msg.text?.includes('quyên sinh') ? 'mc-death' : ''} ${msg.text?.includes('chiến thắng') ? 'mc-win' : ''}`}>
                      <span className="chat-mc-icon">
                        {msg.text?.includes('bắn gục') ? '🏹' :
                         msg.text?.includes('quyên sinh') ? '💔' :
                         msg.text?.includes('Quyền Trượng') ? '👑' :
                         msg.text?.includes('không qua khỏi') || msg.text?.includes('treo cổ') ? '💀' :
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
              {isNight && isWolfTeamRole(me?.role) && me?.alive && (
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


      {/* EndGame Replay Không Gian Thật 100vw: Phát lại băng ghi hình tương tác thật bằng Nhân vật thật + Khung Ngắm Máy Quay */}
      {g.winner && g.history && (
        <EndGameRecap 
          history={g.history} 
          replayTimeline={g.replayTimeline || []}
          awards={g.awards || []}
          isHost={me?.isHost} 
          onRestart={() => socketRef.current.emit("room:restart")}
          onAnimate={setRecapAnimation}
          onStageChange={setRecapStageState}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          showPostGameChat={showPostGameChat}
          onTogglePostGameChat={() => setShowPostGameChat((v) => !v)}
          players={room.players}
          winner={g.winner}
          loversPublic={g.loversPublic || []}
          mcVoiceEnabled={mcVoiceEnabled}
          vsServerOffline={vsServerOffline}
          vsStatusChecking={vsStatusChecking}
          onRecheckVoice={onRecheckVoice}
          voiceRecheckTick={voiceRecheckTick}
        />
      )}
      
      {/* Tutorial 3 bước — overlay khi game bắt đầu (tự ẩn khi ván kết thúc) */}
      {tutorialStep > 0 && me?.role && !g.winner && (
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
                <p className="tutorial-team">Phe: {isWolfTeamRole(me.role) ? '🐺 Sói' : me.role === 'tanner' ? '💀 Trung Lập' : '👥 Dân Làng'}</p>
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

      {/* Dead Player — Spectator overlay (tự ẩn ngay khi kết game để nhường chỗ Rạp Chiếu 3D!) */}
      {showDeadOverlay && !g.winner && (
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

      {/* Spectator banner — sticky khi đang xem sau khi chết (ẩn trong lúc Thợ Săn đang gồng bắn trả thù) */}
      {me && !me.alive && !isMyHunterRevenge && !showDeadOverlay && !g.winner && (
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

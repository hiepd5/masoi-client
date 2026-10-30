import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import PlayerCircle from "./PlayerCircle.jsx";
import RolePortrait from "./RolePortrait.jsx";
import EndGameRecap from "./EndGameRecap.jsx";
import VoiceRoom, { VoiceQuickMicPill } from "./VoiceRoom.jsx";
import FullscreenButton from "./FullscreenButton.jsx";
import ParticleBackground from "./ParticleBackground.jsx";
import AmbientSound from "./AmbientSound.jsx";
import { SFX } from "./SFX.js";
import EmojiReactions from "./EmojiReactions.jsx";
import { HudGameClock, HudPhaseCountdown, HudPhaseProgressBar } from "./HudTimer.jsx";
import { safeHaptic } from "../utils/hapticsAndSound.js";
import { useBotVoicePlayer } from "../utils/botVoicePlayer.js";
import { SUSPECT_TAG_META } from "../3d/components/SeatHudBatchOverlay.jsx";

import { ROLE_LABELS, ROLE_EMOJIS, ROLE_DESCRIPTIONS, isWolfTeamRole } from '../config/roles.config.js';
import {
  sanitizeUniverseId,
  getUniverseTheme,
  getUniverseRoleLabel,
  getUniverseRoleEmoji,
  getUniverseRoleDescription,
} from '../config/universeThemes.config.js';
import StealthCamouflageOverlay, { BossKeyTriggerButton } from './StealthCamouflageOverlay.jsx';
import VillageBackdrop from './VillageBackdrop.jsx';
import Scene3DErrorBoundary from '../3d/components/Scene3DErrorBoundary.jsx';
import { isDevArchitectAllowed } from '../3d/editor/defaultVillageLayout.js';

const WerewolfScene3D = lazy(() => import("../3d/scene/WerewolfScene3D.jsx"));

const EMPTY_ARRAY = Object.freeze([]);


const PHASE_LABELS = {
  role_reveal: '🎭 Nhận Vai Định Mệnh',
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
  role_reveal:     { icon:'🎭', color:'#eab308', text:'Ghi nhớ kỹ thân phận bí mật của bạn trước khi màn đêm đầu tiên buông xuống!' },
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

const QUICK_DEBATE_CHIPS = [
  "🛡️ Mình là Dân chuẩn!",
  "🔮 Chức năng tối qua báo tin đi!",
  "🐺 Ghế này lập luận mâu thuẫn quá!",
  "🗳️ Gom phiếu đưa lên ghế nóng thử!",
  "⏳ Bình tĩnh nghe biện hộ kỹ đã!",
];


export default function PlayingView({
  room,
  socketRef,
  mcLog,
  mcVoiceEnabled,
  setMcVoiceEnabled,
  onToggleStealthHeadphones = null,
  onLeave = null,
  onExitRecapToLobby = null,
  voicePregening = false,
  voicePregenProgress = { done: 0, total: 0 },
  vsServerOffline = false,
  vsStatusReady = false,
  vsStatusChecking = false,
  onRecheckVoice = null,
  voiceRecheckTick = 0,
  voiceSpeakingIds = EMPTY_ARRAY,
  isMcSpeakingNow = false,
  botVoiceEnabled = true,
  onToggleBotVoice = null,
  mcPacingMode = "full",
  canToggleMcPacing = false,
  onToggleMcPacing = null,
}) {
  const g = room.game;
  const universeId = sanitizeUniverseId(room?.universeId);
  const uTheme = getUniverseTheme(universeId);
  const phaseLabels = uTheme.phaseLabels || PHASE_LABELS;
  const actionBanners = uTheme.actionBanners || ACTION_BANNERS;
  const quickDebateChips = uTheme.quickDebateChips || QUICK_DEBATE_CHIPS;
  const voteLabels = uTheme.voteLabels || {};
  const roleLabelOf = (rk) => getUniverseRoleLabel(rk, universeId);
  const roleEmojiOf = (rk) => getUniverseRoleEmoji(rk, universeId);
  const roleDescOf = (rk) => getUniverseRoleDescription(rk, universeId);
  const isSpectator = Boolean(room.isSpectator);
  // Dùng playerId ổn định (không thay đổi khi reconnect), kèm fallback sessionToken sống từ room.players
  const myPlayerId = sessionStorage.getItem("ws_playerId") || socketRef.current.id;
  const me = isSpectator
    ? null
    : room.players.find((p) => p.id === myPlayerId) ||
      room.players.find((p) => p.sessionToken);
  const liveSessionToken =
    room.freshSessionToken ||
    (isSpectator ? room.spectatorSessionToken || "" : me?.sessionToken || "");
  
  const [selectedId, setSelectedId] = useState(null);
  const [cupidTargets, setCupidTargets] = useState([]);
  const [wolfChatInput, setWolfChatInput] = useState("");
  const [villageChatInput, setVillageChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState("village");
  const [ghostChatLog, setGhostChatLog] = useState([]);
  const [ghostChatInput, setGhostChatInput] = useState("");
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
  // Thẻ Ghi Chú Suy Luận Cá Nhân 1-Chạm (100% Local State — Zero-Leak) & Tắt tiếng / Báo cáo văn minh
  const [suspectTags, setSuspectTags] = useState({});
  const [mutedSenderIds, setMutedSenderIds] = useState({});
  const [didActOrVoteInMatch, setDidActOrVoteInMatch] = useState(false);
  const quickChipLastSentRef = useRef(0);

  useEffect(() => {
    setSuspectTags({});
    setDidActOrVoteInMatch(false);
    setChatLog([]);
    setGhostChatLog([]);
    setChatChannel("village");
    setSeerHistory([]);
    setShowSeerPopover(false);
    setShowDeadOverlay(false);
    setShowPostGameChat(false);
    setSelectedId(null);
    setCupidTargets([]);
    setHasActed(false);
    setMySkipVote(false);
    setActionFeedback("");
    setLocalBubbleChatLog({});
    setUnreadCount(0);
    setNewMsgCount(0);
    prevAliveRef.current = true;
    prevIsNightRef.current = null;
  }, [g.gameStartedAt]);

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

  const hasBotsInMatch = useMemo(
    () => Boolean((room?.players || []).some((p) => p.isBot)),
    [room?.players]
  );
  const currentPhaseTagRef = useRef(g.nightDayPhase);
  currentPhaseTagRef.current = g.nightDayPhase;

  const { enqueueBotVoice, activeBotSpeakingId } = useBotVoicePlayer({
    enabled: botVoiceEnabled && hasBotsInMatch,
    isMcSpeakingNow,
    humanSpeakingIds: voiceSpeakingIds,
    activePhase: g.nightDayPhase,
    hasWinner: Boolean(g.winner),
    mutedSenderIds,
  });

  const effectiveSpeakingIds = useMemo(() => {
    if (g.winner) return EMPTY_ARRAY;
    const base = voiceSpeakingIds.length > 0 ? voiceSpeakingIds : speakingIds;
    if (!activeBotSpeakingId) return base;
    if (base.includes(activeBotSpeakingId)) return base;
    return [...base, activeBotSpeakingId];
  }, [g.winner, voiceSpeakingIds, speakingIds, activeBotSpeakingId]);
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

  // Tutorial 3 bước — chỉ tự bật ở Ván Đầu Tiên của người chơi mới (từ ván thứ 2 tắt tự động để không che mất 20s Đêm 1!)
  useEffect(() => {
    if (
      me?.role &&
      g.dayNumber === 1 &&
      !localStorage.getItem("ws_tutorial_done") &&
      (g.nightDayPhase === "role_reveal" ||
        g.nightDayPhase === "night_cupid" ||
        g.nightDayPhase === "night_guard")
    ) {
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
          // Tự sang bước tiếp hoặc đánh dấu hoàn thành & ẩn
          setTutorialStep(prev => {
            if (prev >= 3) {
              try { localStorage.setItem("ws_tutorial_done", "1"); } catch {}
              return 0;
            }
            return prev + 1;
          });
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
    if (isSpectator) return;
    const isAliveOrHoldingBreath = me?.alive !== false || isMyHunterRevenge;
    if (prevAliveRef.current === true && !isAliveOrHoldingBreath && !g.winner) {
      setShowDeadOverlay(true);
    }
    if (me?.alive) {
      setChatChannel("village");
    }
    prevAliveRef.current = isAliveOrHoldingBreath ?? true;
  }, [isSpectator, me?.alive, isMyHunterRevenge, g.winner]);

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

  const [showHudSettings, setShowHudSettings] = useState(false);
  const hudSettingsRef = useRef(null);
  useEffect(() => {
    if (!showHudSettings) return undefined;
    const onPointerDownOutside = (e) => {
      if (hudSettingsRef.current && !hudSettingsRef.current.contains(e.target)) {
        setShowHudSettings(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => document.removeEventListener("pointerdown", onPointerDownOutside);
  }, [showHudSettings]);

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

  // Chốt #7: Rung xúc giác 100% Zero-Leak — tuyệt đối CẤM rung khi bị cắn/độc đêm, chỉ rung khi tới lượt mình hoặc đồng loạt toàn bàn!
  useEffect(() => {
    if (isSpectator || g.winner) return;
    if (isMyTurn && (me?.alive || isMyHunterRevenge)) {
      safeHaptic("my_turn");
    } else if (g.nightDayPhase === "day_reveal") {
      safeHaptic("dawn_reveal");
    } else if (g.nightDayPhase === "day_final_vote" || g.nightDayPhase === "hunter_revenge") {
      safeHaptic("tribunal");
    }
  }, [g.nightDayPhase, isMyTurn, isSpectator, g.winner, me?.alive, isMyHunterRevenge]);

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
    const handleVillageChat = ({
      senderId,
      senderName,
      message,
      botAudioUrl,
      durationMs,
    }) => {
      // Speech bubble overlay on player avatar (giữ lâu khớp thời lượng giọng đọc của AI Bot nếu có)
      const bubbleDuration = botAudioUrl
        ? Math.min(9500, Math.max(5200, (Number(durationMs) || 6000) + 1200))
        : 4000;
      setLocalBubbleChatLog((prev) => ({ ...prev, [senderId]: message }));
      setTimeout(() => {
        setLocalBubbleChatLog((prev) => {
          if (prev[senderId] !== message) return prev;
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      }, bubbleDuration);
      if (botAudioUrl) {
        enqueueBotVoice({
          senderId,
          botAudioUrl,
          phaseTag: currentPhaseTagRef.current,
          isWhisper: false,
        });
      }
      // Push to unified chat log
      setChatLog((prev) => [
        ...prev,
        {
          type: "village",
          senderId,
          senderName,
          text: message,
          time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    };

    const handleWolfChat = ({ senderId, senderName, message, botAudioUrl, durationMs }) => {
      const bubbleDuration = botAudioUrl
        ? Math.min(8500, Math.max(4800, (Number(durationMs) || 4800) + 1000))
        : 4000;
      // Speech bubble overlay on player avatar
      setLocalBubbleChatLog((prev) => ({ ...prev, [senderId]: message }));
      setTimeout(() => {
        setLocalBubbleChatLog((prev) => {
          if (prev[senderId] !== message) return prev;
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      }, bubbleDuration);
      if (botAudioUrl) {
        enqueueBotVoice({
          senderId,
          botAudioUrl,
          phaseTag: currentPhaseTagRef.current,
          isWhisper: true,
        });
      }
      // Push to unified chat log
      const sender = room.players.find((p) => p.id === senderId);
      setChatLog((prev) => [
        ...prev,
        {
          type: "wolf",
          senderId,
          senderName: senderName || sender?.name || "Sói",
          text: message,
          time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    };

    const handleGhostChat = ({ senderId, senderName, message }) => {
      setGhostChatLog((prev) => [
        ...prev,
        {
          type: "ghost",
          senderId,
          senderName: senderName || "Linh Hồn",
          text: message,
          time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    socketRef.current.on("wolf:chat", handleWolfChat);
    socketRef.current.on("village:chat", handleVillageChat);
    socketRef.current.on("ghost:chat", handleGhostChat);
    return () => {
      socketRef.current.off("wolf:chat", handleWolfChat);
      socketRef.current.off("village:chat", handleVillageChat);
      socketRef.current.off("ghost:chat", handleGhostChat);
    };
  }, [socketRef, room.players, enqueueBotVoice]);

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

  // Đồng bộ cờ tắt tiếng & chủ đề âm thanh SFX theo Vũ trụ hiện tại
  useEffect(() => {
    SFX.setMuted(!mcVoiceEnabled);
    SFX.setUniverse(universeId);
  }, [mcVoiceEnabled, universeId]);

  // SFX: death / win sounds triggered by chatLog / winner changes
  useEffect(() => {
    if (chatLog.length === 0) return;
    const last = chatLog[chatLog.length - 1];
    if (last?.type === 'death') SFX.death();
  }, [chatLog]);

  useEffect(() => {
    if (!g.winner) return;
    if (g.winner === "wolf") SFX.winWolf();
    else SFX.winVillage();
  }, [g.winner]);

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
    if (isSpectator) return;
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
        flashActionFeedback(
          universeId === "office"
            ? "👑 Đã BẬT Thẻ VIP: Nhân sự bị nhắm tối nay sẽ gia nhập phe Sếp!"
            : universeId === "school"
              ? "🕶️ Đã BẬT Tuyển Ngầm: Bạn bị nhắm tối nay sẽ đeo băng đỏ nhập phe Giáo Viên!"
              : "🩸 Đã BẬT Huyết Nguyệt: Con mồi đêm nay sẽ hóa thành Sói!"
        );
      } else {
        flashActionFeedback(
          universeId === "office"
            ? "👔 Đã tắt Thẻ VIP — quay về chế độ đóng mộc cắt KPI thông thường."
            : universeId === "school"
              ? "👩‍🏫 Đã tắt Tuyển Ngầm — quay về chế độ gõ thước ghi Sổ Đầu Bài."
              : "🐺 Đã tắt Huyết Nguyệt — chuyển về cắn hạ sát bình thường."
        );
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
      flashActionFeedback(
        universeId === "office"
          ? "🏅 Đã công bố Cúp Chủ Tịch Công Đoàn — Mọi lá phiếu từ nay tính x2!"
          : universeId === "school"
            ? "⭐ Đã công bố Sao Lớp Trưởng — Mọi lá phiếu biểu quyết từ nay tính x2!"
            : "👑 Đã công bố Quyền Trượng Trưởng Làng — Mọi lá phiếu x2!"
      );
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
    setDidActOrVoteInMatch(true);

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
    socketRef.current.emit("action:witchDecide", { save, poisonTargetId, pass: true }, (res) => {
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

  function handleRoleRevealReady() {
    SFX.select();
    socketRef.current.emit("action:roleRevealReady", {}, () => {
      setHasActed(true);
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

  function handleQuickDebateChip(phrase) {
    if (!phrase || !me?.id || !me?.alive || isNight || isSpectator) return;
    const now = Date.now();
    if (now - quickChipLastSentRef.current < 1800) {
      setVillageChatInput(phrase);
      return;
    }
    quickChipLastSentRef.current = now;
    socketRef.current.emit("action:villageChat", { message: phrase });
    setLocalBubbleChatLog((prev) => ({ ...prev, [me.id]: phrase }));
    setTimeout(() => {
      setLocalBubbleChatLog((prev) => {
        const next = { ...prev };
        delete next[me.id];
        return next;
      });
    }, 4000);
  }

  function handleToggleSuspectTag(targetPlayerId, tagKey) {
    if (!targetPlayerId || targetPlayerId === me?.id) return;
    safeHaptic("ui_tap");
    setSuspectTags((prev) => {
      const next = { ...prev };
      if (!tagKey || next[targetPlayerId] === tagKey) {
        delete next[targetPlayerId];
      } else {
        next[targetPlayerId] = tagKey;
      }
      return next;
    });
  }

  function handleToggleMuteSender(senderId, senderName) {
    if (!senderId || senderId === me?.id) return;
    setMutedSenderIds((prev) => {
      const next = { ...prev };
      const willMute = !next[senderId];
      if (willMute) next[senderId] = true;
      else delete next[senderId];
      flashActionFeedback(
        willMute
          ? `🔇 Đã ẩn tin nhắn của ${senderName || "người chơi"} trong ván này.`
          : `🔊 Đã bật lại tin nhắn của ${senderName || "người chơi"}.`
      );
      return next;
    });
  }

  function handleReportPlayer(targetId, targetName) {
    if (!targetId || targetId === me?.id) return;
    socketRef.current.emit(
      "player:report",
      { targetId, targetName, reason: "Ngôn từ thiếu văn minh trong ván đấu" },
      (res) => {
        if (res?.ok) {
          setMutedSenderIds((prev) => ({ ...prev, [targetId]: true }));
          flashActionFeedback(`🚩 Đã ghi nhận báo cáo & tự động ẩn chat của ${targetName || "người chơi"}.`);
        } else {
          flashActionFeedback(`⚠️ ${res?.error || "Không thể gửi báo cáo lúc này."}`);
        }
      }
    );
  }

  function handleVillageChat(e) {
    e.preventDefault();
    if (!villageChatInput.trim() || !me?.id) return;
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

  function handleGhostChat(e) {
    e.preventDefault();
    const clean = ghostChatInput.trim();
    if (!clean || isSpectator || me?.alive) return;
    socketRef.current.emit("action:ghostChat", { message: clean }, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
      }
    });
    setGhostChatInput("");
  }

  function handleGhostBet(team) {
    if (isSpectator || me?.alive || g.winner) return;
    SFX.select();
    socketRef.current.emit("action:ghostBet", { team }, (res) => {
      if (res?.error) {
        flashActionFeedback(`⚠️ ${res.error}`);
      }
    });
  }

  // --- Computed: Action Banner ---
  const getActionBanner = () => {
    if ((!me?.alive && !isMyHunterRevenge) || g.winner) return null;
    const phase = g.nightDayPhase;
    if (isNight && !isMyTurn) return null; // đêm: chỉ hiện cho người đến lượt
    if (phase === 'night_witch') {
      return g.witchInfo?.victimId ? actionBanners.night_witch : actionBanners.night_witch_nd;
    }
    return actionBanners[phase] || null;
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
        label:
          universeId === "office"
            ? "📁 Tung Email CC"
            : universeId === "school"
              ? "📢 Thưa Cô!"
              : "🏹 Bắn Đạn Bạc",
        accent: "#e11d48",
        onConfirm: handleHunterShoot,
        onClear: clearFn,
      };
    }
    if (phase === "night_guard" && isMyTurn && !hasActed) {
      return {
        canConfirm: true,
        label:
          universeId === "office"
            ? "🛡️ Bảo lãnh KPI"
            : universeId === "school"
              ? "🙋 Đỡ lời"
              : "🛡️ Bảo vệ",
        accent: "#2563eb",
        onConfirm: handleAction,
        onClear: clearFn,
      };
    }
    if (phase === "night_wolf" && isMyTurn) {
      const isFellowWolf = selectedPlayer.id === me?.id || (g.wolfTeammates || []).includes(selectedPlayer.id);
      if (isFellowWolf) {
        return {
          canConfirm: false,
          invalidReason:
            universeId === "office"
              ? "Không thể trừ lương đồng minh Phe Sếp"
              : universeId === "school"
                ? "Không thể ghi sổ đồng minh Giáo Viên"
                : "Không thể cắn đồng bọn Sói",
          onClear: clearFn,
        };
      }
      return {
        canConfirm: true,
        label: g.alphaWolfInfo?.convertTonight
          ? universeId === "office"
            ? "👑 Mua chuộc"
            : universeId === "school"
              ? "🕶️ Tuyển ngầm"
              : "🩸 Đồng hóa"
          : `${voteLabels.wolfCountIcon || "🐺"} ${voteLabels.wolfConfirm || "Cắn"}`,
        accent: g.alphaWolfInfo?.convertTonight ? "#be123c" : "#dc2626",
        onConfirm: handleAction,
        onClear: clearFn,
      };
    }
    if (phase === "night_witch" && isMyTurn && !hasActed && !g.witchInfo?.usedPoison) {
      return {
        canConfirm: true,
        label:
          universeId === "office"
            ? "🧮 Trừ Chuyên Cần"
            : universeId === "school"
              ? "📒 Bút Đỏ"
              : "☠️ Đầu độc",
        accent: "#7c3aed",
        onConfirm: () => handleWitch(false, selectedPlayer.id),
        onClear: clearFn,
      };
    }
    if (phase === "night_seer" && isMyTurn && !hasActed) {
      if (selectedPlayer.id === me?.id) {
        return { canConfirm: false, invalidReason: "Hãy chọn người khác để soi", onClear: clearFn };
      }
      return {
        canConfirm: true,
        label:
          universeId === "office"
            ? "💻 Quét IP"
            : universeId === "school"
              ? "🎽 Soi Thẻ"
              : "🔮 Soi",
        accent: "#4f46e5",
        onConfirm: handleAction,
        onClear: clearFn,
      };
    }
    if (phase === "day_nominate") {
      if (selectedPlayer.id === me?.id) {
        return { canConfirm: false, invalidReason: "Không tự đề cử chính mình", onClear: clearFn };
      }
      return {
        canConfirm: true,
        label: hasActed
          ? "🗳️ Đổi đề cử"
          : `🗳️ ${voteLabels.nominateConfirm || "Đề cử"}`,
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
      <StealthCamouflageOverlay
        universeId={universeId}
        phaseKey={g.nightDayPhase}
        dayNumber={g.dayNumber}
        myActionNeeded={Boolean(isMyTurn && !hasActed && !g.winner)}
      />
      <AmbientSound
        isNight={isNight}
        isTense={g.nightDayPhase === 'day_final_vote' || g.nightDayPhase === 'hunter_revenge'}
        enabled={mcVoiceEnabled}
        universeId={universeId}
      />
      
      {/* Top HUD bar */}
      <div className={`phase-header phase-${g.nightDayPhase ? g.nightDayPhase.split('_')[0] : 'default'}`}>
        <div className="hud-left">
          <HudGameClock gameStartedAt={g.gameStartedAt} />
          {g.isTurbo && (
            <span
              title="Chế độ Tốc Chiến 5 Phút đang bật"
              style={{
                padding: '2px 7px',
                borderRadius: '999px',
                fontSize: '0.68rem',
                fontWeight: 800,
                background: 'rgba(245, 158, 11, 0.24)',
                border: '1px solid rgba(251, 191, 36, 0.65)',
                color: '#fef08a',
                whiteSpace: 'nowrap',
              }}
            >
              ⚡ 5 Phút
            </span>
          )}
          <h2 className="phase-title">{g.winner ? 'Trò Chơi Kết Thúc' : `Ngày ${g.dayNumber} — ${phaseLabels[g.nightDayPhase] || g.nightDayPhase}`}</h2>
        </div>
        <div className="hud-center">
          {isSpectator ? (
            <span
              className="role-badge"
              style={{
                background: 'rgba(14, 116, 144, 0.35)',
                borderColor: 'rgba(56, 189, 248, 0.65)',
                color: '#e0f2fe',
              }}
              title="Bạn đang xem trực tiếp với chế độ chống lộ vai (Zero-Leak) — hệ thống đã xếp hàng tự động đưa bạn vào ghế chơi ván tiếp theo!"
            >
              👀 Khán Giả ({room.spectatorCount || 1})
            </span>
          ) : (
            <span
              className="role-badge"
              style={{ cursor: me?.role ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={me?.role ? `${roleDescOf(me.role) || ''} (Nhấn để xem lại nhiệm vụ)` : ''}
              onClick={() => {
                if (me?.role && !g.winner) {
                  setTutorialStep(1);
                  setTutorialSeconds(7);
                }
              }}
            >
              {me?.role ? (
                universeId === 'classic' ? (
                  <RolePortrait roleKey={me.role} size={22} />
                ) : (
                  <span>{roleEmojiOf(me.role)}</span>
                )
              ) : (
                '👻'
              )}
              <span>
                {me?.role
                  ? roleLabelOf(me.role)
                  : universeId === 'office'
                    ? 'Hết lương'
                    : universeId === 'school'
                      ? 'Ra hành lang'
                      : 'Đã tử nạn'}
              </span>
            </span>
          )}
          {myLoverPartner && (
            <span
              className="role-badge"
              title={`Bạn được ghép đôi cùng ${myLoverPartner.name}. Nếu 1 người rời cuộc, người kia sẽ đi theo!`}
              style={{
                background: 'rgba(236, 72, 153, 0.22)',
                borderColor: 'rgba(244, 114, 182, 0.65)',
                color: '#fbcfe8',
              }}
            >
              {universeId === 'office' ? '🧋' : universeId === 'school' ? '💌' : '💘'} {myLoverPartner.name} {!myLoverPartner.alive ? '💀' : ''}
            </span>
          )}
          {revealedMayorPlayer && (
            <span
              className="role-badge"
              title={`${roleLabelOf('mayor')} ${revealedMayorPlayer.name} đã công bố quyền lực (Lá phiếu x2)`}
              style={{
                background: 'rgba(245, 158, 11, 0.24)',
                borderColor: 'rgba(253, 224, 71, 0.72)',
                color: '#fef08a',
              }}
            >
              {universeId === 'office' ? '🏅' : universeId === 'school' ? '⭐' : '👑'} {revealedMayorPlayer.id === me?.id ? 'Phiếu x2' : `${revealedMayorPlayer.name} (x2)`}
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
          <BossKeyTriggerButton universeId={universeId} />
          {/* Live Sói/Dân counter */}
          <div className="hud-score" title={hasCursedMystery ? 'Có vai ẩn đồng hóa trong ván (quân số phe đối lập có thể tăng)' : 'Tương quan hai phe còn trụ lại'}>
            <span className="hud-wolf">{voteLabels.wolfCountIcon || '🐺'} {aliveWolfCount}{hasCursedMystery ? '?' : ''}</span>
            <span className="hud-vs">vs</span>
            <span className="hud-village">{voteLabels.villageCountIcon || '👥'} {aliveVillageCount}</span>
          </div>

          {setMcVoiceEnabled && (
            <button
              type="button"
              className="btn-mc-voice"
              onClick={() => {
                if (uTheme.silentByDefault && onToggleStealthHeadphones) {
                  onToggleStealthHeadphones();
                } else {
                  setMcVoiceEnabled((prev) => !prev);
                }
              }}
              title={
                uTheme.silentByDefault
                  ? mcVoiceEnabled
                    ? 'Đang bật âm thanh Tai nghe — Bấm để quay về Chế độ 0dB Im Lặng'
                    : 'Đang ở Chế độ 0dB Im Lặng — Bấm khi đã đeo Tai Nghe để nghe giọng MC & Bot!'
                  : mcVoiceEnabled
                    ? 'Tắt tiếng Quản Trò MC'
                    : 'Bật tiếng Quản Trò MC'
              }
            >
              {uTheme.silentByDefault ? (mcVoiceEnabled ? '🎧' : '🔇0dB') : mcVoiceEnabled ? '🔊' : '🔇'}
            </button>
          )}

          {/* Menu Cài Đặt Nhanh Trong Trận ⚙️ (Gom 3D/2D, Nhịp Đọc, Voice Bot, Trạng thái Voice & Studio D5) */}
          <div className="hud-settings-popover-anchor" ref={hudSettingsRef}>
            <button
              type="button"
              className={`btn-mc-voice btn-hud-gear ${showHudSettings ? 'active' : ''}`}
              onClick={() => setShowHudSettings((v) => !v)}
              title="Tùy chọn Sân khấu 3D/2D, Nhịp đọc MC & Giọng AI Bot"
            >
              ⚙️
            </button>

            {showHudSettings && (
              <div className="hud-settings-popover">
                <div className="hud-popover-title">Cài Đặt Nhanh Ván Đấu</div>

                <button
                  type="button"
                  className="hud-popover-row"
                  onClick={toggleViewMode}
                >
                  <span>🖥️ Chế độ Sân khấu</span>
                  <span className="hud-popover-chip">{viewMode === '3d' ? '🎮 3D Đầy Đủ' : '⚡ 2D Nhẹ'}</span>
                </button>

                {hasBotsInMatch && canToggleMcPacing && onToggleMcPacing && !g.winner && (
                  <button
                    type="button"
                    className="hud-popover-row"
                    onClick={onToggleMcPacing}
                  >
                    <span>🎙️ Nhịp Quản Trò</span>
                    <span className="hud-popover-chip">
                      {mcPacingMode === 'full' ? '🐢 Đọc Trọn' : '⚡ Nhanh'}
                    </span>
                  </button>
                )}

                {hasBotsInMatch && onToggleBotVoice && !g.winner && (
                  <button
                    type="button"
                    className="hud-popover-row"
                    onClick={onToggleBotVoice}
                  >
                    <span>🤖 Giọng tranh biện Bot</span>
                    <span className="hud-popover-chip">
                      {botVoiceEnabled ? '🤖🔊 Bật' : '🤖🔇 Tắt'}
                    </span>
                  </button>
                )}

                {!voicePregening && mcVoiceEnabled && (
                  <button
                    type="button"
                    className="hud-popover-row"
                    onClick={() => onRecheckVoice?.()}
                  >
                    <span>🔊 Máy chủ Giọng MC</span>
                    <span className="hud-popover-chip">
                      {vsStatusChecking
                        ? '⏳ Kiểm tra...'
                        : vsServerOffline
                          ? 'MP3 Chuẩn (Thử lại)'
                          : vsStatusReady
                            ? '🟢 Sẵn sàng'
                            : '🟡 Kết nối...'}
                    </span>
                  </button>
                )}

                {canOpenArchitect && (
                  <button
                    type="button"
                    className="hud-popover-row"
                    onClick={() => {
                      setShowHudSettings(false);
                      if (viewMode !== '3d') {
                        setViewMode('3d');
                        localStorage.setItem('ws_view_mode', '3d');
                      }
                      setOpenArchitectCounter((c) => c + 1);
                    }}
                  >
                    <span>🏗️ Dựng Cảnh D5</span>
                    <span className="hud-popover-chip">Dev</span>
                  </button>
                )}
              </div>
            )}
          </div>

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

      {/* Timer progress bar (chuẩn hóa thời lượng từng phase, đồng bộ phaseDurationSec từ Server) */}
      <HudPhaseProgressBar
        phaseEndsAt={g.phaseEndsAt}
        nightDayPhase={g.nightDayPhase}
        phaseDurationSec={g.phaseDurationSec}
        hasWinner={Boolean(g.winner)}
      />

      {isSpectator && !g.winner && (
        <div className="spectator-queue-banner">
          👀 Bạn đang xem trực tiếp (Chế độ Zero-Leak) — Đã đặt chỗ tự động vào ghế chơi ngay ván sau!
        </div>
      )}

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
                    roomCode={room.code}
                    universeId={universeId}
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
                    speakingIds={effectiveSpeakingIds}
                    reactions={reactions}
                    suspectTags={suspectTags}
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
                roomCode={room.code}
                universeId={universeId}
                players={room.players} 
                me={me}
                phase={g.nightDayPhase}
                myRole={me?.role}
                hasWinner={Boolean(g.winner)}
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
                mayorRevealedId={g.mayorRevealedId || null}
                myLoverPartnerId={g.myLoverPartnerId || null}
                hunterPendingId={g.hunterPendingId || null}
                alphaWolfId={g.alphaWolfInfo?.alphaWolfId || null}
                speakingIds={effectiveSpeakingIds}
                reactions={reactions}
                suspectTags={suspectTags}
              />
            </>
          )}

          {/* Nút Mic nổi 1-Chạm góc trên phải Sân Khấu 3D/2D (Bật/Tắt/Giữ nói ngay trên Mobile & PC) */}
          {!g.winner && (
            <div className="voice-stage-floating-anchor">
              <VoiceQuickMicPill />
            </div>
          )}

          {/* Spotlight Tarot 3D Mở Màn (Pha role_reveal 6s): Kính mờ gọn trên đỉnh sân khấu, không che khuất nhân vật 3D bên dưới! */}
          {g.nightDayPhase === "role_reveal" && !isSpectator && me?.role && !g.winner && (
            <div className="role-reveal-spotlight-card">
              {universeId === "classic" ? (
                <RolePortrait roleKey={me.role} mode="card" size={64} glow />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 82,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2.15rem",
                    background: "rgba(15, 23, 42, 0.94)",
                    border: `2px solid ${uTheme.accentHex}`,
                    boxShadow: `0 0 18px ${uTheme.panelBorderRgba}`,
                    flexShrink: 0,
                  }}
                >
                  {roleEmojiOf(me.role)}
                </div>
              )}
              <div className="role-reveal-spotlight-body">
                <div className="role-reveal-spotlight-kicker">
                  <span>
                    {universeId === "office"
                      ? "🪪 THẺ CHỨC DANH BÍ MẬT CỦA BẠN"
                      : universeId === "school"
                        ? "🎫 THẺ VAI TRÒ LỚP HỌC CỦA BẠN"
                        : "🎭 LÁ BÀI ĐỊNH MỆNH CỦA BẠN"}
                  </span>
                  <span className={`role-reveal-faction-pill ${isWolfTeamRole(me.role) ? "wolf" : me.role === "tanner" ? "neutral" : "village"}`}>
                    {isWolfTeamRole(me.role)
                      ? uTheme.factions?.wolf || "🐺 Phe Sói"
                      : me.role === "tanner"
                        ? uTheme.factions?.neutral || "💀 Độc Lập"
                        : uTheme.factions?.village || "🛡️ Phe Dân Làng"}
                  </span>
                </div>
                <div className="role-reveal-spotlight-title">{roleLabelOf(me.role)}</div>
                <div className="role-reveal-spotlight-desc">{roleDescOf(me.role)}</div>
              </div>
              {!(hasActed || g.roleRevealReadyIds?.[me.id]) && (
                <button
                  type="button"
                  className="role-reveal-ready-cta"
                  onClick={handleRoleRevealReady}
                >
                  ⚡ Sẵn Sàng
                </button>
              )}
            </div>
          )}

          {/* Nút tròn thả cảm xúc 😊 thu gọn ở góc dưới bên phải sân khấu */}
          {!isSpectator && !g.winner && me?.alive && (
            <EmojiReactions socketRef={socketRef} myName={me?.name} />
          )}

          {/* Thanh Pill Kính Mờ 1 Hàng Ngang Siêu Gọn (Ẩn khi đang hiện Spotlight Lá Bài Định Mệnh role_reveal để chống lặp 2 thanh trên-dưới!) */}
          {!isSpectator && !g.winner && (me?.alive || isMyHunterRevenge) && !(g.nightDayPhase === "role_reveal" && me?.role && !actionFeedback) && (
            <div className="action-panel compact-floating-dock">
              {/* Popover Lịch sử Tiên Tri (chỉ mở khi bấm nút 🔮 Đã soi) */}
              {showSeerPopover && seerHistory.length > 0 && (
                <div className="seer-popover-card">
                  <div className="seer-popover-header">
                    <span>{roleEmojiOf("seer")} Lịch sử kiểm tra</span>
                    <button type="button" className="dock-icon-close" onClick={() => setShowSeerPopover(false)}>✕</button>
                  </div>
                  <div className="seer-popover-list">
                    {seerHistory.map((h, i) => (
                      <div key={i} className={`seer-history-row ${h.result === 'wolf' ? 'sh-wolf' : 'sh-human'}`}>
                        <span className="sh-day">Đêm {h.day}</span>
                        <span className="sh-name">{h.targetName}</span>
                        <span className="sh-result">
                          {h.result === 'wolf'
                            ? voteLabels.seerWolfBadge || '🔴 SÓI'
                            : voteLabels.seerGoodBadge || '🔵 Tốt'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {actionFeedback ? (
                <span className="dock-hint dock-feedback">{actionFeedback}</span>
              ) : g.nightDayPhase === "role_reveal" ? (
                /* ================= PHA MỞ MÀN ĐỘC LẬP: NHẬN VAI ĐỊNH MỆNH (6 GIÂY) ================= */
                <div className="dock-row">
                  <span className="dock-hint" style={{ color: '#fef08a', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {me?.role ? (
                      universeId === 'classic' ? (
                        <RolePortrait roleKey={me.role} size={28} glow />
                      ) : (
                        <span>{roleEmojiOf(me.role)}</span>
                      )
                    ) : (
                      '🎭'
                    )}
                    <span>
                      Vai của bạn: <strong>{roleLabelOf(me?.role) || '...'}</strong>
                      {roleDescOf(me?.role) ? ` — ${roleDescOf(me.role)}` : ''}
                    </span>
                  </span>
                  {hasActed || g.roleRevealReadyIds?.[me?.id] ? (
                    <span className="dock-chip" style={{ color: '#a7f3d0', borderColor: 'rgba(52,211,153,0.5)' }}>
                      ✅ Đã sẵn sàng vào Đêm 1
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="dock-btn dock-btn-confirm"
                      style={{
                        background: 'linear-gradient(135deg, #eab308, #d97706)',
                        color: '#0f172a',
                        fontWeight: 800,
                      }}
                      onClick={handleRoleRevealReady}
                    >
                      ⚡ Đã rõ vai trò!
                    </button>
                  )}
                </div>
              ) : g.nightDayPhase === "hunter_revenge" ? (
                /* ================= PHÁP TRƯỜNG / BÌNH MINH: THỢ SĂN / SENIOR / CHIẾN THẦN THƯA CÔ ================= */
                <div className="dock-row">
                  {isMyHunterRevenge ? (
                    hasActed ? (
                      <span className="dock-hint dock-done">
                        {universeId === "office"
                          ? "✈️ Đã phóng Email CC toàn công ty!"
                          : universeId === "school"
                            ? "📢 Đã bắc loa chỉ điểm thành công!"
                            : "🏹 Đã bóp cò viên đạn bạc cuối cùng!"}
                      </span>
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
                        {universeId === "office"
                          ? "✈️ 15 giây cuối! Click 1 ghế để gửi Email CC toàn công ty kéo bàn giao chung!"
                          : universeId === "school"
                            ? "📢 15 giây cuối! Click 1 bạn để bắc loa 'Em thưa cô bạn kia cũng vậy!'"
                            : "🏹 Hơi thở cuối! Click vào 1 người còn sống trên vòng ghế để bắn trả thù!"}
                      </span>
                    )
                  ) : (
                    <span className="dock-hint" style={{ color: '#fda4af' }}>
                      {universeId === "office" ? (
                        <>✈️ Senior <strong>{fallenHunterPlayer?.name || ''}</strong> đang soạn Email CC toàn công ty...</>
                      ) : universeId === "school" ? (
                        <>📢 <strong>{fallenHunterPlayer?.name || ''}</strong> đang giơ loa chuẩn bị chỉ điểm lên bảng chung...</>
                      ) : (
                        <>🏹 Thợ Săn <strong>{fallenHunterPlayer?.name || ''}</strong> đang giương nỏ ngắm bắn viên đạn bạc cuối cùng...</>
                      )}
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
                          {g.seerLastResult.result === 'wolf'
                            ? voteLabels.seerWolfBadge || '🔴 SÓI!'
                            : voteLabels.seerGoodBadge || '🔵 Người tốt'}
                        </span>
                      )}
                      {me?.role === "seer" && seerHistory.length > 0 && (
                        <button
                          type="button"
                          className="dock-btn dock-btn-ghost"
                          onClick={() => setShowSeerPopover((v) => !v)}
                        >
                          {roleEmojiOf("seer")} Đã kiểm ({seerHistory.length})
                        </button>
                      )}
                    </div>
                  ) : g.nightDayPhase === "night_cupid" ? (
                    /* Đêm 1: Ghép đôi */
                    <div className="dock-row">
                      {cupidTargets.length === 0 ? (
                        <span className="dock-hint">
                          {universeId === "office" ? (
                            <>🧋 Ca tối đầu: Click chọn <strong>2 đồng nghiệp</strong> để ký Hợp Đồng Liên Minh Trà Sữa!</>
                          ) : universeId === "school" ? (
                            <>💌 Tiết đầu: Click chọn <strong>2 bạn</strong> để gửi thư ghép Đôi Bạn Cùng Bàn!</>
                          ) : (
                            <>💘 Đêm đầu tiên: Click chọn <strong>2 người</strong> trên vòng ghế để ghép đôi sinh tử!</>
                          )}
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
                                {universeId === "office" ? "🧋" : universeId === "school" ? "💌" : "💘"} #{idx + 1}: {tp?.name || tid}
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
                              {universeId === "office"
                                ? "🧋 Chốt Liên Minh"
                                : universeId === "school"
                                  ? "💌 Ghép Đôi Bạn Thân"
                                  : "💘 Kết Duyên Sinh Tử"}
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
                        {g.witchInfo?.victimId
                          ? universeId === "office"
                            ? "📉 Có người bị cắt lương!"
                            : universeId === "school"
                              ? "📒 Có bạn bị ghi Sổ Đầu Bài!"
                              : "🩸 Có người bị cắn!"
                          : universeId === "office"
                            ? "😮‍💨 Không ai bị cắt lương"
                            : universeId === "school"
                              ? "😮‍💨 Không ai bị ghi sổ"
                              : "😮‍💨 Không ai bị cắn"}
                      </span>
                      {g.witchInfo?.victimId && (
                        <button
                          type="button"
                          className="dock-btn dock-btn-save"
                          disabled={g.witchInfo?.usedSave}
                          onClick={() => handleWitch(true, null)}
                          title={g.witchInfo?.usedSave ? "Đã dùng quyền cứu" : "Cứu người bị nhắm tối nay"}
                        >
                          💚{" "}
                          {g.witchInfo?.usedSave
                            ? "Hết lượt"
                            : universeId === "office"
                              ? "+ Chuyên cần"
                              : universeId === "school"
                                ? "+ Điểm phát biểu"
                                : "Cứu"}
                        </button>
                      )}
                      {!g.witchInfo?.usedPoison ? (
                        selectedPlayer?.alive ? (
                          <button
                            type="button"
                            className="dock-btn dock-btn-poison"
                            onClick={() => handleWitch(false, selectedPlayer.id)}
                          >
                            {universeId === "office"
                              ? `🧮 Trừ lương ${selectedPlayer.name}`
                              : universeId === "school"
                                ? `📒 Bút đỏ ${selectedPlayer.name}`
                                : `☠️ Độc ${selectedPlayer.name}`}
                          </button>
                        ) : (
                          <span className="dock-chip">
                            {universeId === "office"
                              ? "🧮 Click ghế để trừ chuyên cần"
                              : universeId === "school"
                                ? "📒 Click ghế để dùng bút đỏ"
                                : "☠️ Click ghế để độc"}
                          </span>
                        )
                      ) : (
                        <span className="dock-chip chip-muted">
                          {universeId === "office"
                            ? "🧮 Đã dùng trừ"
                            : universeId === "school"
                              ? "📒 Đã dùng bút đỏ"
                              : "☠️ Hết độc"}
                        </span>
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
                          <span className="dock-chip chip-muted" title="Đã dùng đặc quyền 1 lần trong ván này">
                            {universeId === "office"
                              ? "👑 Đã trao phong bì"
                              : universeId === "school"
                                ? "🕶️ Đã tuyển ngầm"
                                : "🩸 Hết Đồng Hóa"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="dock-btn"
                            onClick={handleAlphaToggle}
                            title="1 lần/ván: Mua chuộc / đồng hóa người bị chọn tối nay sang phe của bạn!"
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
                            {g.alphaWolfInfo?.convertTonight
                              ? universeId === "office"
                                ? '👑 Mua chuộc: BẬT'
                                : universeId === "school"
                                  ? '🕶️ Tuyển ngầm: BẬT'
                                  : '🩸 Huyết Nguyệt: BẬT'
                              : universeId === "office"
                                ? '👑 Phong Bì Tăng Lương (1 lần)'
                                : universeId === "school"
                                  ? '🕶️ Tuyển Sao Đỏ Ngầm (1 lần)'
                                  : '🩸 Đồng Hóa (1 lần)'}
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
                  <span className="dock-hint dock-muted">
                    {universeId === "office"
                      ? "🌙 Văn phòng đang khóa sổ ca tối — chờ đến lượt bộ phận của bạn..."
                      : universeId === "school"
                        ? "🌙 Lớp đang tự học yên tĩnh — chờ đến lượt tổ của bạn..."
                        : "🌙 Màn đêm tĩnh lặng — bạn đang ngủ..."}
                  </span>
                )
              ) : (
                /* ================= BAN NGÀY ================= */
                <div className="dock-row">
                  {g.nightDayPhase === "day_discuss" && (
                    <>
                      <span className="dock-hint">
                        {universeId === "office"
                          ? "☕ Giải lao truy tìm nick Sếp"
                          : universeId === "school"
                            ? "🎒 Ra chơi tìm nick Giáo Viên"
                            : "💬 Thảo luận tìm Sói"}
                      </span>
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
                        {voteLabels.hangBtn || "🪢 Treo"} ({hangCount})
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
                        {voteLabels.spareBtn || "🕊️ Tha"} ({spareCount})
                      </button>
                      <span className="dock-chip">
                        {hangCount >= hangNeeded ? "✅ Đủ quá bán!" : `Cần ${hangNeeded} phiếu`}
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
                      title="Lộ diện chức vụ vĩnh viễn và nhân đôi (x2) sức nặng lá phiếu của bạn!"
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b, #b45309)',
                        border: '1px solid #fde047',
                        color: '#fffbeb',
                        fontWeight: 800,
                        boxShadow: '0 2px 12px rgba(245, 158, 11, 0.45)',
                      }}
                    >
                      {universeId === "office"
                        ? "🏅 Thẻ Công Đoàn (Phiếu x2)"
                        : universeId === "school"
                          ? "⭐ Sao Lớp Trưởng (Phiếu x2)"
                          : "👑 Công Bố Quyền Trượng (x2)"}
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

              {/* Dải Thẻ Suy Luận Cá Nhân 1-Chạm (100% Local Zero-Leak — hiện ngay khi chọn bất kỳ ghế người khác) */}
              {selectedPlayer && selectedPlayer.id !== me?.id && !g.winner && g.nightDayPhase !== "role_reveal" && (
                <div className="suspect-tags-dock-strip">
                  <span className="suspect-tags-label">🔍 Ghi chú {selectedPlayer.name}:</span>
                  {Object.values(SUSPECT_TAG_META).map((tag) => {
                    const active = suspectTags[selectedPlayer.id] === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={`suspect-tag-chip ${active ? "active" : ""}`}
                        style={
                          active
                            ? { background: tag.bg, borderColor: tag.border, color: tag.color }
                            : undefined
                        }
                        onClick={() => handleToggleSuspectTag(selectedPlayer.id, tag.id)}
                      >
                        {tag.short}
                      </button>
                    );
                  })}
                  {suspectTags[selectedPlayer.id] && (
                    <button
                      type="button"
                      className="suspect-tag-chip clear"
                      onClick={() => handleToggleSuspectTag(selectedPlayer.id, null)}
                      title="Xóa ghi chú ghế này"
                    >
                      ✕
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
              roomCode={room.code}
              nightDayPhase={g.nightDayPhase}
              isNight={isNight} 
              myRole={isSpectator ? null : me?.role} 
              isAlive={Boolean(me?.alive) && !isSpectator}
              isSpectator={isSpectator}
              myId={isSpectator ? room.mySpectatorId : me?.id}
              myName={isSpectator ? "Khán Giả" : me?.name}
              wolfTeammates={g.wolfTeammates || []} 
              onSpeakingChange={handleSpeakingChange}
            />
          )}

          
          <div className="mc-chat-panel">
            {!g.winner && !isSpectator && me && !me.alive && !isMyHunterRevenge && (
              <>
                <div className="ghost-channel-switcher">
                  <button
                    type="button"
                    className={`ghost-tab-btn ${chatChannel === "village" ? "active" : ""}`}
                    onClick={() => setChatChannel("village")}
                  >
                    💬 {universeId === "office" ? "Phòng Họp" : universeId === "school" ? "Nhóm Lớp" : "Kênh Làng"} ({chatLog.length})
                  </button>
                  <button
                    type="button"
                    className={`ghost-tab-btn ${chatChannel === "ghost" ? "active" : ""}`}
                    onClick={() => setChatChannel("ghost")}
                  >
                    {universeId === "office" ? "☕ Tổ Pantry" : universeId === "school" ? "🧋 Hành Lang" : "👻 Cõi Âm"} ({ghostChatLog.length})
                  </button>
                </div>
                <div className="ghost-bet-box">
                  {g.myGhostBet ? (
                    <span>
                      🎯 Đã dự đoán:{" "}
                      <strong>
                        {g.myGhostBet === "wolf"
                          ? uTheme.factions?.wolf || "🐺 Phe Sói"
                          : g.myGhostBet === "lovers"
                            ? universeId === "office"
                              ? "🧋 Liên Minh Trà Sữa"
                              : universeId === "school"
                                ? "💌 Đôi Bạn Cùng Bàn"
                                : "💘 Cặp Đôi"
                            : g.myGhostBet === "tanner"
                              ? `${roleEmojiOf("tanner")} ${roleLabelOf("tanner")}`
                              : uTheme.factions?.village || "🏡 Phe Dân"}
                      </strong>{" "}
                      (Đúng +35 XP!)
                    </span>
                  ) : (
                    <>
                      <span>🎯 Dự đoán phe thắng (+35 XP):</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-ghost-bet"
                          onClick={() => handleGhostBet("village")}
                        >
                          {uTheme.factions?.village || "🏡 Phe Dân"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost-bet"
                          onClick={() => handleGhostBet("wolf")}
                        >
                          {uTheme.factions?.wolf || "🐺 Phe Sói"}
                        </button>
                        {Number(g.roleCounts?.cupid) > 0 && (
                          <button
                            type="button"
                            className="btn-ghost-bet"
                            onClick={() => handleGhostBet("lovers")}
                          >
                            {universeId === "office" ? "🧋 Liên Minh" : universeId === "school" ? "💌 Đôi Bạn" : "💘 Cặp Đôi"}
                          </button>
                        )}
                        {Number(g.roleCounts?.tanner) > 0 && (
                          <button
                            type="button"
                            className="btn-ghost-bet"
                            onClick={() => handleGhostBet("tanner")}
                          >
                            {roleEmojiOf("tanner")} {roleLabelOf("tanner")}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

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
              {chatChannel === "ghost" && !isSpectator && me && !me.alive && ghostChatLog.length === 0 && (
                <div style={{ padding: "14px 10px", textAlign: "center", fontSize: "0.78rem", color: "#c4b5fd" }}>
                  {universeId === "office" ? (
                    <>☕ Chào mừng đến <strong>Tổ Hóng Pantry</strong>! Các nhân sự đã bàn giao việc có thể trò chuyện thoải mái tại đây.</>
                  ) : universeId === "school" ? (
                    <>🧋 Chào mừng đến <strong>Hội Hóng Hành Lang</strong>! Các bạn đang trực ngoài lớp có thể tám chuyện riêng tại đây.</>
                  ) : (
                    <>👻 Chào mừng đến <strong>Cõi Âm</strong>! Chỉ những người đã ngã xuống mới đọc & trò chuyện được tại đây.</>
                  )}
                </div>
              )}
              {(chatChannel === "ghost" && !isSpectator && me && !me.alive ? ghostChatLog : chatLog)
                .filter((msg) => msg.type === "mc" || !msg.senderId || !mutedSenderIds[msg.senderId])
                .map((msg, i) => (
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

                  {/* Player chat bubble — Zalo style (Village / Wolf / Ghost) */}
                  {(msg.type === 'village' || msg.type === 'wolf' || msg.type === 'ghost') && (() => {
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
                              {msg.type === 'wolf' && (
                                <span className="wolf-tag">
                                  {universeId === 'office' ? '👔' : universeId === 'school' ? '👩‍🏫' : '🐺'}
                                </span>
                              )}
                              {msg.type === 'ghost' && (
                                <span className="wolf-tag">
                                  {universeId === 'office' ? '☕' : universeId === 'school' ? '🧋' : '👻'}
                                </span>
                              )}
                              <span className="chat-sender-name">{msg.senderName}</span>
                              <span className="chat-time">{msg.time}</span>
                              {!isSpectator && msg.senderId && !senderPlayer?.isBot && (
                                <span className="chat-mod-actions">
                                  <button
                                    type="button"
                                    className="chat-mod-btn"
                                    onClick={() => handleToggleMuteSender(msg.senderId, msg.senderName)}
                                    title="Ẩn tin nhắn người chơi này"
                                  >
                                    🔇
                                  </button>
                                  <button
                                    type="button"
                                    className="chat-mod-btn report"
                                    onClick={() => handleReportPlayer(msg.senderId, msg.senderName)}
                                    title="Báo cáo ngôn từ thiếu văn minh"
                                  >
                                    🚩
                                  </button>
                                </span>
                              )}
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
              {!isSpectator && isNight && isWolfTeamRole(me?.role) && me?.alive && (
                <form onSubmit={handleWolfChat} className="chat-input-form wolf-input">
                  <input 
                    className="chat-input"
                    placeholder={
                      universeId === "office"
                        ? "👔 Nhắn riêng Hội Sếp..."
                        : universeId === "school"
                          ? "👩‍🏫 Nhắn riêng Tổ Giáo Viên..."
                          : "🐺 Chat bầy sói..."
                    }
                    value={wolfChatInput}
                    onChange={e => setWolfChatInput(e.target.value)}
                  />
                  <button type="submit" className="btn-send wolf-send">➤</button>
                </form>
              )}
              {!isSpectator && !isNight && me?.alive && !g.winner && (
                <div className="quick-debate-strip">
                  {quickDebateChips.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      className="quick-debate-chip"
                      onClick={() => handleQuickDebateChip(phrase)}
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              )}
              {!isSpectator && !isNight && me?.alive && (
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
              {!isSpectator && !g.winner && me && !me.alive && !isMyHunterRevenge && chatChannel === "ghost" && (
                <form onSubmit={handleGhostChat} className="chat-input-form">
                  <input
                    className="chat-input"
                    placeholder={
                      universeId === "office"
                        ? "☕ Trò chuyện Tổ Hóng Pantry..."
                        : universeId === "school"
                          ? "🧋 Trò chuyện Hội Hành Lang..."
                          : "👻 Trò chuyện Cõi Âm (chỉ linh hồn thấy)..."
                    }
                    value={ghostChatInput}
                    onChange={e => setGhostChatInput(e.target.value)}
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
          roomCode={room.code}
          universeId={universeId}
          gameStartedAt={g.gameStartedAt}
          myPlayerId={me?.id || null}
          serverGoldenHour={room.serverGoldenHour || null}
          didActOrVote={didActOrVoteInMatch || Boolean(hasActed)}
          history={g.history || EMPTY_ARRAY} 
          replayTimeline={g.replayTimeline || EMPTY_ARRAY}
          awards={g.awards || EMPTY_ARRAY}
          isHost={Boolean(me?.isHost)} 
          isSpectator={isSpectator}
          rematchEndsAt={g.rematchEndsAt}
          rematchReadyCount={g.rematchReadyCount || 0}
          rematchRequiredCount={g.rematchRequiredCount || 1}
          myRematchReady={Boolean(g.myRematchReady)}
          ghostBetBonusXp={g.ghostBetBonusXp || 0}
          onRematchReady={() => {
            if (onExitRecapToLobby) {
              onExitRecapToLobby();
            } else {
              socketRef.current.emit("room:rematchReady");
            }
          }}
          onRestart={() => {
            if (onExitRecapToLobby) {
              onExitRecapToLobby();
            } else {
              socketRef.current.emit("room:restart");
            }
          }}
          onExitToLobby={onExitRecapToLobby}
          onAnimate={setRecapAnimation}
          onStageChange={setRecapStageState}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          showPostGameChat={showPostGameChat}
          onTogglePostGameChat={() => setShowPostGameChat((v) => !v)}
          players={room.players || EMPTY_ARRAY}
          winner={g.winner}
          loversPublic={g.loversPublic || EMPTY_ARRAY}
          sessionToken={liveSessionToken}
          mcVoiceEnabled={mcVoiceEnabled}
          vsServerOffline={vsServerOffline}
          vsStatusChecking={vsStatusChecking}
          onRecheckVoice={onRecheckVoice}
          voiceRecheckTick={voiceRecheckTick}
        />
      )}
      
      {/* Tutorial 3 bước — overlay khi game bắt đầu (tự ẩn ở pha role_reveal 6s & khi ván kết thúc) */}
      {tutorialStep > 0 && me?.role && !g.winner && g.nightDayPhase !== "role_reveal" && (
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
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  {universeId === 'classic' ? (
                    <RolePortrait roleKey={me.role} mode="card" size={88} glow />
                  ) : (
                    <div
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: 18,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2.8rem',
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: `2px solid ${uTheme.accentHex}`,
                      }}
                    >
                      {roleEmojiOf(me.role)}
                    </div>
                  )}
                </div>
                <h2>Bạn là <span style={{ color: '#f59e0b' }}>{roleLabelOf(me.role)}</span></h2>
                <p className="tutorial-team">
                  Phe:{' '}
                  {isWolfTeamRole(me.role)
                    ? uTheme.factions?.wolf || '🐺 Sói'
                    : me.role === 'tanner'
                      ? uTheme.factions?.neutral || '💀 Trung Lập'
                      : uTheme.factions?.village || '👥 Dân Làng'}
                </p>
              </div>
            )}

            {/* Bước 2: Nhiệm vụ */}
            {tutorialStep === 2 && (
              <div className="tutorial-step-content">
                <div className="role-tutorial-emoji">📋</div>
                <h2>Nhiệm vụ của bạn</h2>
                <p className="tutorial-desc">{roleDescOf(me.role)}</p>
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
                      <div key={r} className={`role-count-chip ${r === me.role ? 'role-count-mine' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {universeId === 'classic' ? (
                          <RolePortrait roleKey={r} size={20} />
                        ) : (
                          <span>{roleEmojiOf(r)}</span>
                        )}
                        <span>
                          {roleLabelOf(r)} × {c}
                          {r === me.role && ' (Bạn!)'}
                        </span>
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
                          onClick={() => {
                            try { localStorage.setItem("ws_tutorial_done", "1"); } catch {}
                            setTutorialStep(0);
                          }}>
                    Bắt đầu! ✓
                  </button>
                )}
                <button className="tutorial-skip-btn" onClick={() => {
                  try { localStorage.setItem("ws_tutorial_done", "1"); } catch {}
                  setTutorialStep(0);
                }}>Skip</button>
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
            <p>
              Bạn có thể <strong>xem tiếp</strong>, trò chuyện riêng tại <strong>👻 Cõi Âm</strong> và dự đoán phe chiến thắng (<strong>+35 XP</strong>)!
            </p>
            <button
              className="btn-primary"
              onClick={() => {
                setShowDeadOverlay(false);
                setChatChannel("ghost");
              }}
            >
              👻 Vào Cõi Âm & Xem Tiếp
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

import { useState, useEffect, useRef } from "react";
import PlayerCircle from "./PlayerCircle.jsx";
import EndGameRecap from "./EndGameRecap.jsx";

const ROLE_LABELS = {
  wolf: "Sói",
  seer: "Tiên Tri",
  guard: "Bảo Vệ",
  witch: "Phù Thủy",
  tanner: "Chán Đời",
  villager: "Nông Dân",
};

export default function PlayingView({ room, socketRef, mcLog }) {
  const g = room.game;
  const me = room.players.find((p) => p.id === socketRef.current.id);
  
  const [selectedId, setSelectedId] = useState(null);
  const [wolfChatInput, setWolfChatInput] = useState("");
  const [villageChatInput, setVillageChatInput] = useState("");
  const [localBubbleChatLog, setLocalBubbleChatLog] = useState({});
  const [hasActed, setHasActed] = useState(false);
  const [gameTimeStr, setGameTimeStr] = useState("00:00");
  const [phaseTimeStr, setPhaseTimeStr] = useState("");
  const [recapAnimation, setRecapAnimation] = useState(null);
  const chatEndRef = useRef(null);

  // Tự động cuộn chat xuống cuối cùng
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mcLog, localBubbleChatLog]);

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
  }, [g.nightDayPhase]);

  const isNight = g.nightDayPhase.startsWith("night_");
  const isMyTurn = 
    (g.nightDayPhase === "night_guard" && me?.role === "guard") ||
    (g.nightDayPhase === "night_wolf" && me?.role === "wolf") ||
    (g.nightDayPhase === "night_witch" && me?.role === "witch") ||
    (g.nightDayPhase === "night_seer" && me?.role === "seer");

  useEffect(() => {
    const handleBubbleChat = ({ senderId, message }) => {
      setLocalBubbleChatLog(prev => ({ ...prev, [senderId]: message }));
      setTimeout(() => {
        setLocalBubbleChatLog(prev => {
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      }, 4000); // clear after 4s
    };

    socketRef.current.on("wolf:chat", handleBubbleChat);
    socketRef.current.on("village:chat", handleBubbleChat);
    return () => {
      socketRef.current.off("wolf:chat", handleBubbleChat);
      socketRef.current.off("village:chat", handleBubbleChat);
    };
  }, [socketRef]);

  function handleAction() {
    if (!selectedId && g.nightDayPhase !== "night_witch") return;

    if (g.nightDayPhase === "night_guard") {
      socketRef.current.emit("action:guardProtect", { targetId: selectedId }, () => setHasActed(true));
    } else if (g.nightDayPhase === "night_wolf") {
      socketRef.current.emit("action:wolfPick", { targetId: selectedId }); // Sói có thể đổi lại liên tục nên ko setHasActed
    } else if (g.nightDayPhase === "night_witch") {
      // Witch action is handled separately via specific buttons
    } else if (g.nightDayPhase === "night_seer") {
      socketRef.current.emit("action:seerCheck", { targetId: selectedId }, () => setHasActed(true));
    } else if (g.nightDayPhase === "day_nominate") {
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

  return (
    <div className={`playing-view-container ${isNight && !g.winner ? "night-mode" : "day-mode"}`}>
      
      {/* HUD: Phase Info */}
      <div className="phase-header">
        <div className="game-time">Thời gian trận: {gameTimeStr}</div>
        <h2>{g.winner ? "Trò Chơi Kết Thúc" : `Ngày ${g.dayNumber} - ${g.nightDayPhase.toUpperCase()}`}</h2>
        <p className="role-text">Vai của bạn: <span className="highlight-role">{me?.role ? ROLE_LABELS[me.role] || me.role : "Chết"}</span></p>
        {showPhaseTimer && phaseTimeStr && (
          <div className="phase-time">Còn lại: {phaseTimeStr}</div>
        )}
      </div>

      <div className="game-area">
        {/* Lịch sử MC Chat */}
        <div className="mc-chat-panel">
          <div className="chat-messages">
            {mcLog.map((log, i) => (
              <div key={i} className={`mc-message ${log.type}`}>
                {log.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          
          {isNight && me?.role === "wolf" && (
            <form onSubmit={handleWolfChat} className="wolf-chat-form">
              <input 
                placeholder="Chat riêng cho bầy sói..." 
                value={wolfChatInput}
                onChange={e => setWolfChatInput(e.target.value)}
              />
              <button type="submit" className="btn-wolf-chat">Gửi</button>
            </form>
          )}

          {!isNight && me?.alive && (
            <form onSubmit={handleVillageChat} className="wolf-chat-form">
              <input 
                placeholder="Thảo luận chung với dân làng..." 
                value={villageChatInput}
                onChange={e => setVillageChatInput(e.target.value)}
              />
              <button type="submit" className="btn-wolf-chat" style={{background: "#7c8cf8"}}>Chat</button>
            </form>
          )}
        </div>

        {/* Vòng tròn người chơi */}
        <div className="circle-panel">
          <PlayerCircle 
            players={room.players} 
            me={me}
            phase={g.nightDayPhase}
            myRole={me?.role}
            onSelectPlayer={(id) => setSelectedId(id)}
            selectedPlayerId={selectedId}
            wolfVictimId={g.witchInfo?.victimId}
            nightDeaths={g.nightDeaths}
            wolfPicksVisible={g.wolfPicksVisible}
            bubbleChatLog={localBubbleChatLog}
            seerLastResult={me?.role === "seer" ? g.seerLastResult : null}
            nominationVotes={g.nominationVotes}
            finalVotes={g.finalVotes}
            defendantId={g.phase === "day_final_vote" ? g.hotSeatQueue[g.hotSeatIndex] : null}
            recapAnimation={recapAnimation}
          />

          {g.winner ? (
            <EndGameRecap 
              history={g.history} 
              isHost={me?.isHost} 
              onRestart={() => socketRef.current.emit("room:restart")}
              onAnimate={setRecapAnimation} 
            />
          ) : me?.alive && (
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
                    <button className="btn-secondary" onClick={() => socketRef.current.emit("action:voteExtendDiscussion", { wantExtend: true })}>
                      +2 Phút Thảo Luận
                    </button>
                  )}

                  {g.nightDayPhase === "day_nominate" && (
                    <button className="btn-primary" disabled={!selectedId} onClick={handleAction}>
                      {hasActed ? "Đổi người đề cử" : "Bỏ phiếu đề cử"}
                    </button>
                  )}

                  {g.nightDayPhase === "day_final_vote" && (
                    <div className="final-vote-actions">
                      <p>Phán xét: {room.players.find(p => p.id === g.hotSeatQueue[g.hotSeatIndex])?.name}</p>
                      <button className="btn-kill" onClick={() => socketRef.current.emit("action:finalVote", { decision: "hang" }, () => setHasActed(true))}>
                        Treo cổ {g.finalVotes && g.finalVotes[me.id] === "hang" && " (Đã chọn)"}
                      </button>
                      <button className="btn-save" onClick={() => socketRef.current.emit("action:finalVote", { decision: "spare" }, () => setHasActed(true))}>
                        Tha {g.finalVotes && g.finalVotes[me.id] === "spare" && " (Đã chọn)"}
                      </button>
                    </div>
                  )}
                </>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

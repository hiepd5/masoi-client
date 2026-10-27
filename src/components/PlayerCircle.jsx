import React, { useRef } from "react";
import "./PlayingView.css";
import Campfire from "./Campfire.jsx";
import ActionBeam from "./ActionBeam.jsx";
import RolePortrait from "./RolePortrait.jsx";
import {
  ROLE_COLORS,
  ROLE_LABELS,
  ROLE_PORTRAIT_BADGES,
  getPublicCitizenPersona,
} from "../config/roles.config.js";

export default function PlayerCircle({
  roomCode = "MASOI",
  players,
  me,
  phase,
  myRole,
  hasWinner = false,
  onSelectPlayer,
  selectedPlayerId,
  wolfVictimId,
  nightDeaths,
  wolfPicksVisible,
  wolfChatLog,
  seerLastResult,
  nominationVotes,
  finalVotes = {},
  defendantId = null,
  mayorRevealedId = null,
  myLoverPartnerId = null,
  hunterPendingId = null,
  alphaWolfId = null,
  recapAnimation = null,
  wolfTeammates = [],
  speakingIds = [],
  reactions = [],
}) {
  const numPlayers = players.length;
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  React.useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const radius = isMobile ? 132 : 178;
  const sceneRef = useRef(null);

  function getPlayerEl(playerId) {
    return sceneRef.current?.querySelector(`[data-player-id="${playerId}"]`);
  }

  return (
    <div className="player-circle-scene" ref={sceneRef}>
      {recapAnimation && (
        <ActionBeam
          event={recapAnimation}
          getPlayerEl={getPlayerEl}
          containerRef={sceneRef}
        />
      )}
      <div className="player-circle-container">
        <div className="campfire-center">
          <Campfire />
        </div>

        {players.map((p, index) => {
          const seatIdx = typeof p.seatIndex === "number" ? p.seatIndex : index;
          const angle = (index / Math.max(1, numPlayers)) * 2 * Math.PI - Math.PI / 2;
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);

          const isDead = !p.alive;
          const isWolfVictim = p.id === wolfVictimId && myRole === "witch";
          const isNightDeath = nightDeaths && nightDeaths.includes(p.id);
          const showRed = isDead || isWolfVictim || isNightDeath;
          const isSelected = selectedPlayerId === p.id;
          const isMe = p.id === me?.id;
          const isWolfTeammate = wolfTeammates.includes(p.id);
          const isSpeaking = (speakingIds || []).includes(p.id);
          const isDisconnected = !p.connected;
          const isMayorPublic = Boolean(mayorRevealedId && mayorRevealedId === p.id && !isDead);
          const isLover = Boolean(myLoverPartnerId && myLoverPartnerId === p.id);
          const isHunterLastBreath = Boolean(hunterPendingId && hunterPendingId === p.id && phase === "hunter_revenge");

          // Zero-Leak Studio 3D Portrait Resolution (khớp 100% ma trận GreyboxActor 3D & Chốt #10)
          const persona = getPublicCitizenPersona(roomCode, seatIdx);
          let visiblePortraitKey = persona.slotKey;
          let visibleRoleLabel = null;

          if ((hasWinner || isDead) && p.role) {
            visiblePortraitKey =
              p.role === "wolf" && seatIdx % 2 === 1 ? "wolf_alt" : p.role;
            visibleRoleLabel = ROLE_LABELS[p.role] || p.role;
          } else if (isMe && myRole) {
            visiblePortraitKey =
              myRole === "wolf" && seatIdx % 2 === 1 ? "wolf_alt" : myRole;
            visibleRoleLabel = ROLE_LABELS[myRole] || myRole;
          } else if (isMayorPublic) {
            visiblePortraitKey = "mayor";
            visibleRoleLabel = ROLE_LABELS.mayor;
          } else if (isHunterLastBreath) {
            visiblePortraitKey = "hunter";
            visibleRoleLabel = ROLE_LABELS.hunter;
          } else if (isWolfTeammate && String(phase || "").startsWith("night_") && !isDead) {
            const mateRole = alphaWolfId && p.id === alphaWolfId ? "alpha_wolf" : "wolf";
            visiblePortraitKey =
              mateRole === "wolf" && seatIdx % 2 === 1 ? "wolf_alt" : mateRole;
            visibleRoleLabel = ROLE_LABELS[mateRole];
          }

          const portraitSrc =
            ROLE_PORTRAIT_BADGES[visiblePortraitKey] || persona.portraitBadge;

          let seerResultClass = "";
          if (seerLastResult && seerLastResult.targetId === p.id && phase === "night_seer") {
            seerResultClass = seerLastResult.result === "wolf" ? "seer-wolf" : "seer-human";
          }

          let showWolfChat = false;
          let wolfMessage = "";
          if (wolfChatLog && wolfChatLog[p.id]) {
            showWolfChat = true;
            wolfMessage = wolfChatLog[p.id];
          }

          let wolfPicksOnThis = 0;
          if (wolfPicksVisible) {
            Object.values(wolfPicksVisible).forEach((pick) => {
              if (pick.targetId === p.id) wolfPicksOnThis++;
            });
          }

          const voters = [];
          if (phase === "day_nominate" && nominationVotes) {
            Object.entries(nominationVotes).forEach(([voterId, vote]) => {
              if (vote.targetId === p.id) {
                const voterPlayer = players.find((pl) => pl.id === voterId);
                if (voterPlayer) voters.push(voterPlayer);
              }
            });
          }

          const hasNominated =
            nominationVotes && Object.values(nominationVotes).some((v) => v.targetId === p.id);
          const onSeat = p.id === defendantId;
          const roleColor = isMe
            ? ROLE_COLORS[myRole] || "#fbbf24"
            : visibleRoleLabel
              ? ROLE_COLORS[p.role || visiblePortraitKey] || persona.tunicHex
              : persona.tunicHex;

          const avatarStyle = {
            borderColor: roleColor,
            boxShadow: isMe
              ? `0 0 0 2.5px ${roleColor}, 0 0 18px ${roleColor}aa`
              : `0 0 0 2px ${roleColor}88, 0 6px 14px rgba(0,0,0,0.65)`,
            transform: isSpeaking ? "translateY(-3px) scale(1.09)" : isMe ? "scale(1.08)" : undefined,
            transition: "all 0.24s ease",
          };

          let recapClass = "";
          let recapRoleBadge = null;
          if (recapAnimation && recapAnimation.targetId === p.id) {
            switch (recapAnimation.type) {
              case "wolf":
                recapClass = "anim-wolf-bite";
                recapRoleBadge = "wolf";
                break;
              case "guard":
                recapClass = "anim-guard-shield";
                recapRoleBadge = "guard";
                break;
              case "witch_save":
                recapClass = "anim-witch-save";
                recapRoleBadge = "witch";
                break;
              case "witch_poison":
                recapClass = "anim-witch-poison";
                recapRoleBadge = "witch";
                break;
              case "hang":
                recapClass = "anim-hang";
                break;
              case "seer":
                recapClass = "anim-seer";
                recapRoleBadge = "seer";
                break;
              case "tough_guy_endured":
                recapClass = "anim-guard-shield";
                recapRoleBadge = "tough_guy";
                break;
              case "cursed_transformed":
                recapClass = "anim-wolf-bite";
                recapRoleBadge = "cursed";
                break;
              case "death":
                recapClass = "anim-hang";
                break;
              default:
                break;
            }
          }

          let myFinalVote = null;
          if (phase === "day_final_vote" && finalVotes) {
            myFinalVote = finalVotes[p.id];
          }

          return (
            <div
              key={p.id}
              data-player-id={p.id}
              className={`player-circle-item ${isDead ? "dead" : ""} ${isSelected ? "selected" : ""} ${hasNominated ? "nominated" : ""} ${onSeat ? "hot-seat" : ""} ${recapClass} ${showRed ? "dead-or-victim" : ""} ${seerResultClass} ${!p.alive ? "dimmed" : ""} ${isWolfTeammate ? "wolf-teammate" : ""} ${isDisconnected ? "disconnected" : ""} ${isSpeaking ? "is-speaking" : ""}`}
              style={{
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
              onClick={() => p.alive && onSelectPlayer && onSelectPlayer(p.id)}
            >
              <div className="avatar-card-3d">
                <div className="avatar-wrapper">
                  {/* Chân dung 3D Studio WebP đồng bộ 1:1 với Sân khấu 3D */}
                  <img
                    src={portraitSrc}
                    alt={p.name}
                    className={`avatar-img studio-2d-portrait ${isMe ? "avatar-me" : ""}`}
                    style={avatarStyle}
                  />
                  {/* Huy hiệu Avatar người chơi nhỏ gọn ở góc dưới trái */}
                  {p.avatar && (
                    <img
                      src={p.avatar}
                      alt=""
                      className="player-mini-self-pip"
                      style={{
                        position: "absolute",
                        left: -4,
                        bottom: -3,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "1.5px solid rgba(250, 204, 21, 0.8)",
                        background: "#0f172a",
                        zIndex: 4,
                      }}
                    />
                  )}
                  {isMe && roleColor && (
                    <div
                      className="me-role-ring"
                      style={{ borderColor: roleColor, boxShadow: `0 0 10px ${roleColor}` }}
                    />
                  )}
                  {isDisconnected && <div className="disconnect-overlay">⚡</div>}
                  {wolfPicksOnThis > 0 && (
                    <div className="wolf-target-badge" title="Mục tiêu bầy Sói chọn">
                      {wolfPicksOnThis}×
                    </div>
                  )}
                  {isWolfTeammate && (
                    <div className="wolf-badge" style={{ padding: 0, overflow: "hidden" }}>
                      <RolePortrait roleKey="wolf" size={20} />
                    </div>
                  )}
                  {isMayorPublic && (
                    <div className="wolf-badge" style={{ padding: 0, overflow: "hidden", left: -4, right: "auto" }}>
                      <RolePortrait roleKey="mayor" size={20} />
                    </div>
                  )}
                  {isLover && (
                    <div
                      className="wolf-badge"
                      title="Tình Nhân Sinh Tử"
                      style={{ padding: 0, overflow: "hidden", top: -6, left: -4, right: "auto" }}
                    >
                      <RolePortrait roleKey="cupid" size={20} />
                    </div>
                  )}
                  {isSpeaking && <div className="speaking-badge">🎙</div>}
                  {recapRoleBadge && (
                    <div className="recap-anim-overlay">
                      <RolePortrait roleKey={recapRoleBadge} size={28} glow />
                    </div>
                  )}
                </div>
              </div>

              {phase === "day_final_vote" && p.id === defendantId && (
                <div className="defendant-badge">Bị Phán Xét</div>
              )}

              <div
                className="player-name-plate"
                style={
                  isMe && roleColor
                    ? { color: roleColor, fontWeight: 700, textShadow: `0 0 8px ${roleColor}` }
                    : undefined
                }
              >
                #{seatIdx + 1} {p.name}
                {isMe && <span className="you-indicator"> ★</span>}
              </div>

              {visibleRoleLabel && (
                <div
                  style={{
                    marginTop: 1,
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: "10px",
                    fontWeight: 800,
                    background: "rgba(9, 13, 26, 0.88)",
                    border: `1px solid ${roleColor}88`,
                    color: "#fef08a",
                    whiteSpace: "nowrap",
                  }}
                >
                  {visibleRoleLabel}
                </div>
              )}

              {voters.length > 0 && (
                <div className="mini-voters-container">
                  {voters.map((v) => (
                    <img
                      key={v.id}
                      src={v.avatar}
                      className="mini-voter-img"
                      alt={v.name}
                      title={v.name}
                    />
                  ))}
                </div>
              )}

              {myFinalVote && (
                <div className={`final-vote-badge ${myFinalVote}`}>
                  {myFinalVote === "hang" ? "Treo Cổ" : "Tha"}
                </div>
              )}

              {showWolfChat && <div className="speech-bubble">{wolfMessage}</div>}

              {reactions
                .filter((r) => r.name === p.name)
                .map((r, i) => (
                  <div key={r.id || i} className="floating-reaction">
                    {r.emoji}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

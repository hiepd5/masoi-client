import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ROLE_COLORS, ROLE_EMOJIS } from "../../config/roles.config.js";
import {
  getUniverseRoleEmoji,
  normalizeUniverseId,
} from "../../config/universeThemes.config.js";

export const SUSPECT_TAG_META = {
  wolf: { id: "wolf", short: "🐺 Nghi Sói", officeShort: "👔 Nghi Sếp", schoolShort: "👩‍🏫 Nghi GV", bg: "rgba(185, 28, 28, 0.92)", border: "#fca5a5", color: "#fee2e2" },
  trust: { id: "trust", short: "🛡️ Đáng Tin", officeShort: "🛡️ Đồng Nghiệp Tốt", schoolShort: "🛡️ Bạn Cùng Bàn", bg: "rgba(21, 128, 61, 0.92)", border: "#86efac", color: "#dcfce7" },
  power: { id: "power", short: "🔮 Chức Năng", officeShort: "💻 Cốt Cán", schoolShort: "🎽 Cán Sự Lớp", bg: "rgba(109, 40, 217, 0.92)", border: "#d8b4fe", color: "#f3e8ff" },
  unknown: { id: "unknown", short: "❓ Khó Đoán", officeShort: "❓ Bí Ẩn", schoolShort: "❓ Khó Đoán", bg: "rgba(180, 83, 9, 0.92)", border: "#fde047", color: "#fef9c3" },
};

const _projVec = new THREE.Vector3();

/**
 * MOBILE 60FPS SHIELD — BỘ CHIẾU TỌA ĐỘ 1-LƯỢT DUY NHẤT TRONG <Canvas>
 * - Thay thế toàn bộ 8–18 gốc React <Html> Drei rời rạc bằng 1 vòng lặp toán học nhẹ ~0.04ms/frame!
 * - Cập nhật trực tiếp style.transform = translate3d(...) trên DOM phẳng bên ngoài <Canvas> (0 React re-render theo frame).
 */
export function SeatHudProjector3D({ orderedPlayers, seatMap, domMapRef, active = true }) {
  useFrame((state) => {
    if (!active || !domMapRef?.current) return;
    const cam = state.camera;
    const width = state.size.width;
    const height = state.size.height;
    if (width <= 0 || height <= 0) return;

    const halfW = width * 0.5;
    const halfH = height * 0.5;

    for (let i = 0; i < orderedPlayers.length; i += 1) {
      const p = orderedPlayers[i];
      const el = domMapRef.current.get(p.id);
      if (!el) continue;

      const st = seatMap?.[p.id];
      if (!st) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        continue;
      }

      const worldY = p.isEmptyLobbySeat ? 1.0 : !p.alive ? 1.66 : 1.56;
      _projVec.set(st.x, worldY, st.z);

      const dist = cam.position.distanceTo(_projVec);
      _projVec.project(cam);

      // Ẩn mượt nếu ghế nằm sau lưng ống kính camera hoặc văng quá xa mép màn hình
      if (_projVec.z > 1.0 || _projVec.z < -1.0 || Math.abs(_projVec.x) > 1.18 || Math.abs(_projVec.y) > 1.18) {
        if (el.style.opacity !== "0") {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
        continue;
      }

      const sx = _projVec.x * halfW + halfW;
      const sy = -_projVec.y * halfH + halfH;
      const scale = THREE.MathUtils.clamp(6.4 / Math.max(dist, 6.4), 0.8, 1.0);

      el.style.opacity = "1";
      el.style.pointerEvents = p.isEmptyLobbySeat || !p.alive ? "none" : "auto";
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
  });

  return null;
}

/**
 * LỚP PHỦ NHÃN GHẾ PHẲNG DUY NHẤT BÊN NGOÀI <Canvas> (0% DREI <Html> OVERHEAD)
 */
export function SeatHudBatchOverlay({
  domMapRef,
  orderedPlayers = [],
  me = null,
  phase = "lobby",
  myRole = null,
  cameraMode = "shoulder",
  selectedPlayerId = null,
  selectedActionMeta = null,
  onSelectPlayer = null,
  defendantId = null,
  wolfVictimId = null,
  wolfTeammates = [],
  wolfPicksVisible = null,
  wolfChatLog = {},
  seerLastResult = null,
  nominationVotes = {},
  finalVotes = {},
  mayorRevealedId = null,
  myLoverPartnerId = null,
  hunterPendingId = null,
  cupidSelectedIds = [],
  speakingIds = [],
  reactions = [],
  suspectTags = {},
  onLobbyKickPlayer = null,
  universeId = "classic",
}) {
  const isLobbyPhase = phase === "lobby";
  const cleanUniverse = normalizeUniverseId(universeId);

  useEffect(() => {
    return () => {
      domMapRef?.current?.clear?.();
    };
  }, [domMapRef]);

  return (
    <div
      className="seat-hud-batch-layer"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 8,
      }}
    >
      {orderedPlayers.map((player) => {
        const setEl = (node) => {
          if (!domMapRef?.current) return;
          if (node) domMapRef.current.set(player.id, node);
          else domMapRef.current.delete(player.id);
        };

        if (player.isEmptyLobbySeat) {
          return (
            <div
              key={player.id}
              ref={setEl}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                opacity: 0,
                willChange: "transform, opacity",
                pointerEvents: "none",
                userSelect: "none",
                whiteSpace: "nowrap",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "10.5px",
                fontWeight: 600,
                color: "rgba(226, 232, 240, 0.58)",
                background: "rgba(15, 23, 42, 0.48)",
                border: "1px dashed rgba(148, 163, 184, 0.3)",
              }}
            >
              🪑 {player.name}
            </div>
          );
        }

        const isMe = Boolean(me?.id && player.id === me.id);
        const actualIsDead = !player.alive;
        const isSelected = selectedPlayerId === player.id;
        const isDefendant = defendantId === player.id;
        const isWolfVictim = Boolean(wolfVictimId && player.id === wolfVictimId && myRole === "witch");
        const isWolfTeammate = wolfTeammates.includes(player.id);
        const isSpeaking = speakingIds.includes(player.id);
        const isMayorRevealed = Boolean(mayorRevealedId && mayorRevealedId === player.id);
        const isMyLoverPartner = Boolean(myLoverPartnerId && myLoverPartnerId === player.id);
        const isCupidSelected = Array.isArray(cupidSelectedIds) && cupidSelectedIds.includes(player.id);
        const isHunterPending = Boolean(hunterPendingId && hunterPendingId === player.id);
        const canLobbyKick = Boolean(isLobbyPhase && me?.isHost && !isMe);
        const chatBubbleText = wolfChatLog?.[player.id] || null;
        const myFinalVote = finalVotes?.[player.id] || null;
        const suspectTagKey = !isLobbyPhase && !isMe ? suspectTags?.[player.id] || null : null;
        const suspectMeta = suspectTagKey ? SUSPECT_TAG_META[suspectTagKey] : null;

        let wolfPicksOnThis = 0;
        if (wolfPicksVisible) {
          Object.values(wolfPicksVisible).forEach((pick) => {
            if (pick?.targetId === player.id) wolfPicksOnThis += 1;
          });
        }

        let nominationCount = 0;
        if (phase === "day_nominate" && nominationVotes) {
          Object.values(nominationVotes).forEach((v) => {
            if (v?.targetId === player.id) nominationCount += 1;
          });
        }

        const seerResult =
          seerLastResult?.targetId === player.id ? seerLastResult.result : null;
        const playerReactions = reactions.filter((r) => r.name === player.name);
        const roleAccentColor = ROLE_COLORS[myRole] || "#fbbf24";

        return (
          <div
            key={player.id}
            ref={setEl}
            onClick={() => !actualIsDead && onSelectPlayer && onSelectPlayer(player.id)}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              opacity: 0,
              willChange: "transform, opacity",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              cursor: actualIsDead ? "default" : "pointer",
              userSelect: "none",
              whiteSpace: "nowrap",
              transformOrigin: "center bottom",
            }}
          >
            {playerReactions.map((r, idx) => (
              <div
                key={r.id || idx}
                className="floating-reaction"
                style={{ position: "static", fontSize: "18px" }}
              >
                {r.emoji}
              </div>
            ))}

            {chatBubbleText && (
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(255,255,255,0.24)",
                  color: "#f8fafc",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  maxWidth: "155px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {chatBubbleText}
              </div>
            )}

            {suspectMeta && (
              <div
                style={{
                  background: suspectMeta.bg,
                  border: `1px solid ${suspectMeta.border}`,
                  color: suspectMeta.color,
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "1px 7px",
                  borderRadius: "999px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.55)",
                }}
              >
                {cleanUniverse === "office"
                  ? suspectMeta.officeShort
                  : cleanUniverse === "school"
                    ? suspectMeta.schoolShort
                    : suspectMeta.short}
              </div>
            )}

            {isSelected && !actualIsDead && selectedActionMeta?.canConfirm && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginBottom: "1px",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectedActionMeta.onConfirm?.();
                  }}
                  style={{
                    width: "auto",
                    margin: 0,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 800,
                    background: selectedActionMeta.accent || "#f59e0b",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.45)",
                    boxShadow: "0 3px 10px rgba(0,0,0,0.65)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ✓ {selectedActionMeta.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectedActionMeta.onClear?.();
                  }}
                  title="Bỏ chọn"
                  style={{
                    width: "20px",
                    height: "20px",
                    margin: 0,
                    padding: 0,
                    borderRadius: "50%",
                    fontSize: "10px",
                    fontWeight: 800,
                    background: "rgba(15, 23, 42, 0.88)",
                    color: "#cbd5e1",
                    border: "1px solid rgba(255,255,255,0.25)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {(!isMe || cameraMode === "overview" || isSelected) && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "11.5px",
                  lineHeight: 1.25,
                  fontWeight: isMe ? 800 : 600,
                  background: actualIsDead
                    ? "rgba(15, 23, 42, 0.58)"
                    : isSelected
                      ? "rgba(245, 158, 11, 0.94)"
                      : "rgba(6, 9, 30, 0.84)",
                  color:
                    isSelected && !actualIsDead
                      ? "#0f172a"
                      : isMe
                        ? roleAccentColor
                        : actualIsDead
                          ? "#94a3b8"
                          : "#f1f5f9",
                  border: `1px solid ${
                    isSelected && !actualIsDead
                      ? "#fde68a"
                      : isMe
                        ? roleAccentColor
                        : isDefendant
                          ? "#fb923c"
                          : isWolfTeammate
                            ? "#ef4444"
                            : "rgba(255,255,255,0.18)"
                  }`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.52)",
                }}
              >
                {isSpeaking && <span>🔊</span>}
                {!player.connected && !isLobbyPhase && <span>🔌</span>}
                {isLobbyPhase && (
                  <span>{player.isHost ? "👑" : player.ready ? "🟢" : "⏳"}</span>
                )}
                {actualIsDead && <span>{cleanUniverse === "office" ? "🪫" : cleanUniverse === "school" ? "📒" : "👻"}</span>}
                {isHunterPending && (
                  <span title="Đang tung kỹ năng phản đòn cuối!">
                    {cleanUniverse === "office" ? "📁" : cleanUniverse === "school" ? "📢" : "🏹"}
                  </span>
                )}
                {isMayorRevealed && (
                  <span
                    style={{
                      background: "linear-gradient(135deg, #f59e0b, #b45309)",
                      color: "#0f172a",
                      fontWeight: 900,
                      fontSize: "9.5px",
                      padding: "0 4px",
                      borderRadius: "999px",
                    }}
                  >
                    {cleanUniverse === "office" ? "🏅x2" : cleanUniverse === "school" ? "⭐x2" : "👑x2"}
                  </span>
                )}
                {isMyLoverPartner && <span title="Đồng minh ghép đôi của bạn">💘</span>}
                {isCupidSelected && <span title="Đã chọn ghép đôi">💘</span>}
                {isDefendant && <span title="Đang giải trình trên Ghế Nóng">⚖️</span>}
                {isWolfVictim && (
                  <span title="Mục tiêu bị nhắm đêm nay">
                    {cleanUniverse === "office" ? "📉" : cleanUniverse === "school" ? "📝" : "🩸"}
                  </span>
                )}
                <span>{player.name}</span>
                {isMe && <span>★</span>}
                {isLobbyPhase && canLobbyKick && onLobbyKickPlayer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLobbyKickPlayer(player);
                    }}
                    title={`Kick ${player.name} khỏi phòng`}
                    style={{
                      width: "16px",
                      height: "16px",
                      margin: "0 0 0 2px",
                      padding: 0,
                      borderRadius: "50%",
                      fontSize: "9px",
                      fontWeight: 800,
                      background: "rgba(220, 38, 38, 0.85)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      pointerEvents: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                )}
                {actualIsDead && player.role && (
                  <span style={{ fontSize: "10.5px", fontWeight: 700, opacity: 0.95 }}>
                    {cleanUniverse === "classic"
                      ? ROLE_EMOJIS[player.role]
                      : getUniverseRoleEmoji(player.role, cleanUniverse)}
                  </span>
                )}
                {wolfPicksOnThis > 0 && (
                  <span
                    style={{
                      background: "#dc2626",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "10px",
                      padding: "0 5px",
                      borderRadius: "999px",
                    }}
                  >
                    {wolfPicksOnThis}
                    {cleanUniverse === "office" ? "👔" : cleanUniverse === "school" ? "👩‍🏫" : "🐺"}
                  </span>
                )}
                {seerResult && phase === "night_seer" && (
                  <span
                    style={{
                      background: seerResult === "wolf" ? "#dc2626" : "#2563eb",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "10px",
                      padding: "0 5px",
                      borderRadius: "999px",
                    }}
                  >
                    {seerResult === "wolf"
                      ? cleanUniverse === "office"
                        ? "🔴SẾP"
                        : cleanUniverse === "school"
                          ? "🔴GV"
                          : "🔴SÓI"
                      : "🔵Tốt"}
                  </span>
                )}
                {nominationCount > 0 && phase === "day_nominate" && (
                  <span
                    style={{
                      background: "rgba(250, 204, 21, 0.28)",
                      color: isSelected ? "#0f172a" : "#fef08a",
                      fontWeight: 800,
                      fontSize: "10px",
                      padding: "0 5px",
                      borderRadius: "999px",
                    }}
                  >
                    🗳️{nominationCount}
                  </span>
                )}
                {myFinalVote && phase === "day_final_vote" && (
                  <span
                    style={{
                      background: myFinalVote === "hang" ? "#dc2626" : "#16a34a",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "10px",
                      padding: "0 5px",
                      borderRadius: "999px",
                    }}
                  >
                    {myFinalVote === "hang"
                      ? cleanUniverse === "office"
                        ? "📋"
                        : cleanUniverse === "school"
                          ? "📒"
                          : "🪢"
                      : cleanUniverse === "office"
                        ? "🤝"
                        : cleanUniverse === "school"
                          ? "🙋"
                          : "🕊️"}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

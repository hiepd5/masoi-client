import React from "react";
import "./PlayingView.css"; // We will add specific styles here or in index.css

export default function PlayerCircle({
  players,
  me,
  phase,
  myRole,
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
  recapAnimation = null,
  wolfTeammates = [],
  speakingIds = [],
}) {
  const numPlayers = players.length;
  const radius = 140;

  // Màu glow theo vai — dùng để làm ring xung quanh avatar của chính mình
  const ROLE_COLORS = {
    wolf:     '#ef4444',
    seer:     '#a855f7',
    guard:    '#3b82f6',
    witch:    '#22c55e',
    tanner:   '#9ca3af',
    villager: '#eab308',
  };

  return (
    <div className="player-circle-container">
      {/* Campfire / Center Chat */}
      <div className="campfire-center">
        <div className="campfire-icon">🔥</div>
      </div>

      {/* Players */}
      {players.map((p, index) => {
        const angle = (index / numPlayers) * 2 * Math.PI - Math.PI / 2; // start from top
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);

        // Highlight logic
        const isDead = !p.alive;
        const isWolfVictim = p.id === wolfVictimId && myRole === "witch";
        const isNightDeath = nightDeaths && nightDeaths.includes(p.id);
        const showRed = isDead || isWolfVictim || isNightDeath;
        const isSelected = selectedPlayerId === p.id;
        
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

        // Show picks for wolves
        let wolfPicksOnThis = 0;
        if (wolfPicksVisible) {
          Object.values(wolfPicksVisible).forEach(pick => {
            if (pick.targetId === p.id) wolfPicksOnThis++;
          });
        }

        // Show nomination voters (mini avatars)
        let voters = [];
        if (phase === "day_nominate" && nominationVotes) {
          Object.entries(nominationVotes).forEach(([voterId, vote]) => {
            if (vote.targetId === p.id) {
              const voterPlayer = players.find(pl => pl.id === voterId);
              if (voterPlayer) voters.push(voterPlayer);
            }
          });
        }

        const hasNominated = nominationVotes && Object.values(nominationVotes).some(v => v.targetId === p.id);
        const onSeat = p.id === defendantId;
        const isWolfTeammate = wolfTeammates.includes(p.id);
        const isSpeaking = (speakingIds || []).includes(p.id);
        const isDisconnected = !p.connected;
        const isMe = p.id === me?.id;
        const roleColor = isMe ? (ROLE_COLORS[myRole] || '#ffffff') : null;

        // Inline style cho avatar của chính mình: ring màu theo vai
        const avatarStyle = isMe && roleColor ? {
          boxShadow: `0 0 0 3px ${roleColor}, 0 0 18px ${roleColor}99, 0 0 35px ${roleColor}44`,
          transform: 'scale(1.12)',
          transition: 'all 0.3s ease',
        } : {};
        
        let recapClass = "";
        let recapIcon = null;
        if (recapAnimation && recapAnimation.targetId === p.id) {
          switch (recapAnimation.type) {
            case "wolf": recapClass = "anim-wolf-bite"; recapIcon = "🐺"; break;
            case "guard": recapClass = "anim-guard-shield"; recapIcon = "🛡️"; break;
            case "witch_save": recapClass = "anim-witch-save"; recapIcon = "🧪"; break;
            case "witch_poison": recapClass = "anim-witch-poison"; recapIcon = "☠️"; break;
            case "hang": recapClass = "anim-hang"; recapIcon = "🪢"; break;
            case "seer": recapClass = "anim-seer"; recapIcon = "👁️"; break;
            default: break;
          }
        }

        // Show final vote for defendant (who voted hang vs spare)
        let myFinalVote = null;
        if (phase === "day_final_vote" && finalVotes) {
          myFinalVote = finalVotes[p.id];
        }

        return (
          <div
            key={p.id}
            className={`player-circle-item ${isDead ? "dead" : ""} ${isSelected ? "selected" : ""} ${hasNominated ? "nominated" : ""} ${onSeat ? "hot-seat" : ""} ${recapClass} ${showRed ? "dead-or-victim" : ""} ${seerResultClass} ${!p.alive ? "dimmed" : ""} ${isWolfTeammate ? "wolf-teammate" : ""} ${isDisconnected ? "disconnected" : ""} ${isSpeaking ? "is-speaking" : ""}`}
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
            }}
            onClick={() => p.alive && onSelectPlayer && onSelectPlayer(p.id)}
          >
            <div className="avatar-wrapper">
              <img src={p.avatar} alt={p.name} className={`avatar-img ${isMe ? 'avatar-me' : ''}`} style={avatarStyle} />
              {isMe && roleColor && (
                <div className="me-role-ring" style={{ borderColor: roleColor, boxShadow: `0 0 10px ${roleColor}` }} />
              )}
              {isDisconnected && <div className="disconnect-overlay">🔌</div>}
              {wolfPicksOnThis > 0 && <div className="wolf-target-badge">{wolfPicksOnThis} 🐺</div>}
              {isWolfTeammate && <div className="wolf-badge">🐺</div>}
              {isSpeaking && <div className="speaking-badge">🎤</div>}
              {recapIcon && (
                <div className="recap-anim-overlay">{recapIcon}</div>
              )}
            </div>
            
            {phase === "day_final_vote" && p.id === defendantId && (
              <div className="defendant-badge">
                Bị Phán Xét
              </div>
            )}

            <div className="player-name-plate" style={isMe && roleColor ? { color: roleColor, fontWeight: 700, textShadow: `0 0 8px ${roleColor}` } : {}}>
              {p.name}{isMe && <span className="you-indicator"> ★</span>}
            </div>

            {/* Hiển thị ai đang vote cho người này (Day Nominate) */}
            {voters.length > 0 && (
              <div className="mini-voters-container">
                {voters.map(v => (
                  <img key={v.id} src={v.avatar} className="mini-voter-img" alt={v.name} title={v.name} />
                ))}
              </div>
            )}

            {/* Hiển thị biểu quyết của người này (Day Final Vote) */}
            {myFinalVote && (
              <div className={`final-vote-badge ${myFinalVote}`}>
                {myFinalVote === "hang" ? "Treo Cổ" : "Tha"}
              </div>
            )}
            
            {showWolfChat && (
              <div className="speech-bubble">
                {wolfMessage}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


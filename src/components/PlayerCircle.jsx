import React from "react";
import "./PlayingView.css"; // We will add specific styles here or in index.css

export default function PlayerCircle({
  players,
  me,
  phase,
  myRole,
  onSelectPlayer,
  selectedPlayerId,
  wolfVictimId, // to show red for witch
  nightDeaths, // to show red for day
  wolfPicksVisible,
  wolfChatLog,
  seerLastResult, // { targetId, result: "wolf" | "not_wolf" }
  nominationVotes,
  finalVotes = {}, // { voterId: 'hang' | 'spare' }
  defendantId = null,
  recapAnimation = null,
  wolfTeammates = [],
}) {
  const numPlayers = players.length;
  const radius = 140; // radius of the circle

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
            className={`player-circle-item ${isDead ? "dead" : ""} ${isSelected ? "selected" : ""} ${hasNominated ? "nominated" : ""} ${onSeat ? "hot-seat" : ""} ${recapClass} ${showRed ? "dead-or-victim" : ""} ${seerResultClass} ${!p.alive ? "dimmed" : ""} ${isWolfTeammate ? "wolf-teammate" : ""}`}
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
            }}
            onClick={() => p.alive && onSelectPlayer && onSelectPlayer(p.id)}
          >
            <div className="avatar-wrapper">
              <img src={p.avatar} alt={p.name} className="avatar-img" />
              {wolfPicksOnThis > 0 && <div className="wolf-target-badge">{wolfPicksOnThis} 🐺</div>}
              {isWolfTeammate && <div className="wolf-badge">🐺</div>}
              {recapIcon && (
                <div className="recap-anim-overlay">{recapIcon}</div>
              )}
            </div>
            
            {phase === "day_final_vote" && p.id === defendantId && (
              <div className="defendant-badge">
                Bị Phán Xét
              </div>
            )}

            <div className="player-name-plate">
              {p.name} {p.id === me?.id && "(Bạn)"}
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


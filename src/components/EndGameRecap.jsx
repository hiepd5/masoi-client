import { useState, useEffect } from 'react';

import { ROLE_LABELS, ROLE_EMOJIS, ROLE_COLORS } from '../config/roles.config.js';


const WINNER_CONFIG = {
  wolf:    { emoji:'🐺', title:'Phe Sói Chiến Thắng!', subtitle:'Bóng tối đã nuốt chửng cả làng...', bg:'rgba(239,68,68,0.15)', border:'rgba(239,68,68,0.4)' },
  village: { emoji:'🏆', title:'Phe Dân Chiến Thắng!', subtitle:'Ánh sáng công lý đã xua tan bóng tối!', bg:'rgba(34,197,94,0.15)', border:'rgba(34,197,94,0.4)' },
  tanner:  { emoji:'💀', title:'Chán Đời Chiến Thắng!', subtitle:'Người này thực sự muốn bị treo cổ. Thật kỳ lạ!', bg:'rgba(156,163,175,0.15)', border:'rgba(156,163,175,0.4)' },
};

const EVENT_ICONS = {
  wolf: '🐺', guard: '🛡️', witch_save: '💚', witch_poison: '☠️',
  seer: '🔮', hang: '🪢', spare: '🕊️', death: '💀', win: '🏆',
};

export default function EndGameRecap({ history, isHost, onRestart, onAnimate, players = [], winner }) {
  const [phase, setPhase] = useState('splash'); // 'splash' | 'flip' | 'timeline' | 'turning' | 'done'
  const [flippedCount, setFlippedCount] = useState(0);
  const [timelineIndex, setTimelineIndex] = useState(-1);
  const [showTurning, setShowTurning] = useState(false);

  // Phase 1: splash for 2.5s then move to flip
  useEffect(() => {
    if (phase !== 'splash') return;
    const t = setTimeout(() => setPhase('flip'), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  // Phase 2: flip cards staggered 300ms each, then move to timeline
  useEffect(() => {
    if (phase !== 'flip') return;
    if (flippedCount < players.length) {
      const t = setTimeout(() => setFlippedCount(c => c + 1), 300);
      return () => clearTimeout(t);
    } else {
      // All flipped — wait 1s then timeline
      const t = setTimeout(() => { setPhase('timeline'); setTimelineIndex(0); }, 1000);
      return () => clearTimeout(t);
    }
  }, [phase, flippedCount, players.length]);

  // Phase 3: timeline events
  useEffect(() => {
    if (phase !== 'timeline') return;
    if (!history || history.length === 0) { setPhase('turning'); return; }
    if (timelineIndex < history.length) {
      const event = history[timelineIndex];
      onAnimate?.(event);
      const t = setTimeout(() => setTimelineIndex(i => i + 1), 2500);
      return () => clearTimeout(t);
    } else {
      onAnimate?.(null);
      const t = setTimeout(() => setPhase('turning'), 800);
      return () => clearTimeout(t);
    }
  }, [phase, timelineIndex, history]);

  // Phase 4: show turning point then done
  useEffect(() => {
    if (phase !== 'turning') return;
    setShowTurning(true);
    const t = setTimeout(() => setPhase('done'), 4000);
    return () => clearTimeout(t);
  }, [phase]);

  const turningPoints = computeTurningPoints(history || [], players);
  const winConfig = WINNER_CONFIG[winner] || WINNER_CONFIG.village;

  // Group history events by day
  const byDay = {};
  (history || []).forEach(ev => {
    const key = ev.day;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(ev);
  });

  const flatEvents = (history || []);

  return (
    <div className="recap-cinema-overlay">
      <div className="recap-cinema-panel">

        {/* PHASE 1 + always visible header: winner splash */}
        <div className={`recap-winner-splash ${phase === 'splash' ? 'splash-active' : 'splash-done'}`}
             style={{ background: winConfig.bg, borderColor: winConfig.border }}>
          <div className="recap-winner-emoji">{winConfig.emoji}</div>
          <h2 className="recap-winner-title">{winConfig.title}</h2>
          <p className="recap-winner-sub">{winConfig.subtitle}</p>
        </div>

        {/* PHASE 2: Card flip grid */}
        {(phase === 'flip' || phase === 'timeline' || phase === 'turning' || phase === 'done') && (
          <div className="recap-flip-section">
            <h3 className="recap-section-title">🃏 Danh Tính Thật</h3>
            <div className="recap-cards-grid">
              {players.map((p, i) => (
                <div key={p.id}
                     className={`recap-card ${i < flippedCount ? 'flipped' : ''} ${p.role === 'wolf' ? 'card-wolf' : 'card-village'}`}>
                  <div className="recap-card-inner">
                    <div className="recap-card-front">
                      <div className="recap-card-back-icon">🎴</div>
                    </div>
                    <div className="recap-card-back">
                      <img src={p.avatar} className="recap-card-avatar" alt={p.name} />
                      <div className="recap-card-role" style={{ color: ROLE_COLORS[p.role] || '#fff' }}>
                        {ROLE_EMOJIS[p.role]} {ROLE_LABELS[p.role]}
                      </div>
                      <div className="recap-card-name">{p.name}</div>
                      {!p.alive && <div className="recap-card-dead">💀</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PHASE 3: Timeline */}
        {(phase === 'timeline' || phase === 'turning' || phase === 'done') && (
          <div className="recap-timeline-section">
            <h3 className="recap-section-title">📜 Diễn Biến Từng Đêm</h3>
            <div className="recap-timeline">
              {Object.entries(byDay).map(([day, events]) => (
                <div key={day} className="recap-day-block">
                  <div className="recap-day-header">🌙 Đêm {day}</div>
                  {events.map((ev, ei) => {
                    const flatIdx = flatEvents.indexOf(ev);
                    const visible = flatIdx <= timelineIndex || phase !== 'timeline';
                    return (
                      <div key={ei}
                           className={`recap-event-row ${visible ? 'event-visible' : 'event-hidden'}`}
                           style={{ '--ev-color': getEventColor(ev.type) }}>
                        <span className="recap-event-icon">{EVENT_ICONS[ev.type] || '📌'}</span>
                        <span className="recap-event-text">{getEventText(ev, players)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PHASE 4: Turning Points */}
        {showTurning && turningPoints.length > 0 && (
          <div className="recap-turning-section">
            <h3 className="recap-section-title">🔑 Điểm Quyết Định</h3>
            {turningPoints.map((tp, i) => (
              <div key={i} className="recap-turning-row">
                <span className="turning-bullet">•</span>
                <span className="turning-text">{tp}</span>
              </div>
            ))}
          </div>
        )}

        {/* PHASE 5: Restart */}
        {phase === 'done' && (
          <div className="recap-restart-section">
            {isHost ? (
              <button className="btn-primary recap-restart-btn" onClick={onRestart}>
                🎮 Bắt đầu ván mới
              </button>
            ) : (
              <p className="waiting-text">⏳ Đang chờ chủ phòng bắt đầu ván mới...</p>
            )}
          </div>
        )}

        {/* Skip button */}
        {phase !== 'done' && (
          <button className="recap-skip-btn" onClick={() => {
            onAnimate?.(null);
            setPhase('done');
          }}>⏭ Bỏ qua</button>
        )}

      </div>
    </div>
  );
}

function getEventColor(type) {
  const map = {
    wolf:'#ef4444', guard:'#3b82f6', witch_save:'#22c55e',
    witch_poison:'#a855f7', seer:'#c084fc', hang:'#f97316',
    spare:'#86efac', death:'#ef4444', win:'#fbbf24',
  };
  return map[type] || '#ffffff';
}

function getEventText(ev, players) {
  const target = players.find(p => p.id === ev.targetId);
  const src    = players.find(p => p.id === ev.sourceId);
  const tName  = target?.name || '?';
  const sName  = src?.name || '?';
  switch (ev.type) {
    case 'wolf':         return `Bầy sói tấn công trong bóng đêm...`;
    case 'guard':        return `Bảo vệ lặng lẽ che chắn cho ${tName}...`;
    case 'witch_save':   return `Phù thủy dốc bình cứu ${tName}!`;
    case 'witch_poison': return `Phù thủy gieo độc cho ${tName}...`;
    case 'seer':         return ev.text || `Tiên tri soi ${tName}...`;
    case 'hang':         return `Làng treo cổ ${tName}!`;
    case 'spare':        return `Làng tha bổng ${tName}.`;
    case 'death':        return `${tName} không qua khỏi đêm...`;
    default:             return ev.text || '';
  }
}

function computeTurningPoints(history, players) {
  const points = [];
  history.forEach(ev => {
    if (ev.type === 'witch_save') {
      const t = players.find(p => p.id === ev.targetId);
      points.push(`Đêm ${ev.day}: Phù thủy cứu thành công${t ? ` — ${t.name} sống sót quan trọng` : ''} → Bước ngoặt lớn!`);
    }
    if (ev.type === 'hang') {
      const t = players.find(p => p.id === ev.targetId);
      if (t?.role === 'wolf') {
        points.push(`Ngày ${ev.day}: Làng treo đúng Sói ${t.name} → Thắng lợi quyết định!`);
      } else if (t?.role === 'guard' || t?.role === 'seer') {
        points.push(`Ngày ${ev.day}: Làng treo nhầm ${ROLE_LABELS[t.role] || t.role} ${t.name} → Mất lớp bảo vệ quan trọng!`);
      }
    }
    if (ev.type === 'witch_poison') {
      const t = players.find(p => p.id === ev.targetId);
      if (t?.role === 'wolf') {
        points.push(`Phù thủy gieo độc trúng Sói ${t?.name || ''} → Đòn quyết định!`);
      }
    }
  });
  return points.slice(0, 3);
}

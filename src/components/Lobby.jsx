import { useState } from "react";
import { saveSession } from "../hooks/useSocket.js";

const RANDOM_NAMES = [
  "Rồng Lửa", "Bóng Đêm", "Sói Xám", "Ánh Sao", "Hổ Phách",
  "Mây Trắng", "Cáo Vàng", "Bão Tố", "Ngọc Bích", "Sấm Sét",
];

const DICEBEAR_SEEDS = [
  'wolf','fox','bear','dragon','witch','guard','seer','farmer',
  'ninja','ghost','knight','wizard','hunter','monk','sage',
  'rogue','bard','paladin','ranger','druid'
];

const CUSTOM_AVATARS = Array.from({ length: 10 }, (_, i) =>
  `/avatars/custom/avatar_${String(i + 1).padStart(2, '0')}.png`
);

const ROLE_RULES = [
  { emoji: '🐺', name: 'Sói',      desc: 'Mỗi đêm bí mật chọn 1 nạn nhân. Ban ngày che giấu danh tính!' },
  { emoji: '🛡️', name: 'Bảo Vệ', desc: 'Mỗi đêm bảo vệ 1 người khỏi Sói. Không trùng 2 đêm liên tiếp.' },
  { emoji: '🔮', name: 'Tiên Tri',desc: 'Mỗi đêm soi 1 người: 🔴 Sói, 🔵 Người tốt.' },
  { emoji: '🧪', name: 'Phù Thủy',desc: 'Có 1 bình cứu + 1 bình độc. Dùng đúng thời điểm!' },
  { emoji: '💀', name: 'Chán Đời',desc: 'Thắng nếu bị làng treo cổ! Hãy làm mọi người nghi ngờ bạn.' },
  { emoji: '👨‍🌾', name: 'Nông Dân',desc: 'Quan sát, suy luận, thuyết phục làng treo đúng Sói.' },
];

const RULES_TABS = [
  { id: 'roles',   label: '🎭 Các Vai' },
  { id: 'flow',    label: '🔄 Luật Chơi' },
  { id: 'tips',    label: '💡 Mẹo' },
];

function suggestName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

export default function Lobby({ socketRef, onJoined }) {
  const [name, setName] = useState(() => sessionStorage.getItem('ws_name') || '');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Avatar
  const [avatarTab, setAvatarTab] = useState('custom');
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState(
    () => sessionStorage.getItem('ws_avatar_url') || CUSTOM_AVATARS[0]
  );

  // Rules modal
  const [showRules, setShowRules] = useState(false);
  const [rulesTab, setRulesTab] = useState('roles');

  function persistName(n) {
    sessionStorage.setItem('ws_name', n);
  }

  function persistAvatar(url) {
    sessionStorage.setItem('ws_avatar_url', url);
    setSelectedAvatarUrl(url);
  }

  function handleCreateRoom() {
    setError('');
    const finalName = name.trim() || suggestName();
    setLoading(true);
    persistName(finalName);
    socketRef.current.emit('room:create', {}, (res) => {
      setLoading(false);
      if (!res.ok) { setError(res.error || 'Không thể tạo phòng.'); return; }
      socketRef.current.emit('room:rename', { newName: finalName, avatarUrl: selectedAvatarUrl }, () => {
        if (res.playerId) {
          sessionStorage.setItem('ws_playerId', res.playerId);
          saveSession(res.roomCode, res.sessionToken || '', res.playerId, finalName);
        }
        onJoined(res.roomCode);
      });
    });
  }

  function handleJoinRoom() {
    setError('');
    if (!roomCode.trim()) { setError('Vui lòng nhập mã phòng.'); return; }
    const finalName = name.trim() || suggestName();
    setLoading(true);
    persistName(finalName);
    socketRef.current.emit(
      'room:join',
      { roomCode: roomCode.trim().toUpperCase(), name: finalName, avatarUrl: selectedAvatarUrl },
      (res) => {
        setLoading(false);
        if (!res.ok) { setError(res.error || 'Không thể vào phòng.'); return; }
        if (res.playerId) {
          sessionStorage.setItem('ws_playerId', res.playerId);
          saveSession(res.roomCode, res.sessionToken || '', res.playerId, finalName);
        }
        onJoined(res.roomCode);
      }
    );
  }

  const dicebearUrl = (seed) =>
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

  return (
    <>
      {/* Rules Modal */}
      {showRules && (
        <div className="rules-modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={e => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h2>📖 Luật Chơi Ma Sói</h2>
              <button className="rules-close" onClick={() => setShowRules(false)}>✕</button>
            </div>

            {/* Tab bar */}
            <div className="rules-tab-bar">
              {RULES_TABS.map(t => (
                <button
                  key={t.id}
                  className={`rules-tab-btn ${rulesTab === t.id ? 'active' : ''}`}
                  onClick={() => setRulesTab(t.id)}
                >{t.label}</button>
              ))}
            </div>

            <div className="rules-body">
              {/* Roles tab */}
              {rulesTab === 'roles' && (
                <div className="rules-roles-list">
                  {ROLE_RULES.map(r => (
                    <div key={r.name} className="rules-role-row">
                      <span className="rules-role-emoji">{r.emoji}</span>
                      <div>
                        <div className="rules-role-name">{r.name}</div>
                        <div className="rules-role-desc">{r.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Flow tab */}
              {rulesTab === 'flow' && (
                <div className="rules-flow">
                  <div className="flow-step">
                    <span className="flow-icon">🌙</span>
                    <div>
                      <div className="flow-title">Đêm</div>
                      <div className="flow-desc">Các vai đặc biệt hành động bí mật theo lượt: Bảo Vệ → Sói → Phù Thủy → Tiên Tri.</div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">☀️</span>
                    <div>
                      <div className="flow-title">Bình Minh</div>
                      <div className="flow-desc">Công bố ai chết đêm qua (nếu có). Người chết lật thẻ bài lộ vai trò.</div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">💬</span>
                    <div>
                      <div className="flow-title">Thảo Luận</div>
                      <div className="flow-desc">Mọi người nói chuyện, nghi ngờ ai, chia sẻ thông tin (3 phút).</div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">🗳️</span>
                    <div>
                      <div className="flow-title">Đề Cử & Vote</div>
                      <div className="flow-desc">Đề cử người nghi là Sói. Ai đủ phiếu sẽ lên ghế nóng biện hộ. Sau đó cả làng vote Treo Cổ hay Tha.</div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">🏆</span>
                    <div>
                      <div className="flow-title">Điều Kiện Thắng</div>
                      <div className="flow-desc">🐺 Sói thắng khi số Sói ≥ Dân còn sống. 👥 Dân thắng khi treo hết Sói. 💀 Chán Đời thắng riêng nếu bị làng treo cổ.</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tips tab */}
              {rulesTab === 'tips' && (
                <div className="rules-tips">
                  <div className="tip-item">💡 Sói thường bảo vệ đồng đội bằng cách đổ lỗi cho người khác.</div>
                  <div className="tip-item">💡 Tiên Tri không nên khai danh tính quá sớm — Sói sẽ nhắm vào ngay.</div>
                  <div className="tip-item">💡 Phù Thủy không cần cứu ngay đêm đầu — hãy dành bình cứu cho thời điểm quyết định.</div>
                  <div className="tip-item">💡 Chú ý ai vote tha cho ai — Sói thường tha đồng đội.</div>
                  <div className="tip-item">💡 Bảo Vệ nên bảo vệ Tiên Tri ở những đêm đầu nếu nghi ngờ ai là Tiên Tri.</div>
                  <div className="tip-item">💡 Người nói nhiều mà thiếu lý lẽ thường đáng nghi nhất!</div>
                </div>
              )}
            </div>

            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowRules(false)}>
              Đã hiểu, vào chơi!
            </button>
          </div>
        </div>
      )}

      {/* Main Lobby Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ margin: 0 }}>🐺 Ma Sói Online</h1>
          <button
            onClick={() => setShowRules(true)}
            style={{
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.5)',
              color: '#a5b4fc',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            📖 Luật Chơi
          </button>
        </div>
        <p className="subtitle">Chơi cùng bạn bè từ xa</p>

        <label>Tên của bạn</label>
        <input
          type="text"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nhập tên bạn muốn hiển thị..."
          autoFocus
        />

        {/* Avatar Picker — 2 tab */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[{ id: 'custom', label: '🎨 Ảnh thật' }, { id: 'dice', label: '🤖 Nhân vật' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAvatarTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: 8,
                  border: `1.5px solid ${avatarTab === tab.id ? '#f59e0b' : 'rgba(255,255,255,0.15)'}`,
                  background: avatarTab === tab.id ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  color: avatarTab === tab.id ? '#fde68a' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >{tab.label}</button>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            maxHeight: 200,
            overflowY: 'auto',
            padding: 4,
          }}>
            {avatarTab === 'custom'
              ? CUSTOM_AVATARS.map(url => (
                  <img
                    key={url}
                    src={url}
                    alt="avatar"
                    onClick={() => persistAvatar(url)}
                    onError={e => { e.target.style.display = 'none'; }}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 12, cursor: 'pointer', objectFit: 'cover',
                      border: selectedAvatarUrl === url ? '2.5px solid #f59e0b' : '2px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.08)',
                      boxShadow: selectedAvatarUrl === url ? '0 0 14px rgba(245,158,11,0.6)' : 'none',
                      transform: selectedAvatarUrl === url ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.15s',
                    }}
                  />
                ))
              : DICEBEAR_SEEDS.map(seed => {
                  const url = dicebearUrl(seed);
                  return (
                    <img
                      key={seed}
                      src={url}
                      alt={seed}
                      onClick={() => persistAvatar(url)}
                      style={{
                        width: '100%', aspectRatio: '1', borderRadius: 12, cursor: 'pointer',
                        border: selectedAvatarUrl === url ? '2.5px solid #f59e0b' : '2px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.08)',
                        boxShadow: selectedAvatarUrl === url ? '0 0 14px rgba(245,158,11,0.6)' : 'none',
                        transform: selectedAvatarUrl === url ? 'scale(1.1)' : 'scale(1)',
                        transition: 'all 0.15s',
                      }}
                    />
                  );
                })
            }
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <button className="btn-primary" onClick={handleCreateRoom} disabled={loading}>
          Tạo phòng mới
        </button>

        <div className="divider">— hoặc —</div>

        <label>Mã phòng</label>
        <input
          value={roomCode}
          maxLength={5}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          placeholder="VD: A3F9K"
        />
        <button className="btn-secondary" onClick={handleJoinRoom} disabled={loading}>
          Vào phòng
        </button>
      </div>
    </>
  );
}

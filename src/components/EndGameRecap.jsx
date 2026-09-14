import { useState, useEffect, useRef, useMemo } from "react";
import { ROLE_LABELS, ROLE_EMOJIS, ROLE_COLORS } from "../config/roles.config.js";
import "./EndGameRecap.css";

const WINNER_CONFIG = {
  wolf: {
    emoji: "🐺",
    title: "Phe Sói Chiến Thắng!",
    subtitle: "Bóng tối đã hoàn toàn nuốt chửng ngôi làng...",
    themeClass: "wolf",
  },
  village: {
    emoji: "🏆",
    title: "Phe Dân Chiến Thắng!",
    subtitle: "Ánh sáng công lý đã xua tan nanh vuốt bóng đêm!",
    themeClass: "village",
  },
  tanner: {
    emoji: "💀",
    title: "Chán Đời Chiến Thắng!",
    subtitle: "Kẻ chán sống đã thực hiện được tâm nguyện được treo cổ!",
    themeClass: "tanner",
  },
};

export default function EndGameRecap({
  history = [],
  awards = [],
  isHost,
  onRestart,
  onAnimate,
  players = [],
  winner = "village",
}) {
  const [activeTab, setActiveTab] = useState("reveal"); // 'reveal' | 'clash' | 'awards'
  const [flippedMap, setFlippedMap] = useState({});
  const [selectedDay, setSelectedDay] = useState(1);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recapSpeed, setRecapSpeed] = useState(1); // 1 or 1.5

  const winConfig = WINNER_CONFIG[winner] || WINNER_CONFIG.village;

  // Compute all distinct days from history
  const allDays = useMemo(() => {
    const daySet = new Set();
    history.forEach((h) => {
      if (h.day) daySet.add(h.day);
    });
    const days = Array.from(daySet).sort((a, b) => a - b);
    return days.length > 0 ? days : [1];
  }, [history]);

  // Flip cards one by one automatically at the start
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < players.length) {
        const p = players[index];
        setFlippedMap((prev) => ({ ...prev, [p.id]: true }));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 280);

    return () => clearInterval(interval);
  }, [players]);

  // Group events by day & categorize into Night and Day
  const dayBundles = useMemo(() => {
    const map = {};
    allDays.forEach((d) => {
      map[d] = {
        day: d,
        night: [],
        daytime: [],
        nightClash: null,
        dayTribunal: null,
      };
    });

    history.forEach((ev) => {
      const d = ev.day || 1;
      if (!map[d]) {
        map[d] = { day: d, night: [], daytime: [], nightClash: null, dayTribunal: null };
      }

      if (
        ["guard", "wolf", "witch_save", "witch_poison", "seer", "tough_guy_endured", "cursed_transformed", "death", "peaceful_night"].includes(
          ev.type
        )
      ) {
        map[d].night.push(ev);
      } else {
        map[d].daytime.push(ev);
      }
    });

    // Analyze Clash for each day
    allDays.forEach((d) => {
      const b = map[d];
      const wolfEv = b.night.find((e) => e.type === "wolf" && e.targetId);
      const guardEv = b.night.find((e) => e.type === "guard" && e.targetId);
      const witchSaveEv = b.night.find((e) => e.type === "witch_save" && e.targetId);
      const witchPoisonEv = b.night.find((e) => e.type === "witch_poison" && e.targetId);
      const seerEv = b.night.find((e) => e.type === "seer" && e.targetId);
      const toughGuyEv = b.night.find((e) => e.type === "tough_guy_endured");
      const cursedEv = b.night.find((e) => e.type === "cursed_transformed");
      const deathEvs = b.night.filter((e) => e.type === "death");

      const targetId = wolfEv?.targetId;
      const victim = targetId ? players.find((p) => p.id === targetId) : null;
      const guard = guardEv?.sourceId ? players.find((p) => p.id === guardEv.sourceId) : null;
      const guardTarget = guardEv?.targetId ? players.find((p) => p.id === guardEv.targetId) : null;
      const witchSaveTarget = witchSaveEv?.targetId ? players.find((p) => p.id === witchSaveEv.targetId) : null;
      const witchPoisonTarget = witchPoisonEv?.targetId ? players.find((p) => p.id === witchPoisonEv.targetId) : null;
      const seerTarget = seerEv?.targetId ? players.find((p) => p.id === seerEv.targetId) : null;

      let outcomeType = "peaceful"; // 'saved' | 'bloody' | 'peaceful'
      let outcomeText = "Đêm bình yên trôi qua, không ai tử nạn!";

      if (deathEvs.length > 0) {
        outcomeType = "bloody";
        const deadNames = deathEvs.map((e) => players.find((p) => p.id === e.targetId)?.name || "Người dân").join(", ");
        outcomeText = `Sáng hôm sau, ${deadNames} đã không thể qua khỏi!`;
      } else if (wolfEv && (guardTarget?.id === wolfEv.targetId || witchSaveTarget?.id === wolfEv.targetId)) {
        outcomeType = "saved";
        const savior =
          guardTarget?.id === wolfEv.targetId ? `Bảo Vệ ${guard?.name || ""}` : "Bình thuốc cứu của Phù Thủy";
        outcomeText = `${victim?.name || "Nạn nhân"} bị Sói tấn công nhưng được ${savior} cứu sống thần kỳ!`;
      } else if (toughGuyEv) {
        outcomeType = "saved";
        outcomeText = "Người Cứng Cỏi bị Sói cắn nhưng đã kiên cường gượng dậy, thoát chết ngoạn mục đêm nay!";
      } else if (cursedEv) {
        outcomeType = "saved";
        outcomeText = "Kẻ Bị Nguyền bị cắn nhưng không chết, mà dòng máu Sói thức tỉnh, chính thức thành Sói!";
      }

      b.nightClash = {
        wolfVictim: victim,
        guard,
        guardTarget,
        witchSaveTarget,
        witchPoisonTarget,
        seerTarget,
        seerIsWolf: seerEv?.isWolf || seerEv?.text?.includes("là Sói"),
        toughGuyEv,
        cursedEv,
        deathEvs,
        outcomeType,
        outcomeText,
      };

      // Tribunal
      const nomEv = b.daytime.find((e) => e.type === "nomination");
      const hangEv = b.daytime.find((e) => e.type === "hang");
      const spareEv = b.daytime.find((e) => e.type === "spare");

      const defEv = hangEv || spareEv;
      const defendant = defEv?.targetId ? players.find((p) => p.id === defEv.targetId) : null;

      b.dayTribunal = {
        nominees: nomEv?.nominees || [],
        defendant,
        isHanged: Boolean(hangEv),
        isSpared: Boolean(spareEv),
        hangCount: defEv?.hangCount || 0,
        spareCount: defEv?.spareCount || 0,
        votesDetail: defEv?.votesDetail || {},
        role: defEv?.targetRole || defendant?.role,
      };
    });

    return map;
  }, [history, allDays, players]);

  // TTS Speech helper
  function speakNarration(text) {
    if (!speechEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "vi-VN";
      utter.rate = 0.88 * recapSpeed;
      utter.pitch = 0.95;
      utter.volume = 0.9;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  }

  // Trigger animations & speech when selected day changes in clash tab
  useEffect(() => {
    if (activeTab !== "clash") return;
    const bundle = dayBundles[selectedDay];
    if (!bundle) return;

    // Trigger visual animation in player circle
    const firstNightEvent = bundle.night.find((e) => e.type === "wolf") || bundle.night[0];
    if (firstNightEvent) {
      onAnimate?.(firstNightEvent);
    }

    // Speak outcome
    if (bundle.nightClash) {
      speakNarration(`Đêm thứ ${selectedDay}. ${bundle.nightClash.outcomeText}`);
    }
  }, [activeTab, selectedDay, dayBundles, onAnimate]);

  // Autoplay progression
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => {
      const currIdx = allDays.indexOf(selectedDay);
      if (currIdx < allDays.length - 1) {
        setSelectedDay(allDays[currIdx + 1]);
      } else {
        setIsPlaying(false);
        setActiveTab("awards");
      }
    }, 4500 / recapSpeed);

    return () => clearTimeout(timer);
  }, [isPlaying, selectedDay, allDays, recapSpeed]);

  function handleFlipAll() {
    const all = {};
    players.forEach((p) => (all[p.id] = true));
    setFlippedMap(all);
  }

  const currentBundle = dayBundles[selectedDay];

  return (
    <div className="recap-cinema-overlay">
      <div className="recap-cinema-container">
        {/* --- TOP CINEMA BAR & TABS --- */}
        <header className="recap-top-nav">
          <div className="recap-tabs-list">
            <button
              className={`btn-recap-tab ${activeTab === "reveal" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("reveal");
                onAnimate?.(null);
              }}
            >
              🏆 Lật Bài & Vinh Quang
            </button>
            <button
              className={`btn-recap-tab ${activeTab === "clash" ? "active" : ""}`}
              onClick={() => setActiveTab("clash")}
            >
              ⚔️ Diễn Biến Từng Ngày
            </button>
            <button
              className={`btn-recap-tab ${activeTab === "awards" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("awards");
                onAnimate?.(null);
              }}
            >
              👑 Bảng Vàng & MVP ({awards.length})
            </button>
          </div>

          <div className="recap-quick-tools">
            <button
              className="btn-recap-tool"
              onClick={() => setSpeechEnabled((prev) => !prev)}
              title={speechEnabled ? "Tắt đọc MC" : "Bật đọc MC"}
            >
              {speechEnabled ? "🔊 Giọng MC" : "🔇 Tắt MC"}
            </button>
            <button
              className="btn-recap-tool"
              onClick={() => setRecapSpeed((s) => (s === 1 ? 1.5 : 1))}
              title="Tốc độ diễn hoạt"
            >
              ⚡ {recapSpeed}x
            </button>
          </div>
        </header>

        {/* --- MAIN BODY CONTENT --- */}
        <main className="recap-content-body">
          {/* ================= TAB 1: REVEAL & WINNER ================= */}
          {activeTab === "reveal" && (
            <>
              <div className={`recap-winner-hero ${winConfig.themeClass}`}>
                <div className="recap-winner-emoji-big">{winConfig.emoji}</div>
                <h2 className="recap-winner-title-big">{winConfig.title}</h2>
                <p className="recap-winner-quote">"{winConfig.subtitle}"</p>
              </div>

              <div className="recap-cards-heading">
                <h3>🃏 Danh Tính Thật Của Mọi Người</h3>
                <button className="btn-recap-tool" onClick={handleFlipAll}>
                  Lật tất cả ✓
                </button>
              </div>

              <div className="recap-cards-grid-3d">
                {players.map((p) => {
                  const isFlipped = Boolean(flippedMap[p.id]);
                  const roleKey = p.role || "villager";
                  const team = roleKey === "wolf" ? "wolf" : roleKey === "tanner" ? "neutral" : "village";

                  return (
                    <div
                      key={p.id}
                      className={`card-flip-item ${isFlipped ? "flipped" : ""}`}
                      onClick={() =>
                        setFlippedMap((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                      }
                      title="Bấm để lật thẻ bài"
                    >
                      <div className="card-flip-inner">
                        {/* Mặt úp ban đầu */}
                        <div className="card-flip-front">
                          <span className="back-pattern-icon">🎴</span>
                          <span className="back-name">{p.name}</span>
                        </div>

                        {/* Mặt ngửa danh tính thật */}
                        <div className={`card-flip-back ${team}`}>
                          <img src={p.avatar} alt={p.name} className="card-flip-avatar" />
                          <span
                            className="card-flip-role-badge"
                            style={{ color: ROLE_COLORS[roleKey] || "#fff" }}
                          >
                            {ROLE_EMOJIS[roleKey]} {ROLE_LABELS[roleKey]}
                          </span>
                          <span className="card-flip-player-name">{p.name}</span>
                          <span
                            className={`card-flip-status-pill ${p.alive ? "alive" : "dead"}`}
                          >
                            {p.alive ? "🟢 Còn sống" : "💀 Tử nạn"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ================= TAB 2: NIGHT CLASH & DAY TRIBUNAL ================= */}
          {activeTab === "clash" && (
            <div className="recap-day-container">
              {/* Day Selector Pills */}
              <div className="recap-days-selector">
                {allDays.map((d) => (
                  <button
                    key={d}
                    className={`btn-day-pill ${selectedDay === d ? "active" : ""}`}
                    onClick={() => {
                      setSelectedDay(d);
                      setIsPlaying(false);
                    }}
                  >
                    🌙☀️ Ngày {d}
                  </button>
                ))}
              </div>

              {/* Night Clash Section */}
              {currentBundle?.nightClash && (
                <div className="night-clash-card">
                  <div className="night-clash-header">
                    <h4>🌙 Đêm {selectedDay} — Đấu Trí Bí Mật</h4>
                    <span style={{ fontSize: "0.82rem", color: "#a5b4fc" }}>
                      {currentBundle.night.length} hành động đêm
                    </span>
                  </div>

                  <div className="clash-actions-stream">
                    {/* Sói cắn */}
                    {currentBundle.nightClash.wolfVictim && (
                      <div className="clash-action-row">
                        <div className="clash-action-icon" style={{ color: "#ef4444" }}>
                          🐺
                        </div>
                        <div className="clash-action-desc">
                          Đàn Sói đã bí mật nhắm vào:{" "}
                          <strong>{currentBundle.nightClash.wolfVictim.name}</strong>
                        </div>
                      </div>
                    )}

                    {/* Bảo vệ */}
                    {currentBundle.nightClash.guardTarget && (
                      <div className="clash-action-row">
                        <div className="clash-action-icon" style={{ color: "#3b82f6" }}>
                          🛡️
                        </div>
                        <div className="clash-action-desc">
                          Bảo Vệ {currentBundle.nightClash.guard ? `[${currentBundle.nightClash.guard.name}] ` : ""}
                          lặng lẽ che chắn cho:{" "}
                          <strong>{currentBundle.nightClash.guardTarget.name}</strong>
                        </div>
                      </div>
                    )}

                    {/* Phù Thủy Cứu */}
                    {currentBundle.nightClash.witchSaveTarget && (
                      <div className="clash-action-row">
                        <div className="clash-action-icon" style={{ color: "#22c55e" }}>
                          🧪
                        </div>
                        <div className="clash-action-desc">
                          Phù Thủy mở bình tiên dược, <strong>cứu sống {currentBundle.nightClash.witchSaveTarget.name}!</strong>
                        </div>
                      </div>
                    )}

                    {/* Phù Thủy Độc */}
                    {currentBundle.nightClash.witchPoisonTarget && (
                      <div className="clash-action-row">
                        <div className="clash-action-icon" style={{ color: "#a855f7" }}>
                          ☠️
                        </div>
                        <div className="clash-action-desc">
                          Phù Thủy tung bình độc hạ gục:{" "}
                          <strong>{currentBundle.nightClash.witchPoisonTarget.name}</strong>
                        </div>
                      </div>
                    )}

                    {/* Tiên Tri soi */}
                    {currentBundle.nightClash.seerTarget && (
                      <div className="clash-action-row">
                        <div className="clash-action-icon" style={{ color: "#818cf8" }}>
                          🔮
                        </div>
                        <div className="clash-action-desc">
                          Tiên Tri đã soi <strong>{currentBundle.nightClash.seerTarget.name}</strong> và phát hiện:{" "}
                          <span
                            style={{
                              color: currentBundle.nightClash.seerIsWolf ? "#ef4444" : "#4ade80",
                              fontWeight: 800,
                            }}
                          >
                            {currentBundle.nightClash.seerIsWolf ? "🔴 Là SÓI!" : "🔵 Là Dân Lành"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Người Cứng Cỏi */}
                    {currentBundle.nightClash.toughGuyEv && (
                      <div className="clash-action-row" style={{ background: "rgba(249, 115, 22, 0.15)" }}>
                        <div className="clash-action-icon">💪</div>
                        <div className="clash-action-desc" style={{ color: "#fdba74" }}>
                          Người Cứng Cỏi bị Sói tấn công nhưng đã kiên cường gượng dậy, sống sót qua ngày!
                        </div>
                      </div>
                    )}

                    {/* Kẻ Bị Nguyền */}
                    {currentBundle.nightClash.cursedEv && (
                      <div className="clash-action-row" style={{ background: "rgba(100, 116, 139, 0.2)" }}>
                        <div className="clash-action-icon">🌑</div>
                        <div className="clash-action-desc" style={{ color: "#cbd5e1" }}>
                          Kẻ Bị Nguyền bị cắn nhưng dòng máu Sói đã thức tỉnh, biến thành Sói từ đêm tiếp theo!
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Kết quả sáng hôm sau */}
                  <div
                    className={`clash-outcome-banner ${currentBundle.nightClash.outcomeType}`}
                  >
                    <span>
                      {currentBundle.nightClash.outcomeType === "saved"
                        ? "✨"
                        : currentBundle.nightClash.outcomeType === "bloody"
                        ? "💀"
                        : "🕊️"}
                    </span>
                    <span>{currentBundle.nightClash.outcomeText}</span>
                  </div>
                </div>
              )}

              {/* Day Tribunal Section */}
              {currentBundle?.dayTribunal && currentBundle.dayTribunal.defendant && (
                <div className="day-tribunal-card">
                  <div className="day-tribunal-header">
                    <h4>☀️ Ngày {selectedDay} — Tòa Án Phán Quyết</h4>
                    <span style={{ fontSize: "0.82rem", color: "#fde047" }}>
                      Bị cáo: <strong>{currentBundle.dayTribunal.defendant.name}</strong>
                    </span>
                  </div>

                  <div className="tribunal-votes-grid">
                    {/* Cột Treo Cổ */}
                    <div className="tribunal-vote-column hang">
                      <div className="vote-column-title" style={{ color: "#f87171" }}>
                        <span>🪢 Phiếu Treo Cổ</span>
                        <span>{currentBundle.dayTribunal.hangCount} phiếu</span>
                      </div>
                      <div className="vote-voters-list">
                        {Object.entries(currentBundle.dayTribunal.votesDetail)
                          .filter(([, v]) => v === "hang")
                          .map(([voterId]) => {
                            const p = players.find((x) => x.id === voterId);
                            return (
                              <span key={voterId} className="voter-pill">
                                {p?.name || voterId}
                              </span>
                            );
                          })}
                      </div>
                    </div>

                    {/* Cột Tha Bổng */}
                    <div className="tribunal-vote-column spare">
                      <div className="vote-column-title" style={{ color: "#4ade80" }}>
                        <span>🕊️ Phiếu Tha Bổng</span>
                        <span>{currentBundle.dayTribunal.spareCount} phiếu</span>
                      </div>
                      <div className="vote-voters-list">
                        {Object.entries(currentBundle.dayTribunal.votesDetail)
                          .filter(([, v]) => v === "spare")
                          .map(([voterId]) => {
                            const p = players.find((x) => x.id === voterId);
                            return (
                              <span key={voterId} className="voter-pill">
                                {p?.name || voterId}
                              </span>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                  {/* Bản án chốt */}
                  <div
                    className={`tribunal-verdict-banner ${
                      currentBundle.dayTribunal.isHanged
                        ? currentBundle.dayTribunal.role === "wolf"
                          ? "hanged-wolf"
                          : "hanged-innocent"
                        : "spared"
                    }`}
                  >
                    <span>{currentBundle.dayTribunal.isHanged ? "⚖️" : "🕊️"}</span>
                    <span>
                      {currentBundle.dayTribunal.isHanged ? (
                        <>
                          Làng đã quyết định <strong>Treo Cổ {currentBundle.dayTribunal.defendant.name}</strong>. Danh tính thực sự:{" "}
                          <span style={{ textDecoration: "underline" }}>
                            {ROLE_EMOJIS[currentBundle.dayTribunal.role]}{" "}
                            {ROLE_LABELS[currentBundle.dayTribunal.role] || currentBundle.dayTribunal.role}
                          </span>
                          !{" "}
                          {currentBundle.dayTribunal.role === "wolf"
                            ? "🎉 Tiêu diệt Sói xuất sắc!"
                            : currentBundle.dayTribunal.role === "tanner"
                            ? "💀 Cả làng bị Chán Đời đánh lừa!"
                            : "😱 Ôi không! Làng đã treo nhầm người vô tội!"}
                        </>
                      ) : (
                        <>
                          Làng đã quyết định <strong>Tha Bổng {currentBundle.dayTribunal.defendant.name}</strong> với{" "}
                          {currentBundle.dayTribunal.spareCount} phiếu tha!
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: HALL OF FAME & MVP ================= */}
          {activeTab === "awards" && (
            <div className="recap-awards-section">
              {/* MVP Hero Card */}
              {awards.length > 0 && awards[0]?.id === "mvp" && (
                <div className="mvp-hero-card">
                  <div className="mvp-hero-avatar-wrapper">
                    <img
                      src={awards[0].avatar}
                      alt={awards[0].name}
                      className="mvp-hero-avatar"
                    />
                    <span className="mvp-crown-badge">👑</span>
                  </div>
                  <div className="mvp-hero-details">
                    <span className="mvp-badge-tag">🏆 CẦU THỦ XUẤT SẮC NHẤT TRẬN ĐẤU</span>
                    <h3 className="mvp-hero-name">
                      {awards[0].name} ({ROLE_EMOJIS[awards[0].role]} {ROLE_LABELS[awards[0].role] || awards[0].role})
                    </h3>
                    <p className="mvp-hero-desc">{awards[0].description}</p>
                  </div>
                </div>
              )}

              {/* Special Awards Grid */}
              <div className="awards-grid">
                {awards
                  .filter((a) => a.id !== "mvp")
                  .map((award) => (
                    <div
                      key={award.id}
                      className="award-card-item"
                      style={{ borderColor: award.color || "rgba(255,255,255,0.15)" }}
                    >
                      <img
                        src={award.avatar}
                        alt={award.name}
                        className="award-player-avatar"
                        style={{ borderColor: award.color || "#fff" }}
                      />
                      <div className="award-details">
                        <span className="award-title" style={{ color: award.color || "#f1f5f9" }}>
                          {award.title}
                        </span>
                        <span className="award-recipient">
                          {award.name} ({ROLE_EMOJIS[award.role]} {ROLE_LABELS[award.role]})
                        </span>
                        <span className="award-description">{award.description}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>

        {/* --- BOTTOM CINEMA FOOTER & PLAYBACK CONTROLS --- */}
        <footer className="recap-cinema-footer">
          <div className="recap-playback-buttons">
            <button
              className="btn-playback"
              onClick={() => {
                const idx = allDays.indexOf(selectedDay);
                if (idx > 0) setSelectedDay(allDays[idx - 1]);
              }}
              disabled={allDays.indexOf(selectedDay) <= 0}
              title="Lùi lại 1 ngày"
            >
              ◀️ Trước
            </button>

            <button
              className="btn-playback"
              onClick={() => setIsPlaying((p) => !p)}
              style={{ background: isPlaying ? "rgba(239, 68, 68, 0.2)" : "rgba(99, 102, 241, 0.2)" }}
            >
              {isPlaying ? "⏸️ Tạm dừng" : "▶️ Tự động chiếu"}
            </button>

            <button
              className="btn-playback"
              onClick={() => {
                const idx = allDays.indexOf(selectedDay);
                if (idx < allDays.length - 1) setSelectedDay(allDays[idx + 1]);
                else setActiveTab("awards");
              }}
              disabled={allDays.indexOf(selectedDay) >= allDays.length - 1 && activeTab === "awards"}
              title="Tiếp theo"
            >
              Sau ▶️
            </button>
          </div>

          <div className="recap-restart-wrapper">
            {isHost ? (
              <button className="btn-recap-restart-master" onClick={onRestart}>
                🎮 Bắt đầu ván mới
              </button>
            ) : (
              <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                ⏳ Đang chờ Chủ phòng bắt đầu ván mới...
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
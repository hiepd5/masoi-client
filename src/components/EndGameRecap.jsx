import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RolePortrait from "./RolePortrait.jsx";
import { ROLE_COLORS, ROLE_EMOJIS, ROLE_LABELS, isWolfTeamRole } from "../config/roles.config.js";
import {
  getCinemaAudioEngine,
  unlockCinemaAudioEngine,
  startCinemaStoryRecording,
} from "../utils/cinemaVideoRecorder.js";
import { getSession } from "../hooks/useSocket.js";
import { getTtsCacheKey } from "../utils/ttsTextUtils.js";
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
    subtitle: "Kẻ chán sống đã thực hiện được tâm nguyện trên giá treo cổ!",
    themeClass: "tanner",
  },
  lovers: {
    emoji: "💘",
    title: "Cặp Đôi Định Mệnh Chiến Thắng!",
    subtitle: "Tình yêu vượt qua ranh giới Sói và Dân, nắm tay nhau sống sót đến cuối cùng!",
    themeClass: "village",
  },
};

function formatTimecode(ms = 0) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * TIỀN XỬ LÝ BIÊN TẬP ĐIỆN ẢNH TINH GỌN (SMART STORY MONTAGE):
 * - Giữ trọn vẹn mọi vai cá nhân ban đêm, lời mật đàm Sói, lời tranh biện Dân và các cú "quay xe" đổi mục tiêu đắt giá.
 * - Loại bỏ nhiễu (spam click nhá liên tục không đổi ý, thả emoji lặt vặt).
 * - Tự động gom chuỗi lá phiếu lặp lại cuối ngày (`day_final_vote`) vào Đại Cảnh Phán Quyết Pháp Trường Trên Cao để phim sâu lắng, kịch tính mà không lê thê!
 */
function curateCinematicFrames(rawTimeline = []) {
  if (!Array.isArray(rawTimeline) || rawTimeline.length === 0) return [];

  const cleaned = [];
  for (let i = 0; i < rawTimeline.length; i++) {
    const f = rawTimeline[i];
    if (!f || !f.kind) continue;

    // Bỏ qua emoji lẻ khi ván đấu đã có đầy đủ tình tiết cốt truyện
    if (f.kind === "reaction" && rawTimeline.length > 5) continue;

    // Nén chuỗi day_final_vote lẻ tẻ nếu ngay sau đó đã có day_verdict chốt sổ của cùng ngày
    if (f.kind === "day_final_vote") {
      const hasVerdictSameDay = rawTimeline
        .slice(i + 1)
        .some((nxt) => nxt.day === f.day && nxt.kind === "day_verdict" && nxt.targetId === f.targetId);
      if (hasVerdictSameDay) continue;

      // Nếu không có day_verdict (hiếm), chỉ giữ frame day_final_vote cuối cùng chứa đầy đủ votesSnapshot
      const nextSameVote = rawTimeline[i + 1];
      if (
        nextSameVote &&
        nextSameVote.day === f.day &&
        nextSameVote.kind === "day_final_vote" &&
        nextSameVote.targetId === f.targetId
      ) {
        continue;
      }
    }

    // Với day_nominate: giữ mọi cú đổi ý (switched) + giữ cú đề cử đầu tiên mở màn + cú đề cử chốt cuối ngày (gom toàn cảnh)
    if (f.kind === "day_nominate") {
      const switched = Boolean(f.prevTargetId && f.prevTargetId !== f.targetId);
      const prevSameDayNom = cleaned.some((c) => c.day === f.day && c.kind === "day_nominate");
      const moreNomSameDayAhead = rawTimeline
        .slice(i + 1)
        .some((nxt) => nxt.day === f.day && nxt.kind === "day_nominate");

      if (!switched && prevSameDayNom && moreNomSameDayAhead) {
        continue;
      }
      cleaned.push({
        ...f,
        _isCollectiveNominationSummary: prevSameDayNom && !moreNomSameDayAhead && !switched,
      });
      continue;
    }

    // Với wolf_aim: nếu cùng 1 con Sói bấm nhá nhiều lần trong cùng đêm, giữ lần nhắm đầu tiên + cú đổi ý cuối cùng trước khi cắn
    if (f.kind === "wolf_aim") {
      const nextFrame = rawTimeline[i + 1];
      if (
        nextFrame &&
        nextFrame.day === f.day &&
        nextFrame.kind === "wolf_aim" &&
        nextFrame.actorId === f.actorId
      ) {
        continue;
      }
    }

    cleaned.push(f);
  }

  return cleaned;
}

function buildFinaleBeat(players, awards, winner, cloneActorSnapshot, simAliveMap, simRoleMap, loversPublic = []) {
  const mvpAward = awards.find((a) => a.id === "mvp") || awards[0] || null;
  const mvpId = mvpAward?.playerId || players[0]?.id || null;
  const finalOverrides = {};

  players.forEach((p) => {
    simAliveMap[p.id] = Boolean(p.alive);
    simRoleMap[p.id] = p.role || "villager";
    const won =
      (winner === "wolf" && isWolfTeamRole(p.role)) ||
      (winner === "tanner" && p.role === "tanner") ||
      (winner === "lovers" && (loversPublic.includes(p.id) || p.alive)) ||
      (winner === "village" && !isWolfTeamRole(p.role) && p.role !== "tanner");
    if (won && p.alive) {
      finalOverrides[p.id] = { pose: "cheer" };
    }
  });

  if (mvpId) {
    finalOverrides[mvpId] = {
      pose: "cheer",
      isSpotlight: true,
      badgeText: "👑 MVP VÁN ĐẤU!",
      badgeColor: "#d97706",
    };
  }

  return {
    id: "beat_mvp_finale",
    kind: "mvp",
    day: 999,
    elapsedMs: null,
    act1SetupMs: 850,
    tag: "👑 CHƯƠNG CUỐI • VINH DANH",
    title: mvpAward
      ? `Người Hùng Của Đêm Dài: ${mvpAward.name} (${ROLE_LABELS[mvpAward.role] || mvpAward.role})`
      : WINNER_CONFIG[winner]?.title || "Khép Lại Câu Chuyện",
    narration: mvpAward
      ? `Khép lại câu chuyện sinh tử, ngôi vương MVP thuộc về ${mvpAward.name}. ${mvpAward.description}`
      : WINNER_CONFIG[winner]?.subtitle || "Trận đấu đã khép lại!",
    durationMs: 6500,
    mood: "victory",
    cameraShot: {
      shotKey: "shot_mvp_finale",
      shotType: mvpId ? "actor_portrait" : "orbit_reveal",
      targetId: mvpId,
      isMvp: true,
    },
    vfxCue: mvpId
      ? { cueId: "cue_mvp_finale", vfxType: "mvp_crown", targetId: mvpId }
      : null,
    soundKey: "mvp_crown",
    lookAtSeatId: mvpId,
    actorStates: cloneActorSnapshot(finalOverrides),
  };
}

/**
 * BỘ ĐẠO DIỄN PHIM KỂ CHUYỆN CHUYÊN NGHIỆP (PERSONAL POV vs COLLECTIVE HIGH WIDE):
 * - Đến vai cá nhân ai -> Quay về đúng Góc Nhìn Cá Nhân Qua Vai (`actor_pov`) hoặc Chân Dung (`actor_portrait`) của người đó!
 * - CHỈ khi Đàn Sói đồng loạt cắn (`high_pack_hunt`) hoặc Cả Làng Vote / Xử Án (`high_tribunal`) mới kéo máy mở rộng lên cao!
 * - Mỗi cảnh tuân thủ Nhịp 3 Hồi chậm rãi (~5.2s – 6.6s): Lướt máy vào vai (0.95s) -> Ra đòn VFX -> Giữ nhịp lắng đọng hết câu kể MC!
 */
function buildTrueSpaceReplayBeats(replayTimeline = [], history = [], players = [], awards = [], winner = "village", loversPublic = []) {
  const playerById = {};
  players.forEach((p) => {
    playerById[p.id] = p;
  });

  const simAliveMap = {};
  const simRoleMap = {};
  const enduringSet = new Set();

  players.forEach((p) => {
    simAliveMap[p.id] = true;
    simRoleMap[p.id] = p.initialRole || p.role || "villager";
  });

  const cloneActorSnapshot = (overrides = {}) => {
    const out = {};
    players.forEach((p) => {
      out[p.id] = {
        isRevealed: true,
        simAlive: simAliveMap[p.id],
        overrideRole: simRoleMap[p.id],
        enduringFire: enduringSet.has(p.id),
        pose: null,
        badgeText: null,
        badgeColor: null,
        replayChatBubble: null,
        isWolfWhisper: false,
        isSpotlight: false,
        ...(overrides[p.id] || {}),
      };
    });
    return out;
  };

  const beats = [];

  // 1. MỞ MÀN CÂU CHUYỆN: ĐẠI CẢNH LỘT MẶT NẠ BÊN LỬA TRẠI
  beats.push({
    id: "beat_reveal_all",
    kind: "reveal",
    day: 0,
    elapsedMs: 0,
    act1SetupMs: 400,
    tag: "🎭 MỞ MÀN CÂU CHUYỆN",
    title: "Khi Áo Choàng Ẩn Danh Rũ Xuống Bên Lửa Trại",
    narration:
      "Bóng đêm dần tan. Hãy cùng quay ngược thời gian, theo chân từng người trong ngôi làng để chứng kiến toàn bộ sự thật phía sau tấm màn bí mật.",
    durationMs: 4800,
    mood: "dawn",
    cameraShot: { shotKey: "shot_reveal", shotType: "orbit_reveal" },
    vfxCue: { cueId: "cue_reveal", vfxType: "reveal_wave" },
    soundKey: "reveal_wave",
    lookAtSeatId: null,
    actorStates: cloneActorSnapshot(),
  });

  const curatedFrames = curateCinematicFrames(replayTimeline);

  if (curatedFrames.length > 0) {
    curatedFrames.forEach((frame, idx) => {
      const dayNum = frame.day || 1;
      const seqKey = `${frame.seq || idx}_${frame.kind}`;
      const actor = frame.actorId ? playerById[frame.actorId] : null;
      const target = frame.targetId ? playerById[frame.targetId] : null;
      const prevTarget = frame.prevTargetId ? playerById[frame.prevTargetId] : null;

      if (Array.isArray(frame.aliveIds) && frame.aliveIds.length > 0) {
        const aliveSet = new Set(frame.aliveIds);
        players.forEach((p) => {
          simAliveMap[p.id] = aliveSet.has(p.id);
        });
      }
      if (Array.isArray(frame.wolfIdsNow) && frame.wolfIdsNow.length > 0) {
        const wolfSet = new Set(frame.wolfIdsNow);
        players.forEach((p) => {
          const baseRole = p.initialRole || p.role || "villager";
          simRoleMap[p.id] = wolfSet.has(p.id)
            ? baseRole === "alpha_wolf"
              ? "alpha_wolf"
              : "wolf"
            : baseRole;
        });
      }

      const actorName = actor?.name || "Người chơi";
      const targetName = target?.name || "Mục tiêu";
      const prevName = prevTarget?.name || "Mục tiêu cũ";
      const overrides = {};

      switch (frame.kind) {
        case "guard_pick": {
          // VAI CÁ NHÂN BẢO VỆ -> GÓC QUA VAI BẢO VỆ (`actor_pov`)
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "🛡️ HỘ VỆ TRONG ĐÊM",
              badgeColor: "#2563eb",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              badgeText: "🛡️ ĐƯỢC CHE CHỞ",
              badgeColor: "#0284c7",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN BẢO VỆ`,
            title: `Bảo Vệ ${actorName} Lặng Lẽ Canh Gác Cho ${targetName}`,
            narration:
              frame.caption ||
              `Giữa màn sương lạnh Đêm ${dayNum}, Bảo Vệ ${actorName} âm thầm hướng ánh mắt về phía ${targetName} và dựng lên vòm khiên hộ mệnh.`,
            durationMs: 5400,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "guard_aim",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "guard_aim",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "wolf_aim": {
          // CÁ NHÂN SÓI RÌNH MỒI / ĐỔI Ý -> GÓC QUA VAI CON SÓI ĐÓ (`actor_pov`)
          const switched = Boolean(frame.prevTargetId && frame.prevTargetId !== frame.targetId);
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: switched ? "🐺 ĐỔI CON MỒI!" : "🐺 RÌNH MỒI",
              badgeColor: "#dc2626",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              badgeText: "🎯 TRONG TẦM NGẮM",
              badgeColor: "#ef4444",
            };
          }
          if (switched && frame.prevTargetId) {
            overrides[frame.prevTargetId] = {
              badgeText: "💨 THOÁT TẦM VUỐT",
              badgeColor: "#64748b",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN SÓI`,
            title: switched
              ? `Sói ${actorName} Bất Ngờ Đổi Ý Từ ${prevName} Sang ${targetName}`
              : `Ánh Mắt Săn Mồi Của Sói ${actorName} Khóa Chặt ${targetName}`,
            narration: switched
              ? `Từ góc nhìn của Sói ${actorName}, sau một thoáng chần chừ trước ${prevName}, móng vuốt bất ngờ xoay sang nhắm thẳng vào ${targetName}.`
              : `Từ trong bóng tối, Sói ${actorName} nhe nanh hướng thẳng móng vuốt sắc lạnh về phía chiếc ghế của ${targetName}.`,
            durationMs: switched ? 5800 : 5200,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "wolf_aim",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              prevTargetId: frame.prevTargetId,
            },
            soundKey: "wolf_aim",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "wolf_chat": {
          // SÓI THÌ THẦM MẬT ĐÀM -> GÓC CÁ NHÂN CON SÓI ĐANG NÓI (`actor_pov` / `actor_portrait`)
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "defend",
              replayChatBubble: frame.chatText,
              isWolfWhisper: true,
              badgeText: "🐺 MẬT ĐÀM TRONG ĐÊM",
              badgeColor: "#991b1b",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 700,
            tag: `🌙 ĐÊM ${dayNum} • MẬT ĐÀM SÓI`,
            title: `Lời Thì Thầm Bí Mật Của Sói ${actorName}`,
            narration: `Sói ${actorName} khẽ nghiêng người bàn mưu cùng đồng loại: "${frame.chatText || ""}"`,
            dialogueSpeaker: `🐺 ${actorName}`,
            dialogueText: frame.chatText ? `🐺 ${actorName}: "${frame.chatText}"` : null,
            isWolfWhisper: true,
            durationMs: 5500,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: frame.targetId ? "actor_pov" : "actor_portrait",
              sourceId: frame.actorId,
              targetId: frame.targetId || frame.actorId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "wolf_whisper",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "wolf_whisper",
            lookAtSeatId: frame.targetId || frame.actorId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "wolf_strike": {
          // ĐÀN SÓI ĐỒNG LOẠT CẮN -> MỞ RỘNG KHUNG HÌNH LÊN CAO TOÀN CẢNH (`high_pack_hunt`)!
          const packIds = frame.coActorIds?.length ? frame.coActorIds : frame.actorId ? [frame.actorId] : [];
          packIds.forEach((wid) => {
            overrides[wid] = {
              pose: "castLunge",
              badgeText: "🐺 ĐÀN SÓI VỒ MỒI!",
              badgeColor: "#dc2626",
            };
          });
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "hitRecoil",
              badgeText: "🩸 TRÚNG NANH ĐÀN SÓI!",
              badgeColor: "#ef4444",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 1050,
            tag: `🌙 ĐÊM ${dayNum} • ĐẠI CẢNH ĐÀN SÓI CẮN`,
            title: `Cả Đàn Sói Đồng Loạt Lao Ra Tấn Công ${targetName}!`,
            narration: `Thời khắc định đoạt của Đêm ${dayNum}! Khung hình mở rộng toàn cảnh khi cả đàn Sói đồng loạt phóng móng vuốt đỏ rực chụp xuống ${targetName}!`,
            durationMs: 6100,
            mood: "night",
            legacyEvent: { type: "wolf", day: dayNum, sourceId: frame.actorId, targetId: frame.targetId },
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "high_pack_hunt",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              shakeStrength: 0.92,
              shakeDelayMs: 1550,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "wolf_attack",
              sourceId: frame.actorId,
              coActorIds: packIds,
              targetId: frame.targetId,
            },
            soundKey: "wolf_attack",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "shield_block": {
          // VAI CÁ NHÂN BẢO VỆ ĐỠ ĐÒN -> GÓC QUA VAI BẢO VỆ (`actor_pov`)
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "🛡️ KHIÊN THẦN CỨU MẠNG!",
              badgeColor: "#2563eb",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "cheer",
              badgeText: "✨ THOÁT CHẾT NGOẠN MỤC!",
              badgeColor: "#0ea5e9",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • KHIÊN HỘ VỆ CẢN ĐÒN`,
            title: `Khiên Của Bảo Vệ ${actorName} Chặn Đứng Nanh Sói, Cứu Sống ${targetName}!`,
            narration: `Đúng khoảnh khắc sinh tử, vòm khiên ánh sáng của ${actorName} bùng nổ hất văng đòn cắn của đàn Sói, giữ toàn mạng cho ${targetName}!`,
            durationMs: 5900,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              shakeStrength: 0.78,
              shakeDelayMs: 1250,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "guard_block",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "guard_block",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "witch_save": {
          // VAI CÁ NHÂN PHÙ THỦY -> GÓC QUA VAI PHÙ THỦY (`actor_pov`)
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "💚 TUNG TIÊN DƯỢC!",
              badgeColor: "#16a34a",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "cheer",
              badgeText: "💚 CẢI TỬ HOÀN SINH!",
              badgeColor: "#22c55e",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN PHÙ THỦY`,
            title: `Phù Thủy ${actorName} Mở Bình Tiên Dược Cứu Sống ${targetName}`,
            narration: `Chứng kiến ${targetName} hấp hối trong đêm, Phù Thủy ${actorName} quyết định tung bình linh dược xanh ngọc quý giá nhất để kéo họ về từ cõi chết.`,
            durationMs: 5600,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "witch_save",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "witch_save",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "witch_poison": {
          // VAI CÁ NHÂN PHÙ THỦY -> GÓC QUA VAI PHÙ THỦY (`actor_pov`)
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "☠️ NÉM ĐỘC DƯỢC!",
              badgeColor: "#7e22ce",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "hitRecoil",
              badgeText: "☠️ TRÚNG KỊCH ĐỘC!",
              badgeColor: "#9333ea",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN PHÙ THỦY`,
            title: `Phù Thủy ${actorName} Lạnh Lùng Quăng Bình Độc Về Phía ${targetName}`,
            narration: `Từ phía sau vành mũ bí ẩn, Phù Thủy ${actorName} rút chốt bình độc dược tím sẫm và ném thẳng sang chiếc ghế của ${targetName}!`,
            durationMs: 5700,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              shakeStrength: 0.65,
              shakeDelayMs: 1450,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "witch_poison",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "witch_poison",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "seer_scan": {
          // VAI CÁ NHÂN TIÊN TRI -> GÓC QUA VAI TIÊN TRI (`actor_pov`)
          const isWolfResult = frame.decision === "wolf";
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "🔮 KHAI MỞ MẮT THẦN",
              badgeColor: "#6366f1",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              badgeText: isWolfResult ? "🔴 CHÂN TƯỚNG MA SÓI!" : "🔵 TÂM HỒN DÂN LÀNH",
              badgeColor: isWolfResult ? "#dc2626" : "#0284c7",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN TIÊN TRI`,
            title: isWolfResult
              ? `Tiên Tri ${actorName} Phát Hiện Chân Tướng Ma Sói Của ${targetName}!`
              : `Tiên Tri ${actorName} Soi Thấu Sự Trong Sạch Của ${targetName}`,
            narration: isWolfResult
              ? `Qua vai Tiên Tri ${actorName}, luồng sáng pha lê vừa chạm vào ${targetName} lập tức hóa đỏ rực — một con Ma Sói đã lộ diện trong đêm!`
              : `Tiên Tri ${actorName} lặng lẽ chiếu luồng sáng cổ ngữ sang ghế của ${targetName} và nhận được ánh lam hiền hòa của phe Dân Làng.`,
            durationMs: 5700,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "seer_scan",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              isWolfResult,
            },
            soundKey: "seer_scan",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "cursed_turn": {
          // VAI CÁ NHÂN KẺ BỊ NGUYỀN -> GÓC CHÂN DUNG CÁ NHÂN (`actor_portrait`)
          if (frame.targetId) {
            simRoleMap[frame.targetId] = "wolf";
            overrides[frame.targetId] = {
              // Khởi đầu là Kẻ Bị Nguyền co giật ôm đầu; đúng nhịp 42% (~950ms) tự bung cánh hú trăng hóa Sói!
              overrideRole: "cursed",
              pose: "cheer",
              badgeText: "🌑➡️🐺 HÓA THÀNH SÓI!",
              badgeColor: "#9333ea",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 900,
            tag: `🌙 ĐÊM ${dayNum} • HUYẾT NGUYỀN THỨC TỈNH`,
            title: `Bước Ngoặt Định Mệnh — ${targetName} Hóa Thành Ma Sói Mới!`,
            narration: `Sau cú cắn trong đêm, chiếc mặt nạ phong ấn của ${targetName} vỡ vụn! Dòng máu Sói âm ỉ bấy lâu chính thức trỗi dậy.`,
            durationMs: 6000,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_portrait",
              targetId: frame.targetId,
              shakeStrength: 0.72,
              shakeDelayMs: 950,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "cursed_transform",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "cursed_transform",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "tough_endure": {
          if (frame.targetId) {
            enduringSet.add(frame.targetId);
            overrides[frame.targetId] = {
              enduringFire: true,
              pose: "cheer",
              badgeText: "💪 MÌNH ĐỒNG DA SẮT!",
              badgeColor: "#ea580c",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 850,
            tag: `🌙 ĐÊM ${dayNum} • Ý CHÍ TRÁNG SĨ`,
            title: `Người Cứng Cỏi ${targetName} Nghiến Răng Chịu Đựng Vết Cắn Sói`,
            narration: `Dù trúng đòn chí mạng trong đêm, ý chí sắt đá vẫn giúp ${targetName} gồng mình trụ vững để đón ánh bình minh thêm một ngày nữa!`,
            durationMs: 5500,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_portrait",
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "tough_guy_endure",
              targetId: frame.targetId,
            },
            soundKey: "tough_guy_endure",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "night_death": {
          if (frame.targetId) {
            simAliveMap[frame.targetId] = false;
            enduringSet.delete(frame.targetId);
            overrides[frame.targetId] = {
              simAlive: false,
              badgeText: "👻 LÌA ĐỜI ĐÊM QUA",
              badgeColor: "#475569",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "dawn",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 650,
            tag: `☀️ BÌNH MINH NGÀY ${dayNum}`,
            title: `Bình Minh Tang Tóc — ${targetName} Không Qua Khỏi Đêm Dài`,
            narration: `Khi sương mù tan dần bên bếp lửa, cả làng bàng hoàng nhận ra ${targetName} đã mãi mãi ra đi trong đêm qua.`,
            durationMs: 5300,
            mood: "dawn",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: frame.targetId ? "actor_portrait" : "orbit_reveal",
              targetId: frame.targetId,
            },
            vfxCue: null,
            soundKey: "story",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "peaceful_dawn": {
          beats.push({
            id: `rf_${seqKey}`,
            kind: "dawn",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 500,
            tag: `☀️ BÌNH MINH NGÀY ${dayNum}`,
            title: `Bình Minh Thanh Bình Sau Đêm Nghẹt Thở`,
            narration: `Ánh nắng sớm mai chiếu rọi khắp ngôi làng — kỳ diệu thay, đêm thứ ${dayNum} khép lại mà không một ai phải ngã xuống!`,
            durationMs: 4700,
            mood: "dawn",
            cameraShot: { shotKey: `shot_${seqKey}`, shotType: "orbit_reveal" },
            vfxCue: null,
            soundKey: "story",
            lookAtSeatId: null,
            actorStates: cloneActorSnapshot(),
          });
          break;
        }

        case "village_chat": {
          const isWolfSpeaker = simRoleMap[frame.actorId] === "wolf";
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "defend",
              replayChatBubble: frame.chatText,
              isWolfWhisper: false,
              badgeText: isWolfSpeaker ? "🐺 ĐÓNG KỊCH NGỤY BIỆN" : "💬 LÊN TIẾNG SUY LUẬN",
              badgeColor: isWolfSpeaker ? "#dc2626" : "#d97706",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "day",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 600,
            tag: `☀️ NGÀY ${dayNum} • GÓC CÁ NHÂN TRANH BIỆN`,
            title: isWolfSpeaker
              ? `Sói ${actorName} Bình Thản Ngụy Biện Trước Cả Làng`
              : `${actorName} Cất Tiếng Suy Luận Giữa Vòng Tròn`,
            narration: `${actorName} lên tiếng trước dân làng: "${frame.chatText || ""}"`,
            dialogueText: frame.chatText ? `💬 ${actorName}: "${frame.chatText}"` : null,
            isWolfWhisper: false,
            durationMs: 5200,
            mood: "dawn",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_portrait",
              targetId: frame.actorId,
            },
            vfxCue: null,
            soundKey: "story",
            lookAtSeatId: frame.actorId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "day_nominate": {
          const switched = Boolean(frame.prevTargetId && frame.prevTargetId !== frame.targetId);
          const isCollectiveVote = Boolean(frame._isCollectiveNominationSummary);
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: switched ? "👉 ĐỔI MŨI DÙI!" : "👉 CHỈ MẶT ĐỀ CỬ",
              badgeColor: "#d97706",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "hitRecoil",
              badgeText: "⚖️ TÂM ĐIỂM NGHI NGỜ",
              badgeColor: "#ea580c",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "tribunal",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 900,
            tag: isCollectiveVote
              ? `🗳️ NGÀY ${dayNum} • TOÀN CẢNH BỎ PHIẾU ĐỀ CỬ`
              : `🗳️ NGÀY ${dayNum} • CHỈ TAY CÁ NHÂN`,
            title: switched
              ? `${actorName} Bất Ngờ Đổi Hướng, Chỉ Thẳng Tay Vào ${targetName}!`
              : isCollectiveVote
                ? `Mũi Dùi Của Cả Ngôi Làng Dồn Về Phía ${targetName}`
                : `${actorName} Khơi Mào Nghi Vấn, Chỉ Mặt ${targetName}`,
            narration: isCollectiveVote
              ? `Khung hình mở rộng toàn vòng tròn khi hàng loạt cánh tay trong làng đồng loạt chỉ thẳng về chiếc ghế của ${targetName}!`
              : switched
                ? `Giữa lúc căng thẳng, ${actorName} rút lại lời buộc tội ${prevName} và quay ngoắt sang chỉ mặt ${targetName}!`
                : `Từ góc ghế của mình, ${actorName} đứng thẳng dậy giơ tay đề cử ${targetName} ra trước pháp trường.`,
            durationMs: 5500,
            mood: "dusk_trial",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: isCollectiveVote ? "high_tribunal" : "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "day_point",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              prevTargetId: frame.prevTargetId,
              votesDetail: frame.votesSnapshot || {},
            },
            soundKey: isCollectiveVote ? "day_tribunal" : "day_point",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "day_defense": {
          // CÁ NHÂN BỊ CÁO BIỆN HỘ -> GÓC CHÂN DUNG CÁ NHÂN (`actor_portrait`)
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "defend",
              badgeText: "⚖️ BIỆN HỘ TRÊN GHẾ NÓNG",
              badgeColor: "#ea580c",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "tribunal",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 700,
            tag: `⚖️ NGÀY ${dayNum} • GÓC NHÌN BỊ CÁO`,
            title: `${targetName} Đơn Độc Tự Biện Hộ Trên Ghế Nóng`,
            narration: `Trước hàng chục ánh mắt phán xét của cả làng, ${targetName} nỗ lực cất lời bảo vệ mạng sống của chính mình trên ghế nóng.`,
            durationMs: 5400,
            mood: "dusk_trial",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_portrait",
              targetId: frame.targetId,
            },
            vfxCue: null,
            soundKey: "day_point",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "day_final_vote":
        case "day_verdict": {
          // CẢ LÀNG VOTE & PHÁN QUYẾT -> MỞ RỘNG KHUNG HÌNH LÊN CAO TOÀN CẢNH (`high_tribunal`)!
          const isHanged = frame.decision === "hang";
          const roleLabel = ROLE_LABELS[frame.targetRole || simRoleMap[frame.targetId]] || "Người chơi";
          const votesObj = frame.votesSnapshot || {};
          Object.entries(votesObj).forEach(([vid, dec]) => {
            if (vid !== frame.targetId) {
              overrides[vid] = {
                pose: "castLunge",
                badgeText: dec === "hang" ? "👎 TREO!" : "🕊️ THA!",
                badgeColor: dec === "hang" ? "#dc2626" : "#16a34a",
              };
            }
          });
          if (frame.targetId) {
            const wasAliveBeforeVerdict = simAliveMap[frame.targetId] !== false;
            if (frame.kind === "day_verdict" && isHanged) {
              simAliveMap[frame.targetId] = false;
            }
            overrides[frame.targetId] = {
              // Giữ người thật trong suốt cảnh bước bộ lên Đài Treo Cổ đón phán quyết; từ cảnh sau tự hóa Hồn Ma!
              simAlive: frame.kind === "day_verdict" && isHanged ? wasAliveBeforeVerdict : simAliveMap[frame.targetId],
              pose: isHanged ? null : "cheer",
              badgeText: isHanged ? "🪢 BỊ TREO CỔ!" : "🕊️ ĐƯỢC THA BỔNG!",
              badgeColor: isHanged ? "#dc2626" : "#16a34a",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "tribunal",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 1000,
            tag: `⚖️ NGÀY ${dayNum} • ĐẠI CẢNH BỎ PHIẾU PHÁP TRƯỜNG`,
            title: isHanged
              ? `Phán Quyết Định Mệnh — Cả Làng Bỏ Phiếu Treo Cổ ${targetName} (${roleLabel})`
              : `Cả Ngôi Làng Mở Đường Sống, Tha Bổng Cho ${targetName}`,
            narration:
              frame.caption ||
              (isHanged
                ? `Từ góc máy trên cao bao quát pháp trường, những lá phiếu đỏ định mệnh khép lại số phận của ${targetName} — chân tướng lộ diện là ${roleLabel}!`
                : `Những tia sáng xanh khoan hồng chiếm ưu thế trên khắp quảng trường, ${targetName} thoát khỏi giá treo cổ trong gang tấc!`),
            durationMs: 6400,
            mood: "dusk_trial",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "high_tribunal",
              targetId: frame.targetId,
              shakeStrength: isHanged ? 0.85 : 0.18,
              shakeDelayMs: 1400,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "day_tribunal",
              targetId: frame.targetId,
              votesDetail: votesObj,
              isHanged,
            },
            soundKey: "day_tribunal",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "cupid_link": {
          const partnerId = frame.coActorIds?.[0] || null;
          const partnerName = partnerId ? playerById[partnerId]?.name || "Người thương" : "Người thương";
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "💘 BẮN TƠ HỒNG!",
              badgeColor: "#ec4899",
            };
          }
          if (frame.targetId) {
            overrides[frame.targetId] = {
              pose: "cheer",
              badgeText: "💘 CẶP ĐÔI ĐỊNH MỆNH",
              badgeColor: "#db2777",
            };
          }
          if (partnerId) {
            overrides[partnerId] = {
              pose: "cheer",
              badgeText: "💘 CẶP ĐÔI ĐỊNH MỆNH",
              badgeColor: "#db2777",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 900,
            tag: `🌙 ĐÊM ${dayNum} • THẦN TÌNH YÊU SE DUYÊN`,
            title: `Thần Tình Yêu ${actorName} Kết Tơ Hồng Sinh Tử Cho ${targetName} & ${partnerName}`,
            narration:
              frame.caption ||
              `Giữa Đêm ${dayNum}, mũi tên vàng của ${actorName} bay vút qua ánh lửa, gắn kết vận mệnh sinh tử của ${targetName} và ${partnerName}!`,
            durationMs: 5600,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "cupid_link",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              secondaryTargetId: partnerId,
            },
            soundKey: "witch_save",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "alpha_convert": {
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "castLunge",
              badgeText: "🩸 HUYẾT NGUYỆT ĐỒNG HÓA!",
              badgeColor: "#be123c",
            };
          }
          if (frame.targetId) {
            simRoleMap[frame.targetId] = "wolf";
            overrides[frame.targetId] = {
              overrideRole: target?.initialRole || "villager",
              pose: "cheer",
              badgeText: "🩸➡️🐺 GIA NHẬP ĐÀN SÓI!",
              badgeColor: "#dc2626",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "night",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 950,
            tag: `🌙 ĐÊM ${dayNum} • HUYẾT NGUYỆT SÓI ĐẦU ĐÀN`,
            title: `Sói Đầu Đàn ${actorName} Khắc Ấn Huyết Nguyệt Đồng Hóa ${targetName}!`,
            narration:
              frame.caption ||
              `Thay vì kết liễu con mồi, Sói Đầu Đàn ${actorName} truyền dòng máu Huyết Nguyệt biến ${targetName} thành thành viên mới của bầy Sói!`,
            durationMs: 6000,
            mood: "night",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              shakeStrength: 0.78,
              shakeDelayMs: 1200,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "alpha_convert",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "cursed_transform",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "lover_heartbreak": {
          if (frame.targetId) {
            simAliveMap[frame.targetId] = false;
            overrides[frame.targetId] = {
              simAlive: true,
              pose: "hitRecoil",
              badgeText: "💔 TƠ HỒNG ĐỨT ĐOẠN!",
              badgeColor: "#ec4899",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "dawn",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 800,
            tag: `💔 NGÀY ${dayNum} • BI KỊCH TÌNH NHÂN`,
            title: `Tơ Hồng Đứt Đoạn — ${targetName} Quyên Sinh Theo Người Thương ${actorName}!`,
            narration:
              frame.caption ||
              `Không thể chịu đựng nỗi đau mất đi người thương ${actorName}, ${targetName} quỳ sụp xuống và trút hơi thở cuối cùng theo lời thề sinh tử!`,
            durationMs: 5700,
            mood: "dawn",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_portrait",
              targetId: frame.targetId,
              shakeStrength: 0.55,
              shakeDelayMs: 1100,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "lover_heartbreak",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "story",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "hunter_shot": {
          const shotRoleLabel = ROLE_LABELS[frame.targetRole || simRoleMap[frame.targetId]] || "Người chơi";
          if (frame.actorId) {
            simAliveMap[frame.actorId] = false;
            overrides[frame.actorId] = {
              simAlive: true,
              pose: "castLunge",
              badgeText: "🏹 VIÊN ĐẠN BẠC CUỐI!",
              badgeColor: "#e11d48",
            };
          }
          if (frame.targetId) {
            simAliveMap[frame.targetId] = false;
            overrides[frame.targetId] = {
              simAlive: true,
              pose: "hitRecoil",
              badgeText: "🩸 TRÚNG ĐẠN THỢ SĂN!",
              badgeColor: "#dc2626",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "tribunal",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 900,
            tag: `🏹 NGÀY ${dayNum} • ĐẠN BẠC TRẢ THÙ`,
            title: `Thợ Săn ${actorName} Bóp Cò Gục Ngã ${targetName} (${shotRoleLabel})!`,
            narration:
              frame.caption ||
              `Dồn chút sinh lực cuối cùng trước khi ngã xuống, Thợ Săn ${actorName} giương nỏ phóng viên đạn bạc xuyên thẳng qua ${targetName}!`,
            durationMs: 5900,
            mood: "dusk_trial",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_pov",
              sourceId: frame.actorId,
              targetId: frame.targetId,
              shakeStrength: 0.92,
              shakeDelayMs: 1350,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "hunter_shot",
              sourceId: frame.actorId,
              targetId: frame.targetId,
            },
            soundKey: "wolf_attack",
            lookAtSeatId: frame.targetId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        case "mayor_reveal": {
          if (frame.actorId) {
            overrides[frame.actorId] = {
              pose: "cheer",
              badgeText: "👑 QUYỀN TRƯỢNG X2!",
              badgeColor: "#d97706",
            };
          }
          beats.push({
            id: `rf_${seqKey}`,
            kind: "day",
            day: dayNum,
            elapsedMs: frame.elapsedMs,
            act1SetupMs: 750,
            tag: `👑 NGÀY ${dayNum} • TRƯỞNG LÀNG LỘ DIỆN`,
            title: `${actorName} Công Bố Quyền Trượng Trưởng Làng — Nhân Đôi Lá Phiếu (x2)!`,
            narration:
              frame.caption ||
              `Giữa vòng tròn căng thẳng, ${actorName} giơ cao Quyền Trượng Vàng khẳng định quyền uy Trưởng Làng — mọi lá phiếu từ nay mang sức nặng gấp đôi!`,
            durationMs: 5400,
            mood: "dawn",
            cameraShot: {
              shotKey: `shot_${seqKey}`,
              shotType: "actor_portrait",
              targetId: frame.actorId,
              shakeStrength: 0.5,
              shakeDelayMs: 1050,
            },
            vfxCue: {
              cueId: `cue_${seqKey}`,
              vfxType: "mayor_reveal",
              sourceId: frame.actorId,
              targetId: frame.actorId,
            },
            soundKey: "mvp_crown",
            lookAtSeatId: frame.actorId,
            actorStates: cloneActorSnapshot(overrides),
          });
          break;
        }

        default:
          break;
      }
    });

    beats.push(buildFinaleBeat(players, awards, winner, cloneActorSnapshot, simAliveMap, simRoleMap, loversPublic));
    return beats;
  }

  // ==================== DỰ PHÒNG DỰNG TỪ `history[]` (Áp dụng chuẩn Góc Cá Nhân vs Tập Thể Trên Cao 100%) ====================
  const findRolePlayerId = (roleKey) =>
    players.find((p) => (p.initialRole || p.role) === roleKey || p.role === roleKey)?.id || null;

  const daySet = new Set();
  history.forEach((ev) => {
    if (ev?.day) daySet.add(ev.day);
  });
  const sortedDays = Array.from(daySet).sort((a, b) => a - b);

  sortedDays.forEach((dayNum) => {
    const dayEvents = history.filter((e) => (e.day || 1) === dayNum);
    const guardEv = dayEvents.find((e) => e.type === "guard" && e.targetId);
    const wolfEv = dayEvents.find((e) => e.type === "wolf" && e.targetId);
    const witchSaveEv = dayEvents.find((e) => e.type === "witch_save" && e.targetId);
    const witchPoisonEv = dayEvents.find((e) => e.type === "witch_poison" && e.targetId);
    const seerEv = dayEvents.find((e) => e.type === "seer" && e.targetId);
    const toughEv = dayEvents.find((e) => e.type === "tough_guy_endured");
    const cursedEv = dayEvents.find((e) => e.type === "cursed_transformed");
    const deathEvs = dayEvents.filter((e) => e.type === "death");
    const hangEv = dayEvents.find((e) => e.type === "hang");
    const spareEv = dayEvents.find((e) => e.type === "spare");

    if (guardEv?.targetId) {
      const guardId = guardEv.sourceId || findRolePlayerId("guard");
      const guardName = playerById[guardId]?.name || "Bảo Vệ";
      const targetName = playerById[guardEv.targetId]?.name || "Người dân";
      const blockedWolf = wolfEv?.targetId === guardEv.targetId;
      const overrides = {};
      if (guardId) overrides[guardId] = { pose: "castLunge", badgeText: "🛡️ HỘ VỆ!", badgeColor: "#2563eb" };
      overrides[guardEv.targetId] = {
        pose: blockedWolf ? "cheer" : null,
        badgeText: blockedWolf ? "✨ CHẶN ĐỨNG SÓI!" : "🛡️ ĐƯỢC GÁC",
        badgeColor: "#3b82f6",
      };
      beats.push({
        id: `day_${dayNum}_guard`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 950,
        tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN BẢO VỆ`,
        title: blockedWolf
          ? `Khiên Của Bảo Vệ ${guardName} Đánh Bật Nanh Sói Cứu ${targetName}!`
          : `Bảo Vệ ${guardName} Lặng Lẽ Canh Gác Cho ${targetName}`,
        narration: blockedWolf
          ? `Qua vai Bảo Vệ ${guardName}, vòm khiên ánh sáng kịp thời dựng lên đánh bật đòn vồ của đàn Sói, cứu mạng ${targetName}!`
          : `Trong đêm tĩnh mịch, Bảo Vệ ${guardName} âm thầm đặt khiên che chở cho ghế của ${targetName}.`,
        durationMs: 5600,
        mood: "night",
        cameraShot: {
          shotKey: `shot_${dayNum}_guard`,
          shotType: "actor_pov",
          sourceId: guardId,
          targetId: guardEv.targetId,
          shakeStrength: blockedWolf ? 0.75 : 0,
          shakeDelayMs: 1250,
        },
        vfxCue: {
          cueId: `cue_${dayNum}_guard`,
          vfxType: blockedWolf ? "guard_block" : "guard_aim",
          sourceId: guardId,
          targetId: guardEv.targetId,
        },
        soundKey: blockedWolf ? "guard_block" : "guard_aim",
        lookAtSeatId: guardEv.targetId,
        actorStates: cloneActorSnapshot(overrides),
      });
    }

    if (wolfEv?.targetId) {
      const sourceWolfId = wolfEv.sourceId || findRolePlayerId("wolf");
      const victimName = playerById[wolfEv.targetId]?.name || "Nạn nhân";
      const overrides = {};
      if (sourceWolfId) overrides[sourceWolfId] = { pose: "castLunge", badgeText: "🐺 ĐÀN SÓI VỒ MỒI!", badgeColor: "#dc2626" };
      overrides[wolfEv.targetId] = { pose: "hitRecoil", badgeText: "🩸 TRÚNG ĐÒN SÓI!", badgeColor: "#ef4444" };
      beats.push({
        id: `day_${dayNum}_wolf`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 1050,
        tag: `🌙 ĐÊM ${dayNum} • ĐẠI CẢNH ĐÀN SÓI CẮN`,
        title: `Đàn Sói Đồng Loạt Lao Ra Cắn ${victimName}!`,
        narration: `Khung hình vút lên cao bao quát toàn bộ ngôi làng khi cả đàn Sói đồng loạt phóng nanh vuốt đỏ rực vào ${victimName}!`,
        durationMs: 6000,
        mood: "night",
        cameraShot: {
          shotKey: `shot_${dayNum}_wolf`,
          shotType: "high_pack_hunt",
          sourceId: sourceWolfId,
          targetId: wolfEv.targetId,
          shakeStrength: 0.9,
          shakeDelayMs: 1500,
        },
        vfxCue: {
          cueId: `cue_${dayNum}_wolf`,
          vfxType: "wolf_attack",
          sourceId: sourceWolfId,
          targetId: wolfEv.targetId,
        },
        soundKey: "wolf_attack",
        lookAtSeatId: wolfEv.targetId,
        actorStates: cloneActorSnapshot(overrides),
      });
    }

    if (witchSaveEv?.targetId) {
      const witchId = witchSaveEv.sourceId || findRolePlayerId("witch");
      const targetName = playerById[witchSaveEv.targetId]?.name || "Nạn nhân";
      const overrides = {};
      if (witchId) overrides[witchId] = { pose: "castLunge", badgeText: "💚 TUNG THUỐC CỨU!", badgeColor: "#16a34a" };
      overrides[witchSaveEv.targetId] = { pose: "cheer", badgeText: "💚 HỒI SINH!", badgeColor: "#22c55e" };
      beats.push({
        id: `day_${dayNum}_wsave`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 950,
        tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN PHÙ THỦY`,
        title: `Phù Thủy Tung Bình Tiên Dược Cứu Sống ${targetName}`,
        narration: `Từ góc nhìn cá nhân của Phù Thủy, bình tiên dược xanh ngọc bay vút qua đống lửa kéo ${targetName} trở về từ cõi chết!`,
        durationMs: 5600,
        mood: "night",
        cameraShot: { shotKey: `shot_${dayNum}_wsave`, shotType: "actor_pov", sourceId: witchId, targetId: witchSaveEv.targetId },
        vfxCue: { cueId: `cue_${dayNum}_wsave`, vfxType: "witch_save", sourceId: witchId, targetId: witchSaveEv.targetId },
        soundKey: "witch_save",
        lookAtSeatId: witchSaveEv.targetId,
        actorStates: cloneActorSnapshot(overrides),
      });
    }

    if (witchPoisonEv?.targetId) {
      const witchId = witchPoisonEv.sourceId || findRolePlayerId("witch");
      const targetName = playerById[witchPoisonEv.targetId]?.name || "Mục tiêu";
      const overrides = {};
      if (witchId) overrides[witchId] = { pose: "castLunge", badgeText: "☠️ QUĂNG BÌNH ĐỘC!", badgeColor: "#7e22ce" };
      overrides[witchPoisonEv.targetId] = { pose: "hitRecoil", badgeText: "☠️ TRÚNG ĐỘC!", badgeColor: "#9333ea" };
      beats.push({
        id: `day_${dayNum}_wpoison`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 950,
        tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN PHÙ THỦY`,
        title: `Phù Thủy Lạnh Lùng Ném Độc Dược Vào ${targetName}`,
        narration: `Từ góc ghế của Phù Thủy, bình độc tím sẫm lao thẳng sang và vỡ tan dưới chân ghế của ${targetName}!`,
        durationMs: 5600,
        mood: "night",
        cameraShot: {
          shotKey: `shot_${dayNum}_wpoison`,
          shotType: "actor_pov",
          sourceId: witchId,
          targetId: witchPoisonEv.targetId,
          shakeStrength: 0.65,
          shakeDelayMs: 1400,
        },
        vfxCue: { cueId: `cue_${dayNum}_wpoison`, vfxType: "witch_poison", sourceId: witchId, targetId: witchPoisonEv.targetId },
        soundKey: "witch_poison",
        lookAtSeatId: witchPoisonEv.targetId,
        actorStates: cloneActorSnapshot(overrides),
      });
    }

    if (cursedEv?.targetId) {
      simRoleMap[cursedEv.targetId] = "wolf";
      const cursedName = playerById[cursedEv.targetId]?.name || "Kẻ Bị Nguyền";
      beats.push({
        id: `day_${dayNum}_cursed`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 900,
        tag: `🌙 ĐÊM ${dayNum} • HUYẾT NGUYỀN`,
        title: `Lời Nguyền Thức Tỉnh — ${cursedName} Hóa Ma Sói!`,
        narration: `Dòng máu Sói chính thức thức tỉnh biến ${cursedName} thành một Ma Sói mới trong đêm!`,
        durationMs: 5800,
        mood: "night",
        cameraShot: { shotKey: `shot_${dayNum}_cursed`, shotType: "actor_portrait", targetId: cursedEv.targetId, shakeStrength: 0.7, shakeDelayMs: 950 },
        vfxCue: { cueId: `cue_${dayNum}_cursed`, vfxType: "cursed_transform", targetId: cursedEv.targetId },
        soundKey: "cursed_transform",
        lookAtSeatId: cursedEv.targetId,
        actorStates: cloneActorSnapshot({
          [cursedEv.targetId]: { pose: "cheer", badgeText: "🌑➡️🐺 HÓA SÓI!", badgeColor: "#9333ea" },
        }),
      });
    }

    if (toughEv?.targetId) {
      enduringSet.add(toughEv.targetId);
      const toughName = playerById[toughEv.targetId]?.name || "Người Cứng Cỏi";
      beats.push({
        id: `day_${dayNum}_tough`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 850,
        tag: `🌙 ĐÊM ${dayNum} • Ý CHÍ THÉP`,
        title: `Người Cứng Cỏi ${toughName} Trụ Vững Sau Đòn Sói`,
        narration: `${toughName} nghiến răng chịu đựng vết thương chí mạng của Sói để sống sót qua bình minh!`,
        durationMs: 5400,
        mood: "night",
        cameraShot: { shotKey: `shot_${dayNum}_tough`, shotType: "actor_portrait", targetId: toughEv.targetId },
        vfxCue: { cueId: `cue_${dayNum}_tough`, vfxType: "tough_guy_endure", targetId: toughEv.targetId },
        soundKey: "tough_guy_endure",
        lookAtSeatId: toughEv.targetId,
        actorStates: cloneActorSnapshot({
          [toughEv.targetId]: { pose: "cheer", badgeText: "💪 GỒNG CHỊU ĐÒN!", badgeColor: "#ea580c" },
        }),
      });
    }

    if (seerEv?.targetId) {
      const seerId = seerEv.sourceId || findRolePlayerId("seer");
      const targetName = playerById[seerEv.targetId]?.name || "Mục tiêu";
      const isWolfResult = Boolean(seerEv.isWolf || seerEv.text?.includes("là Sói"));
      const overrides = {};
      if (seerId) overrides[seerId] = { pose: "castLunge", badgeText: "🔮 SOI THẤU!", badgeColor: "#6366f1" };
      overrides[seerEv.targetId] = {
        badgeText: isWolfResult ? "🔴 PHÁT HIỆN SÓI!" : "🔵 DÂN LÀNH",
        badgeColor: isWolfResult ? "#dc2626" : "#0284c7",
      };
      beats.push({
        id: `day_${dayNum}_seer`,
        kind: "night",
        day: dayNum,
        act1SetupMs: 950,
        tag: `🌙 ĐÊM ${dayNum} • GÓC NHÌN TIÊN TRI`,
        title: isWolfResult ? `Mắt Thần Của Tiên Tri Bắt Trọn Sói ${targetName}!` : `Tiên Tri Soi Thấu ${targetName}`,
        narration: isWolfResult
          ? `Qua vai Tiên Tri, luồng sáng pha lê lóe đỏ rực khi chạm vào ${targetName} — chân tướng Sói đã bị vạch trần!`
          : `Qua vai Tiên Tri, tia pha lê xác nhận ${targetName} mang tâm hồn lương thiện của Dân Làng.`,
        durationMs: 5600,
        mood: "night",
        cameraShot: { shotKey: `shot_${dayNum}_seer`, shotType: "actor_pov", sourceId: seerId, targetId: seerEv.targetId },
        vfxCue: { cueId: `cue_${dayNum}_seer`, vfxType: "seer_scan", sourceId: seerId, targetId: seerEv.targetId, isWolfResult },
        soundKey: "seer_scan",
        lookAtSeatId: seerEv.targetId,
        actorStates: cloneActorSnapshot(overrides),
      });
    }

    if (deathEvs.length > 0) {
      const overrides = {};
      deathEvs.forEach((dEv) => {
        if (dEv.targetId) {
          simAliveMap[dEv.targetId] = false;
          enduringSet.delete(dEv.targetId);
          overrides[dEv.targetId] = { badgeText: "👻 TỬ NẠN ĐÊM QUA", badgeColor: "#475569" };
        }
      });
      const focusDeadId = deathEvs[0]?.targetId || null;
      const deadNames = deathEvs.map((e) => playerById[e.targetId]?.name || e.targetName || "Người dân").join(", ");
      beats.push({
        id: `day_${dayNum}_dawn_death`,
        kind: "dawn",
        day: dayNum,
        act1SetupMs: 650,
        tag: `☀️ SÁNG NGÀY ${dayNum}`,
        title: `Bình Minh Tang Tóc — ${deadNames} Ngã Xuống`,
        narration: `Mặt trời ló dạng sau đêm dài, cả làng bàng hoàng phát hiện ${deadNames} đã không qua khỏi!`,
        durationMs: 5200,
        mood: "dawn",
        cameraShot: { shotKey: `shot_${dayNum}_dawn`, shotType: focusDeadId ? "actor_portrait" : "orbit_reveal", targetId: focusDeadId },
        vfxCue: null,
        soundKey: "story",
        lookAtSeatId: focusDeadId,
        actorStates: cloneActorSnapshot(overrides),
      });
    }

    const verdictEv = hangEv || spareEv;
    if (verdictEv?.targetId) {
      const isHanged = Boolean(hangEv);
      const defName = playerById[verdictEv.targetId]?.name || verdictEv.targetName || "Bị cáo";
      const defRole = verdictEv.targetRole || simRoleMap[verdictEv.targetId] || "villager";
      const roleLabel = ROLE_LABELS[defRole] || defRole;
      const wasAliveBeforeTribunal = simAliveMap[verdictEv.targetId] !== false;
      if (isHanged) simAliveMap[verdictEv.targetId] = false;
      beats.push({
        id: `day_${dayNum}_tribunal`,
        kind: "tribunal",
        day: dayNum,
        act1SetupMs: 1000,
        tag: `⚖️ NGÀY ${dayNum} • ĐẠI CẢNH BỎ PHIẾU PHÁP TRƯỜNG`,
        title: isHanged ? `Pháp Trường Treo Cổ ${defName} (${roleLabel})` : `${defName} Được Dân Làng Tha Bổng`,
        narration: verdictEv.text || "",
        durationMs: 6200,
        mood: "dusk_trial",
        cameraShot: {
          shotKey: `shot_${dayNum}_tribunal`,
          shotType: "high_tribunal",
          targetId: verdictEv.targetId,
          shakeStrength: isHanged ? 0.85 : 0.15,
          shakeDelayMs: 1400,
        },
        vfxCue: {
          cueId: `cue_${dayNum}_tribunal`,
          vfxType: "day_tribunal",
          targetId: verdictEv.targetId,
          votesDetail: verdictEv.votesDetail || {},
          isHanged,
        },
        soundKey: "day_tribunal",
        lookAtSeatId: verdictEv.targetId,
        actorStates: cloneActorSnapshot({
          [verdictEv.targetId]: {
            simAlive: isHanged ? wasAliveBeforeTribunal : simAliveMap[verdictEv.targetId],
            pose: isHanged ? null : "cheer",
            badgeText: isHanged ? "🪢 TREO CỔ!" : "🕊️ THA BỔNG!",
            badgeColor: isHanged ? "#dc2626" : "#16a34a",
          },
        }),
      });
    }
  });

  beats.push(buildFinaleBeat(players, awards, winner, cloneActorSnapshot, simAliveMap, simRoleMap, loversPublic));
  return beats;
}

/**
 * Chuyển hóa mỗi nhịp Kịch Bản (`currentBeat`) thành Bảng Phân Vai Hoạt Cảnh Không Gian 3D (`actorChoreoMap`)
 * + tỉ lệ điểm nổ Climax (`impactFraction`) để khớp 1:1 mili-giây với Camera Shake!
 */
function deriveBeatActorChoreography(beat, players = []) {
  if (!beat?.vfxCue) return { map: null, impactFraction: null, baseChoreoMs: 3900 };
  const cue = beat.vfxCue;
  const states = beat.actorStates || {};
  const map = {};
  let impactFraction = null;
  let baseChoreoMs = 3900;

  const findAliveWolves = () =>
    players
      .filter((p) => {
        const st = states[p.id];
        const aliveNow = st && typeof st.simAlive === "boolean" ? st.simAlive : p.alive !== false;
        const roleNow = st?.overrideRole || p.role;
        return aliveNow && isWolfTeamRole(roleNow);
      })
      .map((p) => p.id);

  switch (cue.vfxType) {
    case "wolf_attack": {
      const pack =
        Array.isArray(cue.coActorIds) && cue.coActorIds.length > 0
          ? cue.coActorIds
          : cue.sourceId
            ? [cue.sourceId]
            : findAliveWolves();
      pack.forEach((wid, idx) => {
        if (wid && wid !== cue.targetId) {
          map[wid] = {
            actionType: "wolf_pounce",
            targetId: cue.targetId,
            slotIndex: idx,
            totalSlots: pack.length,
          };
        }
      });
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "victim_hit_recoil",
          targetId: pack[0] || cue.sourceId,
        };
      }
      impactFraction = 0.43;
      baseChoreoMs = 4100;
      break;
    }

    case "guard_block": {
      // ĐỐI KHÁNG KÉP: Bảo Vệ phóng ra dựng khiên chắn + Đàn Sói lao vào bị hất bật ngửa!
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "guard_intercept",
          targetId: cue.targetId,
        };
      }
      const wolves = findAliveWolves().filter((wid) => wid !== cue.sourceId && wid !== cue.targetId);
      wolves.forEach((wid, idx) => {
        map[wid] = {
          actionType: "wolf_blocked_recoil",
          targetId: cue.targetId,
          slotIndex: idx,
          totalSlots: wolves.length,
        };
      });
      impactFraction = 0.36;
      baseChoreoMs = 4200;
      break;
    }

    case "guard_aim": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "guard_patrol_cast",
          targetId: cue.targetId,
        };
      }
      baseChoreoMs = 3600;
      break;
    }

    case "witch_save": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "witch_elixir_cast",
          targetId: cue.targetId,
        };
      }
      baseChoreoMs = 3700;
      break;
    }

    case "witch_poison": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "witch_poison_throw",
          targetId: cue.targetId,
        };
      }
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "victim_hit_recoil",
          targetId: cue.sourceId,
        };
      }
      impactFraction = 0.42;
      baseChoreoMs = 3800;
      break;
    }

    case "seer_scan": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "seer_divine_cast",
          targetId: cue.targetId,
        };
      }
      baseChoreoMs = 3800;
      break;
    }

    case "tough_guy_endure": {
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "tough_iron_roar",
          targetId: cue.targetId,
        };
      }
      baseChoreoMs = 3900;
      break;
    }

    case "cursed_transform": {
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "cursed_blood_metamorph",
          targetId: cue.targetId,
        };
      }
      impactFraction = 0.42;
      baseChoreoMs = 4200;
      break;
    }

    case "cupid_link": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "cupid_love_arrow",
          targetId: cue.targetId,
          secondaryTargetId: cue.secondaryTargetId || null,
        };
      }
      impactFraction = 0.44;
      baseChoreoMs = 4000;
      break;
    }

    case "alpha_convert": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "alpha_blood_convert",
          targetId: cue.targetId,
        };
      }
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "cursed_blood_metamorph",
          targetId: cue.targetId,
        };
      }
      impactFraction = 0.45;
      baseChoreoMs = 4300;
      break;
    }

    case "lover_heartbreak": {
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "lovers_heartbreak_cascade",
          targetId: cue.sourceId || cue.targetId,
        };
      }
      impactFraction = 0.38;
      baseChoreoMs = 4100;
      break;
    }

    case "hunter_shot": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "hunter_last_shot",
          targetId: cue.targetId,
        };
      }
      if (cue.targetId) {
        map[cue.targetId] = {
          actionType: "victim_hit_recoil",
          targetId: cue.sourceId,
        };
      }
      impactFraction = 0.46;
      baseChoreoMs = 4100;
      break;
    }

    case "mayor_reveal": {
      if (cue.sourceId) {
        map[cue.sourceId] = {
          actionType: "mayor_decree_slam",
          targetId: cue.sourceId,
        };
      }
      impactFraction = 0.42;
      baseChoreoMs = 3800;
      break;
    }

    case "day_point": {
      const votesSnap = cue.votesDetail || {};
      const voters = Object.entries(votesSnap).filter(([, tid]) => tid === cue.targetId);
      if (voters.length > 1) {
        voters.forEach(([vid], idx) => {
          map[vid] = { actionType: "day_accuse_stand", targetId: cue.targetId, slotIndex: idx };
        });
      } else if (cue.sourceId) {
        map[cue.sourceId] = { actionType: "day_accuse_stand", targetId: cue.targetId };
      }
      baseChoreoMs = 3500;
      break;
    }

    case "day_tribunal": {
      const votesObj = cue.votesDetail || {};
      Object.entries(votesObj).forEach(([vid, dec], idx) => {
        if (vid !== cue.targetId && dec === "hang") {
          map[vid] = {
            actionType: "tribunal_torch_stand",
            targetId: cue.targetId,
            slotIndex: idx,
          };
        }
      });
      if (cue.isHanged && cue.targetId) {
        const defPlayer = players.find((p) => p.id === cue.targetId);
        const defRole = states[cue.targetId]?.overrideRole || defPlayer?.role;
        map[cue.targetId] = {
          actionType: defRole === "tanner" ? "gallows_walk_tanner_win" : "gallows_walk_hang",
          targetId: cue.targetId,
        };
        impactFraction = 0.46;
        baseChoreoMs = 4600;
      } else {
        baseChoreoMs = 3800;
      }
      break;
    }

    default:
      break;
  }

  return {
    map: Object.keys(map).length > 0 ? map : null,
    impactFraction,
    baseChoreoMs,
  };
}

export default function EndGameRecap({
  history = [],
  replayTimeline = [],
  awards = [],
  isHost,
  isSpectator = false,
  rematchEndsAt = null,
  rematchReadyCount = 0,
  rematchRequiredCount = 1,
  myRematchReady = false,
  ghostBetBonusXp = 0,
  onRematchReady = null,
  onRestart,
  onAnimate,
  onStageChange,
  viewMode = "3d",
  onToggleViewMode = null,
  showPostGameChat = false,
  onTogglePostGameChat = null,
  players = [],
  winner = "village",
  loversPublic = [],
  sessionToken = "",
  mcVoiceEnabled = true,
  vsServerOffline = false,
  vsStatusChecking = false,
  onRecheckVoice = null,
  voiceRecheckTick = 0,
}) {
  const [rematchSecLeft, setRematchSecLeft] = useState(() =>
    rematchEndsAt ? Math.max(0, Math.ceil((rematchEndsAt - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!rematchEndsAt) {
      setRematchSecLeft(0);
      return;
    }
    const tick = () => {
      setRematchSecLeft(Math.max(0, Math.ceil((rematchEndsAt - Date.now()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [rematchEndsAt]);

  const [beatIndex, setBeatIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  // Tốc độ kể chuyện chuyên nghiệp: 0.75 (Chậm sâu) | 1 (Chuẩn điện ảnh) | 1.5 (Nhanh)
  const [recapSpeed, setRecapSpeed] = useState(1);
  const [speechEnabled, setSpeechEnabled] = useState(() => mcVoiceEnabled !== false);
  const storyAudioBuffersRef = useRef(new Map());
  // Khởi tạo true ngay ở Render #1 khi bật loa để Cảnh 0 (Mở Màn) luôn chờ đợt quét Cache đầu tiên, tuyệt đối không trôi sớm!
  const [storyVoiceLoading, setStoryVoiceLoading] = useState(() => mcVoiceEnabled !== false);
  const [storyVoiceOffline, setStoryVoiceOffline] = useState(false);
  const [voiceHttpErrorCode, setVoiceHttpErrorCode] = useState(null);
  const [voiceBlockedByGesture, setVoiceBlockedByGesture] = useState(false);
  const [unlockReplayTick, setUnlockReplayTick] = useState(0);
  const [autoRetryTick, setAutoRetryTick] = useState(0);
  const [storyVoiceReadyTick, setStoryVoiceReadyTick] = useState(0);
  const [storyVoiceLoadedCount, setStoryVoiceLoadedCount] = useState(0);
  const [storyVoiceTotalCount, setStoryVoiceTotalCount] = useState(0);
  const beatIndexRef = useRef(0);
  const voiceBlockedRef = useRef(false);
  voiceBlockedRef.current = voiceBlockedByGesture;
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken || getSession()?.sessionToken || "";
  const vsServerOfflineRef = useRef(vsServerOffline);
  vsServerOfflineRef.current = vsServerOffline;
  const [followDirector, setFollowDirector] = useState(true);
  const [relockToken, setRelockToken] = useState(0);
  const [drawerTab, setDrawerTab] = useState(() => (viewMode === "2d" ? "cards" : null));
  const [revealedCount, setRevealedCount] = useState(0);
  const [flippedMap, setFlippedMap] = useState({});

  // Nhịp 3 hồi cho mỗi cảnh: Act 1 (Lướt máy vào vai) -> Act 2 (Tung chiêu VFX) -> Act 3 (Chờ giọng MC dứt câu + lắng đọng)
  const [act2Armed, setAct2Armed] = useState(false);
  const [speechCompletedForBeatId, setSpeechCompletedForBeatId] = useState(null);

  // Giao diện Phim Mở Full 100%: Tự động ẩn các thanh nút bấm sau 2.4s không di chuột để nhường trọn màn hình cho câu chuyện!
  const [hudVisible, setHudVisible] = useState(true);
  const idleHudTimerRef = useRef(null);

  // Quay Video Phim Kể Chuyện & Cửa sổ Xem Lại Video Ngay Trong Game
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [showVideoPlayerModal, setShowVideoPlayerModal] = useState(false);
  const [recordErrorMsg, setRecordErrorMsg] = useState("");
  const activeRecorderRef = useRef(null);
  const overlayStateRef = useRef({});

  const winConfig = WINNER_CONFIG[winner] || WINNER_CONFIG.village;

  const storyBeats = useMemo(
    () => buildTrueSpaceReplayBeats(replayTimeline, history, players, awards, winner, loversPublic),
    [replayTimeline, history, players, awards, winner, loversPublic]
  );

  // Chữ ký kịch bản lời dẫn bất biến (storyVoicePlanKey): giúp useEffect tải Voice KHÔNG BAO GIỜ bị ctrl.abort() khi sân khấu 3D re-render mỗi 280ms!
  const orderedVoicePlan = useMemo(() => {
    const orderedItems = [];
    const itemByKey = new Map();
    storyBeats.forEach((beat, idx) => {
      // Theo đặc tả v3: Không đọc các cảnh chat của người chơi (wolf_chat / village_chat có dialogueText)
      if (!beat?.narration || beat.dialogueText) return;
      const k = getTtsCacheKey(beat.narration);
      if (!k) return;
      let entry = itemByKey.get(k);
      if (!entry) {
        entry = { key: k, raw: beat.narration, beatIndices: [idx] };
        itemByKey.set(k, entry);
        orderedItems.push(entry);
      } else {
        entry.beatIndices.push(idx);
      }
    });
    const planKey = orderedItems.map((it) => it.key).join("\n");
    return { orderedItems, itemByKey, planKey, totalUnique: orderedItems.length };
  }, [storyBeats]);

  const voicePlanRef = useRef(orderedVoicePlan);
  voicePlanRef.current = orderedVoicePlan;
  const storyBeatsRef = useRef(storyBeats);
  storyBeatsRef.current = storyBeats;

  const safeBeatIdx = Math.min(beatIndex, Math.max(0, storyBeats.length - 1));
  beatIndexRef.current = safeBeatIdx;
  const currentBeat = storyBeats[safeBeatIdx] || storyBeats[0];
  const isAtFinale = safeBeatIdx >= storyBeats.length - 1;

  // Cập nhật dữ liệu phụ đề thời gian thực cho Bộ Ghép Video 2D Compositor
  useEffect(() => {
    overlayStateRef.current = {
      chapterTag: currentBeat?.tag || "",
      winnerBanner: `${winConfig.emoji} ${winConfig.title}`,
      title: currentBeat?.title || "",
      narration: currentBeat?.narration || "",
      dialogueText: currentBeat?.dialogueText || null,
      isWolfWhisper: Boolean(currentBeat?.isWolfWhisper),
      progressRatio: (safeBeatIdx + 1) / Math.max(1, storyBeats.length),
    };
  }, [currentBeat, winConfig, safeBeatIdx, storyBeats.length]);

  // Đánh thức thanh điều khiển khi người xem chạm chuột / bàn phím, và tự ẩn sau 2.4s khi đang chiếu phim!
  const wakeUpHud = useCallback(() => {
    setHudVisible(true);
    if (idleHudTimerRef.current) {
      clearTimeout(idleHudTimerRef.current);
      idleHudTimerRef.current = null;
    }
    if (isPlaying && !drawerTab && !showVideoPlayerModal && !isAtFinale && viewMode === "3d") {
      idleHudTimerRef.current = setTimeout(() => {
        setHudVisible(false);
      }, 2400);
    }
  }, [isPlaying, drawerTab, showVideoPlayerModal, isAtFinale, viewMode]);

  useEffect(() => {
    wakeUpHud();
    const handleMove = () => wakeUpHud();
    const handleKeyDown = (e) => {
      wakeUpHud();
      if (showVideoPlayerModal) return;
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === "ArrowRight") {
        setIsPlaying(false);
        setBeatIndex((i) => Math.min(storyBeats.length - 1, i + 1));
      } else if (e.code === "ArrowLeft") {
        setIsPlaying(false);
        setBeatIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("touchstart", handleMove, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    const handleUnlockGesture = () => {
      unlockCinemaAudioEngine();
      if (voiceBlockedRef.current) {
        voiceBlockedRef.current = false;
        setVoiceBlockedByGesture(false);
        setUnlockReplayTick((t) => t + 1);
      }
    };
    window.addEventListener("pointerdown", handleUnlockGesture, { passive: true });
    window.addEventListener("touchstart", handleUnlockGesture, { passive: true });
    window.addEventListener("keydown", handleUnlockGesture);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchstart", handleMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handleUnlockGesture);
      window.removeEventListener("touchstart", handleUnlockGesture);
      window.removeEventListener("keydown", handleUnlockGesture);
      if (idleHudTimerRef.current) clearTimeout(idleHudTimerRef.current);
    };
  }, [wakeUpHud, showVideoPlayerModal, storyBeats.length]);

  const handleManualOrbit = useCallback(() => {
    setFollowDirector(false);
    setHudVisible(true);
  }, []);

  const handleRelockDirector = useCallback(() => {
    setFollowDirector(true);
    setRelockToken((t) => t + 1);
  }, []);

  const chapterJumps = useMemo(() => {
    const list = [{ key: "reveal", label: "🎭 Mở Màn", beatIdx: 0 }];
    const seenDays = new Set();
    storyBeats.forEach((b, idx) => {
      if (b.day > 0 && b.day < 999 && !seenDays.has(b.day)) {
        seenDays.add(b.day);
        list.push({ key: `day_${b.day}`, label: `🌙☀️ Ngày ${b.day}`, beatIdx: idx });
      }
    });
    list.push({
      key: "mvp",
      label: "👑 MVP",
      beatIdx: Math.max(0, storyBeats.length - 1),
    });
    return list;
  }, [storyBeats]);

  const allDays = useMemo(() => {
    const s = new Set();
    storyBeats.forEach((b) => {
      if (b.day > 0 && b.day < 999) s.add(b.day);
    });
    history.forEach((h) => {
      if (h.day) s.add(h.day);
    });
    const arr = Array.from(s).sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1];
  }, [storyBeats, history]);

  const [detailDay, setDetailDay] = useState(1);

  // Mở khóa lần lượt 8 vai ở Cảnh 0 chậm rãi trang trọng (280ms/ghế)
  useEffect(() => {
    setRevealedCount(0);
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setRevealedCount(count);
      if (players[count - 1]) {
        const pid = players[count - 1].id;
        setFlippedMap((prev) => ({ ...prev, [pid]: true }));
      }
      if (count >= players.length) {
        clearInterval(timer);
      }
    }, 280);
    return () => clearInterval(timer);
  }, [players]);

  const act2StartPerfRef = useRef(0);

  // NHỊP 1 -> NHỊP 2: Chờ máy quay lướt êm về sau vai nhân vật (act1SetupMs) rồi mới kích hoạt tung chiêu VFX, Hoạt cảnh Không gian & Âm thanh!
  useEffect(() => {
    if (!currentBeat) return undefined;
    const setupDelay = Math.max(220, (currentBeat.act1SetupMs ?? 900) / recapSpeed);
    setAct2Armed(false);
    const armTimer = setTimeout(() => {
      act2StartPerfRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      setAct2Armed(true);
      const audioEngine = getCinemaAudioEngine();
      audioEngine?.setSpeakerMuted(!speechEnabled);
      audioEngine?.triggerBeatSound(currentBeat.soundKey || currentBeat.vfxCue?.vfxType || "story");
    }, setupDelay);
    return () => clearTimeout(armTimer);
  }, [currentBeat?.id, recapSpeed, speechEnabled]);

  // Đồng bộ trạng thái Sân Khấu 3D theo Nhịp 1 (Chuẩn bị góc cá nhân) -> Nhịp 2 (Tung đòn VFX + Hoạt Cảnh Không Gian 9 Vai)
  useEffect(() => {
    if (!currentBeat) return;

    let actorStates = currentBeat.actorStates;
    if (currentBeat.kind === "reveal" && revealedCount < players.length) {
      actorStates = { ...currentBeat.actorStates };
      players.forEach((p, idx) => {
        actorStates[p.id] = {
          ...(actorStates[p.id] || {}),
          isRevealed: idx < revealedCount,
          pose: idx === revealedCount - 1 ? "cheer" : null,
        };
      });
    } else if (!act2Armed && currentBeat.vfxCue) {
      // Ở Nhịp 1 (0 -> 0.95s): Giữ nhân vật bình tĩnh nhìn mục tiêu trong lúc máy quay lướt về sau vai họ, chưa tung đòn vội!
      actorStates = {};
      Object.entries(currentBeat.actorStates || {}).forEach(([pid, st]) => {
        actorStates[pid] = {
          ...st,
          pose: st.replayChatBubble ? st.pose : null,
          badgeText: st.replayChatBubble ? st.badgeText : null,
        };
      });
    }

    const choreoInfo = deriveBeatActorChoreography(currentBeat, players);
    const setupDelayMs = Math.max(220, (currentBeat.act1SetupMs ?? 900) / recapSpeed);
    const choreoDurationMs = Math.max(1600, (choreoInfo.baseChoreoMs || 3900) / recapSpeed);
    const syncedShakeDelayMs =
      choreoInfo.impactFraction !== null
        ? Math.round(setupDelayMs + choreoInfo.impactFraction * choreoDurationMs)
        : currentBeat.cameraShot?.shakeDelayMs;

    onStageChange?.({
      beatId: currentBeat.id,
      mood: currentBeat.mood,
      cameraShot: currentBeat.cameraShot
        ? {
            ...currentBeat.cameraShot,
            shakeDelayMs: syncedShakeDelayMs,
            dollySpeedScale: recapSpeed,
            followDirector,
            relockToken,
          }
        : null,
      onManualOrbit: handleManualOrbit,
      vfxCue: act2Armed || currentBeat.kind === "reveal" ? currentBeat.vfxCue : null,
      actorChoreoMap: act2Armed ? choreoInfo.map : null,
      choreoTiming:
        act2Armed && choreoInfo.map
          ? {
              startedAtPerfMs: act2StartPerfRef.current || (typeof performance !== "undefined" ? performance.now() : Date.now()),
              durationMs: choreoDurationMs,
            }
          : null,
      lookAtSeatId: currentBeat.lookAtSeatId,
      actorStates,
    });

    onAnimate?.(act2Armed ? currentBeat.legacyEvent || null : null);

    if (currentBeat.day > 0 && currentBeat.day < 999) {
      setDetailDay(currentBeat.day);
    }
  }, [
    currentBeat,
    act2Armed,
    revealedCount,
    players,
    recapSpeed,
    followDirector,
    relockToken,
    handleManualOrbit,
    onStageChange,
    onAnimate,
  ]);

  // Khi trạng thái Voice trên Room vừa hồi phục (Online) hoặc vừa nhận được sessionToken mới sau lỗi 401, tự động nạp lại không cắt ngang luồng đang chạy!
  useEffect(() => {
    if (!vsServerOffline && storyVoiceOffline) {
      setStoryVoiceOffline(false);
      if (!storyVoiceLoading) {
        setAutoRetryTick((t) => t + 1);
      }
    }
  }, [vsServerOffline, storyVoiceOffline, storyVoiceLoading]);

  useEffect(() => {
    if (sessionToken && voiceHttpErrorCode === 401 && !storyVoiceLoading) {
      setVoiceHttpErrorCode(null);
      setAutoRetryTick((t) => t + 1);
    }
  }, [sessionToken, voiceHttpErrorCode, storyVoiceLoading]);

  // Đồng bộ gói giọng kể chuyện 2 giai đoạn bất biến (0% Self-Abort):
  // - Giai đoạn 1 (cacheOnly: true): Hút tức thì toàn bộ câu đã tạo cuốn chiếu trên RAM Server để Cảnh 0 cất tiếng ngay!
  // - Giai đoạn 2 (Adaptive Urgent Batch): Ưu tiên 1 câu cảnh đang xem để phát ngay, sau đó gom tối đa 3 câu kế tiếp/lượt lấp đầy 21/21 siêu tốc!
  useEffect(() => {
    const plan = voicePlanRef.current;
    const orderedItems = plan?.orderedItems || [];
    const totalUnique = orderedItems.length;
    setStoryVoiceTotalCount(totalUnique);

    const syncLoadedCount = () => {
      const latestItems = voicePlanRef.current?.orderedItems || orderedItems;
      let ready = 0;
      for (const it of latestItems) {
        if (storyAudioBuffersRef.current.has(it.key)) ready += 1;
      }
      setStoryVoiceLoadedCount(ready);
      return ready;
    };

    if (!speechEnabled || totalUnique === 0 || syncLoadedCount() >= totalUnique) {
      setStoryVoiceLoading(false);
      return undefined;
    }

    const storeBase64Audio = (cacheKey, b64) => {
      if (!cacheKey || !b64 || typeof b64 !== "string") return false;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (bytes.byteLength < 500) return false;
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      storyAudioBuffersRef.current.set(cacheKey, ab);
      return true;
    };

    // Tra cứu kép (raw.trim + chuẩn hóa getTtsCacheKey) chống trượt khóa Unicode NFC/NFD 100%
    const ingestBatchResults = (resultsObj, requestedRaws = []) => {
      if (!resultsObj || typeof resultsObj !== "object") return 0;
      let added = 0;
      for (const raw of requestedRaws) {
        const directB64 = resultsObj[raw] || resultsObj[raw.trim()];
        const k = getTtsCacheKey(raw);
        if (directB64 && k && !storyAudioBuffersRef.current.has(k)) {
          if (storeBase64Audio(k, directB64)) added += 1;
        }
      }
      for (const [resKey, b64] of Object.entries(resultsObj)) {
        if (!b64 || typeof b64 !== "string") continue;
        const normKey = getTtsCacheKey(resKey);
        if (normKey && !storyAudioBuffersRef.current.has(normKey)) {
          if (storeBase64Audio(normKey, b64)) added += 1;
        }
      }
      return added;
    };

    const pickNextMissingBatch = (attemptsByKey, maxAttempts) => {
      const latestBeats = storyBeatsRef.current || [];
      const latestItemByKey = voicePlanRef.current?.itemByKey || plan.itemByKey;
      const totalBeats = latestBeats.length;
      if (totalBeats === 0) return [];

      const curIdx = Math.min(Math.max(0, beatIndexRef.current || 0), totalBeats - 1);

      // 1. Nếu chính cảnh đang chiếu chưa có MP3 -> nạp đơn lẻ [1 câu] ưu tiên tuyệt đối để phát tiếng ngay lập tức!
      const curBeat = latestBeats[curIdx];
      if (curBeat?.narration && !curBeat.dialogueText) {
        const curKey = getTtsCacheKey(curBeat.narration);
        const curItem = curKey ? latestItemByKey.get(curKey) : null;
        if (
          curItem &&
          !storyAudioBuffersRef.current.has(curItem.key) &&
          (attemptsByKey.get(curItem.key) || 0) < maxAttempts
        ) {
          return [curItem];
        }
      }

      // 2. Khi cảnh hiện tại đã có tiếng (đang phát 5-6s), gom tối đa 3 cảnh kế tiếp trong 1 chuyến HTTP để nạp cuốn chiếu mượt 0ms chờ!
      const batch = [];
      const pickedKeys = new Set();
      for (let offset = 1; offset <= totalBeats && batch.length < 3; offset += 1) {
        const bIdx = (curIdx + offset) % totalBeats;
        const beat = latestBeats[bIdx];
        if (!beat?.narration || beat.dialogueText) continue;
        const k = getTtsCacheKey(beat.narration);
        const item = k ? latestItemByKey.get(k) : null;
        if (
          item &&
          !pickedKeys.has(item.key) &&
          !storyAudioBuffersRef.current.has(item.key) &&
          (attemptsByKey.get(item.key) || 0) < maxAttempts
        ) {
          pickedKeys.add(item.key);
          batch.push(item);
        }
      }
      return batch;
    };

    const ctrl = new AbortController();
    const vsProfileId = localStorage.getItem("mc_voice_profile_id") || "b5d182f3";
    const batchUrl = import.meta.env.PROD
      ? "https://masoi-server-2eca.onrender.com/api/tts-batch"
      : "http://localhost:3001/api/tts-batch";
    const buildBatchHeaders = () => ({
      "Content-Type": "application/json",
      "x-game-session": sessionTokenRef.current || getSession()?.sessionToken || "",
    });

    (async () => {
      setStoryVoiceLoading(true);
      setVoiceHttpErrorCode(null);
      let loadedAny = false;
      try {
        // GIAI ĐOẠN 1 (<350ms): Quét nhanh 100% câu đã có sẵn trong LRU RAM Cache trên Server
        const initialMissingRaws = orderedItems
          .filter((it) => !storyAudioBuffersRef.current.has(it.key))
          .map((it) => it.raw);

        if (initialMissingRaws.length > 0 && !ctrl.signal.aborted) {
          try {
            const fastResp = await fetch(batchUrl, {
              method: "POST",
              headers: buildBatchHeaders(),
              body: JSON.stringify({
                phrases: initialMissingRaws,
                voice: vsProfileId,
                speed: 0.82,
                cacheOnly: true,
              }),
              signal: ctrl.signal,
            });
            if (fastResp.ok) {
              const fastData = await fastResp.json();
              const fastHits = ingestBatchResults(fastData?.results, initialMissingRaws);
              if (fastHits > 0) {
                loadedAny = true;
                setStoryVoiceOffline(false);
                setVoiceHttpErrorCode(null);
                syncLoadedCount();
                setStoryVoiceReadyTick((t) => t + 1);
              }
            } else if (fastResp.status === 401 || fastResp.status === 429) {
              setVoiceHttpErrorCode(fastResp.status);
            }
          } catch (fastErr) {
            if (fastErr?.name === "AbortError") return;
          }
        }

        // GIAI ĐOẠN 2 (Urgent Adaptive Streaming): Nạp từng chùm 1-3 cảnh còn thiếu bám sát con trỏ người xem!
        const attemptsByKey = new Map();
        const MAX_ATTEMPTS_PER_BEAT = 4;

        while (!ctrl.signal.aborted) {
          const targetBatch = pickNextMissingBatch(attemptsByKey, MAX_ATTEMPTS_PER_BEAT);
          if (targetBatch.length === 0) break;

          for (const it of targetBatch) {
            attemptsByKey.set(it.key, (attemptsByKey.get(it.key) || 0) + 1);
          }
          const reqPhrases = targetBatch.map((it) => it.raw);

          const resp = await fetch(batchUrl, {
            method: "POST",
            headers: buildBatchHeaders(),
            body: JSON.stringify({
              phrases: reqPhrases,
              voice: vsProfileId,
              speed: 0.82,
              urgent: true,
            }),
            signal: ctrl.signal,
          });
          if (!resp.ok) {
            setVoiceHttpErrorCode(resp.status);
            throw new Error(`HTTP ${resp.status}`);
          }
          const data = await resp.json();
          const batchHits = ingestBatchResults(data?.results, reqPhrases);

          if (batchHits > 0) {
            loadedAny = true;
            setStoryVoiceOffline(false);
            setVoiceHttpErrorCode(null);
            syncLoadedCount();
            setStoryVoiceReadyTick((t) => t + 1);
          }

          if (data?.vsOnline === false && batchHits === 0) {
            if (storyAudioBuffersRef.current.size === 0) {
              setStoryVoiceOffline(true);
            }
            break;
          }

          const pendingNormSet = new Set(
            Array.isArray(data?.pending) ? data.pending.map((p) => getTtsCacheKey(p)) : []
          );
          let hasPending = false;
          for (const it of targetBatch) {
            if (storyAudioBuffersRef.current.has(it.key)) continue;
            if (pendingNormSet.has(it.key)) {
              hasPending = true;
            } else {
              // Câu này bị từ chối/rỗng -> đánh dấu hết lượt thử để không lặp vô tận
              attemptsByKey.set(it.key, MAX_ATTEMPTS_PER_BEAT);
            }
          }
          if (hasPending && batchHits === 0) {
            await new Promise((r) => setTimeout(r, 1100));
          }
        }

        syncLoadedCount();
        if (
          !loadedAny &&
          !ctrl.signal.aborted &&
          storyAudioBuffersRef.current.size === 0 &&
          vsServerOfflineRef.current
        ) {
          setStoryVoiceOffline(true);
        }
      } catch (err) {
        if (err?.name !== "AbortError" && storyAudioBuffersRef.current.size === 0) {
          setStoryVoiceOffline(true);
        }
      } finally {
        if (!ctrl.signal.aborted) {
          syncLoadedCount();
          setStoryVoiceLoading(false);
        }
      }
    })();

    return () => ctrl.abort();
  }, [orderedVoicePlan.planKey, speechEnabled, voiceRecheckTick, autoRetryTick]);

  const effectiveVoiceTotalCount = storyVoiceTotalCount || orderedVoicePlan.totalUnique;
  const currentBeatCacheKey =
    currentBeat?.narration && !currentBeat?.dialogueText
      ? getTtsCacheKey(currentBeat.narration)
      : "";
  const hasCurrentBeatAudio = Boolean(
    currentBeatCacheKey &&
      storyVoiceReadyTick >= 0 &&
      storyAudioBuffersRef.current.has(currentBeatCacheKey)
  );
  const shouldWaitCurrentBeatAudio = Boolean(
    speechEnabled &&
      currentBeatCacheKey &&
      !hasCurrentBeatAudio &&
      storyVoiceLoading &&
      !storyVoiceOffline &&
      !voiceHttpErrorCode
  );

  // NHỊP 3: Lồng tiếng Giọng Đọc Kể Chuyện MC Clone (b5d182f3) qua WebAudio (thu trọn vào cả Loa & Video MP4/WebM — Tuyệt đối 0% speechSynthesis!)
  useEffect(() => {
    if (!currentBeat) return undefined;
    const beatId = currentBeat.id;
    const audioEngine = getCinemaAudioEngine();
    audioEngine?.stopVoice();

    // Bỏ qua giọng đọc nếu tắt loa, không có lời dẫn, hoặc là cảnh chat người chơi (wolf_chat / village_chat)
    if (!speechEnabled || !currentBeat.narration || currentBeat.dialogueText) {
      setSpeechCompletedForBeatId(beatId);
      return undefined;
    }

    const readyBuffer = hasCurrentBeatAudio
      ? storyAudioBuffersRef.current.get(currentBeatCacheKey)
      : null;

    if (!readyBuffer) {
      if (!shouldWaitCurrentBeatAudio) {
        setSpeechCompletedForBeatId(beatId);
        return undefined;
      }
      // Giữ nhịp máy quay chờ tối đa 14s nếu cảnh hiện tại đang được tải / tổng hợp; ngay khi MP3 về là đọc trọn câu!
      setSpeechCompletedForBeatId(null);
      const waitTimer = setTimeout(() => {
        setSpeechCompletedForBeatId(beatId);
      }, 14000);
      return () => clearTimeout(waitTimer);
    }

    setSpeechCompletedForBeatId(null);
    let cancelled = false;
    let settlePauseTimer = null;
    const markDone = () => {
      if (cancelled) return;
      cancelled = true;
      setSpeechCompletedForBeatId(beatId);
    };

    const estReadMs = Math.max(5500, currentBeat.narration.length * 105) / recapSpeed;
    const safetyTimer = setTimeout(markDone, estReadMs + 2500);

    const startSpeakTimer = setTimeout(async () => {
      if (cancelled) return;
      if (!audioEngine?.playVoiceArrayBuffer) {
        markDone();
        return;
      }
      audioEngine.setSpeakerMuted(!speechEnabled);
      const playedOk = await audioEngine.playVoiceArrayBuffer(readyBuffer, recapSpeed);
      if (cancelled) return;
      if (playedOk) {
        setVoiceBlockedByGesture(false);
        // Đệm lắng đọng cảm xúc 850ms sau khi MC vừa dứt lời!
        settlePauseTimer = setTimeout(markDone, 850);
      } else if (audioEngine.wasBlockedByAutoplay?.()) {
        // Trình duyệt tạm khóa Autoplay (ví dụ F5 thẳng vào màn kết game): hiện nhắc chạm chuột và giữ cảnh chờ tới 8s để phát lại ngay khi chạm!
        setVoiceBlockedByGesture(true);
        settlePauseTimer = setTimeout(markDone, 8000);
      } else {
        markDone();
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      clearTimeout(startSpeakTimer);
      if (settlePauseTimer) clearTimeout(settlePauseTimer);
      audioEngine?.stopVoice();
    };
  }, [
    currentBeat?.id,
    currentBeat?.narration,
    currentBeat?.dialogueText,
    currentBeatCacheKey,
    hasCurrentBeatAudio,
    shouldWaitCurrentBeatAudio,
    speechEnabled,
    recapSpeed,
    unlockReplayTick,
  ]);

  // Dọn dẹp tài nguyên khi rời màn hình Recap
  useEffect(() => {
    const audioEngine = getCinemaAudioEngine();
    audioEngine?.setAmbientActive(true);
    return () => {
      audioEngine?.stopVoice();
      audioEngine?.setAmbientActive(false);
      if (activeRecorderRef.current) {
        activeRecorderRef.current.stop();
        activeRecorderRef.current = null;
      }
      onStageChange?.(null);
      onAnimate?.(null);
    };
  }, [onStageChange, onAnimate]);

  useEffect(() => {
    return () => {
      if (recordedVideo?.url) {
        URL.revokeObjectURL(recordedVideo.url);
      }
    };
  }, [recordedVideo?.url]);

  const stopVideoCaptureAndOpenPlayer = useCallback(async () => {
    const rec = activeRecorderRef.current;
    if (!rec) return;
    activeRecorderRef.current = null;
    setIsRecordingVideo(false);
    try {
      const result = await rec.stop();
      if (result?.url) {
        setRecordedVideo((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return result;
        });
        setShowVideoPlayerModal(true);
        setHudVisible(true);
      }
    } catch {
      setRecordErrorMsg("Không thể đóng gói file video vừa quay.");
    }
  }, []);

  // Điều phối chuyển cảnh: CHỈ chuyển khi ĐÃ đủ thời lượng cảnh tối thiểu VÀ Giọng đọc MC đã dứt câu (+0.85s lắng đọng)!
  const [minDurationPassedForBeatId, setMinDurationPassedForBeatId] = useState(null);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return undefined;
    setMinDurationPassedForBeatId(null);
    const minWaitMs = Math.max(3600, (currentBeat.durationMs || 5400) / recapSpeed);
    const timer = setTimeout(() => {
      setMinDurationPassedForBeatId(currentBeat.id);
    }, minWaitMs);
    return () => clearTimeout(timer);
  }, [isPlaying, currentBeat?.id, currentBeat?.durationMs, recapSpeed]);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return undefined;
    const minDone = minDurationPassedForBeatId === currentBeat.id;
    const voiceDone = !speechEnabled || speechCompletedForBeatId === currentBeat.id;
    if (!minDone || !voiceDone) return undefined;

    if (safeBeatIdx < storyBeats.length - 1) {
      setBeatIndex(safeBeatIdx + 1);
    } else {
      setIsPlaying(false);
      setHudVisible(true);
      if (activeRecorderRef.current) {
        // Chờ thêm 1.1s ở khung hình MVP cuối cùng trước khi chốt băng Video!
        const endRecTimer = setTimeout(() => {
          stopVideoCaptureAndOpenPlayer();
        }, 1100);
        return () => clearTimeout(endRecTimer);
      }
    }
    return undefined;
  }, [
    isPlaying,
    currentBeat,
    minDurationPassedForBeatId,
    speechCompletedForBeatId,
    speechEnabled,
    safeBeatIdx,
    storyBeats.length,
    stopVideoCaptureAndOpenPlayer,
  ]);

  // Nút [🔴 Quay Video Phim]: Tự tua về Mở Màn 00:00, ẩn sạch thanh công cụ để ghi trọn bộ phim và bật trình xem lại ngay!
  const handleStartFullStoryVideoRecording = useCallback(() => {
    unlockCinemaAudioEngine();
    setRecordErrorMsg("");
    if (viewMode !== "3d" && onToggleViewMode) {
      onToggleViewMode();
    }
    try {
      const recSession = startCinemaStoryRecording({
        getOverlayState: () => overlayStateRef.current,
      });
      activeRecorderRef.current = recSession;
      setDrawerTab(null);
      setShowVideoPlayerModal(false);
      setFollowDirector(true);
      setRelockToken((t) => t + 1);
      setRecapSpeed(1);
      setBeatIndex(0);
      setIsPlaying(true);
      setIsRecordingVideo(true);
      setHudVisible(false);
    } catch (err) {
      setRecordErrorMsg(err?.message || "Không thể khởi động trình ghi video.");
    }
  }, [viewMode, onToggleViewMode]);

  function cycleSpeed() {
    setRecapSpeed((s) => (s === 1 ? 0.75 : s === 0.75 ? 1.5 : 1));
  }

  function toggleDrawer(tab) {
    setDrawerTab((prev) => (prev === tab ? null : tab));
    setHudVisible(true);
  }

  function handleFlipAll() {
    const all = {};
    players.forEach((p) => {
      all[p.id] = true;
    });
    setFlippedMap(all);
    setRevealedCount(players.length);
  }

  function toggleBrowserFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  const dayReplayBeats = useMemo(
    () => storyBeats.filter((b) => b.day === detailDay),
    [storyBeats, detailDay]
  );

  const timecodeLabel =
    typeof currentBeat?.elapsedMs === "number"
      ? formatTimecode(currentBeat.elapsedMs)
      : `CẢNH ${String(safeBeatIdx + 1).padStart(2, "0")}/${String(storyBeats.length).padStart(2, "0")}`;

  const controlsHiddenForImmersion =
    viewMode === "3d" &&
    !drawerTab &&
    !showVideoPlayerModal &&
    (isRecordingVideo || (!hudVisible && isPlaying && !isAtFinale));

  return (
    <div
      className={`recap-stage2a-root ${drawerTab ? "drawer-open" : ""} ${
        showPostGameChat ? "with-right-chat" : ""
      } ${controlsHiddenForImmersion ? "cinema-immersive-clean" : ""}`}
    >
      {/* Dải Tối Letterbox Rất Nhẹ Sát Đáy Giúp Chữ Phụ Đề Phim Nổi Sắc Nét Mà Không Cần Hộp Nền Thô! */}
      {viewMode === "3d" && <div className="cinema-bottom-vignette" aria-hidden="true" />}

      {/* Chỉ Báo Nhỏ Góc Trên Khi Đang Ghi Hình Tự Động Toàn Bộ Câu Chuyện */}
      {isRecordingVideo && (
        <div className="cinema-recording-live-pill">
          <span className="vf-rec-dot" />
          <span>
            ĐANG QUAY PHIM ({safeBeatIdx + 1}/{storyBeats.length})
          </span>
          <button
            type="button"
            className="btn-stop-record-early"
            onClick={stopVideoCaptureAndOpenPlayer}
            title="Dừng quay ngay tại đây và mở trình phát xem lại video"
          >
            ⏹ Dừng & Xem ngay
          </button>
        </div>
      )}

      {/* Nhãn Chương Mảnh Tinh Tế Khi Ẩn Thanh Công Cụ Để Xem Full Màn Hình */}
      {controlsHiddenForImmersion && !isRecordingVideo && (
        <div className="cinema-minimal-chapter-whisper">
          <span>{currentBeat?.tag}</span>
        </div>
      )}

      {/* ==================== 1. THANH ĐỈNH MÀN HÌNH (TỰ ẨN MƯỢT KHI ĐANG XEM PHIM FULL) ==================== */}
      <header className={`replay-viewfinder-topbar ${controlsHiddenForImmersion ? "hud-hidden" : ""}`}>
        <div className="vf-left-cluster">
          <div className={`recap-top-ribbon ${winConfig.themeClass}`}>
            <span className="ribbon-emoji">{winConfig.emoji}</span>
            <div className="ribbon-texts">
              <strong>{winConfig.title}</strong>
              <span>{winConfig.subtitle}</span>
            </div>
          </div>

          <div className="vf-rec-pill" title="Phim kể chuyện diễn biến thật từ góc nhìn từng nhân vật">
            <span className="vf-rec-dot" />
            <span className="vf-rec-text">PHIM KỂ CHUYỆN</span>
            <span className="vf-timecode">{timecodeLabel}</span>
          </div>
          {speechEnabled && (
            <button
              type="button"
              className="vf-rec-pill"
              onClick={() => {
                unlockCinemaAudioEngine();
                if (voiceBlockedRef.current) {
                  voiceBlockedRef.current = false;
                  setVoiceBlockedByGesture(false);
                  setUnlockReplayTick((t) => t + 1);
                }
                setVoiceHttpErrorCode(null);
                setStoryVoiceOffline(false);
                setAutoRetryTick((t) => t + 1);
                onRecheckVoice?.();
              }}
              title={
                voiceBlockedByGesture
                  ? "Trình duyệt tạm khóa tự phát tiếng sau khi tải lại trang — Bấm để phát ngay giọng kể chuyện cảnh hiện tại!"
                  : voiceHttpErrorCode
                    ? `Kết nối tải Voice trả mã HTTP ${voiceHttpErrorCode} — Bấm để làm mới phiên và tải lại ngay!`
                    : (storyVoiceOffline || vsServerOffline) && storyAudioBuffersRef.current.size === 0
                      ? "Máy chủ VoiceStudio cá nhân đang tắt — tự động phát nhạc nền điện ảnh & phụ đề sạch, 0% giọng tiếng Anh. Bấm để kiểm tra & nạp lại ngay!"
                      : "Giọng đọc kể chuyện Voice Clone cá nhân (RTX 3090) đang sẵn sàng — Bấm để mở khóa loa & làm mới trạng thái"
              }
              style={{
                cursor: "pointer",
                borderColor: voiceBlockedByGesture
                  ? "rgba(251, 191, 36, 0.72)"
                  : (voiceHttpErrorCode || storyVoiceOffline || vsServerOffline) &&
                      storyAudioBuffersRef.current.size === 0
                    ? "rgba(248, 113, 113, 0.55)"
                    : "rgba(52, 211, 153, 0.55)",
                background: voiceBlockedByGesture
                  ? "rgba(120, 53, 15, 0.52)"
                  : (voiceHttpErrorCode || storyVoiceOffline || vsServerOffline) &&
                      storyAudioBuffersRef.current.size === 0
                    ? "rgba(127, 29, 29, 0.42)"
                    : "rgba(6, 78, 59, 0.38)",
                color: voiceBlockedByGesture
                  ? "#fde68a"
                  : (voiceHttpErrorCode || storyVoiceOffline || vsServerOffline) &&
                      storyAudioBuffersRef.current.size === 0
                    ? "#fecaca"
                    : "#a7f3d0",
              }}
            >
              <span>
                {voiceBlockedByGesture
                  ? `🔊 Chạm bất kỳ để bật tiếng (${storyVoiceLoadedCount}/${effectiveVoiceTotalCount})`
                  : voiceHttpErrorCode && storyAudioBuffersRef.current.size === 0
                    ? `⚠️ Voice nghẽn HTTP ${voiceHttpErrorCode} (Bấm thử lại)`
                    : (storyVoiceOffline || vsServerOffline) && storyAudioBuffersRef.current.size === 0
                      ? "🔴 Voice Offline (Bấm thử lại)"
                      : storyVoiceLoading &&
                          effectiveVoiceTotalCount > 0 &&
                          storyVoiceLoadedCount < effectiveVoiceTotalCount
                        ? `🎙️ Đang nạp Voice (${storyVoiceLoadedCount}/${effectiveVoiceTotalCount})...`
                        : vsStatusChecking
                          ? "⏳ Đang kiểm tra Voice..."
                          : `🟢 Voice Clone Sẵn Sàng${effectiveVoiceTotalCount > 0 ? ` (${storyVoiceLoadedCount}/${effectiveVoiceTotalCount})` : ""}`}
              </span>
            </button>
          )}
        </div>

        <div className="vf-right-cluster">
          {/* Nút Quay Lại Video & Xem Lại Ngay Trong Game */}
          {!isRecordingVideo && (
            <button
              type="button"
              className="vf-record-movie-btn"
              onClick={handleStartFullStoryVideoRecording}
              title="Tự động quay lại toàn bộ bộ phim kể chuyện 3D kèm phụ đề & âm thanh để xem lại và lưu về máy"
            >
              🔴 Quay Video Phim
            </button>
          )}

          {recordedVideo && !isRecordingVideo && (
            <button
              type="button"
              className="vf-watch-recorded-btn"
              onClick={() => {
                setIsPlaying(false);
                setShowVideoPlayerModal(true);
              }}
              title="Mở rạp xem lại bản video vừa quay"
            >
              🎬 Xem Video Đã Quay ({recordedVideo.durationSec}s)
            </button>
          )}

          {viewMode === "3d" &&
            !followDirector && (
              <button
                type="button"
                className="vf-relock-btn"
                onClick={handleRelockDirector}
                title="Khóa ống kính quay về góc nhìn đạo diễn theo từng vai"
              >
                🎥 Bám lại Đạo Diễn
              </button>
            )}

          <button
            type="button"
            className="vf-tool-btn"
            onClick={toggleBrowserFullscreen}
            title="Mở toàn màn hình rạp chiếu phim"
          >
            ⛶ Full Màn Hình
          </button>

          {onTogglePostGameChat && (
            <button
              type="button"
              className={`vf-tool-btn ${showPostGameChat ? "active" : ""}`}
              onClick={onTogglePostGameChat}
              title="Đóng/mở cột trò chuyện sau trận đấu"
            >
              💬 {showPostGameChat ? "Ẩn Chat" : "Chat"}
            </button>
          )}

          {onToggleViewMode && (
            <button
              type="button"
              className="vf-tool-btn"
              onClick={onToggleViewMode}
              title="Chuyển đổi giữa Phim 3D và Thẻ 2D"
            >
              {viewMode === "3d" ? "⚡ 2D" : "🎮 3D"}
            </button>
          )}
        </div>
      </header>

      {recordErrorMsg && (
        <div className="cinema-record-error-toast" onClick={() => setRecordErrorMsg("")}>
          ⚠️ {recordErrorMsg}
        </div>
      )}

      {/* ==================== 2. NGĂN KÉO KÍNH MỜ BẬT/TẮT TÙY Ý (THẺ BÀI / CẢNH QUAY / MVP) ==================== */}
      {drawerTab && !showVideoPlayerModal && (
        <div className="recap-glass-drawer">
          <div className="drawer-header">
            <div className="drawer-tabs">
              <button
                type="button"
                className={`drawer-tab-btn ${drawerTab === "details" ? "active" : ""}`}
                onClick={() => setDrawerTab("details")}
              >
                🎬 Kịch Bản Từng Pha ({storyBeats.length})
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${drawerTab === "cards" ? "active" : ""}`}
                onClick={() => setDrawerTab("cards")}
              >
                🃏 Thẻ Bài ({players.length})
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${drawerTab === "awards" ? "active" : ""}`}
                onClick={() => setDrawerTab("awards")}
              >
                👑 Bảng Vàng MVP ({awards.length})
              </button>
            </div>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setDrawerTab(null)}
              title="Thu gọn để xem phim toàn màn hình"
            >
              ✕ Mở Rộng Phim 3D
            </button>
          </div>

          <div className="drawer-body">
            {drawerTab === "cards" && (
              <>
                <div className="recap-cards-heading">
                  <h3>🎭 Chân Tướng Cả Làng</h3>
                  <button type="button" className="btn-recap-tool" onClick={handleFlipAll}>
                    Lật tất cả ✓
                  </button>
                </div>
                <div className="recap-cards-grid-3d">
                  {players.map((p) => {
                    const isFlipped = Boolean(flippedMap[p.id]);
                    const roleKey = p.role || "villager";
                    const wasCursed = p.initialRole && p.initialRole !== roleKey;
                    const isLoverCard = Array.isArray(loversPublic) && loversPublic.includes(p.id);
                    const team =
                      isWolfTeamRole(roleKey) ? "wolf" : roleKey === "tanner" ? "neutral" : "village";

                    return (
                      <div
                        key={p.id}
                        className={`card-flip-item ${isFlipped ? "flipped" : ""}`}
                        onClick={() =>
                          setFlippedMap((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                        }
                      >
                        <div className="card-flip-inner">
                          <div className="card-flip-front">
                            <span className="back-pattern-icon">🎴</span>
                            <span className="back-name">{p.name}</span>
                          </div>
                          <div className={`card-flip-back ${team}`}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <RolePortrait roleKey={roleKey} size={40} glow />
                              <img src={p.avatar} alt={p.name} className="card-flip-avatar" style={{ width: 28, height: 28 }} />
                            </div>
                            <span
                              className="card-flip-role-badge"
                              style={{ color: ROLE_COLORS[roleKey] || "#fff" }}
                            >
                              {ROLE_LABELS[roleKey]}
                            </span>
                            {wasCursed && (
                              <span style={{ fontSize: "10px", color: "#c084fc", fontWeight: 700 }}>
                                (Gốc: {ROLE_EMOJIS[p.initialRole]} {ROLE_LABELS[p.initialRole]})
                              </span>
                            )}
                            {isLoverCard && (
                              <span style={{ fontSize: "10px", color: "#f472b6", fontWeight: 700 }}>
                                💘 Cặp Đôi Định Mệnh
                              </span>
                            )}
                            <span className="card-flip-player-name">{p.name}</span>
                            <span className={`card-flip-status-pill ${p.alive ? "alive" : "dead"}`}>
                              {p.alive ? "🟢 Sống sót" : "👻 Tử nạn"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {drawerTab === "details" && (
              <div className="recap-day-container">
                <div className="recap-days-selector">
                  {allDays.map((d) => (
                    <button
                      type="button"
                      key={d}
                      className={`btn-day-pill ${detailDay === d ? "active" : ""}`}
                      onClick={() => {
                        setDetailDay(d);
                        const idx = storyBeats.findIndex((b) => b.day === d);
                        if (idx >= 0) {
                          setBeatIndex(idx);
                          setIsPlaying(false);
                        }
                      }}
                    >
                      🌙☀️ Ngày {d}
                    </button>
                  ))}
                </div>
                <div className="clash-actions-stream">
                  {dayReplayBeats.length === 0 ? (
                    <div className="clash-action-row">
                      <div className="clash-action-desc">Chưa có cảnh quay trong ngày này.</div>
                    </div>
                  ) : (
                    dayReplayBeats.map((b) => {
                      const targetBeatIdx = storyBeats.findIndex((item) => item.id === b.id);
                      const isCurrentRow = targetBeatIdx === safeBeatIdx;
                      return (
                        <div
                          key={b.id}
                          className={`clash-action-row clickable ${isCurrentRow ? "active-beat" : ""}`}
                          onClick={() => {
                            if (targetBeatIdx >= 0) {
                              setBeatIndex(targetBeatIdx);
                              setIsPlaying(true);
                              setDrawerTab(null);
                            }
                          }}
                          title="Nhấp để phát ngay cảnh quay này ở chế độ toàn màn hình!"
                        >
                          <div className="clash-action-icon">
                            {b.kind === "night" ? "🌙" : b.kind === "tribunal" ? "⚖️" : "☀️"}
                          </div>
                          <div className="clash-action-desc">
                            <strong>{b.title}</strong>
                            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
                              {b.narration}
                            </div>
                          </div>
                          <span className="jump-play-pill">▶ Phát cảnh</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {drawerTab === "awards" && (
              <div className="recap-awards-section">
                {awards.length > 0 && awards[0]?.id === "mvp" && (
                  <div className="mvp-hero-card">
                    <div className="mvp-hero-avatar-wrapper">
                      <img src={awards[0].avatar} alt={awards[0].name} className="mvp-hero-avatar" />
                      <span className="mvp-crown-badge">👑</span>
                    </div>
                    <div className="mvp-hero-details">
                      <span className="mvp-badge-tag">🏆 CẦU THỦ XUẤT SẮC NHẤT TRẬN ĐẤU</span>
                      <h3 className="mvp-hero-name">
                        {awards[0].name} ({ROLE_EMOJIS[awards[0].role]}{" "}
                        {ROLE_LABELS[awards[0].role] || awards[0].role})
                      </h3>
                      <p className="mvp-hero-desc">{awards[0].description}</p>
                    </div>
                  </div>
                )}

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
          </div>
        </div>
      )}

      {/* ==================== 3. PHỤ ĐỀ ĐIỆN ẢNH NỔI TRONG SUỐT + THANH ĐẠO DIỄN TỰ ẨN ==================== */}
      <footer className="cinema-bottom-stack">
        {/* Phụ đề phim luôn hiển thị thanh thoát không che cảnh, kể cả khi thanh nút bấm đã tự ẩn! */}
        <div className="cinema-floating-subtitle">
          {!controlsHiddenForImmersion && (
            <span className={`director-scene-badge kind-${currentBeat?.kind || "night"}`}>
              {currentBeat?.tag || "🎬 CẢNH QUAY"}
            </span>
          )}
          <div className="cinema-sub-title">{currentBeat?.title}</div>
          <div className="cinema-sub-narration">{currentBeat?.narration}</div>
        </div>

        {/* Bàn điều khiển tua phim — Tự động lặn xuống đáy khi đang tập trung xem phim Full màn hình! */}
        <section className={`recap-director-dock ${controlsHiddenForImmersion ? "hud-hidden" : ""}`}>
          <div className="director-scrubber-row">
            <span className="scrubber-index-pill">
              🎬 Pha {safeBeatIdx + 1}/{storyBeats.length}
            </span>
            <input
              type="range"
              className="director-timeline-slider"
              min={0}
              max={Math.max(0, storyBeats.length - 1)}
              step={1}
              value={safeBeatIdx}
              onChange={(e) => {
                setIsPlaying(false);
                setBeatIndex(Number(e.target.value));
              }}
              aria-label="Thanh tua phim kể chuyện 3D"
            />
            <span className="scrubber-time-pill">{timecodeLabel}</span>
          </div>

          <div className="director-controls-row">
            <div className="director-chapters">
              {chapterJumps.map((ch) => {
                const isCurrent =
                  (ch.key === "reveal" && currentBeat?.kind === "reveal") ||
                  (ch.key === "mvp" && currentBeat?.kind === "mvp") ||
                  ch.key === `day_${currentBeat?.day}`;
                return (
                  <button
                    type="button"
                    key={ch.key}
                    className={`director-chip ${isCurrent ? "active" : ""}`}
                    onClick={() => {
                      setBeatIndex(ch.beatIdx);
                      setIsPlaying(true);
                    }}
                  >
                    {ch.label}
                  </button>
                );
              })}
            </div>

            <div className="director-transport">
              <button
                type="button"
                className="director-btn"
                disabled={safeBeatIdx <= 0}
                onClick={() => {
                  setIsPlaying(false);
                  setBeatIndex((i) => Math.max(0, i - 1));
                }}
                title="Lùi 1 pha (Phím ←)"
              >
                ⏮
              </button>
              <button
                type="button"
                className={`director-btn play-toggle ${isPlaying ? "playing" : ""}`}
                onClick={() => {
                  if (!isPlaying && isAtFinale) {
                    setBeatIndex(0);
                    setIsPlaying(true);
                  } else {
                    setIsPlaying((p) => !p);
                  }
                }}
              >
                {isPlaying ? "⏸ Tạm dừng" : isAtFinale ? "↺ Xem lại từ đầu" : "▶ Tiếp tục phim"}
              </button>
              <button
                type="button"
                className="director-btn"
                disabled={isAtFinale}
                onClick={() => {
                  setIsPlaying(false);
                  setBeatIndex((i) => Math.min(storyBeats.length - 1, i + 1));
                }}
                title="Tiến 1 pha (Phím →)"
              >
                ⏭
              </button>
              <button
                type="button"
                className="director-btn"
                onClick={cycleSpeed}
                title="Đổi nhịp độ kể chuyện (0.75x Chậm sâu • 1x Chuẩn phim • 1.5x Nhanh)"
              >
                🎞️ {recapSpeed}x
              </button>
              <button
                type="button"
                className="director-btn"
                onClick={() => {
                  setSpeechEnabled((prev) => {
                    if (prev) getCinemaAudioEngine()?.stopVoice();
                    return !prev;
                  });
                }}
                title="Bật/tắt giọng đọc kể chuyện & âm thanh điện ảnh"
              >
                {speechEnabled ? "🔊 Kể chuyện" : "🔇 Tắt tiếng"}
              </button>
            </div>

            <div className="director-drawers-and-restart">
              <button
                type="button"
                className={`director-btn drawer-trigger ${drawerTab === "details" ? "active" : ""}`}
                onClick={() => toggleDrawer("details")}
              >
                📜 Kịch Bản
              </button>
              <button
                type="button"
                className={`director-btn drawer-trigger ${drawerTab === "cards" ? "active" : ""}`}
                onClick={() => toggleDrawer("cards")}
              >
                🃏 Thẻ Bài
              </button>
              <button
                type="button"
                className={`director-btn drawer-trigger ${drawerTab === "awards" ? "active" : ""}`}
                onClick={() => toggleDrawer("awards")}
              >
                👑 MVP ({awards.length})
              </button>

              {ghostBetBonusXp > 0 && (
                <span
                  className="director-wait-host"
                  style={{
                    color: "#e9d5ff",
                    borderColor: "rgba(192, 132, 252, 0.65)",
                    background: "rgba(88, 28, 135, 0.55)",
                    fontWeight: 800,
                  }}
                >
                  🔮 +{ghostBetBonusXp} XP Tiên Tri Âm Giới!
                </span>
              )}

              {isHost ? (
                <button type="button" className="btn-director-restart" onClick={onRestart}>
                  🔄 Mở Sảnh Ván Mới{rematchSecLeft > 0 ? ` (${rematchSecLeft}s)` : ""}
                </button>
              ) : isSpectator ? (
                <span className="director-wait-host" style={{ color: "#bae6fd" }}>
                  👀 Tự vào ghế sau {rematchSecLeft || 45}s...
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-director-restart"
                  onClick={() => onRematchReady?.()}
                  disabled={myRematchReady}
                  style={myRematchReady ? { opacity: 0.85, cursor: "default" } : undefined}
                >
                  {myRematchReady
                    ? `✅ Đã Sẵn Sàng (${rematchReadyCount}/${rematchRequiredCount})`
                    : `🙋 Ván Mới (${rematchReadyCount}/${rematchRequiredCount})`}
                  {rematchSecLeft > 0 ? ` • ${rematchSecLeft}s` : ""}
                </button>
              )}
            </div>
          </div>
        </section>
      </footer>

      {/* ==================== 4. RẠP XEM LẠI VIDEO VỪA QUAY FULL-SCREEN NGAY TRONG GAME ==================== */}
      {showVideoPlayerModal && recordedVideo && (
        <div
          className="cinema-video-modal-backdrop"
          onClick={() => setShowVideoPlayerModal(false)}
        >
          <div className="cinema-video-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cinema-video-modal-header">
              <div className="cinema-video-modal-title">
                <span>🎬 Bản Thu Video Phim Kể Chuyện</span>
                <small>
                  Thời lượng ~{recordedVideo.durationSec}s • Lúc {recordedVideo.createdAt} • Chuẩn HD 16:9 kèm Phụ đề
                </small>
              </div>
              <div className="cinema-video-modal-actions">
                <a
                  href={recordedVideo.url}
                  download={`MaSoi3D_PhimKeChuyen_${Date.now()}.${recordedVideo.ext}`}
                  className="btn-download-story-video"
                >
                  ⬇️ Tải Video Về Máy (.{recordedVideo.ext})
                </a>
                <button
                  type="button"
                  className="btn-re-record-video"
                  onClick={handleStartFullStoryVideoRecording}
                >
                  🔴 Quay Lại Bản Mới
                </button>
                <button
                  type="button"
                  className="btn-close-video-modal"
                  onClick={() => setShowVideoPlayerModal(false)}
                >
                  ✕ Đóng
                </button>
              </div>
            </div>

            <div className="cinema-video-player-stage">
              <video
                src={recordedVideo.url}
                controls
                autoPlay
                playsInline
                className="cinema-recorded-video-el"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

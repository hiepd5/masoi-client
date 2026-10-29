import { useState } from "react";
import {
  ROLE_COLORS,
  ROLE_EMOJIS,
  ROLE_LABELS,
  ROLE_PORTRAIT_BADGES,
  ROLE_PORTRAIT_CARDS,
} from "../config/roles.config.js";

/**
 * RolePortrait — Hiển thị Chân Dung 3D Studio Arcane (WebP 1:1 Huy hiệu hoặc 2:3 Thẻ Tarot)
 * thay thế hoàn toàn Emoji thô trên HUD, Sảnh chờ, Sổ tay luật, Thẻ lật bài và bản ⚡ 2D Lite.
 * Có cơ chế tự động fallback mượt nếu thiết bị offline hoàn toàn chưa kịp cache ảnh.
 */
export default function RolePortrait({
  roleKey = "villager_cloak",
  mode = "badge", // 'badge' (1:1) | 'card' (2:3)
  size = 44,
  alt = "",
  className = "",
  style = undefined,
  glow = false,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const safeKey = roleKey || "villager_cloak";
  const rawSrc =
    mode === "card"
      ? ROLE_PORTRAIT_CARDS[safeKey] || ROLE_PORTRAIT_CARDS.villager_cloak
      : ROLE_PORTRAIT_BADGES[safeKey] || ROLE_PORTRAIT_BADGES.villager_cloak;
  const src = rawSrc ? (rawSrc.includes("?") ? rawSrc : `${rawSrc}?v=44`) : null;
  const accent = ROLE_COLORS[safeKey] || "#d9a441";
  const label = alt || ROLE_LABELS[safeKey] || "Nhân vật";

  const widthPx = typeof size === "number" ? `${size}px` : size;
  const heightPx =
    mode === "card"
      ? typeof size === "number"
        ? `${Math.round(size * 1.5)}px`
        : "100%"
      : widthPx;

  if (imgFailed || !src) {
    return (
      <span
        className={`role-portrait-fallback ${className}`.trim()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: widthPx,
          height: heightPx,
          borderRadius: mode === "card" ? "10px" : "50%",
          background: "rgba(15, 23, 42, 0.88)",
          border: `1.5px solid ${accent}`,
          fontSize: typeof size === "number" ? `${Math.max(14, Math.round(size * 0.52))}px` : "1.2rem",
          flexShrink: 0,
          ...style,
        }}
        title={label}
      >
        {ROLE_EMOJIS[safeKey] || "🐺"}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      decoding="async"
      draggable={false}
      onError={() => setImgFailed(true)}
      className={`role-portrait-img mode-${mode} ${className}`.trim()}
      style={{
        width: widthPx,
        height: heightPx,
        objectFit: "cover",
        borderRadius: mode === "card" ? "10px" : "50%",
        border: `1.5px solid ${accent}aa`,
        boxShadow: glow ? `0 0 14px ${accent}66` : "0 2px 8px rgba(0,0,0,0.45)",
        display: "block",
        flexShrink: 0,
        userSelect: "none",
        ...style,
      }}
    />
  );
}

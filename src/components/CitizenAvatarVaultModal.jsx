import { useEffect, useState } from "react";
import {
  BUILTIN_VILLAGER_AVATARS,
  getCitizenAvatarCatalogSnapshot,
  loadCitizenAvatarCatalog,
  subscribeCitizenAvatarCatalog,
} from "../config/citizenAvatars.config.js";

/**
 * CitizenAvatarVaultModal — Kho Nhân Vật Dân Làng 3D & Ô Chờ Avatar 3D Người Thật Cá Nhân Hóa.
 * - Nhóm 1: 4 Nhân Vật Dân Làng Bắc Âu 3D sẵn sàng (đồng bộ 1:1 giữa ghế 3D 0.48m, 2D Lite & Chat).
 * - Nhóm 2: 12+ Ô Chờ Avatar 3D Người Thật (tự động mở khóa không giới hạn khi nạp file .glb qua
 *   UPDATE_AVATARS_3D.bat hoặc đồng bộ từ Database User users.citizen_model_id trong tương lai).
 */
export default function CitizenAvatarVaultModal({
  open,
  onClose,
  selectedId,
  onSelect,
}) {
  const [catalog, setCatalog] = useState(() => getCitizenAvatarCatalogSnapshot());

  useEffect(() => {
    if (!open) return;
    const unsub = subscribeCitizenAvatarCatalog((next) => {
      setCatalog(next);
    });
    loadCitizenAvatarCatalog({ force: true }).then((next) => {
      setCatalog(next);
    });
    return unsub;
  }, [open]);

  if (!open) return null;

  const builtinList = catalog?.builtinVillagers || BUILTIN_VILLAGER_AVATARS;
  const customList = catalog?.customHumanAvatars || [];
  const readyHumanCount = customList.filter(
    (item) => item.status === "ready" && Boolean(item.glbUrl)
  ).length;

  const handleChoose = (id) => {
    onSelect?.(id);
    onClose?.();
  };

  return (
    <div className="avatar-vault-overlay" onClick={onClose}>
      <div
        className="avatar-vault-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Kho Nhân Vật 3D & Ô Chờ Avatar Người Thật"
      >
        <div className="avatar-vault-header">
          <div>
            <h2 className="avatar-vault-title">🎭 Kho Nhân Vật Dân Làng & Avatar 3D Cá Nhân Hóa</h2>
            <p className="avatar-vault-sub">
              Nhân vật bạn chọn sẽ trực tiếp ngồi ghế 3D quanh lửa trại ở Sảnh Chờ & suốt ban ngày (100% Zero-Leak vai thật)
            </p>
          </div>
          <button type="button" className="avatar-vault-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="avatar-vault-body">
          {/* NHÓM 1: 4 NHÂN VẬT DÂN LÀNG 3D SẴN SÀNG */}
          <div className="avatar-vault-section">
            <div className="avatar-vault-sec-head">
              <span className="sec-title">🏡 4 Nhân Vật Dân Làng Bắc Âu 3D (Sẵn sàng)</span>
              <span className="sec-pill ready">4/4 Hoạt động</span>
            </div>

            <div className="avatar-vault-grid builtin-grid">
              {builtinList.map((item) => {
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`avatar-vault-card is-ready ${isSelected ? "selected" : ""}`}
                    onClick={() => handleChoose(item.id)}
                  >
                    <div className="vault-card-art">
                      <img
                        src={item.portraitCard || item.portraitBadge}
                        alt={item.label}
                        loading="lazy"
                      />
                      <span className="vault-card-tag tag-villager">3D Dân Làng</span>
                      {isSelected && <span className="vault-card-check">✓ Đang chọn</span>}
                    </div>
                    <div className="vault-card-meta">
                      <div className="vault-card-name">{item.label}</div>
                      <div className="vault-card-desc">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* NHÓM 2: KHO AVATAR 3D NGƯỜI THẬT CÁ NHÂN HÓA (12+ Ô CHỜ MỞ RỘNG TỰ ĐỘNG) */}
          <div className="avatar-vault-section">
            <div className="avatar-vault-sec-head">
              <span className="sec-title">
                🧍 Ô Chờ Avatar 3D Người Thật Ngoài Đời (Độc quyền User • Không cấp cho AI Bot)
              </span>
              <span className={`sec-pill ${readyHumanCount > 0 ? "ready" : "reserved"}`}>
                {readyHumanCount > 0
                  ? `${readyHumanCount} Đã nạp • ${customList.length} Ô`
                  : `${customList.length} Ô chờ sẵn sàng`}
              </span>
            </div>

            <div className="avatar-vault-db-note">
              💡 Khi bộ Model 3D Người Thật (`.glb`) hoàn thiện hoặc kết nối Tài khoản Database (`users.citizen_model_id`), các ô chờ bên dưới sẽ tự động mở khóa không giới hạn số lượng — ngồi chuẩn ghế `0.48m` với màu da & trang phục gốc 100%.
            </div>

            <div className="avatar-vault-grid custom-human-grid">
              {customList.map((item, idx) => {
                const isReady = item.status === "ready" && Boolean(item.glbUrl);
                const isSelected = isReady && selectedId === item.id;
                const padNum = String(item.slotNumber || idx + 1).padStart(2, "0");

                if (isReady) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`avatar-vault-card is-ready is-human-3d ${isSelected ? "selected" : ""}`}
                      onClick={() => handleChoose(item.id)}
                    >
                      <div className="vault-card-art">
                        <img
                          src={item.portraitCard || item.portraitBadge || "/portraits/badges/villager_cloak.webp"}
                          alt={item.label}
                          loading="lazy"
                        />
                        <span className="vault-card-tag tag-human">✨ Người Thật 3D</span>
                        {isSelected && <span className="vault-card-check">✓ Đang chọn</span>}
                      </div>
                      <div className="vault-card-meta">
                        <div className="vault-card-name">{item.label}</div>
                        <div className="vault-card-desc">
                          {item.desc || "Model 3D cá nhân hóa ngồi ghế thật"}
                        </div>
                      </div>
                    </button>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="avatar-vault-card is-reserved"
                    title="Ô chờ nạp Model 3D Người Thật (.glb) hoặc đồng bộ Database User"
                  >
                    <div className="vault-reserved-art">
                      <div className="reserved-rune-ring">
                        <span className="reserved-silhouette">🧍</span>
                      </div>
                      <span className="reserved-slot-code">SLOT #{padNum}</span>
                    </div>
                    <div className="vault-card-meta">
                      <div className="vault-card-name">{item.shortLabel || `Ô Chờ #${padNum}`}</div>
                      <div className="vault-card-desc">Chờ nạp Model 3D Người Thật</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

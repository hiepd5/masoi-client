import { useState, useEffect, useRef } from "react";
import { getUniverseTheme, sanitizeUniverseId } from "../config/universeThemes.config.js";
import "./StealthCamouflageOverlay.css";

let cachedOriginalTitle = null;
let cachedOriginalFavicon = null;

function ensureOriginalDocumentMetaCaptured() {
  if (typeof document === "undefined") return;
  if (cachedOriginalTitle === null) {
    cachedOriginalTitle = document.title || "Ma Sói Online 3D";
  }
  if (cachedOriginalFavicon === null) {
    const iconEl = document.querySelector("link[rel*='icon']");
    cachedOriginalFavicon = iconEl ? iconEl.getAttribute("href") || "" : "";
  }
}

function applyFaviconHref(href) {
  if (typeof document === "undefined" || !href) return;
  let link = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function triggerBossKeyToggle(forceOpen = null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ws:boss-key-toggle", { detail: { forceOpen } }));
}

export function BossKeyTriggerButton({ universeId, className = "" }) {
  const uTheme = getUniverseTheme(universeId);
  const disguise = uTheme.stealthDisguise;
  if (!disguise?.enabled) return null;

  return (
    <button
      type="button"
      className={`boss-key-trigger-pill mode-${disguise.bossKeyMode} ${className}`.trim()}
      onClick={() => triggerBossKeyToggle(true)}
      title="Phím tắt [Esc] — Bật màn hình ngụy trang trong 0.05 giây!"
    >
      {disguise.bossKeyShort}
    </button>
  );
}

const EXCEL_ROWS = [
  ["KV-01", "Phòng Phát Triển Sản Phẩm", "420,000,000", "468,500,000", "111.5%", "Đạt vượt mức", "=D4/C4"],
  ["KV-02", "Khối Vận Hành & CSKH", "310,000,000", "319,200,000", "103.0%", "Hoàn thành", "=D5/C5"],
  ["KV-03", "Bộ Phận Truyền Thông Số", "285,000,000", "298,400,000", "104.7%", "Hoàn thành", "=D6/C6"],
  ["KV-04", "Nhóm Hạ Tầng Hệ Thống IT", "195,000,000", "204,750,000", "105.0%", "Ổn định SLA 99.9%", "=D7/C7"],
  ["KV-05", "Phòng Kế Toán - Kiểm Toán", "160,000,000", "160,000,000", "100.0%", "Đã đối soát", "=D8/C8"],
  ["KV-06", "Khối Kinh Doanh Khu Vực Bắc", "540,000,000", "512,000,000", "94.8%", "Đang bổ sung Q3", "=D9/C9"],
  ["KV-07", "Khối Kinh Doanh Khu Vực Nam", "610,000,000", "658,800,000", "108.0%", "Đạt vượt mức", "=D10/C10"],
  ["KV-08", "Phòng Hành Chính Nhân Sự", "145,000,000", "147,900,000", "102.0%", "Hoàn thành", "=D11/C11"],
  ["TỔNG", "Cộng dồn Toàn Khối Q3", "2,665,000,000", "2,769,550,000", "103.9%", "Đã duyệt sơ bộ", "=SUM(D4:D11)"],
];

const PDF_QUESTIONS = [
  {
    id: 1,
    q: "Câu 1. Cho hàm số y = f(x) = x³ - 3x² + 2. Giá trị cực đại của hàm số đã cho trên khoảng (-1; 3) bằng:",
    opts: ["A. y = 2", "B. y = -2", "C. y = 0", "D. y = 4"],
  },
  {
    id: 2,
    q: "Câu 2. Giá trị của tích phân I = ∫(từ 0 đến 1) (2x + 1)dx bằng bao nhiêu?",
    opts: ["A. I = 1", "B. I = 2", "C. I = 3", "D. I = 3/2"],
  },
  {
    id: 3,
    q: "Câu 3. Trong không gian Oxyz, mặt phẳng (P): 2x - y + 3z - 6 = 0 có một vectơ pháp tuyến là:",
    opts: ["A. n = (2; 1; 3)", "B. n = (2; -1; 3)", "C. n = (-2; -1; 3)", "D. n = (2; -1; -6)"],
  },
  {
    id: 4,
    q: "Câu 4. Một vật dao động điều hòa với phương trình x = 6cos(4πt + π/3) (cm). Chu kỳ dao động T của vật là:",
    opts: ["A. T = 0,5 s", "B. T = 2,0 s", "C. T = 0,25 s", "D. T = 4,0 s"],
  },
];

export default function StealthCamouflageOverlay({
  universeId = "classic",
  phaseKey = "lobby",
  dayNumber = 1,
  secondsLeft = null,
  myActionNeeded = false,
}) {
  const cleanUniverse = sanitizeUniverseId(universeId);
  const uTheme = getUniverseTheme(cleanUniverse);
  const disguise = uTheme.stealthDisguise;
  const isEnabled = Boolean(disguise?.enabled);

  const [open, setOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState({ r: 0, c: 3, formula: "=468500000" });
  const [pickedAnswers, setPickedAnswers] = useState({ 1: 0, 2: 1 });
  const [patrolToast, setPatrolToast] = useState(false);
  const patrolShownKeyRef = useRef("");

  // Đồng bộ Tab Title + Favicon ngụy trang tự động
  useEffect(() => {
    ensureOriginalDocumentMetaCaptured();
    if (!isEnabled) {
      setOpen(false);
      setPatrolToast(false);
      if (cachedOriginalTitle) document.title = cachedOriginalTitle;
      if (cachedOriginalFavicon) applyFaviconHref(cachedOriginalFavicon);
      return;
    }

    document.title = disguise.tabTitle;
    if (disguise.faviconDataUri) {
      applyFaviconHref(disguise.faviconDataUri);
    }
  }, [isEnabled, disguise?.tabTitle, disguise?.faviconDataUri]);

  // Khôi phục Title/Favicon gốc khi unmount hoàn toàn
  useEffect(() => {
    return () => {
      if (cachedOriginalTitle) document.title = cachedOriginalTitle;
      if (cachedOriginalFavicon) applyFaviconHref(cachedOriginalFavicon);
    };
  }, []);

  // Lắng nghe phím [Esc] 0.05s và sự kiện click nút BossKey
  useEffect(() => {
    if (!isEnabled) return undefined;

    const onCustomToggle = (e) => {
      const forced = e?.detail?.forceOpen;
      setPatrolToast(false);
      setOpen((prev) => (typeof forced === "boolean" ? forced : !prev));
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        // Bỏ qua nếu đang gõ chữ trong ô input/textarea mà màn ngụy trang chưa mở
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (!open && (tag === "input" || tag === "textarea")) {
          document.activeElement?.blur?.();
          return;
        }
        e.preventDefault();
        setPatrolToast(false);
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("ws:boss-key-toggle", onCustomToggle);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("ws:boss-key-toggle", onCustomToggle);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isEnabled, open]);

  // Micro-event vui nhộn: Báo động tuần tra nhẹ 1 lần khi bước vào Thảo luận Ngày 1
  useEffect(() => {
    if (!isEnabled || open) return undefined;
    if (phaseKey !== "day_discuss") return undefined;
    const key = `${cleanUniverse}:D${dayNumber}`;
    if (patrolShownKeyRef.current === key || dayNumber > 1) return undefined;
    patrolShownKeyRef.current = key;

    const showTimer = window.setTimeout(() => {
      setPatrolToast(true);
    }, 3200);
    const hideTimer = window.setTimeout(() => {
      setPatrolToast(false);
    }, 8800);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [isEnabled, open, phaseKey, dayNumber, cleanUniverse]);

  if (!isEnabled) return null;

  const phaseShort = uTheme.phaseShortLabels?.[phaseKey] || phaseKey;
  const subtleLiveCode = `D${dayNumber || 1} • ${phaseShort}${
    secondsLeft !== null && secondsLeft !== undefined ? ` (${secondsLeft}s)` : ""
  }${myActionNeeded ? " ● Đến lượt" : ""}`;

  return (
    <>
      {patrolToast && !open && (
        <div className="stealth-patrol-toast" role="status">
          <div className="stealth-patrol-title">
            <span>{disguise.patrolAlertTitle}</span>
          </div>
          <div className="stealth-patrol-sub">{disguise.patrolAlertSub}</div>
          <div className="stealth-patrol-actions">
            <button
              type="button"
              className="btn-stealth-instant"
              onClick={() => {
                setPatrolToast(false);
                setOpen(true);
              }}
            >
              ⚡ Bật Ngụy Trang (Esc)
            </button>
            <button
              type="button"
              className="btn-stealth-dismiss"
              onClick={() => setPatrolToast(false)}
            >
              Đã rõ
            </button>
          </div>
        </div>
      )}

      {open && disguise.bossKeyMode === "excel" && (
        <div className="stealth-camouflage-fullscreen mode-excel">
          <div className="excel-top-titlebar">
            <div className="excel-title-left">
              <span>📊 AutoSave: On</span>
              <span>|</span>
              <span>Bao_cao_KPI_Quy_3_Final_v2.xlsx — Saved to OneDrive</span>
            </div>
            <span className="excel-autosave-pill">Q3 Financial & KPI Review</span>
          </div>

          <div className="excel-ribbon-tabs">
            <span>File</span>
            <span className="excel-ribbon-tab active">Home</span>
            <span>Insert</span>
            <span>Page Layout</span>
            <span>Formulas</span>
            <span>Data</span>
            <span>Review</span>
            <span>View</span>
          </div>

          <div className="excel-formula-bar">
            <div className="excel-cell-ref">
              {String.fromCharCode(65 + selectedCell.c)}
              {selectedCell.r + 4}
            </div>
            <span className="excel-fx-tag">fx</span>
            <div className="excel-formula-input">{selectedCell.formula}</div>
          </div>

          <div className="excel-grid-scroll">
            <table className="excel-table">
              <thead>
                <tr>
                  <th className="excel-row-num">#</th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                  <th>E</th>
                  <th>F</th>
                  <th>G</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="excel-row-num">1</td>
                  <td colSpan={7} style={{ fontWeight: 700, fontSize: "13.5px", color: "#065f46" }}>
                    BẢNG TỔNG HỢP CHỈ TIÊU HIỆU SUẤT & NGÂN SÁCH QUÝ 3 (ĐVT: VNĐ)
                  </td>
                </tr>
                <tr>
                  <td className="excel-row-num">2</td>
                  <td colSpan={7} style={{ color: "#6b7280", fontSize: "11.5px" }}>
                    Cập nhật định kỳ nội bộ • Trạng thái đối soát chứng từ tự động
                  </td>
                </tr>
                <tr className="excel-cell-header">
                  <td className="excel-row-num">3</td>
                  <td>Mã Bộ Phận</td>
                  <td>Tên Đơn Vị / Phòng Ban</td>
                  <td>Kế Hoạch Q3</td>
                  <td>Thực Đạt Q3</td>
                  <td>Tỷ Lệ KPI</td>
                  <td>Ghi Chú Đối Soát</td>
                  <td>Công Thức</td>
                </tr>
                {EXCEL_ROWS.map((row, rIdx) => (
                  <tr
                    key={row[0]}
                    style={rIdx === EXCEL_ROWS.length - 1 ? { fontWeight: 700, background: "#f9fafb" } : undefined}
                  >
                    <td className="excel-row-num">{rIdx + 4}</td>
                    {row.map((val, cIdx) => {
                      const isSel = selectedCell.r === rIdx && selectedCell.c === cIdx;
                      const isNum = cIdx >= 2 && cIdx <= 4;
                      const statusCls =
                        cIdx === 5
                          ? val.includes("bổ sung")
                            ? "excel-status-warn"
                            : "excel-status-ok"
                          : "";
                      return (
                        <td
                          key={cIdx}
                          className={`excel-cell ${isSel ? "selected" : ""} ${isNum ? "excel-num" : ""} ${statusCls}`}
                          onClick={() =>
                            setSelectedCell({
                              r: rIdx,
                              c: cIdx,
                              formula: cIdx === 6 ? val : String(val).replace(/,/g, ""),
                            })
                          }
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="excel-bottom-statusbar">
            <span>Ready • Sheet1: Tong_Hop_KPI_Q3 • Sum: 2,769,550,000</span>
            <span style={{ opacity: 0.9 }}>Ref: {subtleLiveCode}</span>
            <span
              className="excel-resume-hint"
              onClick={() => setOpen(false)}
              title="Bấm vào đây hoặc nhấn phím Esc để quay lại phòng chơi"
            >
              100% ▾ [Esc: Đóng bảng]
            </span>
          </div>
        </div>
      )}

      {open && disguise.bossKeyMode === "pdf" && (
        <div className="stealth-camouflage-fullscreen mode-pdf">
          <div className="pdf-top-toolbar">
            <span>☰ De_cuong_on_tap_Toan_Ly_HK2_Chuan.pdf</span>
            <span>Trang 1 / 4  |  Thu phóng: 100%</span>
            <span
              style={{ cursor: "pointer", opacity: 0.85 }}
              onClick={() => setOpen(false)}
              title="Nhấn phím Esc hoặc click để quay lại lớp"
            >
              [Esc: Thu nhỏ]
            </span>
          </div>

          <div className="pdf-doc-scroll">
            <div className="pdf-a4-sheet">
              <div className="pdf-a4-header">
                <h3>ĐỀ CƯƠNG ÔN TẬP KIỂM TRA HỌC KỲ II — KHỐI THPT</h3>
                <p>Chuyên đề: Giải tích 12, Hình học Oxyz & Dao động cơ học (Thời gian làm bài: 45 phút)</p>
              </div>

              {PDF_QUESTIONS.map((item) => (
                <div key={item.id} className="pdf-question-block">
                  <div className="pdf-question-title">{item.q}</div>
                  <div className="pdf-options-grid">
                    {item.opts.map((opt, idx) => {
                      const picked = pickedAnswers[item.id] === idx;
                      return (
                        <div
                          key={opt}
                          className={`pdf-opt-item ${picked ? "picked" : ""}`}
                          onClick={() =>
                            setPickedAnswers((prev) => ({ ...prev, [item.id]: idx }))
                          }
                        >
                          <span>{picked ? "◉" : "○"}</span>
                          <span>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="pdf-footer-meta">
                <span>Tài liệu lưu hành nội bộ ôn thi HK2 • Đã chọn {Object.keys(pickedAnswers).length}/4 câu</span>
                <span>Mã theo dõi: {subtleLiveCode}</span>
                <span className="pdf-resume-chip" onClick={() => setOpen(false)}>
                  Trang 1/4 (Esc)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

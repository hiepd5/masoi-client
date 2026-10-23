import { Component } from "react";

/**
 * Lưới bảo vệ an toàn cho Sân Khấu 3D (WebGL / GPU Fallback):
 * Nếu trình duyệt tắt Hardware Acceleration hoặc thiết bị không khởi tạo được WebGL,
 * tự động hiển thị khung hạ cánh êm sang chế độ 2D mà không làm văng ván chơi đang diễn ra.
 */
export default class Scene3DErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Không thể khởi tạo WebGL 3D trên trình duyệt này.",
    };
  }

  componentDidCatch(error) {
    console.warn("[Scene3DErrorBoundary] WebGL fallback triggered:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "24px",
            textAlign: "center",
            background: "rgba(10, 15, 30, 0.92)",
            color: "#e2e8f0",
          }}
        >
          <div style={{ fontSize: "32px" }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>
            Trình duyệt chưa bật đồ họa WebGL 3D
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8", maxWidth: "360px" }}>
            {this.state.errorMessage}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => this.props.onFallback2D?.()}
              style={{
                width: "auto",
                margin: 0,
                padding: "8px 16px",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "13px",
                background: "#f59e0b",
                color: "#0f172a",
                border: "none",
                cursor: "pointer",
              }}
            >
              ⚡ Chuyển sang Chế độ 2D để chơi ngay
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: "" })}
              style={{
                width: "auto",
                margin: 0,
                padding: "8px 14px",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "13px",
                background: "rgba(255,255,255,0.1)",
                color: "#f8fafc",
                border: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
              }}
            >
              🔄 Thử tải lại 3D
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

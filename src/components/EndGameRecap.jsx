import { useState, useEffect } from "react";

export default function EndGameRecap({ history, isHost, onRestart, onAnimate }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!history || history.length === 0) return;

    if (currentIndex < history.length) {
      const event = history[currentIndex];
      // Gọi callback để truyền sự kiện ra PlayerCircle hiển thị hoạt ảnh
      onAnimate(event);

      const timer = setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 2500); // Mỗi dòng đọc mất 2.5s
      return () => clearTimeout(timer);
    } else {
      // Khi đọc xong hết, xóa hoạt ảnh trên circle
      onAnimate(null);
    }
  }, [currentIndex, history, onAnimate]);

  if (!history || history.length === 0) return null;

  return (
    <div className="endgame-recap-panel">
      <h3>📜 Thuật Lại Diễn Biến</h3>
      <div className="recap-lines">
        {history.slice(0, currentIndex + 1).map((event, i) => (
          <div key={i} className={`recap-line ${i === currentIndex ? "active" : ""}`}>
            Ngày {event.day}: {event.text}
          </div>
        ))}
      </div>
      
      {currentIndex >= history.length && (
        <div className="restart-section">
          {isHost ? (
            <button className="btn-primary" onClick={onRestart}>Bắt đầu ván mới</button>
          ) : (
            <p className="waiting-text">Đang chờ chủ phòng bắt đầu ván mới...</p>
          )}
        </div>
      )}
    </div>
  );
}

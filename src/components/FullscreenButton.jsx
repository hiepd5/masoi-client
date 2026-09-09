import { useState, useEffect } from 'react';

export default function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    function handleResize() {
      setIsLandscape(window.innerWidth > window.innerHeight);
    }
    document.addEventListener('fullscreenchange', handleChange);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div className="fullscreen-controls">
      {!isLandscape && (
        <div className="rotate-hint">📱 Xoay ngang để chơi tốt hơn ↩️</div>
      )}
      <button 
        className="btn-fullscreen" 
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
      >
        {isFullscreen ? '⛶' : '⛶'}
        <span>{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
      </button>
    </div>
  );
}

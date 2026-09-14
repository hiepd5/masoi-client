export default function VillageBackdrop({ isNight }) {
  return (
    <div
      className={`village-backdrop ${isNight ? 'night' : 'day'}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        transition: 'opacity 1.5s ease',
      }}
    >
      <svg
        viewBox="0 0 800 600"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Quầng sáng nền lửa trại ở trung tâm */}
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="45%">
            <stop offset="0%" stopColor={isNight ? "#ff7700" : "#ffcc00"} stopOpacity={isNight ? "0.22" : "0.14"} />
            <stop offset="50%" stopColor={isNight ? "#ff4400" : "#ff9900"} stopOpacity={isNight ? "0.08" : "0.05"} />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Vầng sáng mặt trăng hoặc mặt trời */}
          <radialGradient id="celestialGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={isNight ? "#cce4ff" : "#fff3b0"} stopOpacity={isNight ? "0.4" : "0.3"} />
            <stop offset="60%" stopColor={isNight ? "#3b82f6" : "#f59e0b"} stopOpacity={isNight ? "0.15" : "0.1"} />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Quầng sáng trung tâm làng quanh đống lửa */}
        <ellipse cx="400" cy="300" rx="360" ry="240" fill="url(#centerGlow)" />

        {/* Mặt trăng đêm hoặc ánh dương ngày */}
        {isNight ? (
          <g transform="translate(660, 70)" opacity="0.45">
            <circle cx="0" cy="0" r="45" fill="url(#celestialGlow)" />
            <path
              d="M-10,-24 A26,26 0 1,0 24,20 A30,30 0 1,1 -10,-24 Z"
              fill="#f1f5f9"
              opacity="0.85"
            />
          </g>
        ) : (
          <g transform="translate(680, 60)" opacity="0.4">
            <circle cx="0" cy="0" r="60" fill="url(#celestialGlow)" />
            <circle cx="0" cy="0" r="24" fill="#fef08a" opacity="0.8" />
          </g>
        )}

        {/* Cụm nhà xa viền góc trái */}
        <g transform="translate(30, 460)" opacity={isNight ? "0.2" : "0.28"}>
          {/* Nhà 1 */}
          <rect x="0" y="30" width="70" height="50" rx="4" fill={isNight ? "#0d1527" : "#5c4033"} />
          <polygon points="-8,30 35,-5 78,30" fill={isNight ? "#090d1a" : "#4a3520"} />
          {isNight && <rect x="25" y="45" width="18" height="14" rx="2" fill="#ffd54f" opacity="0.7" />}
          {/* Nhà 2 */}
          <rect x="80" y="45" width="55" height="35" rx="3" fill={isNight ? "#0d1527" : "#5c4033"} />
          <polygon points="75,45 107,15 140,45" fill={isNight ? "#090d1a" : "#4a3520"} />
          {/* Cây thông */}
          <polygon points="155,20 140,55 170,55" fill={isNight ? "#081c10" : "#2d5a27"} />
          <polygon points="155,40 135,75 175,75" fill={isNight ? "#06150c" : "#22441d"} />
        </g>

        {/* Cụm nhà xa viền góc phải */}
        <g transform="translate(640, 460)" opacity={isNight ? "0.2" : "0.28"}>
          {/* Cây thông */}
          <polygon points="25,20 10,55 40,55" fill={isNight ? "#081c10" : "#2d5a27"} />
          <polygon points="25,40 5,75 45,75" fill={isNight ? "#06150c" : "#22441d"} />
          {/* Nhà */}
          <rect x="55" y="30" width="75" height="50" rx="4" fill={isNight ? "#0d1527" : "#5c4033"} />
          <polygon points="48,30 92,-5 137,30" fill={isNight ? "#090d1a" : "#4a3520"} />
          {isNight && <rect x="80" y="46" width="20" height="14" rx="2" fill="#ffd54f" opacity="0.7" />}
        </g>

        {/* Hàng cây thông xa mờ ảo ở đỉnh */}
        <g opacity={isNight ? "0.12" : "0.18"}>
          {[90, 150, 220, 580, 650, 720].map((x, i) => (
            <polygon
              key={`tree-${i}`}
              points={`${x},10 ${x-14},40 ${x+14},40`}
              fill={isNight ? "#08141e" : "#2d4a3e"}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

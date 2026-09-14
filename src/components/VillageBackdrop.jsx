export default function VillageBackdrop({ isNight }) {
  return (
    <div
      className={`village-backdrop${isNight ? ' night' : ' day'}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: isNight ? 0.10 : 0.16,
        transition: 'opacity 1.5s ease',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice"
      >
        {/* === ĐƯỜNG MÒN từ tâm ra 4 hướng === */}
        <path d="M200 200 L200 30"   stroke={isNight?'#8899aa':'#6b7a5e'} strokeWidth="14" strokeLinecap="round" opacity="0.4"/>
        <path d="M200 200 L200 370" stroke={isNight?'#8899aa':'#6b7a5e'} strokeWidth="14" strokeLinecap="round" opacity="0.4"/>
        <path d="M200 200 L30 200"  stroke={isNight?'#8899aa':'#6b7a5e'} strokeWidth="14" strokeLinecap="round" opacity="0.4"/>
        <path d="M200 200 L370 200" stroke={isNight?'#8899aa':'#6b7a5e'} strokeWidth="14" strokeLinecap="round" opacity="0.4"/>

        {/* === NHÀ GÓC TRÊN TRÁI === */}
        <g transform="translate(52, 48)">
          <rect x="0" y="22" width="52" height="36" rx="3" fill={isNight?'#1a2035':'#8b7355'}/>
          <polygon points="-4,22 26,-2 56,22" fill={isNight?'#0d1525':'#6b4f30'}/>
          <rect x="18" y="38" width="16" height="20" rx="2" fill={isNight?'#3d2800':'#4a3520'}/>
          {isNight && <rect x="4" y="28" width="10" height="8" rx="1" fill="#ffd700" opacity="0.6"/>}
          {isNight && <rect x="38" y="28" width="10" height="8" rx="1" fill="#ffd700" opacity="0.6"/>}
        </g>

        {/* === NHÀ GÓC TRÊN PHẢI === */}
        <g transform="translate(296, 48)">
          <rect x="0" y="22" width="52" height="36" rx="3" fill={isNight?'#1a2035':'#8b7355'}/>
          <polygon points="-4,22 26,-2 56,22" fill={isNight?'#0d1525':'#6b4f30'}/>
          <rect x="18" y="38" width="16" height="20" rx="2" fill={isNight?'#3d2800':'#4a3520'}/>
          {isNight && <rect x="4" y="28" width="10" height="8" rx="1" fill="#ffd700" opacity="0.5"/>}
          {isNight && <rect x="38" y="28" width="10" height="8" rx="1" fill="#ffd700" opacity="0.5"/>}
        </g>

        {/* === NHÀ GÓC DƯỚI TRÁI === */}
        <g transform="translate(52, 310)">
          <rect x="0" y="22" width="52" height="36" rx="3" fill={isNight?'#1a2035':'#7a6645'}/>
          <polygon points="-4,22 26,-2 56,22" fill={isNight?'#0d1525':'#5a3f20'}/>
          <rect x="18" y="38" width="16" height="20" rx="2" fill={isNight?'#3d2800':'#4a3520'}/>
          {isNight && <rect x="4" y="28" width="10" height="8" rx="1" fill="#ffa500" opacity="0.55"/>}
        </g>

        {/* === NHÀ GÓC DƯỚI PHẢI === */}
        <g transform="translate(296, 310)">
          <rect x="0" y="22" width="52" height="36" rx="3" fill={isNight?'#1a2035':'#7a6645'}/>
          <polygon points="-4,22 26,-2 56,22" fill={isNight?'#0d1525':'#5a3f20'}/>
          <rect x="18" y="38" width="16" height="20" rx="2" fill={isNight?'#3d2800':'#4a3520'}/>
          {isNight && <rect x="38" y="28" width="10" height="8" rx="1" fill="#ffa500" opacity="0.55"/>}
        </g>

        {/* === CÂY THÔNG — trái === */}
        {[80, 120, 90].map((y, i) => (
          <g key={`tl${i}`} transform={`translate(${18 + i*2}, ${y})`}>
            <polygon points="8,0 0,20 16,20" fill={isNight?'#0d2010':'#2d5a1e'}/>
            <polygon points="10,8 0,26 20,26" fill={isNight?'#0a1a0c':'#245518'}/>
            <rect x="6" y="26" width="4" height="6" fill={isNight?'#3d2500':'#6b4513'}/>
          </g>
        ))}

        {/* === CÂY THÔNG — phải === */}
        {[80, 115, 95].map((y, i) => (
          <g key={`tr${i}`} transform={`translate(${358 - i*3}, ${y})`}>
            <polygon points="8,0 0,20 16,20" fill={isNight?'#0d2010':'#2d5a1e'}/>
            <polygon points="10,8 0,26 20,26" fill={isNight?'#0a1a0c':'#245518'}/>
            <rect x="6" y="26" width="4" height="6" fill={isNight?'#3d2500':'#6b4513'}/>
          </g>
        ))}

        {/* === GIẾNG NƯỚC — góc trên phải === */}
        <g transform="translate(360, 155)">
          <rect x="0" y="12" width="24" height="18" rx="2" fill={isNight?'#1a1a2a':'#8b7355'}/>
          <path d="M-3,12 L27,12" stroke={isNight?'#334':'#6b4f30'} strokeWidth="3"/>
          <rect x="10" y="0" width="4" height="14" fill={isNight?'#334':'#6b4f30'}/>
          <ellipse cx="12" cy="30" rx="10" ry="4" fill={isNight?'#0a1520':'rgba(100,160,255,0.3)'}/>
        </g>

        {/* === BỤI CỎ — phía dưới === */}
        {[150,200,250,170,230].map((x, i) => (
          <ellipse key={`g${i}`} cx={x} cy={385} rx={12} ry={5}
            fill={isNight?'#0d1a0d':'#2d4a1e'} opacity="0.5"/>
        ))}
      </svg>
    </div>
  );
}

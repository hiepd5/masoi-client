import { useEffect, useState } from 'react';

const BEAM_CONFIGS = {
  wolf:         { color: '#ef4444', width: 3, style: 'lightning', shake: true },
  guard:        { color: '#3b82f6', width: 2, style: 'curve',     particles: true },
  witch_save:   { color: '#22c55e', width: 2, style: 'orb',       orb: true },
  witch_poison: { color: '#a855f7', width: 2, style: 'lightning', zigzag: true },
};

/**
 * ActionBeam – renders an SVG beam from sourceEl to targetEl.
 *
 * Props:
 *   event        – { type, sourceId, targetId }  (recapAnimation object)
 *   getPlayerEl  – (playerId: string) => DOMElement | null
 *   containerRef – React ref pointing to the .player-circle-scene div
 */
export default function ActionBeam({ event, getPlayerEl, containerRef }) {
  const [beam, setBeam] = useState(null);

  useEffect(() => {
    if (!event || !containerRef?.current) { setBeam(null); return; }

    const cfg = BEAM_CONFIGS[event.type];
    if (!cfg || !event.sourceId || !event.targetId) { setBeam(null); return; }

    const containerRect = containerRef.current.getBoundingClientRect();
    const srcEl = getPlayerEl(event.sourceId);
    const tgtEl = getPlayerEl(event.targetId);
    if (!srcEl || !tgtEl) { setBeam(null); return; }

    const srcRect = srcEl.getBoundingClientRect();
    const tgtRect = tgtEl.getBoundingClientRect();

    const x1 = srcRect.left + srcRect.width  / 2 - containerRect.left;
    const y1 = srcRect.top  + srcRect.height / 2 - containerRect.top;
    const x2 = tgtRect.left + tgtRect.width  / 2 - containerRect.left;
    const y2 = tgtRect.top  + tgtRect.height / 2 - containerRect.top;

    setBeam({ x1, y1, x2, y2, cfg, type: event.type });

    return () => setBeam(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.sourceId, event?.targetId, event?.type]);

  if (!beam) return null;

  const { x1, y1, x2, y2, cfg, type } = beam;

  // Quadratic bezier control point (arc upward)
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 60;

  const useCurve = cfg.style === 'curve' || cfg.style === 'orb';
  const pathD = useCurve
    ? `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
    : `M${x1},${y1} L${x2},${y2}`;

  const gradId   = `beam-grad-${type}`;
  const motionId = `beam-motion-${type}`;

  // Pre-calculate sparkle positions along the bezier curve
  const sparkles = type === 'guard'
    ? [0.2, 0.4, 0.6, 0.8].map((t, i) => {
        const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
        const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
        return { bx, by, i };
      })
    : [];

  const hasOrb = type === 'guard' || type === 'witch_save' || type === 'witch_poison';
  const orbRadius = type === 'witch_save' ? 8 : 5;

  return (
    <svg
      className="action-beam-svg"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 30,
        width: '100%',
        height: '100%',
      }}
    >
      <defs>
        {/* Glow filter */}
        <filter id="beam-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradient along the beam direction */}
        <linearGradient id={gradId} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={cfg.color} stopOpacity="0.2" />
          <stop offset="50%"  stopColor={cfg.color} stopOpacity="1"   />
          <stop offset="100%" stopColor={cfg.color} stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {/* Soft glow halo behind the beam */}
      <path
        d={pathD}
        stroke={cfg.color}
        strokeWidth={cfg.width + 6}
        fill="none"
        opacity="0.22"
        filter="url(#beam-glow)"
      />

      {/* Main animated beam */}
      <path
        d={pathD}
        stroke={`url(#${gradId})`}
        strokeWidth={cfg.width}
        fill="none"
        strokeLinecap="round"
        className={`beam-path beam-${type}`}
      />

      {/* Wolf: pulsing impact circle at target */}
      {type === 'wolf' && (
        <circle
          cx={x2} cy={y2} r={10}
          fill={cfg.color}
          opacity="0.7"
          className="beam-impact-pulse"
        />
      )}

      {/* Orb that travels along the path (guard / witch_save / witch_poison) */}
      {hasOrb && (
        <>
          {/* Hidden path for animateMotion */}
          <path id={motionId} d={pathD} fill="none" stroke="none" />
          <circle r={orbRadius} fill={cfg.color} className="beam-orb">
            <animateMotion dur="0.8s" repeatCount="1" fill="freeze">
              <mpath href={`#${motionId}`} />
            </animateMotion>
          </circle>
        </>
      )}

      {/* Guard: sparkle particles along the curve */}
      {sparkles.map(({ bx, by, i }) => (
        <circle
          key={i}
          cx={bx} cy={by} r={3}
          fill={cfg.color}
          className="beam-sparkle"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </svg>
  );
}

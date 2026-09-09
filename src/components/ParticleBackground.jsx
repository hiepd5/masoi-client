import { useEffect, useRef } from 'react';

export default function ParticleBackground({ isNight }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    function resize() {
      canvas.width = canvas.offsetWidth || 400;
      canvas.height = canvas.offsetHeight || 400;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const count = isNight ? 80 : 35;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * (canvas.width || 400),
      y: Math.random() * (canvas.height || 400),
      size: Math.random() * (isNight ? 2 : 3.5) + 0.5,
      vx: (Math.random() - 0.5) * 0.2,
      vy: Math.random() * (isNight ? -0.08 : -0.5) - 0.05,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.025 + 0.01,
      hue: isNight ? 210 + Math.random() * 60 : 35 + Math.random() * 25,
    }));

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.phase += p.speed;
        if (p.y < -5) p.y = canvas.height + 5;
        if (p.x < -5) p.x = canvas.width + 5;
        if (p.x > canvas.width + 5) p.x = -5;
        
        const alpha = (0.5 + 0.5 * Math.sin(p.phase)) * (isNight ? 0.85 : 0.55);
        
        if (isNight) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
          g.addColorStop(0, `hsla(${p.hue},80%,90%,${alpha})`);
          g.addColorStop(1, `hsla(${p.hue},80%,90%,0)`);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI*2);
          ctx.fillStyle = g; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
          ctx.fillStyle = `hsla(${p.hue},90%,75%,${alpha})`; ctx.fill();
        }
      });
    }
    draw();
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, [isNight]);

  return <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0 }} />;
}

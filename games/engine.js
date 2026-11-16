/* Общие помощники для рисования и регистрации игр */
(function () {
  'use strict';

  const G = {
    W: 800,
    H: 500,
    games: [],
    register(def) { this.games.push(def); },

    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(G.rand(a, b + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },

    COLORS: ['#E3000B', '#FFD700', '#006CB7', '#00A650', '#FF6B00', '#7B2D8B', '#E91E8C'],

    // Осветлить (amt > 0) или затемнить (amt < 0) цвет #RRGGBB
    shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const f = amt < 0 ? 0 : 255, t = Math.abs(amt);
      r = Math.round(r + (f - r) * t); g = Math.round(g + (f - g) * t); b = Math.round(b + (f - b) * t);
      return `rgb(${r},${g},${b})`;
    },

    rr(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    // Кубик LEGO с шипами сверху (x, y — левый верхний угол корпуса)
    brick(ctx, x, y, w, h, color, studs = true) {
      if (studs) {
        const n = Math.max(1, Math.round(w / 28));
        const step = w / n;
        for (let i = 0; i < n; i++) {
          const cx = x + step * (i + 0.5);
          ctx.fillStyle = G.shade(color, -0.25);
          G.rr(ctx, cx - 8, y - 6, 16, 8, 3); ctx.fill();
          ctx.fillStyle = G.shade(color, 0.15);
          G.rr(ctx, cx - 8, y - 7, 16, 5, 3); ctx.fill();
        }
      }
      ctx.fillStyle = G.shade(color, -0.3);
      G.rr(ctx, x, y, w, h, 5); ctx.fill();
      ctx.fillStyle = color;
      G.rr(ctx, x, y, w, h - 5, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      G.rr(ctx, x + 4, y + 3, w - 8, 4, 2); ctx.fill();
    },

    text(ctx, str, x, y, o = {}) {
      ctx.font = `${o.weight || 800} ${o.size || 20}px ${o.font || "'Nunito', sans-serif"}`;
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'middle';
      if (o.stroke) {
        ctx.lineWidth = o.strokeWidth || 5;
        ctx.strokeStyle = o.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = o.color || '#fff';
      ctx.fillText(str, x, y);
    },

    // Табличка счёта в углу экрана
    pill(ctx, x, y, label, o = {}) {
      ctx.font = `900 18px 'Nunito', sans-serif`;
      const w = ctx.measureText(label).width + 28;
      const px = o.align === 'right' ? x - w : (o.align === 'center' ? x - w / 2 : x);
      ctx.fillStyle = o.bg || 'rgba(14,30,56,0.75)';
      G.rr(ctx, px, y, w, 34, 17); ctx.fill();
      G.text(ctx, label, px + w / 2, y + 17.5, { size: 18, weight: 900, align: 'center', color: o.color || '#fff' });
      return w;
    },

    formatTime(sec) {
      const m = Math.floor(sec / 60), s = sec - m * 60;
      return m > 0 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)} с`;
    },
  };

  window.G = G;
})();

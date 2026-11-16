/* 🎯 Воздушный тир: наведи прицел на шарик и подержи — выстрел! */
(function () {
  'use strict';
  const { W, H } = G;
  const ROUND = 60;          // секунд в раунде
  const LOCK = 0.55;         // сколько держать прицел на цели до выстрела

  function Shooting() {
    this.cx = W / 2; this.cy = H / 2; this.vx = 0; this.vy = 0;
    this.t = 0; this.left = ROUND; this.score = 0; this.hits = 0; this.combo = 0;
    this.targets = []; this.spawnT = 0; this.pops = []; this.lock = 0; this.lockTarget = null;
    this.clouds = Array.from({ length: 6 }, () => ({ x: G.rand(0, W), y: G.rand(30, 300), s: G.rand(0.6, 1.3), v: G.rand(8, 20) }));
  }

  Shooting.prototype.spawn = function () {
    const r = Math.random();
    if (r < 0.62) {
      this.targets.push({ kind: 'balloon', x: G.rand(60, W - 60), y: H + 40, vx: G.rand(-20, 20), vy: -G.rand(60, 110) - this.t * 1.2, r: 26, color: G.pick(G.COLORS), pts: 10, ph: Math.random() * 6 });
    } else if (r < 0.82) {
      const fromLeft = Math.random() < 0.5;
      this.targets.push({ kind: 'plate', x: fromLeft ? -30 : W + 30, y: G.rand(80, 300), vx: (fromLeft ? 1 : -1) * G.rand(140, 210), vy: -G.rand(40, 90), r: 22, pts: 25, ph: 0 });
    } else {
      this.targets.push({ kind: 'bomb', x: G.rand(60, W - 60), y: H + 40, vx: G.rand(-15, 15), vy: -G.rand(55, 90), r: 26, pts: -30, ph: Math.random() * 6 });
    }
  };

  Shooting.prototype.update = function (dt, joy) {
    this.t += dt; this.left -= dt;

    // прицел плавно разгоняется — удобно и со стрелками, и с наклоном
    this.vx = G.lerp(this.vx, joy.x * 420, Math.min(1, dt * 8));
    this.vy = G.lerp(this.vy, joy.y * 420, Math.min(1, dt * 8));
    this.cx = G.clamp(this.cx + this.vx * dt, 20, W - 20);
    this.cy = G.clamp(this.cy + this.vy * dt, 20, H - 20);

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawn(); this.spawnT = Math.max(0.45, 1.1 - this.t * 0.01); }

    for (const tg of this.targets) {
      tg.ph += dt;
      tg.x += (tg.vx + (tg.kind !== 'plate' ? Math.sin(tg.ph * 2) * 20 : 0)) * dt;
      if (tg.kind === 'plate') tg.vy += 60 * dt;
      tg.y += tg.vy * dt;
    }
    this.targets = this.targets.filter(tg => tg.y > -60 && tg.y < H + 80 && tg.x > -60 && tg.x < W + 60);
    this.clouds.forEach(c => { c.x += c.v * dt; if (c.x > W + 80) c.x = -80; });

    // какая цель под прицелом
    let under = null;
    for (const tg of this.targets) {
      if (Math.hypot(tg.x - this.cx, tg.y - this.cy) < tg.r + 6) { under = tg; break; }
    }
    if (under && under === this.lockTarget) this.lock += dt;
    else { this.lockTarget = under; this.lock = 0; }

    if (under && this.lock >= LOCK) {
      this.targets.splice(this.targets.indexOf(under), 1);
      let pts = under.pts;
      if (pts > 0) { this.combo++; this.hits++; pts += Math.min(5, this.combo - 1) * 2; }
      else this.combo = 0;
      this.score = Math.max(0, this.score + pts);
      this.pops.push({ x: under.x, y: under.y, t: 0, pts, color: under.color || (under.kind === 'bomb' ? '#111827' : '#FF6B00') });
      this.lock = 0; this.lockTarget = null;
      Joy.setLed(pts > 0 ? 6 : 9);
      this.ledT = 0.25;
    }
    if (this.ledT > 0) { this.ledT -= dt; if (this.ledT <= 0) Joy.setLed(4); }

    this.pops.forEach(p => { p.t += dt; });
    this.pops = this.pops.filter(p => p.t < 0.8);

    if (this.left <= 0) {
      this.left = 0;
      this.result = {
        title: '⏰ Время вышло!', win: true, score: this.score,
        lines: [`Попаданий: ${this.hits}`, { text: `Очки: ${this.score}`, color: '#FFD700', size: 30 }],
      };
    }
  };

  Shooting.prototype.draw = function (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#38BDF8'); sky.addColorStop(1, '#BAE6FD');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    this.clouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 26 * c.s, 0, Math.PI * 2); ctx.arc(c.x + 30 * c.s, c.y - 10 * c.s, 32 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 62 * c.s, c.y, 24 * c.s, 0, Math.PI * 2); ctx.fill();
    });
    // холмы
    ctx.fillStyle = '#4ADE80';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - 50 - Math.sin(x / 90) * 18);
    ctx.lineTo(W, H); ctx.fill();

    for (const tg of this.targets) {
      if (tg.kind === 'plate') {
        ctx.fillStyle = '#C2410C';
        ctx.beginPath(); ctx.ellipse(tg.x, tg.y + 3, tg.r, tg.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FF6B00';
        ctx.beginPath(); ctx.ellipse(tg.x, tg.y, tg.r, tg.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FDBA74';
        ctx.beginPath(); ctx.ellipse(tg.x, tg.y - 1, tg.r * 0.45, tg.r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      // ниточка
      ctx.strokeStyle = 'rgba(30,41,59,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tg.x, tg.y + tg.r + 4);
      ctx.quadraticCurveTo(tg.x + 8, tg.y + tg.r + 22, tg.x, tg.y + tg.r + 40); ctx.stroke();
      const col = tg.kind === 'bomb' ? '#1F2937' : tg.color;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(tg.x, tg.y, tg.r * 0.88, tg.r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tg.x - 5, tg.y + tg.r + 5); ctx.lineTo(tg.x + 5, tg.y + tg.r + 5); ctx.lineTo(tg.x, tg.y + tg.r - 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(tg.x - 8, tg.y - 9, 6, 9, -0.5, 0, Math.PI * 2); ctx.fill();
      if (tg.kind === 'bomb') G.text(ctx, '💀', tg.x, tg.y + 2, { size: 22, align: 'center' });
    }

    // вспышки попаданий
    for (const p of this.pops) {
      const k = p.t / 0.8;
      ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.globalAlpha = 1 - k;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, r1 = 10 + k * 30, r2 = 18 + k * 44;
        ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); ctx.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2); ctx.stroke();
      }
      G.text(ctx, (p.pts > 0 ? '+' : '') + p.pts, p.x, p.y - 20 - k * 40, { size: 26, align: 'center', color: p.pts > 0 ? '#FFD700' : '#EF4444', stroke: '#0E1E38' });
      ctx.globalAlpha = 1;
    }

    // прицел
    const c = this.lockTarget ? '#E3000B' : '#0E1E38';
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.cx - 32, this.cy); ctx.lineTo(this.cx - 10, this.cy);
    ctx.moveTo(this.cx + 10, this.cy); ctx.lineTo(this.cx + 32, this.cy);
    ctx.moveTo(this.cx, this.cy - 32); ctx.lineTo(this.cx, this.cy - 10);
    ctx.moveTo(this.cx, this.cy + 10); ctx.lineTo(this.cx, this.cy + 32);
    ctx.stroke();
    if (this.lockTarget) {
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.lock / LOCK)); ctx.stroke();
    }

    G.pill(ctx, 16, 14, `🎯 ${this.score}`);
    if (this.combo > 1) G.pill(ctx, 16, 56, `🔥 серия ×${this.combo}`, { bg: 'rgba(255,107,0,0.9)' });
    G.pill(ctx, W - 16, 14, `⏱ ${Math.ceil(this.left)} с`, { align: 'right', bg: this.left < 10 ? 'rgba(227,0,11,0.9)' : undefined });
  };

  G.register({
    id: 'shooting',
    emoji: '🎯',
    title: 'Воздушный тир',
    color: 'linear-gradient(135deg, #006CB7, #38BDF8)',
    short: 'Наводи прицел на воздушные шарики и летающие тарелочки. Подержи прицел на цели — и выстрел! Чёрные шарики не трогай.',
    goal: 'Набери как можно больше очков за 60 секунд',
    howto: [
      'Наклоняй джойстик — прицел летит в ту же сторону.',
      'Задержи прицел на цели — заполнится жёлтое кольцо и будет выстрел.',
      'Шарик = 10, тарелочка = 25 очков. Серия попаданий даёт бонус.',
      'Чёрный шарик 💀 = −30 очков. Уводи прицел!',
    ],
    led: 4,
    formatScore: v => `${v} очков`,
    create: () => new Shooting(),
  });
})();

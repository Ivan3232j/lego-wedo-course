/* 🚁 Вертолёт: высота зависит от того, как близко рука к дальномеру */
(function () {
  'use strict';
  const { W, H } = G;
  const TOP = 70, BOTTOM = 440, GROUND = 470;
  const HX = 190, COL_W = 70;

  function Heli() {
    this.y = (TOP + BOTTOM) / 2; this.vy = 0; this.t = 0;
    this.cols = []; this.stars = []; this.passed = 0; this.starCount = 0;
    this.nextX = W + 60; this.scroll = 0; this.rotor = 0;
  }

  Heli.prototype.speed = function () { return Math.min(300, 150 + this.t * 3); };

  Heli.prototype.addCol = function (x) {
    const gapH = Math.max(150, 210 - this.passed * 3);
    const gapY = G.rand(TOP + gapH / 2 + 10, BOTTOM - gapH / 2 + 10);
    this.cols.push({ x, gapY, gapH, color: G.pick(G.COLORS), passed: false });
    if (Math.random() < 0.6) this.stars.push({ x: x + COL_W / 2, y: gapY, got: false });
  };

  Heli.prototype.update = function (dt, joy) {
    this.t += dt;
    this.rotor += dt * 30;
    const sp = this.speed();
    this.scroll += sp * dt;

    // рука близко — вертолёт наверху, далеко — внизу
    const ty = G.lerp(TOP, BOTTOM, joy.dist);
    const oldY = this.y;
    this.y += (ty - this.y) * Math.min(1, dt * 5);
    this.vy = (this.y - oldY) / dt;

    this.nextX -= sp * dt;
    if (this.nextX < W + 60) { this.addCol(this.nextX + 80); this.nextX += 270; }
    this.cols.forEach(c => { c.x -= sp * dt; });
    this.stars.forEach(s => { s.x -= sp * dt; });
    this.cols = this.cols.filter(c => c.x > -COL_W - 10);
    this.stars = this.stars.filter(s => s.x > -30 && !s.got);

    const hb = { x1: HX - 34, x2: HX + 30, y1: this.y - 14, y2: this.y + 16 };
    for (const c of this.cols) {
      if (!c.passed && c.x + COL_W < hb.x1) { c.passed = true; this.passed++; }
      const overlapX = hb.x2 > c.x + 4 && hb.x1 < c.x + COL_W - 4;
      if (overlapX && (hb.y1 < c.gapY - c.gapH / 2 || hb.y2 > c.gapY + c.gapH / 2)) {
        const score = this.passed + this.starCount * 2;
        this.result = {
          title: '💥 Вертолёт задел башню!', win: false, score,
          lines: [`Пролетел башен: ${this.passed}`, `Звёзд: ${this.starCount}`, { text: `Очки: ${score}`, color: '#FFD700', size: 28 }],
        };
        return;
      }
    }
    for (const s of this.stars) {
      if (Math.abs(s.x - HX) < 34 && Math.abs(s.y - this.y) < 30) { s.got = true; this.starCount++; Joy.setLed(7); this.ledT = 0.3; }
    }
    if (this.ledT > 0) { this.ledT -= dt; if (this.ledT <= 0) Joy.setLed(3); }
  };

  function drawTower(ctx, c) {
    const rowH = 34;
    const topEnd = c.gapY - c.gapH / 2, botStart = c.gapY + c.gapH / 2;
    // верхняя часть: свисает сверху
    for (let y = topEnd - rowH; y > -rowH; y -= rowH) G.brick(ctx, c.x, y, COL_W, rowH, c.color, false);
    // нижняя часть: стоит на земле
    for (let y = botStart; y < GROUND; y += rowH) G.brick(ctx, c.x, y, COL_W, rowH, c.color, y === botStart);
  }

  Heli.prototype.draw = function (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#60A5FA'); sky.addColorStop(1, '#DBEAFE');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // дальние холмы
    ctx.fillStyle = '#A7F3D0';
    ctx.beginPath(); ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 60 - Math.sin((x + this.scroll * 0.3) / 120) * 30);
    ctx.lineTo(W, GROUND); ctx.fill();

    this.cols.forEach(c => drawTower(ctx, c));
    this.stars.forEach(s => G.text(ctx, '⭐', s.x, s.y, { size: 30, align: 'center' }));

    ctx.fillStyle = '#16A34A'; ctx.fillRect(0, GROUND, W, H - GROUND);

    // вертолёт
    ctx.save();
    ctx.translate(HX, this.y);
    ctx.rotate(G.clamp(this.vy / 900, -0.3, 0.3));
    ctx.fillStyle = '#374151';
    ctx.fillRect(-60, -4, 34, 6);                                   // хвост
    ctx.fillRect(-64, -14, 6, 18);
    ctx.fillStyle = '#E3000B';
    ctx.beginPath(); ctx.ellipse(0, 0, 32, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#BAE6FD';
    ctx.beginPath(); ctx.ellipse(12, -3, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, 20); ctx.lineTo(22, 20); ctx.moveTo(-10, 16); ctx.lineTo(-10, 20); ctx.moveTo(14, 16); ctx.lineTo(14, 20); ctx.stroke();
    ctx.fillRect(-2, -24, 4, 8);
    const rw = 44 * Math.abs(Math.cos(this.rotor));
    ctx.fillRect(-rw, -26, rw * 2, 4);
    ctx.restore();

    G.distGauge(ctx, 14, TOP, 26, BOTTOM - TOP, Joy.dist, true);
    G.pill(ctx, 56, 14, `🏰 ${this.passed}`);
    G.pill(ctx, W - 16, 14, `⭐ ${this.starCount}`, { align: 'right' });
  };

  G.register({
    id: 'heli',
    sensor: 'distance',
    emoji: '🚁',
    title: 'Вертолёт',
    color: 'linear-gradient(135deg, #0EA5E9, #6366F1)',
    short: 'Поднеси ладонь к дальномеру — вертолёт взлетает, убери — снижается. Пролети между башнями из кубиков!',
    goal: 'Пролети между как можно большим числом башен',
    howto: [
      'Рука близко к датчику — вертолёт наверху.',
      'Рука далеко — вертолёт внизу.',
      'Двигай руку плавно: вертолёт следует за ней.',
      'Звезда ⭐ = 2 очка, башня = 1 очко.',
      'Без датчика: стрелки ↑ ↓.',
    ],
    led: 3,
    formatScore: v => `${v} очков`,
    create: () => new Heli(),
  });
})();

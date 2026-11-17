/* 🧺 Ловец кубиков: тележка ездит влево-вправо от расстояния до руки */
(function () {
  'use strict';
  const { W, H } = G;
  const FLOOR = 440, LEFT = 80, RIGHT = W - 80;
  const BW = 54, BH = 26;

  function Catch() {
    this.x = W / 2; this.t = 0; this.score = 0; this.lives = 5;
    this.items = []; this.spawnT = 0.5; this.pops = []; this.shake = 0;
  }

  Catch.prototype.spawn = function () {
    const r = Math.random();
    const kind = r < 0.12 ? 'star' : r < 0.12 + Math.min(0.28, 0.1 + this.t * 0.004) ? 'bomb' : 'brick';
    this.items.push({
      kind, x: G.rand(LEFT, RIGHT), y: -30,
      vy: G.rand(110, 160) + this.t * 2.2, color: G.pick(G.COLORS), rot: G.rand(-0.3, 0.3),
    });
  };

  Catch.prototype.update = function (dt, joy) {
    this.t += dt;
    if (this.shake > 0) this.shake -= dt;

    // рука близко — тележка слева, далеко — справа
    const tx = G.lerp(LEFT, RIGHT, joy.dist);
    this.x += (tx - this.x) * Math.min(1, dt * 7);

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawn(); this.spawnT = Math.max(0.45, 1.25 - this.t * 0.012); }

    for (const it of this.items) {
      it.y += it.vy * dt;
      if (it.done) continue;
      // поймал: предмет на уровне корзины и над ней
      if (it.y > FLOOR - 40 && it.y < FLOOR - 4 && Math.abs(it.x - this.x) < 62) {
        it.done = true;
        if (it.kind === 'bomb') { this.lives--; this.shake = 0.4; Joy.setLed(9); this.pops.push({ x: it.x, y: it.y, t: 0, txt: '💥', c: '#EF4444' }); }
        else {
          const pts = it.kind === 'star' ? 5 : 1;
          this.score += pts; Joy.setLed(6);
          this.pops.push({ x: it.x, y: it.y, t: 0, txt: '+' + pts, c: '#FFD700' });
        }
        this.ledT = 0.3;
      } else if (it.y > FLOOR + 20) {
        it.done = true;
        if (it.kind === 'brick') { this.lives--; this.pops.push({ x: it.x, y: FLOOR, t: 0, txt: 'мимо', c: '#F87171' }); }
      }
    }
    this.items = this.items.filter(it => !it.done);
    this.pops.forEach(p => { p.t += dt; });
    this.pops = this.pops.filter(p => p.t < 0.8);
    if (this.ledT > 0) { this.ledT -= dt; if (this.ledT <= 0) Joy.setLed(8); }

    if (this.lives <= 0) {
      this.result = {
        title: '🧺 Игра окончена!', win: false, score: this.score,
        lines: [`Время в игре: ${G.formatTime(this.t)}`, { text: `Поймано очков: ${this.score}`, color: '#FFD700', size: 28 }],
      };
    }
  };

  Catch.prototype.draw = function (ctx) {
    ctx.save();
    if (this.shake > 0) ctx.translate(G.rand(-5, 5), G.rand(-5, 5));
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#FDE68A'); bg.addColorStop(1, '#FED7AA');
    ctx.fillStyle = bg; ctx.fillRect(-10, -10, W + 20, H + 20);
    // стена из кубиков на фоне
    ctx.globalAlpha = 0.1;
    for (let y = 0; y < FLOOR; y += 40) for (let x = (y / 40) % 2 ? -40 : 0; x < W; x += 80) G.brick(ctx, x + 2, y + 6, 76, 34, '#FF6B00', false);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#92400E'; ctx.fillRect(-10, FLOOR + 20, W + 20, H);

    for (const it of this.items) {
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
      if (it.kind === 'brick') G.brick(ctx, -BW / 2, -BH / 2, BW, BH, it.color);
      else if (it.kind === 'star') G.text(ctx, '⭐', 0, 0, { size: 36, align: 'center' });
      else G.text(ctx, '💣', 0, 0, { size: 36, align: 'center' });
      ctx.restore();
    }

    // тележка
    const x = this.x;
    ctx.fillStyle = '#1F2937';
    [x - 38, x + 38].forEach(wx => { ctx.beginPath(); ctx.arc(wx, FLOOR + 10, 12, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#006CB7';
    ctx.beginPath(); ctx.moveTo(x - 64, FLOOR - 36); ctx.lineTo(x + 64, FLOOR - 36); ctx.lineTo(x + 52, FLOOR + 4); ctx.lineTo(x - 52, FLOOR + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0284C7'; ctx.fillRect(x - 64, FLOOR - 40, 128, 8);

    for (const p of this.pops) {
      ctx.globalAlpha = 1 - p.t / 0.8;
      G.text(ctx, p.txt, p.x, p.y - 30 - p.t * 50, { size: 26, align: 'center', color: p.c, stroke: '#0E1E38' });
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    G.distGauge(ctx, W / 2 - 160, H - 30, 320, 24, Joy.dist, false);
    G.pill(ctx, 16, 14, '❤️'.repeat(Math.max(0, this.lives)) + '🤍'.repeat(Math.max(0, 5 - this.lives)));
    G.pill(ctx, W - 16, 14, `🧱 ${this.score}`, { align: 'right' });
  };

  G.register({
    id: 'catch',
    sensor: 'distance',
    emoji: '🧺',
    title: 'Ловец кубиков',
    color: 'linear-gradient(135deg, #FF6B00, #FFD700)',
    short: 'Двигай тележку рукой над дальномером и лови падающие кубики. Бомбы не лови!',
    goal: 'Поймай как можно больше кубиков',
    howto: [
      'Рука близко к датчику — тележка едет влево.',
      'Рука далеко — тележка едет вправо.',
      'Кубик = 1 очко, звезда ⭐ = 5 очков.',
      'Упустил кубик или поймал бомбу 💣 — минус жизнь.',
      'Без датчика: стрелки ↑ ↓.',
    ],
    led: 8,
    formatScore: v => `${v} очков`,
    create: () => new Catch(),
  });
})();

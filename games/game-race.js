/* 🏎️ Гонка: объезжай машины и конусы, собирай монеты */
(function () {
  'use strict';
  const { W, H } = G;
  const ROAD_L = 220, ROAD_R = 580, LANE = (ROAD_R - ROAD_L) / 3;
  const CAR_Y = 390;

  function drawCar(ctx, x, y, color, angle, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    if (flip) ctx.rotate(Math.PI);
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    G.rr(ctx, -21, -36, 46, 78, 12); ctx.fill();
    // колёса
    ctx.fillStyle = '#1F2937';
    [[-26, -28], [16, -28], [-26, 14], [16, 14]].forEach(([wx, wy]) => { G.rr(ctx, wx, wy, 10, 18, 3); ctx.fill(); });
    // корпус
    ctx.fillStyle = G.shade(color, -0.25);
    G.rr(ctx, -22, -40, 44, 80, 12); ctx.fill();
    ctx.fillStyle = color;
    G.rr(ctx, -22, -40, 44, 74, 12); ctx.fill();
    // стёкла
    ctx.fillStyle = '#93C5FD';
    G.rr(ctx, -16, -24, 32, 14, 4); ctx.fill();
    ctx.fillStyle = '#60A5FA';
    G.rr(ctx, -15, 12, 30, 10, 4); ctx.fill();
    // крыша
    ctx.fillStyle = G.shade(color, 0.2);
    G.rr(ctx, -15, -8, 30, 18, 5); ctx.fill();
    // фары
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-18, -40, 9, 4); ctx.fillRect(9, -40, 9, 4);
    ctx.restore();
  }

  function drawCone(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 16, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FF6B00';
    ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 14, y + 14); ctx.lineTo(x - 14, y + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 8, y - 2, 16, 5);
    ctx.fillStyle = '#C2410C';
    G.rr(ctx, -18 + x, y + 12, 36, 7, 3); ctx.fill();
  }

  function drawCoin(ctx, x, y, t) {
    const sx = Math.abs(Math.cos(t * 4));
    ctx.fillStyle = '#B45309';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 14 * sx + 2, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.ellipse(x, y, 14 * sx + 2, 14, 0, 0, Math.PI * 2); ctx.fill();
    if (sx > 0.4) G.text(ctx, '★', x, y + 1, { size: 16, align: 'center', color: '#B45309' });
  }

  function Race() {
    this.x = W / 2; this.speed = 0; this.dist = 0; this.lives = 3; this.coins = 0;
    this.invuln = 0; this.objs = []; this.nextSpawn = 300; this.t = 0; this.scroll = 0;
    this.trees = [];
    for (let i = 0; i < 10; i++) this.trees.push(this.newTree(G.rand(0, H)));
  }

  Race.prototype.newTree = function (y) {
    const left = Math.random() < 0.5;
    return { x: left ? G.rand(20, ROAD_L - 50) : G.rand(ROAD_R + 50, W - 20), y, r: G.rand(18, 30), kind: Math.random() < 0.3 ? 'bush' : 'tree' };
  };

  Race.prototype.spawn = function () {
    const level = Math.min(8, Math.floor(this.dist / 3000));
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const count = Math.random() < 0.25 + level * 0.06 ? 2 : 1; // одна полоса всегда свободна
    for (let i = 0; i < count; i++) {
      const cx = ROAD_L + LANE * (lanes[i] + 0.5);
      if (Math.random() < 0.65) {
        this.objs.push({ type: 'car', x: cx, y: -60, own: G.rand(90, 170), color: G.pick(G.COLORS), w: 40, h: 72 });
      } else {
        this.objs.push({ type: 'cone', x: cx + G.rand(-20, 20), y: -40, own: 0, w: 26, h: 30 });
      }
    }
    if (Math.random() < 0.6) {
      const cx = ROAD_L + LANE * (lanes[2] + 0.5);
      for (let k = 0; k < 3; k++) this.objs.push({ type: 'coin', x: cx, y: -60 - k * 50, own: 0, w: 26, h: 26 });
    }
    this.nextSpawn = this.dist + G.rand(320, 480) - level * 25;
  };

  Race.prototype.update = function (dt, joy) {
    this.t += dt;
    const level = Math.min(8, Math.floor(this.dist / 3000));
    const base = 260 + level * 25;
    let target = joy.y < 0 ? base + 240 * -joy.y : base * (1 - 0.65 * joy.y);

    this.x = G.clamp(this.x + joy.x * 300 * dt, 160, W - 160);
    this.steer = joy.x;
    const offRoad = this.x - 20 < ROAD_L || this.x + 20 > ROAD_R;
    if (offRoad) target = Math.min(target, 150);
    this.offRoad = offRoad;

    this.speed = G.lerp(this.speed, target, Math.min(1, dt * 2.2));
    this.dist += this.speed * dt;
    this.scroll = (this.scroll + this.speed * dt) % 80;
    if (this.invuln > 0) this.invuln -= dt;
    Joy.setLed(this.invuln > 0 ? 9 : 3);

    this.trees.forEach(tr => { tr.y += this.speed * dt; });
    this.trees = this.trees.filter(tr => tr.y < H + 40);
    while (this.trees.length < 10) this.trees.push(this.newTree(G.rand(-200, -30)));

    if (this.dist >= this.nextSpawn) this.spawn();

    const me = { x: this.x - 18, y: CAR_Y - 36, w: 36, h: 72 };
    for (const o of this.objs) {
      o.y += (this.speed - o.own) * dt;
      if (o.dead) continue;
      const hit = Math.abs(o.x - this.x) < (o.w + me.w) / 2 && Math.abs(o.y - CAR_Y) < (o.h + me.h) / 2;
      if (!hit) continue;
      if (o.type === 'coin') { o.dead = true; this.coins++; }
      else if (this.invuln <= 0) {
        o.dead = o.type === 'cone';
        this.lives--; this.invuln = 1.6; this.speed *= 0.35;
        if (this.lives <= 0) {
          const score = this.score();
          this.result = {
            title: '💥 Авария!', win: false, score,
            lines: [`Проехано: ${Math.round(this.dist / 10)} м`, `Монет собрано: ${this.coins}`, { text: `Очки: ${score}`, color: '#FFD700', size: 28 }],
          };
        }
      }
    }
    this.objs = this.objs.filter(o => o.y < H + 100 && !(o.dead && o.type === 'coin'));
  };

  Race.prototype.score = function () { return Math.round(this.dist / 10) + this.coins * 25; };

  Race.prototype.draw = function (ctx) {
    // трава
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#43A047';
    for (let y = -80 + this.scroll * 2 % 160; y < H; y += 160) ctx.fillRect(0, y, W, 80);
    // дорога
    ctx.fillStyle = '#475569';
    ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
    // бордюры
    for (let y = -40 + this.scroll; y < H; y += 80) {
      ctx.fillStyle = '#E3000B'; ctx.fillRect(ROAD_L - 12, y, 12, 40); ctx.fillRect(ROAD_R, y, 12, 40);
      ctx.fillStyle = '#fff'; ctx.fillRect(ROAD_L - 12, y + 40, 12, 40); ctx.fillRect(ROAD_R, y + 40, 12, 40);
    }
    // разметка
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 1; i < 3; i++) {
      for (let y = -80 + this.scroll; y < H; y += 80) ctx.fillRect(ROAD_L + LANE * i - 3, y, 6, 44);
    }
    // деревья
    this.trees.forEach(tr => {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.arc(tr.x + 6, tr.y + 6, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tr.kind === 'tree' ? '#2E7D32' : '#66BB6A';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tr.kind === 'tree' ? '#388E3C' : '#81C784';
      ctx.beginPath(); ctx.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.55, 0, Math.PI * 2); ctx.fill();
    });
    // объекты
    for (const o of this.objs) {
      if (o.dead) continue;
      if (o.type === 'car') drawCar(ctx, o.x, o.y, o.color, 0);
      else if (o.type === 'cone') drawCone(ctx, o.x, o.y);
      else drawCoin(ctx, o.x, o.y, this.t);
    }
    // наша машина
    const blink = this.invuln > 0 && Math.floor(this.invuln * 10) % 2 === 0;
    if (!blink) {
      const shake = this.offRoad ? G.rand(-1.5, 1.5) : 0;
      drawCar(ctx, this.x + shake, CAR_Y, '#E3000B', (this.steer || 0) * 0.22);
    }
    // HUD
    G.pill(ctx, 16, 14, '❤️'.repeat(Math.max(0, this.lives)) + '🤍'.repeat(Math.max(0, 3 - this.lives)));
    G.pill(ctx, W - 16, 14, `⭐ ${this.score()}`, { align: 'right' });
    G.pill(ctx, W - 16, 56, `🚀 ${Math.round(this.speed / 4)} км/ч`, { align: 'right' });
    if (this.offRoad) G.text(ctx, 'Вернись на дорогу!', W / 2, 40, { size: 24, align: 'center', stroke: '#0E1E38', color: '#FFD700' });
  };

  G.register({
    id: 'race',
    emoji: '🏎️',
    title: 'Гонка по трассе',
    color: 'linear-gradient(135deg, #E3000B, #FF6B00)',
    short: 'Рули машинкой, объезжай машины и конусы, собирай монеты. Чем дальше уедешь — тем больше очков.',
    goal: 'Уедь как можно дальше и не разбей машину!',
    howto: [
      'Наклон влево / вправо — руль.',
      'Наклон вперёд — газ, назад — тормоз.',
      'Монета ★ = 25 очков. 3 аварии — конец гонки.',
      'Не съезжай на траву: там машина еле едет.',
    ],
    led: 3,
    formatScore: v => `${v} очков`,
    create: () => new Race(),
  });
})();

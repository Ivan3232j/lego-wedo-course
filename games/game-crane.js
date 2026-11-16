/* 🏗️ Башенный кран: перенеси все кубики в кузов грузовика */
(function () {
  'use strict';
  const { W, H } = G;
  const JIB_Y = 78;          // низ стрелы крана
  const GROUND = 455;
  const BED_Y = 392, BED_L = 560, BED_R = 730;   // кузов грузовика
  const BW = 76, BH = 34;    // размер кубика
  const HOOK = 18;           // высота крюка под тросом
  const TX_MIN = 150, TX_MAX = 760;
  const GRAV = 900;

  function Crane() {
    this.tx = 300; this.tv = 0;
    this.L = 120; this.th = 0; this.om = 0;
    this.t = 0; this.carry = null; this.lifted = false; this.armed = true;
    this.bricks = [];
    const xs = [175, 270, 365, 460];
    G.COLORS.slice(0, 5).forEach((c, i) => {
      const cx = i < 4 ? xs[i] : 270;
      const bottom = i < 4 ? GROUND : GROUND - BH;
      this.bricks.push({ cx, bottom, color: c });
    });
    this.msg = ''; this.msgT = 0;
  }

  // Самая высокая поверхность под отрезком [x1, x2] (кубики, кузов, земля)
  Crane.prototype.surface = function (x1, x2, skip) {
    let y = GROUND, top = null;
    if (x2 > BED_L && x1 < BED_R) y = BED_Y;
    for (const b of this.bricks) {
      if (b === skip) continue;
      const bx1 = b.cx - BW / 2, bx2 = b.cx + BW / 2;
      if (x2 - 6 > bx1 && x1 + 6 < bx2 && b.bottom - BH < y) { y = b.bottom - BH; top = b; }
    }
    return { y, brick: top };
  };

  Crane.prototype.hookPos = function () {
    return { x: this.tx + this.L * Math.sin(this.th), y: JIB_Y + this.L * Math.cos(this.th) };
  };

  Crane.prototype.loadExtent = function () {
    const h = this.hookPos();
    if (this.carry) return { x1: h.x - BW / 2, x2: h.x + BW / 2, bottom: h.y + HOOK + BH, h };
    return { x1: h.x - 10, x2: h.x + 10, bottom: h.y + HOOK, h };
  };

  Crane.prototype.say = function (m) { this.msg = m; this.msgT = 1.6; };

  Crane.prototype.update = function (dt, joy) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;

    // тележка
    const oldV = this.tv;
    this.tv = G.lerp(this.tv, joy.x * 240, Math.min(1, dt * 4));
    this.tx += this.tv * dt;
    if (this.tx < TX_MIN || this.tx > TX_MAX) { this.tx = G.clamp(this.tx, TX_MIN, TX_MAX); this.tv = 0; }
    const acc = (this.tv - oldV) / dt;

    // трос: наклон назад — опустить, вперёд — поднять
    this.L = G.clamp(this.L + joy.y * 170 * dt, 30, GROUND - JIB_Y);

    // маятник (раскачивание груза)
    const steps = 4, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const alpha = -(GRAV / this.L) * Math.sin(this.th) - (acc / this.L) * Math.cos(this.th) - 1.7 * this.om;
      this.om += alpha * h;
      this.th += this.om * h;
    }
    this.th = G.clamp(this.th, -0.9, 0.9);

    // не даём грузу провалиться сквозь землю и кубики
    let e = this.loadExtent();
    let surf = this.surface(e.x1, e.x2, this.carry);
    if (e.bottom > surf.y) {
      const over = e.bottom - surf.y;
      this.L = Math.max(30, this.L - over / Math.max(0.4, Math.cos(this.th)));
      this.om *= 0.6;
      e = this.loadExtent();
    }
    const touching = e.bottom >= surf.y - 1.5;
    const gap = surf.y - e.bottom;

    if (!this.carry) {
      if (gap > 24) this.armed = true;
      // зацепить кубик: крюк опустился точно на верх свободного кубика
      if (this.armed && touching && joy.y > 0.2 && surf.brick && Math.abs(e.h.x - surf.brick.cx) < 26) {
        const b = surf.brick;
        const covered = this.bricks.some(o => o !== b && o.bottom === b.bottom - BH && Math.abs(o.cx - b.cx) < BW - 12);
        if (!covered) {
          this.carry = b; this.lifted = false; this.om *= 0.3;
          this.say('Зацепил! Поднимай ⬆');
        }
      } else if (this.armed && touching && joy.y > 0.2 && surf.brick && !this.hinted) {
        this.hinted = true; this.say('Крюк должен быть над серединой кубика');
      }
    } else {
      if (gap > 24) this.lifted = true;
      // поставить: кубик коснулся опоры
      if (this.lifted && touching) {
        const b = this.carry;
        b.cx = G.clamp(e.h.x, 60, W - 40);
        b.bottom = surf.y;
        this.carry = null; this.armed = false; this.om *= 0.3;
        const onTruck = b.cx > BED_L && b.cx < BED_R;
        this.say(onTruck ? 'Отлично, в кузове! ✅' : 'Поставил. Вези в кузов!');
      }
    }

    const done = this.delivered();
    Joy.setLed(this.carry ? 7 : 3);
    if (done === this.bricks.length && !this.carry) {
      const stars = this.t < 60 ? '⭐⭐⭐' : this.t < 100 ? '⭐⭐' : '⭐';
      this.result = {
        title: '🏆 Грузовик загружен!', win: true, score: Math.round(this.t * 10) / 10,
        lines: [`Время: ${G.formatTime(this.t)}`, { text: stars, size: 34 }],
      };
    }
  };

  Crane.prototype.delivered = function () {
    return this.bricks.filter(b => b !== this.carry && b.cx > BED_L && b.cx < BED_R).length;
  };

  Crane.prototype.draw = function (ctx) {
    // небо и город
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#7DD3FC'); sky.addColorStop(1, '#E0F2FE');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FDE68A';
    ctx.beginPath(); ctx.arc(690, 150, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#BFDBFE';
    [[130, 250], [210, 200], [300, 280], [380, 230], [470, 300], [560, 260], [640, 310]].forEach(([x, y]) => ctx.fillRect(x, y, 70, GROUND - y));
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    [[130, 250], [210, 200], [300, 280], [380, 230], [470, 300], [560, 260], [640, 310]].forEach(([x, y]) => {
      for (let wy = y + 14; wy < GROUND - 20; wy += 28) for (let wx = x + 10; wx < x + 60; wx += 22) ctx.fillRect(wx, wy, 10, 12);
    });
    // земля
    ctx.fillStyle = '#A16207'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#CA8A04'; ctx.fillRect(0, GROUND, W, 8);

    // грузовик
    ctx.fillStyle = '#1F2937';
    [BED_L + 30, BED_R - 30, BED_R + 40].forEach(x => { ctx.beginPath(); ctx.arc(x, GROUND - 16, 17, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#9CA3AF';
    [BED_L + 30, BED_R - 30, BED_R + 40].forEach(x => { ctx.beginPath(); ctx.arc(x, GROUND - 16, 7, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#006CB7'; G.rr(ctx, BED_L - 6, BED_Y, BED_R - BED_L + 12, 40, 6); ctx.fill();
    ctx.fillStyle = '#005A99'; ctx.fillRect(BED_L - 6, BED_Y + 30, BED_R - BED_L + 12, 10);
    ctx.fillStyle = '#E3000B'; G.rr(ctx, BED_R + 10, BED_Y - 40, 62, 80, 10); ctx.fill();
    ctx.fillStyle = '#BAE6FD'; G.rr(ctx, BED_R + 30, BED_Y - 30, 34, 28, 5); ctx.fill();
    // подсветка зоны погрузки
    ctx.strokeStyle = 'rgba(0,166,80,0.8)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 3;
    ctx.strokeRect(BED_L, BED_Y - 130, BED_R - BED_L, 128);
    ctx.setLineDash([]);
    G.text(ctx, 'КУЗОВ', (BED_L + BED_R) / 2, BED_Y - 142, { size: 16, align: 'center', color: '#047857', weight: 900 });

    // башня крана
    ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 4;
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(66, JIB_Y - 40, 6, GROUND - JIB_Y + 40); ctx.fillRect(98, JIB_Y - 40, 6, GROUND - JIB_Y + 40);
    ctx.beginPath();
    for (let y = JIB_Y - 40; y < GROUND; y += 34) { ctx.moveTo(69, y); ctx.lineTo(101, y + 34); ctx.moveTo(101, y); ctx.lineTo(69, y + 34); }
    ctx.stroke();
    // стрела
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(20, JIB_Y - 22, W - 20, 6); ctx.fillRect(20, JIB_Y - 4, W - 20, 6);
    ctx.beginPath();
    for (let x = 20; x < W; x += 24) { ctx.moveTo(x, JIB_Y - 19); ctx.lineTo(x + 12, JIB_Y - 1); ctx.lineTo(x + 24, JIB_Y - 19); }
    ctx.stroke();
    // противовес и кабина
    ctx.fillStyle = '#6B7280'; ctx.fillRect(14, JIB_Y - 2, 46, 34);
    ctx.fillStyle = '#E3000B'; G.rr(ctx, 104, JIB_Y, 40, 32, 6); ctx.fill();
    ctx.fillStyle = '#BAE6FD'; G.rr(ctx, 112, JIB_Y + 6, 24, 16, 4); ctx.fill();

    // кубики
    for (const b of this.bricks) if (b !== this.carry) G.brick(ctx, b.cx - BW / 2, b.bottom - BH, BW, BH, b.color);

    // тележка и трос
    const hp = this.hookPos();
    ctx.fillStyle = '#374151'; G.rr(ctx, this.tx - 18, JIB_Y - 6, 36, 14, 4); ctx.fill();
    ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(this.tx - 3, JIB_Y + 6); ctx.lineTo(hp.x - 3, hp.y); ctx.moveTo(this.tx + 3, JIB_Y + 6); ctx.lineTo(hp.x + 3, hp.y); ctx.stroke();

    // направляющая вниз — помогает прицелиться
    const e = this.loadExtent();
    const s = this.surface(e.x1, e.x2, this.carry);
    ctx.strokeStyle = 'rgba(227,0,11,0.45)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hp.x, e.bottom + 2); ctx.lineTo(hp.x, s.y); ctx.stroke(); ctx.setLineDash([]);

    // крюк
    ctx.save(); ctx.translate(hp.x, hp.y); ctx.rotate(-this.th);
    ctx.fillStyle = '#FFD700'; G.rr(ctx, -12, 0, 24, 12, 3); ctx.fill();
    ctx.strokeStyle = '#4B5563'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, 16); ctx.arc(-5, 16, 5, 0, Math.PI, false); ctx.stroke();
    if (this.carry) G.brick(ctx, -BW / 2, HOOK, BW, BH, this.carry.color);
    ctx.restore();

    // HUD
    G.pill(ctx, 16, 14, `📦 ${this.delivered()} / ${this.bricks.length}`);
    G.pill(ctx, W - 16, 14, `⏱ ${G.formatTime(this.t)}`, { align: 'right' });
    if (this.msgT > 0) G.pill(ctx, W / 2, 112, this.msg, { align: 'center', bg: 'rgba(0,166,80,0.9)' });
  };

  G.register({
    id: 'crane',
    emoji: '🏗️',
    title: 'Башенный кран',
    color: 'linear-gradient(135deg, #F59E0B, #FFD700)',
    short: 'Двигай тележку крана, опускай крюк и перенеси все кубики в кузов грузовика. Осторожно: груз раскачивается!',
    goal: 'Погрузи все 5 кубиков в кузов как можно быстрее',
    howto: [
      'Наклон влево / вправо — едет тележка крана.',
      'Наклон назад — опустить крюк, вперёд — поднять.',
      'Опусти крюк на середину кубика — он зацепится сам.',
      'Опусти кубик на опору — крюк его отпустит.',
      'В кузов влезает 2 кубика в ряд — строй башенку!',
    ],
    led: 3,
    lowerIsBetter: true,
    formatScore: v => G.formatTime(v),
    create: () => new Crane(),
  });
})();

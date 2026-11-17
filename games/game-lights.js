/* 🚦 Светофор: на зелёный — рука к датчику (робот идёт), на красный — руку прочь! */
(function () {
  'use strict';
  const { W, H } = G;
  const START = 90, FINISH = 630, ROAD_Y = 360;
  const GRACE = 0.45;   // сколько секунд даётся, чтобы убрать руку после красного

  function Lights() {
    this.x = START; this.t = 0; this.speed = 0; this.caught = 0; this.step = 0;
    this.light = 'green'; this.lightT = G.rand(2.2, 4); this.redT = 0;
    this.msg = ''; this.msgT = 0; this.flash = 0;
  }

  Lights.prototype.nextLight = function () {
    if (this.light === 'green') { this.light = 'yellow'; this.lightT = 0.9; }
    else if (this.light === 'yellow') { this.light = 'red'; this.lightT = G.rand(1.6, 3.2); this.redT = 0; }
    else { this.light = 'green'; this.lightT = G.rand(1.8, 4.2); }
    Joy.setLed(this.light === 'green' ? 6 : this.light === 'yellow' ? 7 : 9);
  };

  Lights.prototype.update = function (dt, joy) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.flash > 0) this.flash -= dt;

    this.lightT -= dt;
    if (this.lightT <= 0) this.nextLight();
    if (this.light === 'red') this.redT += dt;

    // чем ближе рука к датчику, тем быстрее идёт робот; рука далеко — стоит
    const go = G.clamp((0.75 - joy.dist) / 0.6, 0, 1);
    this.speed = go * 75;
    this.x = Math.min(FINISH, this.x + this.speed * dt);
    this.step += this.speed * dt;

    if (this.light === 'red' && this.redT > GRACE && this.speed > 12) {
      this.caught++;
      this.x = Math.max(START, this.x - 140);
      this.msg = 'Попался! На красный стоим 🛑'; this.msgT = 1.6; this.flash = 0.4;
      this.redT = -1.2;   // пауза, чтобы не ловило несколько раз подряд
    }

    if (this.x >= FINISH) {
      const score = Math.round(this.t * 10) / 10;
      this.result = {
        title: '🏁 Финиш!', win: true, score,
        lines: [`Время: ${G.formatTime(this.t)}`, `Поймали на красный: ${this.caught} раз`],
      };
    }
  };

  function drawRobot(ctx, x, y, step, moving) {
    const leg = moving ? Math.sin(step / 9) * 10 : 0;
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 16 + leg * 0.4, y - 26, 10, 26);
    ctx.fillRect(x + 6 - leg * 0.4, y - 26, 10, 26);
    G.brick(ctx, x - 26, y - 66, 52, 42, '#006CB7');                 // корпус
    ctx.fillStyle = '#FFD700'; ctx.fillRect(x - 6, y - 52, 12, 12);   // кнопка-хаб
    G.brick(ctx, x - 20, y - 98, 40, 30, '#E5E7EB');                 // голова
    ctx.fillStyle = '#0E1E38';
    ctx.beginPath(); ctx.arc(x - 8, y - 84, 4, 0, Math.PI * 2); ctx.arc(x + 8, y - 84, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y - 104); ctx.lineTo(x, y - 116); ctx.stroke();
    ctx.fillStyle = '#E3000B'; ctx.beginPath(); ctx.arc(x, y - 118, 4, 0, Math.PI * 2); ctx.fill();
  }

  Lights.prototype.draw = function (ctx) {
    ctx.fillStyle = '#BAE6FD'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#E0F2FE';
    [[40, 200], [150, 160], [270, 220], [420, 180], [560, 210]].forEach(([x, y]) => ctx.fillRect(x, y, 90, ROAD_Y - y));
    ctx.fillStyle = '#64748B'; ctx.fillRect(0, ROAD_Y, W, H - ROAD_Y);
    ctx.fillStyle = '#fff';
    for (let x = 0; x < W; x += 60) ctx.fillRect(x, ROAD_Y + 60, 34, 6);
    // линия старта и финиша
    ctx.fillStyle = '#fff'; ctx.fillRect(START - 4, ROAD_Y, 6, 50);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#111827' : '#fff'; ctx.fillRect(FINISH + 22, ROAD_Y + i * 10, 10, 10);
      ctx.fillStyle = i % 2 ? '#fff' : '#111827'; ctx.fillRect(FINISH + 32, ROAD_Y + i * 10, 10, 10);
    }
    G.text(ctx, '🏁', FINISH + 32, ROAD_Y - 30, { size: 34, align: 'center' });

    // прогресс
    ctx.fillStyle = 'rgba(14,30,56,0.25)'; G.rr(ctx, START, ROAD_Y + 90, FINISH - START, 12, 6); ctx.fill();
    ctx.fillStyle = '#00A650'; G.rr(ctx, START, ROAD_Y + 90, this.x - START, 12, 6); ctx.fill();

    drawRobot(ctx, this.x, ROAD_Y + 4, this.step, this.speed > 5);

    // светофор
    const lx = 740, ly = 40;
    ctx.fillStyle = '#374151'; ctx.fillRect(lx - 4, ly + 150, 8, ROAD_Y - ly - 150);
    ctx.fillStyle = '#1F2937'; G.rr(ctx, lx - 34, ly, 68, 156, 14); ctx.fill();
    [['red', '#EF4444'], ['yellow', '#FACC15'], ['green', '#22C55E']].forEach(([name, col], i) => {
      const on = this.light === name;
      ctx.fillStyle = on ? col : '#4B5563';
      if (on) { ctx.shadowColor = col; ctx.shadowBlur = 24; }
      ctx.beginPath(); ctx.arc(lx, ly + 28 + i * 50, 19, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    const hint = this.light === 'green' ? '🟢 Иди! Рука к датчику' : this.light === 'yellow' ? '🟡 Внимание…' : '🔴 Стоп! Руку прочь';
    G.pill(ctx, W / 2 - 60, 60, hint, { align: 'center', bg: this.light === 'red' ? 'rgba(227,0,11,0.9)' : this.light === 'yellow' ? 'rgba(202,138,4,0.9)' : 'rgba(0,166,80,0.9)' });
    if (this.msgT > 0) G.pill(ctx, W / 2 - 60, 104, this.msg, { align: 'center', bg: 'rgba(14,30,56,0.9)' });
    if (this.flash > 0) { ctx.fillStyle = `rgba(239,68,68,${this.flash})`; ctx.fillRect(0, 0, W, H); }

    G.distGauge(ctx, W / 2 - 220, H - 28, 280, 22, Joy.dist, false);
    G.pill(ctx, 16, 14, `⏱ ${G.formatTime(this.t)}`);
    G.pill(ctx, 16 + 150, 14, `🛑 ${this.caught}`);
  };

  G.register({
    id: 'lights',
    sensor: 'distance',
    emoji: '🚦',
    title: 'Светофор',
    color: 'linear-gradient(135deg, #00A650, #E3000B)',
    short: 'На зелёный поднеси руку к датчику — робот шагает. На красный быстро убери руку, иначе робота вернут назад!',
    goal: 'Доведи робота до финиша как можно быстрее',
    howto: [
      'Рука близко к датчику — робот идёт (чем ближе, тем быстрее).',
      'Рука далеко — робот стоит.',
      'Красный свет: убери руку, пока робот не попался.',
      'Попался — робот отступает назад.',
      'Без датчика: стрелки ↑ ↓.',
    ],
    led: 6,
    lowerIsBetter: true,
    formatScore: v => G.formatTime(v),
    create: () => new Lights(),
  });
})();

/* 🟡 Лабиринт с шариком: наклоняй поле и докати шарик до флажка */
(function () {
  'use strict';
  const { W, H } = G;
  const LEVELS = [
    { cols: 7, rows: 4, holes: 0 },
    { cols: 9, rows: 5, holes: 3 },
    { cols: 12, rows: 7, holes: 6 },
  ];
  const AREA = { x: 16, y: 58, w: W - 32, h: H - 72 };
  const WALL = 8;

  // Лабиринт «поиском в глубину»: у каждой клетки стены [верх, право, низ, лево]
  function generate(cols, rows) {
    const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ w: [true, true, true, true], seen: false })));
    const stack = [[0, 0]];
    cells[0][0].seen = true;
    const D = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = D.filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !cells[ny][nx].seen;
      });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy, a, b] = G.pick(opts);
      cells[y][x].w[a] = false;
      cells[y + dy][x + dx].w[b] = false;
      cells[y + dy][x + dx].seen = true;
      stack.push([x + dx, y + dy]);
    }
    return cells;
  }

  // Путь от старта до финиша (чтобы не ставить ямы на правильную дорогу)
  function solve(cells, cols, rows) {
    const prev = {}, q = [[0, 0]], key = (x, y) => x + ',' + y;
    prev[key(0, 0)] = null;
    const D = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === cols - 1 && y === rows - 1) break;
      for (const [dx, dy, wi] of D) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!cells[y][x].w[wi] && !(k in prev)) { prev[k] = key(x, y); q.push([nx, ny]); }
      }
    }
    const path = new Set();
    let k = key(cols - 1, rows - 1);
    while (k) { path.add(k); k = prev[k]; }
    return path;
  }

  function Maze() {
    this.level = 0; this.t = 0; this.levelT = 0; this.falls = 0; this.banner = 0;
    this.build();
  }

  Maze.prototype.build = function () {
    const L = LEVELS[this.level];
    this.cols = L.cols; this.rows = L.rows;
    this.cell = Math.min(AREA.w / L.cols, AREA.h / L.rows);
    this.ox = AREA.x + (AREA.w - this.cell * L.cols) / 2;
    this.oy = AREA.y + (AREA.h - this.cell * L.rows) / 2;
    const cells = generate(L.cols, L.rows);
    const c = this.cell, ox = this.ox, oy = this.oy;

    // стены как прямоугольники
    this.walls = [];
    const add = (x, y, w, h) => this.walls.push({ x, y, w, h });
    for (let y = 0; y < L.rows; y++) {
      for (let x = 0; x < L.cols; x++) {
        const px = ox + x * c, py = oy + y * c, w = cells[y][x].w;
        if (w[0]) add(px - WALL / 2, py - WALL / 2, c + WALL, WALL);
        if (w[3]) add(px - WALL / 2, py - WALL / 2, WALL, c + WALL);
        if (x === L.cols - 1 && w[1]) add(px + c - WALL / 2, py - WALL / 2, WALL, c + WALL);
        if (y === L.rows - 1 && w[2]) add(px - WALL / 2, py + c - WALL / 2, c + WALL, WALL);
      }
    }

    // ямы — только в тупиках в стороне от правильного пути
    const path = solve(cells, L.cols, L.rows);
    const free = [];
    for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
      if (!path.has(x + ',' + y)) free.push([x, y]);
    }
    free.sort(() => Math.random() - 0.5);
    this.holes = free.slice(0, L.holes).map(([x, y]) => ({ x: ox + (x + 0.5) * c, y: oy + (y + 0.5) * c, r: c * 0.3 }));

    this.goal = { x: ox + (L.cols - 0.5) * c, y: oy + (L.rows - 0.5) * c };
    this.r = c * 0.22;
    this.reset();
  };

  Maze.prototype.reset = function () {
    this.bx = this.ox + this.cell / 2; this.by = this.oy + this.cell / 2;
    this.vx = 0; this.vy = 0; this.fall = 0;
  };

  Maze.prototype.collide = function () {
    for (const w of this.walls) {
      const nx = G.clamp(this.bx, w.x, w.x + w.w), ny = G.clamp(this.by, w.y, w.y + w.h);
      const dx = this.bx - nx, dy = this.by - ny, d = Math.hypot(dx, dy);
      if (d < this.r && d > 0.0001) {
        const ux = dx / d, uy = dy / d, push = this.r - d;
        this.bx += ux * push; this.by += uy * push;
        const vn = this.vx * ux + this.vy * uy;
        if (vn < 0) { this.vx -= 1.4 * vn * ux; this.vy -= 1.4 * vn * uy; }
      }
    }
  };

  Maze.prototype.update = function (dt, joy) {
    this.t += dt; this.levelT += dt;
    if (this.banner > 0) this.banner -= dt;

    if (this.fall > 0) {             // шарик падает в яму
      this.fall -= dt;
      if (this.fall <= 0) { this.reset(); Joy.setLed(5); }
      return;
    }

    const acc = 1100;
    this.vx += joy.x * acc * dt; this.vy += joy.y * acc * dt;
    const fr = Math.pow(0.35, dt);
    this.vx *= fr; this.vy *= fr;
    const sp = Math.hypot(this.vx, this.vy), max = 520;
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }

    const steps = Math.ceil(sp * dt / (this.r * 0.4)) || 1;
    for (let i = 0; i < steps; i++) {
      this.bx += this.vx * dt / steps; this.by += this.vy * dt / steps;
      this.collide();
    }

    for (const h of this.holes) {
      if (Math.hypot(h.x - this.bx, h.y - this.by) < h.r * 0.75) {
        this.fall = 0.7; this.falls++; this.fallAt = h;
        Joy.setLed(9);
        return;
      }
    }

    if (Math.hypot(this.goal.x - this.bx, this.goal.y - this.by) < this.cell * 0.3) {
      if (this.level < LEVELS.length - 1) {
        this.level++; this.levelT = 0; this.banner = 1.8;
        Joy.setLed(6);
        this.build();
      } else {
        const score = Math.round(this.t * 10) / 10;
        this.result = {
          title: '🏁 Все лабиринты пройдены!', win: true, score,
          lines: [`Время: ${G.formatTime(this.t)}`, `Падений в ямы: ${this.falls}`],
        };
      }
    }
  };

  Maze.prototype.draw = function (ctx) {
    ctx.fillStyle = '#0E1E38'; ctx.fillRect(0, 0, W, H);
    // поле
    ctx.fillStyle = '#FDE68A';
    G.rr(ctx, this.ox - 6, this.oy - 6, this.cell * this.cols + 12, this.cell * this.rows + 12, 10); ctx.fill();
    ctx.fillStyle = 'rgba(180,120,40,0.12)';
    for (let x = this.ox; x < this.ox + this.cell * this.cols; x += 18) ctx.fillRect(x, this.oy, 2, this.cell * this.rows);

    // старт
    ctx.fillStyle = 'rgba(0,108,183,0.18)';
    ctx.fillRect(this.ox, this.oy, this.cell, this.cell);

    // ямы
    for (const h of this.holes) {
      const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
      g.addColorStop(0, '#000'); g.addColorStop(0.75, '#1F2937'); g.addColorStop(1, '#78350F');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
    }

    // финиш
    const gx = this.goal.x, gy = this.goal.y, s = this.cell * 0.32;
    ctx.fillStyle = 'rgba(0,166,80,0.25)';
    ctx.beginPath(); ctx.arc(gx, gy, this.cell * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gx - s * 0.4, gy + s); ctx.lineTo(gx - s * 0.4, gy - s); ctx.stroke();
    ctx.fillStyle = '#E3000B';
    ctx.beginPath(); ctx.moveTo(gx - s * 0.4, gy - s); ctx.lineTo(gx + s * 0.8, gy - s * 0.6); ctx.lineTo(gx - s * 0.4, gy - s * 0.2); ctx.fill();

    // стены
    for (const w of this.walls) {
      ctx.fillStyle = '#004E85'; ctx.fillRect(w.x, w.y + 2, w.w, w.h);
      ctx.fillStyle = '#006CB7'; ctx.fillRect(w.x, w.y, w.w, w.h - 1);
    }

    // шарик
    let bx = this.bx, by = this.by, r = this.r;
    if (this.fall > 0) {
      const k = 1 - this.fall / 0.7;
      bx = G.lerp(bx, this.fallAt.x, Math.min(1, k * 3)); by = G.lerp(by, this.fallAt.y, Math.min(1, k * 3));
      r *= Math.max(0, 1 - k);
    }
    if (r > 0.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(bx + 3, by + 4, r, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.35, r * 0.1, bx, by, r);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, '#FFD700'); g.addColorStop(1, '#B45309');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    }

    G.pill(ctx, 16, 12, `🧩 Уровень ${this.level + 1} из ${LEVELS.length}`);
    G.pill(ctx, W - 16, 12, `⏱ ${G.formatTime(this.t)}`, { align: 'right' });
    if (this.fall > 0) G.pill(ctx, W / 2, 12, 'Ой, яма! Начинаем сначала', { align: 'center', bg: 'rgba(227,0,11,0.9)' });
    else if (this.banner > 0) G.pill(ctx, W / 2, 12, `Уровень ${this.level + 1}! Лабиринт больше`, { align: 'center', bg: 'rgba(0,166,80,0.9)' });
  };

  G.register({
    id: 'maze',
    emoji: '🟡',
    title: 'Лабиринт с шариком',
    color: 'linear-gradient(135deg, #00A650, #84CC16)',
    short: 'Наклоняй поле — шарик катится сам. Доведи его до красного флажка через 3 лабиринта и не упади в яму!',
    goal: 'Пройди 3 лабиринта за минимальное время',
    howto: [
      'Наклон джойстика наклоняет поле — шарик катится вниз по наклону.',
      'Шарик разгоняется, как настоящий: тормози обратным наклоном.',
      'Финиш — красный флажок в правом нижнем углу.',
      'Чёрные ямы на 2-м и 3-м уровне возвращают шарик на старт.',
    ],
    led: 5,
    lowerIsBetter: true,
    formatScore: v => G.formatTime(v),
    create: () => new Maze(),
  });
})();

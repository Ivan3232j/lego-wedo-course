/* Оболочка: меню, подключение джойстика, игровой цикл, экраны «старт» и «финиш» */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // ── Рекорды ──
  function bestKey(def) { return 'wedo-best-' + def.id; }
  function getBest(def) {
    try { const v = localStorage.getItem(bestKey(def)); return v === null ? null : Number(v); } catch (e) { return null; }
  }
  function setBest(def, v) { try { localStorage.setItem(bestKey(def), String(v)); } catch (e) {} }
  function isBetter(def, a, b) { return b === null || (def.lowerIsBetter ? a < b : a > b); }

  // ── Меню ──
  function renderMenu() {
    const grid = $('gamesGrid');
    grid.innerHTML = '';
    G.games.forEach(def => {
      const best = getBest(def);
      const card = document.createElement('button');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="art" style="background:${def.color}">${def.emoji}</div>
        <div class="body">
          <h3>${def.title}</h3>
          <p>${def.short}</p>
          <div class="best">${best === null ? '🏆 Рекорда пока нет' : '🏆 Рекорд: ' + def.formatScore(best)}</div>
        </div>`;
      card.onclick = () => openGame(def);
      grid.appendChild(card);
    });
  }

  // ── Состояние игры ──
  let def = null, game = null, phase = 'menu', phaseTime = 0, holdTime = 0, newRecord = false;

  function openGame(d) {
    def = d;
    $('playTitle').textContent = `${d.emoji} ${d.title}`;
    $('playHowto').innerHTML = d.howto.map(h => `<li>${h}</li>`).join('');
    $('menu').classList.add('hidden');
    $('play').classList.add('active');
    try { history.replaceState(null, '', '#' + d.id); } catch (e) {}
    restart();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeGame() {
    def = null; game = null; phase = 'menu';
    $('play').classList.remove('active');
    $('menu').classList.remove('hidden');
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    Joy.setLed(6);
    renderMenu();
  }

  function restart() {
    game = def.create();
    window.currentGame = game; // для отладки из консоли
    phase = 'ready'; phaseTime = 0; holdTime = 0; newRecord = false;
    Joy.setLed(def.led ?? 3);
  }

  $('backBtn').onclick = closeGame;
  $('restartBtn').onclick = () => def && restart();

  window.addEventListener('keydown', e => {
    if (!def) return;
    if (e.code === 'Escape') closeGame();
    if ((e.code === 'Enter' || e.code === 'Space') && phase !== 'play') { e.preventDefault(); restart(); phase = 'play'; }
  });

  // ── Подключение WeDo ──
  const connectBtn = $('connectBtn');
  function updateStatus(h) {
    const dot = $('connDot'), txt = $('connText');
    dot.className = 'dot' + (h.connected ? ' on' : h.connecting ? ' wait' : '');
    if (h.connecting) txt.textContent = 'Подключаюсь…';
    else if (!h.connected) txt.textContent = 'Смартхаб не подключён';
    else if (h.tiltPort === null) txt.textContent = `${h.name}: вставь датчик наклона`;
    else txt.textContent = `${h.name}: джойстик готов`;
    connectBtn.textContent = h.connected ? 'Отключить' : '🔵 Подключить WeDo';
    connectBtn.disabled = h.connecting;
  }
  Joy.onStatus(updateStatus);
  updateStatus(Joy.hub);

  connectBtn.onclick = async () => {
    if (Joy.hub.connected) { Joy.disconnect(); return; }
    try {
      await Joy.connect();
      $('settings').classList.add('open');
    } catch (e) {
      if (e && e.name === 'NotFoundError') return; // пользователь закрыл окно выбора
      alert('Не удалось подключиться: ' + (e && e.message ? e.message : e));
    }
  };
  if (!Joy.bluetoothSupported) {
    connectBtn.title = 'Bluetooth работает в Chrome или Edge';
  }

  $('settingsBtn').onclick = () => $('settings').classList.toggle('open');
  $('calibrateBtn').onclick = () => Joy.calibrate();
  [['optSwap', 'swap'], ['optInvX', 'invX'], ['optInvY', 'invY']].forEach(([id, key]) => {
    const el = $(id);
    el.checked = !!Joy.settings[key];
    el.onchange = () => Joy.setSetting(key, el.checked);
  });

  Joy.attachTouchStick($('stickBase'), $('stickKnob'));

  // ── Экраны поверх игры ──
  function overlay(title, lines, progress) {
    ctx.fillStyle = 'rgba(14,30,56,0.72)';
    ctx.fillRect(0, 0, G.W, G.H);
    G.text(ctx, title, G.W / 2, 150, { size: 46, font: "'Baloo 2', sans-serif", align: 'center', stroke: '#0E1E38', strokeWidth: 8 });
    lines.forEach((l, i) => {
      G.text(ctx, typeof l === 'string' ? l : l.text, G.W / 2, 220 + i * 38, { size: l.size || 22, align: 'center', color: l.color || '#E2E8F0', weight: 800 });
    });
    if (progress !== undefined) {
      const cx = G.W / 2, cy = 415, r = 30;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
      G.text(ctx, '⬆', cx, cy + 1, { size: 26, align: 'center', color: '#FFD700' });
    }
  }

  // «Наклони вперёд и подержи» — чтобы начать без мыши
  const HOLD = 0.7;
  function holdForward(dt) {
    if (Joy.y < -0.5) holdTime += dt; else holdTime = Math.max(0, holdTime - dt * 2);
    return holdTime >= HOLD;
  }

  // ── Игровой цикл ──
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    Joy.update();

    // индикатор в настройках
    const dot = $('tiltDot');
    dot.style.transform = `translate(${Joy.x * 36}px, ${Joy.y * 36}px)`;
    const h = Joy.hub;
    $('rawText').textContent = h.connected && h.tiltPort !== null
      ? `датчик: X ${h.rawX}, Y ${h.rawY}` : 'датчик: —';

    if (game) {
      phaseTime += dt;
      if (phase === 'play') {
        game.update(dt, Joy);
        if (game.result) {
          phase = 'over'; phaseTime = 0; holdTime = 0;
          const r = game.result;
          if (r.score !== undefined && r.score !== null) {
            const best = getBest(def);
            if (isBetter(def, r.score, best)) { setBest(def, r.score); newRecord = best !== null || r.win !== false; }
          }
          Joy.setLed(r.win ? 6 : 9);
        }
      }
      game.draw(ctx);

      if (phase === 'ready') {
        const best = getBest(def);
        overlay(`${def.emoji} ${def.title}`, [
          def.goal,
          { text: best === null ? '' : '🏆 Рекорд: ' + def.formatScore(best), color: '#FFD700' },
          { text: 'Наклони джойстик вперёд и подержи, чтобы начать', color: '#fff', size: 20 },
        ], holdTime / HOLD);
        if (holdForward(dt)) { phase = 'play'; phaseTime = 0; holdTime = 0; }
      } else if (phase === 'over') {
        const r = game.result;
        const lines = (r.lines || []).slice();
        if (newRecord) lines.push({ text: '🎉 Новый рекорд!', color: '#FFD700', size: 26 });
        lines.push({ text: 'Наклони вперёд и подержи — сыграть ещё', color: '#fff', size: 20 });
        overlay(r.title, lines, phaseTime > 1 ? holdTime / HOLD : 0);
        if (phaseTime > 1 && holdForward(dt)) { restart(); phase = 'play'; }
      }
    }
    requestAnimationFrame(frame);
  }

  renderMenu();
  const fromHash = G.games.find(g => '#' + g.id === location.hash);
  if (fromHash) openGame(fromHash);
  requestAnimationFrame(frame);
})();

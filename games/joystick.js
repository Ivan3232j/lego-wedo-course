/*
 * games/joystick.js
 * Джойстик для мини-игр LEGO WeDo 2.0.
 * Использует общий модуль shared/wedo.js для связи со смартхабом.
 * Источники управления (работают одновременно):
 *   1) LEGO WeDo 2.0 смартхаб + датчик наклона — по Bluetooth через shared/wedo.js;
 *   2) клавиатура — стрелки или WASD;
 *   3) экранный стик — мышью или пальцем.
 *
 * Результат: Joy.x, Joy.y в диапазоне -1..1.
 *   x: -1 влево, +1 вправо
 *   y: -1 вперёд (вверх по экрану), +1 назад (вниз по экрану)
 */
(function () {
  'use strict';

  const MAX_ANGLE = 30; // наклон (в «сырых» единицах) = полный ход стика
  const DEADZONE  = 0.18;
  const SETTINGS_KEY = 'wedo-joystick-settings';

  const Joy = {
    x: 0, y: 0,
    // Дальномер: 0 — рука вплотную, 1 — далеко / ничего нет
    dist: 1,
    hub: { connected: false, connecting: false, name: '', tiltPort: null, rawX: 0, rawY: 0, distPort: null, rawDist: null },
    settings: { swap: false, invX: false, invY: false, offX: 0, offY: 0, distNear: 0, distFar: 10 },
    listeners: [],
    onStatus(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach(fn => { try { fn(this.hub); } catch (e) { console.error(e); } }); },
    bluetoothSupported: typeof WeDo !== 'undefined' ? WeDo.isBluetoothSupported() : !!(navigator.bluetooth && navigator.bluetooth.requestDevice),
  };

  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved) Object.assign(Joy.settings, saved);
  } catch (e) { /* хранилище недоступно — работаем с настройками по умолчанию */ }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Joy.settings)); } catch (e) {}
  }
  Joy.setSetting = function (key, value) { Joy.settings[key] = value; saveSettings(); };

  // ── Клавиатура ────────────────────────────────────────────────
  const keys = new Set();
  const KEYMAP = {
    ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
    ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
  };
  window.addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) { keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());

  // ── Экранный стик ─────────────────────────────────────────────
  const touch = { x: 0, y: 0, active: false };
  Joy.attachTouchStick = function (base, knob) {
    let pid = null;
    const move = (e) => {
      const r = base.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / R;
      let dy = (e.clientY - (r.top + R)) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      touch.x = dx; touch.y = dy;
      knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    base.addEventListener('pointerdown', e => {
      pid = e.pointerId; touch.active = true;
      base.setPointerCapture(pid); move(e); e.preventDefault();
    });
    base.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
    const end = e => {
      if (e.pointerId !== pid) return;
      pid = null; touch.active = false; touch.x = 0; touch.y = 0;
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  };

  // ── Датчик наклона: сырые значения → -1..1 ───────────────────
  function tiltVector() {
    const h = Joy.hub, s = Joy.settings;
    if (!h.connected || h.tiltPort === null) return { x: 0, y: 0 };
    let x = (h.rawX - s.offX) / MAX_ANGLE;
    let y = (h.rawY - s.offY) / MAX_ANGLE;
    if (s.swap) { const t = x; x = y; y = t; }
    if (s.invX) x = -x;
    if (s.invY) y = -y;
    return { x, y };
  }

  function shape(v) {
    const a = Math.abs(v);
    if (a < DEADZONE) return 0;
    return Math.sign(v) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
  }

  // Вызывается игровым циклом каждый кадр
  // Дальномер без датчика: стрелки ↑/↓ (или экранный стик) двигают «руку» ближе/дальше
  let manualDist = 1;
  function distTarget(dt, keyY) {
    const h = Joy.hub, s = Joy.settings;
    if (h.connected && h.distPort !== null && h.rawDist !== null) {
      const span = (s.distFar - s.distNear) || 1;
      return G_clamp((h.rawDist - s.distNear) / span);
    }
    manualDist = G_clamp(manualDist + keyY * 1.3 * dt);
    return manualDist;
  }
  function G_clamp(v) { return Math.max(0, Math.min(1, v)); }

  Joy.hasDistanceSensor = function () {
    return Joy.hub.connected && Joy.hub.distPort !== null;
  };

  // Запомнить текущее показание дальномера как «близко» или «далеко»
  Joy.calibrateDist = function (which) {
    if (Joy.hub.rawDist === null) return;
    if (which === 'near') Joy.settings.distNear = Joy.hub.rawDist;
    else Joy.settings.distFar = Joy.hub.rawDist;
    saveSettings();
  };

  Joy.update = function (dt = 1 / 60) {
    let x = 0, y = 0;
    if (keys.has('L')) x -= 1;
    if (keys.has('R')) x += 1;
    if (keys.has('U')) y -= 1;
    if (keys.has('D')) y += 1;
    if (touch.active) { x += touch.x; y += touch.y; }
    // дальномер: сглаживаем, потому что датчик немного «дрожит»
    const target = distTarget(dt, Math.max(-1, Math.min(1, y)));
    Joy.dist += (target - Joy.dist) * (1 - Math.exp(-dt * 12));
    const t = tiltVector();
    x += t.x; y += t.y;
    Joy.x = shape(Math.max(-1, Math.min(1, x)));
    Joy.y = shape(Math.max(-1, Math.min(1, y)));
  };

  // Текущее положение = «ровно»
  Joy.calibrate = function () {
    Joy.settings.offX = Joy.hub.rawX;
    Joy.settings.offY = Joy.hub.rawY;
    saveSettings();
  };

  // ── Интеграция с WeDo модулем ────────────────────────────────
  if (typeof WeDo !== 'undefined') {
    WeDo.onStatus(st => {
      Joy.hub.connected = st.connected;
      Joy.hub.connecting = st.connecting;
      Joy.hub.name = st.name || '';
      Joy.hub.tiltPort = st.tilt.port;
      Joy.hub.distPort = st.distance.port;
      if (st.distance.port === null) Joy.hub.rawDist = null;
      Joy._emit();
    });

    WeDo.onSensor(data => {
      if (data.type === 'tilt') {
        Joy.hub.rawX = data.x;
        Joy.hub.rawY = data.y;
        Joy.hub.tiltPort = data.port;
        Joy._emit();
      } else if (data.type === 'distance' && data.port !== 'sim') {
        Joy.hub.rawDist = data.raw !== undefined ? data.raw : data.value;
        Joy.hub.distPort = data.port;
      }
    });

    Joy.connect = async function () {
      return WeDo.connect();
    };

    Joy.disconnect = function () {
      WeDo.disconnect();
    };

    // Игры вызывают setLed каждый кадр — шлём на хаб только смену цвета
    let lastLed = -1;
    Joy.setLed = function (color) {
      if (color === lastLed) return;
      lastLed = color;
      WeDo.setLed(color);
    };
    WeDo.onStatus(st => { if (!st.connected) lastLed = -1; });
  }

  window.Joy = Joy;
})();

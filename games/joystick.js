/*
 * Джойстик для мини-игр.
 * Источники управления (работают одновременно):
 *   1) LEGO WeDo 2.0 смартхаб + датчик наклона — по Bluetooth (Web Bluetooth, Chrome/Edge);
 *   2) клавиатура — стрелки или WASD;
 *   3) экранный стик — мышью или пальцем.
 *
 * Результат: Joy.x, Joy.y в диапазоне -1..1.
 *   x: -1 влево, +1 вправо
 *   y: -1 вперёд (вверх по экрану), +1 назад (вниз по экрану)
 */
(function () {
  'use strict';

  // UUID сервисов и характеристик смартхаба WeDo 2.0
  const HUB_SERVICE  = '00001523-1212-efde-1523-785feabcd123';
  const IO_SERVICE   = '00004f0e-1212-efde-1523-785feabcd123';
  const CH_ATTACHED  = '00001527-1212-efde-1523-785feabcd123'; // подключение устройств к портам
  const CH_SENSOR    = '00001560-1212-efde-1523-785feabcd123'; // значения датчиков
  const CH_INPUT_CMD = '00001563-1212-efde-1523-785feabcd123'; // настройка режима датчика
  const CH_OUTPUT    = '00001565-1212-efde-1523-785feabcd123'; // моторы, светодиод

  const TYPE_TILT = 0x22;   // датчик наклона
  const MAX_ANGLE = 30;     // наклон (в «сырых» единицах) = полный ход стика
  const DEADZONE  = 0.18;

  const SETTINGS_KEY = 'wedo-joystick-settings';

  const Joy = {
    x: 0, y: 0,
    hub: { connected: false, connecting: false, name: '', tiltPort: null, rawX: 0, rawY: 0 },
    settings: { swap: false, invX: false, invY: false, offX: 0, offY: 0 },
    listeners: [],
    onStatus(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach(fn => { try { fn(this.hub); } catch (e) { console.error(e); } }); },
    bluetoothSupported: !!(navigator.bluetooth && navigator.bluetooth.requestDevice),
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
  Joy.update = function () {
    let x = 0, y = 0;
    if (keys.has('L')) x -= 1;
    if (keys.has('R')) x += 1;
    if (keys.has('U')) y -= 1;
    if (keys.has('D')) y += 1;
    if (touch.active) { x += touch.x; y += touch.y; }
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

  // ── Bluetooth ────────────────────────────────────────────────
  let device = null, inputCmd = null, outputCmd = null, lastLed = -1;
  let writeChain = Promise.resolve();

  // GATT не любит параллельные записи — выстраиваем их в очередь
  function write(ch, bytes) {
    if (!ch) return Promise.resolve();
    writeChain = writeChain
      .then(() => ch.writeValue(new Uint8Array(bytes)))
      .catch(e => console.warn('WeDo write failed', e));
    return writeChain;
  }

  function onAttached(event) {
    const v = new Uint8Array(event.target.value.buffer);
    const port = v[0], attached = v[1] === 1, type = v[3];
    if (attached && type === TYPE_TILT) {
      Joy.hub.tiltPort = port;
      // режим 0 = угол наклона (X и Y), интервал 1, единицы «сырые», уведомления вкл.
      write(inputCmd, [0x01, 0x02, port, TYPE_TILT, 0x00, 0x01, 0, 0, 0, 0x00, 0x01]);
      Joy._emit();
    } else if (!attached && port === Joy.hub.tiltPort) {
      Joy.hub.tiltPort = null;
      Joy.hub.rawX = Joy.hub.rawY = 0;
      Joy._emit();
    }
  }

  function onSensor(event) {
    const dv = event.target.value;
    if (dv.byteLength < 4) return;
    const port = dv.getUint8(1);
    if (port !== Joy.hub.tiltPort) return;
    Joy.hub.rawX = dv.getInt8(2);
    Joy.hub.rawY = dv.getInt8(3);
  }

  function onDisconnected() {
    lastLed = -1;
    Object.assign(Joy.hub, { connected: false, connecting: false, tiltPort: null, rawX: 0, rawY: 0 });
    inputCmd = outputCmd = null;
    Joy._emit();
  }

  Joy.connect = async function () {
    if (!Joy.bluetoothSupported) throw new Error('Этот браузер не умеет Bluetooth. Открой страницу в Chrome или Edge на компьютере/Android.');
    Joy.hub.connecting = true; Joy._emit();
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HUB_SERVICE] }, { namePrefix: 'LPF2' }],
        optionalServices: [HUB_SERVICE, IO_SERVICE],
      });
      device.addEventListener('gattserverdisconnected', onDisconnected);
      const server = await device.gatt.connect();
      const hubSvc = await server.getPrimaryService(HUB_SERVICE);
      const ioSvc  = await server.getPrimaryService(IO_SERVICE);
      inputCmd  = await ioSvc.getCharacteristic(CH_INPUT_CMD);
      outputCmd = await ioSvc.getCharacteristic(CH_OUTPUT);

      const sensor = await ioSvc.getCharacteristic(CH_SENSOR);
      sensor.addEventListener('characteristicvaluechanged', onSensor);
      await sensor.startNotifications();

      const attached = await hubSvc.getCharacteristic(CH_ATTACHED);
      attached.addEventListener('characteristicvaluechanged', onAttached);
      await attached.startNotifications();

      Object.assign(Joy.hub, { connected: true, connecting: false, name: device.name || 'WeDo 2.0' });
      Joy._emit();
      Joy.setLed(6);
    } catch (e) {
      Joy.hub.connecting = false;
      if (device && device.gatt.connected) device.gatt.disconnect();
      Joy._emit();
      throw e;
    }
  };

  Joy.disconnect = function () {
    if (device && device.gatt.connected) device.gatt.disconnect();
  };

  /* Цвет светодиода смартхаба:
     0 выкл, 1 розовый, 2 фиолетовый, 3 синий, 4 голубой, 5 бирюзовый,
     6 зелёный, 7 жёлтый, 8 оранжевый, 9 красный, 10 белый */
  Joy.setLed = function (color) {
    if (!Joy.hub.connected || color === lastLed) return;
    lastLed = color;
    write(inputCmd, [0x06, 0x17, 0x01, 0x01]);
    write(outputCmd, [0x06, 0x04, 0x01, color]);
  };

  window.Joy = Joy;
})();

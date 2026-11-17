/*
 * programming/runtime.js
 * Среда выполнения визуальных программ LEGO WeDo 2.0.
 * Поддерживает:
 *  - Параллельные потоки событий (Старт, Клавиши, Наклон, Расстояние)
 *  - Подсветку активного блока на поле (highlightBlock)
 *  - Асинхронные команды и безопасные циклы (не вешают вкладку)
 *  - Режимы «Старт», «Пауза», «Стоп» и «По шагам»
 *  - Генерацию звуков через Web Audio API
 */

(function () {
  'use strict';

  // ── Web Audio API: синтезатор звуков ────────────────────────
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.2) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function playSoundEffect(name) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    switch (name) {
      case 'beep': // короткий чистый писк WeDo
        playTone(700, 0.15, 'sine', 0.25);
        break;

      case 'siren': { // двухтональная сирена
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.12, now);
        // Модуляция частоты
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(600, now + 0.25);
        osc.frequency.setValueAtTime(800, now + 0.5);
        osc.frequency.setValueAtTime(600, now + 0.75);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 1.0);
        break;
      }

      case 'motor': { // урчание и разгон мотора
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.18, now);
        osc.frequency.setValueAtTime(70, now);
        osc.frequency.linearRampToValueAtTime(160, now + 0.6);
        osc.frequency.linearRampToValueAtTime(80, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 1.2);
        break;
      }

      case 'cheer': // победный аккорд
      case 'victory': {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          setTimeout(() => {
            playTone(freq, 0.35, 'triangle', 0.2);
          }, idx * 110);
        });
        break;
      }

      case 'laser': { // sci-fi лазер
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.15, now);
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.3);
        break;
      }

      default:
        playTone(500, 0.1);
        break;
    }
  }

  // ── Состояние Runtime ───────────────────────────────────────
  let workspace = null;
  let running = false;
  let paused = false;
  let stepMode = false;
  let stepResolver = null;
  let executionId = 0; // для отмены предыдущих запусков
  const pressedKeys = new Set();
  const activeHats = new Set();      // события, обработчик которых сейчас выполняется
  const distBelow = {};              // для «Когда расстояние меньше»: было ли уже меньше порога
  let threads = 0;

  // Запуск цепочки блоков под шапкой события как отдельного потока.
  // Пока поток события работает, повторно то же событие не запускается.
  function runThread(hat, first, execId) {
    if (!first || activeHats.has(hat.id)) return;
    activeHats.add(hat.id);
    threads++;
    executeBlock(first, execId)
      .catch(() => {})
      .finally(() => {
        if (execId !== executionId) return; // поток от прошлого запуска — счётчики уже сброшены
        activeHats.delete(hat.id);
        threads--;
        {
          try { workspace && workspace.highlightBlock(null); } catch (e) {}
          // Программа без событий закончилась сама — снимаем «выполняется»
          if (threads === 0 && !hasEventHats()) {
            running = false; paused = false; stepMode = false;
            Runtime._emitChange();
          }
        }
      });
  }

  function hasEventHats() {
    return !!workspace && workspace.getTopBlocks(false).some(b => b.type.startsWith('event_') && b.type !== 'event_start');
  }

  // Отслеживание нажатий клавиш для событий
  window.addEventListener('keydown', e => {
    pressedKeys.add(e.code);
    // Автоповтор зажатой клавиши не должен запускать событие снова и снова
    if (e.repeat) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (running && !paused) {
      Runtime.triggerEvent('key', e.code);
    }
  });
  window.addEventListener('keyup', e => {
    pressedKeys.delete(e.code);
  });

  // Отслеживание датчиков для событий
  if (typeof WeDo !== 'undefined') {
    let lastTiltDir = 'flat';
    let lastDistUnderThreshold = {};

    WeDo.onSensor(data => {
      if (!running || paused) return;

      if (data.type === 'tilt') {
        if (data.direction !== lastTiltDir) {
          lastTiltDir = data.direction;
          Runtime.triggerEvent('tilt', data.direction);
        }
      } else if (data.type === 'distance') {
        Runtime.triggerEvent('distance', data.value);
      }
    });
    WeDo.onStatus(st => {
      if (!st.connected) lastTiltDir = 'flat';
    });
  }

  // ── Исполнитель шагов блоков ────────────────────────────────
  async function beforeBlock(block, execId) {
    if (execId !== executionId) throw new Error('Canceled');

    // Подсветка блока
    if (workspace && block && block.id) {
      try {
        workspace.highlightBlock(block.id);
      } catch (e) {}
    }

    // Если на паузе — ждём снятия
    while (paused && execId === executionId) {
      await new Promise(r => setTimeout(r, 60));
    }

    if (execId !== executionId) throw new Error('Canceled');

    // Если пошаговый режим — ждём нажатия кнопки «Шаг»
    if (stepMode) {
      await new Promise(resolve => {
        stepResolver = resolve;
      });
      stepResolver = null;
    } else {
      // Небольшая задержка для визуализации перемещения подсветки
      await new Promise(r => setTimeout(r, 80));
    }

    if (execId !== executionId) throw new Error('Canceled');
  }

  // Рекурсивное выполнение блока и его цепочки
  async function executeBlock(block, execId) {
    if (!block || execId !== executionId || !running) return;

    await beforeBlock(block, execId);

    const type = block.type;

    switch (type) {
      // ── Моторы ──
      case 'motor_on': {
        const port = block.getFieldValue('PORT');
        const dir = block.getFieldValue('DIR');
        const pwr = Number(block.getFieldValue('POWER')) || 5;
        const signed = (dir === 'left' ? -pwr : pwr);
        if (window.WeDo) window.WeDo.setMotorPower(port, signed);
        break;
      }
      case 'motor_on_for': {
        const port = block.getFieldValue('PORT');
        const dir = block.getFieldValue('DIR');
        const pwr = Number(block.getFieldValue('POWER')) || 5;
        const sec = Number(block.getFieldValue('SECONDS')) || 2;
        const signed = (dir === 'left' ? -pwr : pwr);
        if (window.WeDo) window.WeDo.setMotorPower(port, signed);
        await sleepWithCancel(sec * 1000, execId);
        if (window.WeDo) window.WeDo.stopMotor(port);
        break;
      }
      case 'motor_stop': {
        const port = block.getFieldValue('PORT');
        if (window.WeDo) window.WeDo.stopMotor(port);
        break;
      }
      case 'motor_stop_all': {
        if (window.WeDo) window.WeDo.stopAllMotors();
        break;
      }

      // ── Ожидание ──
      case 'wait_seconds': {
        const sec = Number(block.getFieldValue('SECONDS')) || 1;
        await sleepWithCancel(sec * 1000, execId);
        break;
      }
      case 'wait_distance': {
        const target = Number(block.getFieldValue('DIST')) || 5;
        while (running && execId === executionId) {
          const current = (window.WeDo ? window.WeDo.getDistance() : 10);
          if (current < target) break;
          await sleepWithCancel(50, execId);
        }
        break;
      }
      case 'wait_tilt': {
        const target = block.getFieldValue('DIR');
        while (running && execId === executionId) {
          const t = (window.WeDo ? window.WeDo.getTilt() : { direction: 'flat' });
          if (t.direction === target) break;
          await sleepWithCancel(50, execId);
        }
        break;
      }

      // ── Повторы и условия ──
      case 'repeat_times': {
        const times = Number(block.getFieldValue('TIMES')) || 3;
        const doBlock = block.getInputTargetBlock('DO');
        for (let i = 0; i < times && running && execId === executionId; i++) {
          if (doBlock) {
            await executeBlock(doBlock, execId);
          }
          await sleepWithCancel(16, execId);
        }
        break;
      }
      case 'repeat_forever': {
        const doBlock = block.getInputTargetBlock('DO');
        while (running && execId === executionId) {
          if (doBlock) {
            await executeBlock(doBlock, execId);
          }
          await sleepWithCancel(20, execId); // предотвращение зависания
        }
        break;
      }
      case 'if_condition': {
        const condBlock = block.getInputTargetBlock('CONDITION');
        const condVal = evaluateCondition(condBlock);
        const branch = condVal ? block.getInputTargetBlock('DO') : block.getInputTargetBlock('ELSE');
        if (branch) {
          await executeBlock(branch, execId);
        }
        break;
      }

      // ── Свет и звук ──
      case 'hub_set_led': {
        const color = Number(block.getFieldValue('COLOR')) || 0;
        if (window.WeDo) window.WeDo.setLed(color);
        break;
      }
      case 'play_sound': {
        const snd = block.getFieldValue('SOUND');
        playSoundEffect(snd);
        break;
      }
    }

    // Переход к следующему блоку в последовательности
    const next = block.getNextBlock();
    if (next && running && execId === executionId) {
      await executeBlock(next, execId);
    }
  }

  function evaluateCondition(condBlock) {
    if (!condBlock) return false;
    const type = condBlock.type;
    if (type === 'condition_tilt') {
      const target = condBlock.getFieldValue('DIR');
      const cur = window.WeDo ? window.WeDo.getTilt() : { direction: 'flat' };
      return cur.direction === target;
    }
    if (type === 'condition_distance') {
      const target = Number(condBlock.getFieldValue('DIST')) || 5;
      const cur = window.WeDo ? window.WeDo.getDistance() : 10;
      return cur < target;
    }
    if (type === 'condition_key') {
      const key = condBlock.getFieldValue('KEY');
      return pressedKeys.has(key);
    }
    return false;
  }

  async function sleepWithCancel(ms, execId) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (execId !== executionId || !running) throw new Error('Canceled');
      while (paused && execId === executionId) {
        await new Promise(r => setTimeout(r, 50));
      }
      const remain = Math.min(50, end - Date.now());
      if (remain > 0) await new Promise(r => setTimeout(r, remain));
    }
  }

  // ── Публичный интерфейс Runtime ──────────────────────────────
  const Runtime = {
    init(ws) {
      workspace = ws;
    },

    setWorkspace(ws) {
      workspace = ws;
    },

    isRunning() {
      return running;
    },

    isPaused() {
      return paused;
    },

    isStepMode() {
      return stepMode;
    },

    // Запуск программы
    start() {
      if (!workspace) return;
      executionId++;
      running = true;
      paused = false;
      stepMode = false;
      const currentExec = executionId;

      this._emitChange();

      const topBlocks = workspace.getTopBlocks(true);

      // Запускаем все блоки 'event_start' или обычные блоки, лежащие без событий
      activeHats.clear();
      threads = 0;
      Object.keys(distBelow).forEach(k => delete distBelow[k]);
      topBlocks.forEach(b => {
        if (b.type === 'event_start') {
          runThread(b, b.getNextBlock(), currentExec);
        } else if (!b.type.startsWith('event_')) {
          // Если блок не шапка события — запускаем сразу
          runThread(b, b, currentExec);
        }
      });
      // Пустая программа без событий — сразу «готово»
      if (threads === 0 && !hasEventHats()) {
        running = false;
        this._emitChange();
      }
    },

    // Пауза / Возобновление
    togglePause() {
      if (!running) return;
      paused = !paused;
      this._emitChange();
    },

    // Шаг по программе
    step() {
      if (!running) {
        // Если еще не запущено — стартуем в пошаговом режиме
        stepMode = true;
        this.start();
        stepMode = true;
        this._emitChange();
        return;
      }
      stepMode = true;
      paused = false;
      if (stepResolver) {
        stepResolver();
      }
      this._emitChange();
    },

    // Остановка
    stop() {
      executionId++;
      running = false;
      paused = false;
      stepMode = false;
      if (stepResolver) {
        stepResolver();
        stepResolver = null;
      }
      if (workspace) {
        try {
          workspace.highlightBlock(null);
        } catch (e) {}
      }
      if (window.WeDo) {
        window.WeDo.stopAllMotors();
      }
      this._emitChange();
    },

    // Срабатывание событий (клавиша, наклон, расстояние)
    triggerEvent(eventType, value) {
      if (!running || !workspace) return;
      const currentExec = executionId;
      const topBlocks = workspace.getTopBlocks(true);

      topBlocks.forEach(b => {
        if (eventType === 'key' && b.type === 'event_key') {
          if (b.getFieldValue('KEY') === value) runThread(b, b.getNextBlock(), currentExec);
        } else if (eventType === 'tilt' && b.type === 'event_tilt') {
          if (b.getFieldValue('DIR') === value) runThread(b, b.getNextBlock(), currentExec);
        } else if (eventType === 'distance' && b.type === 'event_distance') {
          // Срабатывает один раз, когда расстояние стало меньше порога
          // (а не на каждое измерение, пока рука рядом)
          const threshold = Number(b.getFieldValue('DIST')) || 5;
          const below = value < threshold;
          if (below && !distBelow[b.id]) runThread(b, b.getNextBlock(), currentExec);
          distBelow[b.id] = below;
        }
      });
    },

    // Звуки
    playSound(name) {
      playSoundEffect(name);
    },

    // Слушатели состояния Runtime
    _listeners: [],
    onStateChange(fn) {
      this._listeners.push(fn);
    },
    _emitChange() {
      const st = { running, paused, stepMode };
      this._listeners.forEach(fn => {
        try { fn(st); } catch (e) {}
      });
    }
  };

  window.WeDoRuntime = Runtime;
})();

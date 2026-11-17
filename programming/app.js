/*
 * programming/app.js
 * Основной контроллер раздела «Программирование WeDo 2.0».
 * Объединяет Blockly, модуль связи WeDo, пульт управления и симулятор.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'wedo-blocks-autosave';
  const SETTINGS_KEY = 'wedo-remote-settings';

  // Состояние пульта и пресеты
  const PRESETS = {
    car: {
      name: 'Машинка (2 мотора)',
      hold: true,
      bindings: [
        { key: 'ArrowUp', label: '↑ Вперёд', port: 'A+B', action: 'forward', power: 8, desc: 'Оба мотора вперёд' },
        { key: 'ArrowDown', label: '↓ Назад', port: 'A+B', action: 'backward', power: 8, desc: 'Оба мотора назад' },
        { key: 'ArrowLeft', label: '← Влево', port: 'A+B', action: 'turn-left', power: 7, desc: 'Мотор A назад, B вперёд' },
        { key: 'ArrowRight', label: '→ Вправо', port: 'A+B', action: 'turn-right', power: 7, desc: 'Мотор A вперёд, B назад' },
        { key: 'Space', label: 'Пробел', port: 'A+B', action: 'stop', power: 0, desc: 'Остановить оба мотора' }
      ]
    },
    crane: {
      name: 'Кран (подъём + поворот)',
      hold: true,
      bindings: [
        { key: 'ArrowUp', label: '↑ Подъём', port: 'A', action: 'forward', power: 7, desc: 'Лебёдка вверх (Мотор A)' },
        { key: 'ArrowDown', label: '↓ Спуск', port: 'A', action: 'backward', power: 7, desc: 'Лебёдка вниз (Мотор A)' },
        { key: 'ArrowLeft', label: '← Поворот стрелы', port: 'B', action: 'backward', power: 5, desc: 'Стрела влево (Мотор B)' },
        { key: 'ArrowRight', label: '→ Поворот стрелы', port: 'B', action: 'forward', power: 5, desc: 'Стрела вправо (Мотор B)' },
        { key: 'Space', label: 'Пробел', port: 'A+B', action: 'stop', power: 0, desc: 'Стоп' }
      ]
    },
    fan: {
      name: 'Вентилятор (скорость + / −)',
      hold: false,
      bindings: [
        { key: 'ArrowUp', label: '↑ Быстрее', port: 'A', action: 'speed-up', power: 10, desc: 'Вращение вправо ↻ на макс. скорости' },
        { key: 'ArrowDown', label: '↓ Медленнее', port: 'A', action: 'speed-down', power: 4, desc: 'Вращение вправо ↻ на тихом ходу' },
        { key: 'ArrowLeft', label: '← Реверс', port: 'A', action: 'backward', power: 7, desc: 'Вращение влево ↺' },
        { key: 'ArrowRight', label: '→ Прямой ход', port: 'A', action: 'forward', power: 7, desc: 'Вращение вправо ↻' },
        { key: 'Space', label: 'Пробел', port: 'A', action: 'stop', power: 0, desc: 'Выключить вентилятор' }
      ]
    },
    custom: {
      name: 'Своя настройка',
      hold: true,
      bindings: [
        { key: 'ArrowUp', label: '↑ Вперёд', port: 'A', action: 'forward', power: 8, desc: 'Мотор A вперёд' },
        { key: 'ArrowDown', label: '↓ Назад', port: 'A', action: 'backward', power: 8, desc: 'Мотор A назад' },
        { key: 'ArrowLeft', label: '← Мотор B', port: 'B', action: 'backward', power: 8, desc: 'Мотор B назад' },
        { key: 'ArrowRight', label: '→ Мотор B', port: 'B', action: 'forward', power: 8, desc: 'Мотор B вперёд' },
        { key: 'Space', label: 'Пробел', port: 'A+B', action: 'stop', power: 0, desc: 'Стоп' }
      ]
    }
  };

  let currentPresetId = 'car';
  let holdMode = true;
  let activeKeys = new Set();

  let blocklyWorkspace = null;
  let showJsCode = false;
  let isAdvancedMode = false;

  // Углы шестерёнок для анимации симулятора
  let angleGearA = 0;
  let angleGearB = 0;
  let lastAnimTime = performance.now();

  // ── Инициализация ──────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initWeDoUI();
    initMotorsTab();
    initSensorsUI();
    initRemoteTab();
    initBlockly();
    initExamplesModal();
    initHashRouting();
    startSimulationLoop();
  });

  // ── 1. НАВИГАЦИЯ ПО ВКЛАДКАМ ────────────────────────────────
  function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const pages = document.querySelectorAll('.page-tab');

    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.tab;
        switchTab(targetId);
      });
    });
  }

  function switchTab(targetId) {
    // Уходим с вкладки «Пульт» с зажатой клавишей — мотор не должен остаться включённым
    if (targetId !== 'tab-remote' && activeKeys.size) {
      activeKeys.clear();
      WeDo.stopAllMotors();
    }
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === targetId);
    });
    document.querySelectorAll('.page-tab').forEach(p => {
      p.classList.toggle('active', p.id === targetId);
    });

    // При открытии вкладки с Blockly необходимо вызвать resize, чтобы канвас отрисовался ровно
    if (targetId === 'tab-blocks' && blocklyWorkspace) {
      setTimeout(() => {
        Blockly.svgResize(blocklyWorkspace);
        updateReader();
      }, 50);
    }
  }

  window.switchTab = switchTab;

  // ── 2. ПОДКЛЮЧЕНИЕ WEDO И СТАТУС ───────────────────────────
  function initWeDoUI() {
    const headerBtn = document.getElementById('headerConnectBtn');
    const heroBtn   = document.getElementById('heroConnectBtn');

    async function toggleConnect() {
      const st = WeDo.getState();
      if (st.connected) {
        WeDo.disconnect();
      } else {
        try {
          await WeDo.connect();
        } catch (err) {
          if (err && err.name === 'NotFoundError') {
            // Пользователь просто отменил окно выбора Bluetooth
            return;
          }
          let msg = err ? err.message : String(err);
          if (!WeDo.isBluetoothSupported()) {
            msg = 'Bluetooth работает только в браузерах Google Chrome или Microsoft Edge на компьютере или Android.';
          } else if (msg.includes('User cancelled')) {
            return;
          } else {
            msg = 'Не удалось подключиться к смартхабу. Убедись, что на нём мигает огонёк, а фирменное приложение WeDo 2.0 закрыто на всех устройствах рядом.';
          }
          alert(msg);
        }
      }
    }

    if (headerBtn) headerBtn.addEventListener('click', toggleConnect);
    if (heroBtn)   heroBtn.addEventListener('click', toggleConnect);

    // Слушатель статуса WeDo
    WeDo.onStatus(updateStatusUI);
    WeDo.onPorts(updatePortsUI);
    WeDo.onMotor(updateMotorUIFromEvent);
    WeDo.onSensor(updateSensorUIFromEvent);

    updateStatusUI(WeDo.getState());
  }

  function updateStatusUI(st) {
    const dot = document.getElementById('headerConnDot');
    const txt = document.getElementById('headerConnText');
    const hBtn = document.getElementById('headerConnectBtn');
    const heroBtn = document.getElementById('heroConnectBtn');
    const heroTitle = document.getElementById('hubHeroTitle');
    const heroSub = document.getElementById('hubHeroSubtitle');
    const ledPreview = document.getElementById('headerLedPreview');
    const progLed = document.getElementById('progLedStatus');
    const progLedName = document.getElementById('progLedColorName');

    // Цвет светодиода
    const colors = WeDo.getLedColorsList();
    const curCol = colors[st.ledColor] || colors[6];
    if (ledPreview) {
      ledPreview.style.background = curCol.hex;
      ledPreview.style.boxShadow = `0 0 10px ${curCol.hex}`;
    }
    if (progLed) {
      progLed.style.background = curCol.hex;
      progLed.style.boxShadow = `0 0 10px ${curCol.hex}`;
    }
    if (progLedName) {
      progLedName.textContent = curCol.name;
    }

    if (st.connecting) {
      if (dot) dot.className = 'status-dot connecting';
      if (txt) txt.textContent = 'Поиск смартхаба…';
      if (hBtn) { hBtn.textContent = 'Подключение…'; hBtn.disabled = true; }
      if (heroBtn) { heroBtn.textContent = 'Подключение…'; heroBtn.disabled = true; }
    } else if (st.connected) {
      if (dot) dot.className = 'status-dot connected';
      if (txt) txt.textContent = `Подключён: ${st.name}`;
      if (hBtn) { hBtn.textContent = 'Отключить'; hBtn.disabled = false; hBtn.className = 'btn ghost'; }
      if (heroBtn) { heroBtn.textContent = 'Отключить смартхаб'; heroBtn.disabled = false; heroBtn.className = 'btn ghost'; }
      if (heroTitle) heroTitle.textContent = `Смартхаб «${st.name}» подключён!`;
      if (heroSub) heroSub.textContent = 'Все команды отправляются напрямую в робота по Bluetooth.';
    } else {
      if (dot) dot.className = 'status-dot';
      if (txt) txt.textContent = 'Смартхаб не подключён (симулятор)';
      if (hBtn) { hBtn.textContent = '🔵 Подключить WeDo'; hBtn.disabled = false; hBtn.className = 'btn'; }
      if (heroBtn) { heroBtn.textContent = '🔵 Подключить смартхаб'; heroBtn.disabled = false; heroBtn.className = 'btn green'; }
      if (heroTitle) heroTitle.textContent = 'Смартхаб WeDo 2.0 (Режим симулятора)';
      if (heroSub) heroSub.textContent = 'Без подключённого смартхаба всё отлично работает на экране: крутятся шестерёнки и имитируются датчики.';
    }

    updatePortsUI(WeDo.getEffectivePorts());
  }

  function updatePortsUI(ports) {
    const pA = ports.A || {};
    const pB = ports.B || {};

    const pillA = document.getElementById('pillPortA');
    const pillB = document.getElementById('pillPortB');
    if (pillA) pillA.textContent = pA.title || 'Ничего не подключено';
    if (pillB) pillB.textContent = pB.title || 'Ничего не подключено';

    const badgeA = document.getElementById('badgeMotorA');
    const badgeB = document.getElementById('badgeMotorB');
    if (badgeA) badgeA.textContent = (pA.type === 0x01 || !WeDo.getState().connected) ? 'Готов к работе' : pA.title;
    if (badgeB) badgeB.textContent = (pB.type === 0x01 || !WeDo.getState().connected) ? 'Готов к работе' : pB.title;
  }

  // ── 3. ВКЛАДКА 1: МОТОРЫ ────────────────────────────────────
  function initMotorsTab() {
    setupMotorCard('A', 'sliderPowerA', 'powerLabelA', 'btnMotorALeft', 'btnMotorAStop', 'btnMotorARight', 'checkInvertA');
    setupMotorCard('B', 'sliderPowerB', 'powerLabelB', 'btnMotorBLeft', 'btnMotorBStop', 'btnMotorBRight', 'checkInvertB');
  }

  function setupMotorCard(port, sliderId, labelId, leftBtnId, stopBtnId, rightBtnId, invertId) {
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(labelId);
    const btnL   = document.getElementById(leftBtnId);
    const btnS   = document.getElementById(stopBtnId);
    const btnR   = document.getElementById(rightBtnId);
    const checkInv = document.getElementById(invertId);

    if (slider && label) {
      slider.addEventListener('input', () => {
        label.textContent = slider.value;
      });
    }

    if (checkInv) {
      checkInv.addEventListener('change', () => {
        WeDo.setMotorInverted(port, checkInv.checked);
      });
    }

    // Запуск мотора при удержании кнопки
    function startRun(dir) {
      const pwr = Number(slider.value) || 5;
      const signed = (dir === 'left' ? -pwr : pwr);
      WeDo.setMotorPower(port, signed);
    }

    function stopRun() {
      WeDo.stopMotor(port);
    }

    if (btnL) {
      btnL.addEventListener('pointerdown', (e) => { e.preventDefault(); startRun('left'); });
      btnL.addEventListener('pointerup', stopRun);
      btnL.addEventListener('pointercancel', stopRun);
      btnL.addEventListener('pointerleave', stopRun);
    }

    if (btnR) {
      btnR.addEventListener('pointerdown', (e) => { e.preventDefault(); startRun('right'); });
      btnR.addEventListener('pointerup', stopRun);
      btnR.addEventListener('pointercancel', stopRun);
      btnR.addEventListener('pointerleave', stopRun);
    }

    if (btnS) {
      btnS.addEventListener('click', stopRun);
    }
  }

  function updateMotorUIFromEvent(data) {
    const port = data.port;
    const pwr = data.power;
    const txt = document.getElementById(`motorSpeedText${port}`);
    const progTxt = document.getElementById(`progMotor${port}Status`);

    let desc = 'Стоп (мощность 0)';
    if (pwr > 0) {
      desc = `↻ Вправо: мощность ${Math.abs(pwr / 10)}`;
    } else if (pwr < 0) {
      desc = `↺ Влево: мощность ${Math.abs(pwr / 10)}`;
    }

    if (txt) txt.textContent = desc;
    if (progTxt) progTxt.textContent = desc;
  }

  // ── 4. ДАТЧИКИ И СИМУЛЯТОР ДАТЧИКОВ ─────────────────────────
  function initSensorsUI() {
    // Кнопки симулятора наклона
    document.querySelectorAll('.btn-sim-tilt').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.dir;
        WeDo.setSimulatedTilt(dir);
        updateTiltUI(dir);
      });
    });

    // Ползунок симулятора расстояния
    const distSlider = document.getElementById('simDistanceSlider');
    if (distSlider) {
      distSlider.addEventListener('input', () => {
        const val = Number(distSlider.value);
        WeDo.setSimulatedDistance(val);
        updateDistanceUI(val);
      });
    }
  }

  function updateSensorUIFromEvent(data) {
    if (data.type === 'tilt') {
      updateTiltUI(data.direction);
    } else if (data.type === 'distance') {
      updateDistanceUI(data.value);
    }
  }

  function updateTiltUI(dir) {
    const icon = document.getElementById('tiltArrowIcon');
    const badge = document.getElementById('tiltStateBadge');
    if (!icon || !badge) return;

    const MAP = {
      flat:     { icon: '⚖️', text: 'Ровно', transform: 'rotate(0deg)' },
      forward:  { icon: '⬆', text: 'Вперёд', transform: 'translateY(-12px)' },
      backward: { icon: '⬇', text: 'Назад', transform: 'translateY(12px)' },
      left:     { icon: '⬅', text: 'Влево', transform: 'translateX(-12px)' },
      right:    { icon: '➡', text: 'Вправо', transform: 'translateX(12px)' }
    };

    const cur = MAP[dir] || MAP.flat;
    icon.textContent = cur.icon;
    icon.style.transform = cur.transform;
    badge.textContent = cur.text;
  }

  function updateDistanceUI(val) {
    const bar = document.getElementById('distanceProgressBar');
    const numBadge = document.getElementById('distanceValBadge');
    const progBadge = document.getElementById('progDistanceStatus');

    const pct = Math.max(0, Math.min(10, val)) * 10;
    if (bar) bar.style.width = `${pct}%`;

    let label = `${val} (Свободно)`;
    if (val <= 2) label = `${val} (Очень близко!)`;
    else if (val <= 5) label = `${val} (Видит препятствие)`;

    if (numBadge) numBadge.textContent = `Расстояние: ${label}`;
    if (progBadge) progBadge.textContent = label;
  }

  // ── 5. ВКЛАДКА 2: ПУЛЬТ ─────────────────────────────────────
  function initRemoteTab() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPresetId = btn.dataset.preset;
        applyPreset(currentPresetId);
      });
    });

    const holdCheck = document.getElementById('checkHoldMode');
    if (holdCheck) {
      holdCheck.addEventListener('change', () => {
        holdMode = holdCheck.checked;
      });
    }

    // Клавиатура для пульта
    window.addEventListener('keydown', handleRemoteKeyDown);
    window.addEventListener('keyup', handleRemoteKeyUp);
    window.addEventListener('blur', () => {
      if (holdMode) {
        activeKeys.clear();
        WeDo.stopAllMotors();
      }
    });

    // Экранный пульт (геймпад)
    setupScreenGamepad();

    // Первичная отрисовка таблицы
    applyPreset('car');
  }

  function applyPreset(presetId) {
    const p = PRESETS[presetId] || PRESETS.car;
    holdMode = p.hold;
    const holdCheck = document.getElementById('checkHoldMode');
    if (holdCheck) holdCheck.checked = holdMode;

    const tbody = document.getElementById('keyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    p.bindings.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="kbd-badge">${b.label}</span></td>
        <td><b>Порт ${b.port}</b></td>
        <td>${b.desc}</td>
        <td>${b.power ? b.power : '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function remoteTabActive() {
    const tab = document.getElementById('tab-remote');
    return !!tab && tab.classList.contains('active');
  }

  function handleRemoteKeyDown(e) {
    // Пульт слушает клавиши только на своей вкладке — иначе он перебивал бы программу
    if (!remoteTabActive()) return;
    // Если фокус в текстовом поле ввода или модальном окне — не перехватываем
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;

    const code = e.code;
    const p = PRESETS[currentPresetId] || PRESETS.car;
    const binding = p.bindings.find(b => b.key === code);

    if (binding) {
      e.preventDefault();
      if (!activeKeys.has(code)) {
        activeKeys.add(code);
        executeRemoteAction(binding.action, binding.port, binding.power);
        highlightDpadButton(code, true);
      }
    }
  }

  function handleRemoteKeyUp(e) {
    const code = e.code;
    if (activeKeys.has(code)) {
      activeKeys.delete(code);
      highlightDpadButton(code, false);

      if (holdMode) {
        // Если все клавиши отпущены — останавливаем
        if (activeKeys.size === 0) {
          WeDo.stopAllMotors();
        } else {
          // Иначе выполняем действие последней удерживаемой клавиши
          const lastCode = Array.from(activeKeys).pop();
          const p = PRESETS[currentPresetId] || PRESETS.car;
          const binding = p.bindings.find(b => b.key === lastCode);
          if (binding) {
            executeRemoteAction(binding.action, binding.port, binding.power);
          }
        }
      }
    }
  }

  function executeRemoteAction(action, port, power) {
    switch (action) {
      case 'forward':
        if (port === 'A+B') {
          WeDo.setMotorPower('A', power);
          WeDo.setMotorPower('B', power);
        } else {
          WeDo.setMotorPower(port, power);
        }
        break;

      case 'backward':
        if (port === 'A+B') {
          WeDo.setMotorPower('A', -power);
          WeDo.setMotorPower('B', -power);
        } else {
          WeDo.setMotorPower(port, -power);
        }
        break;

      case 'turn-left':
        WeDo.setMotorPower('A', -power);
        WeDo.setMotorPower('B', power);
        break;

      case 'turn-right':
        WeDo.setMotorPower('A', power);
        WeDo.setMotorPower('B', -power);
        break;

      case 'speed-up':
        WeDo.setMotorPower('A', 10);
        break;

      case 'speed-down':
        WeDo.setMotorPower('A', 4);
        break;

      case 'stop':
      default:
        if (port === 'A+B') WeDo.stopAllMotors();
        else WeDo.stopMotor(port);
        break;
    }
  }

  function highlightDpadButton(code, pressed) {
    const btn = document.querySelector(`.dpad-btn[data-code="${code}"]`);
    if (btn) btn.classList.toggle('pressed', pressed);
  }

  function setupScreenGamepad() {
    const dpadBtns = document.querySelectorAll('.dpad-btn');
    dpadBtns.forEach(btn => {
      const code = btn.dataset.code;

      function startPress(e) {
        e.preventDefault();
        btn.classList.add('pressed');
        const p = PRESETS[currentPresetId] || PRESETS.car;
        const binding = p.bindings.find(b => b.key === code);
        if (binding) {
          executeRemoteAction(binding.action, binding.port, binding.power);
        }
      }

      function endPress() {
        btn.classList.remove('pressed');
        if (holdMode) {
          WeDo.stopAllMotors();
        }
      }

      btn.addEventListener('pointerdown', startPress);
      btn.addEventListener('pointerup', endPress);
      btn.addEventListener('pointercancel', endPress);
      btn.addEventListener('pointerleave', endPress);
    });

    // Экранные кнопки моторов A и B
    const padA = document.getElementById('padMotorAAction');
    const padB = document.getElementById('padMotorBAction');

    if (padA) {
      padA.addEventListener('pointerdown', (e) => { e.preventDefault(); WeDo.setMotorPower('A', 8); padA.classList.add('pressed'); });
      padA.addEventListener('pointerup', () => { WeDo.stopMotor('A'); padA.classList.remove('pressed'); });
      padA.addEventListener('pointerleave', () => { WeDo.stopMotor('A'); padA.classList.remove('pressed'); });
    }
    if (padB) {
      padB.addEventListener('pointerdown', (e) => { e.preventDefault(); WeDo.setMotorPower('B', 8); padB.classList.add('pressed'); });
      padB.addEventListener('pointerup', () => { WeDo.stopMotor('B'); padB.classList.remove('pressed'); });
      padB.addEventListener('pointerleave', () => { WeDo.stopMotor('B'); padB.classList.remove('pressed'); });
    }
  }

  // ── 6. ВКЛАДКА 3: BLOCKLY И ПРОГРАММИРОВАНИЕ ─────────────────
  function initBlockly() {
    const container = document.getElementById('blocklyDiv');
    if (!container || typeof Blockly === 'undefined') {
      console.error('Контейнер Blockly не найден или библиотека не загружена');
      return;
    }

    const toolbox = isAdvancedMode 
      ? WeDoBlocks.getAdvancedToolbox() 
      : WeDoBlocks.getSimpleToolbox();

    blocklyWorkspace = Blockly.inject(container, {
      toolbox: toolbox,
      renderer: 'geras',
      collapse: true,
      comments: false,
      disable: false,
      maxBlocks: Infinity,
      trashcan: true,
      horizontalLayout: false,
      toolboxPosition: 'start',
      css: true,
      media: 'https://cdn.jsdelivr.net/npm/blockly@10.4.3/media/',
      rtl: false,
      scrollbars: true,
      sounds: true,
      oneBasedIndex: true,
      grid: {
        spacing: 24,
        length: 3,
        colour: '#E2E8F0',
        snap: true
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1.0,
        maxScale: 2.0,
        minScale: 0.5,
        scaleSpeed: 1.15
      }
    });

    WeDoRuntime.init(blocklyWorkspace);
    window.blocklyWorkspace = blocklyWorkspace;
    window.updateReader = updateReader;

    // Слушатель изменения блоков: обновление читаемого текста и автосохранение
    blocklyWorkspace.addChangeListener(e => {
      if (e.isUiEvent) return;
      updateReader();
      saveToStorage();
    });

    // Режим для продвинутых
    const checkAdv = document.getElementById('checkAdvancedMode');
    if (checkAdv) {
      checkAdv.addEventListener('change', () => {
        isAdvancedMode = checkAdv.checked;
        const newToolbox = isAdvancedMode 
          ? WeDoBlocks.getAdvancedToolbox() 
          : WeDoBlocks.getSimpleToolbox();
        blocklyWorkspace.updateToolbox(newToolbox);
      });
    }

    // Кнопки управления программой
    const runBtn  = document.getElementById('btnRunProgram');
    const pauseBtn= document.getElementById('btnPauseProgram');
    const stopBtn = document.getElementById('btnStopProgram');
    const stepBtn = document.getElementById('btnStepProgram');

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        WeDoRuntime.start();
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        WeDoRuntime.togglePause();
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        WeDoRuntime.stop();
      });
    }

    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        WeDoRuntime.step();
      });
    }

    // Слушатель изменения состояния Runtime (кнопки)
    WeDoRuntime.onStateChange(st => {
      if (runBtn) {
        runBtn.disabled = st.running && !st.paused;
      }
      if (pauseBtn) {
        pauseBtn.disabled = !st.running;
        pauseBtn.textContent = st.paused ? '▶ Продолжить' : '⏸ Пауза';
      }
      if (stopBtn) {
        stopBtn.disabled = !st.running;
      }
    });

    // Переключение текста программы и кода JS
    const toggleCodeBtn = document.getElementById('btnToggleCodeView');
    if (toggleCodeBtn) {
      toggleCodeBtn.addEventListener('click', () => {
        showJsCode = !showJsCode;
        toggleCodeBtn.textContent = showJsCode ? 'Показать текст' : 'Показать JS-код';
        const title = document.getElementById('readerTitle');
        if (title) title.textContent = showJsCode ? '💻 Код JavaScript' : '📖 Как читается программа';
        updateReader();
      });
    }

    // Скачивание и загрузка JSON
    const dlBtn = document.getElementById('btnDownloadProgram');
    const ulBtn = document.getElementById('btnUploadProgram');
    const fileInput = document.getElementById('fileProgramInput');
    const clearBtn = document.getElementById('btnClearProgram');

    if (dlBtn) {
      dlBtn.addEventListener('click', downloadProgramJson);
    }

    if (ulBtn && fileInput) {
      ulBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', uploadProgramJson);
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Очистить рабочее поле программы?')) {
          blocklyWorkspace.clear();
          saveToStorage();
        }
      });
    }

    // Загрузка сохранённого состояния или примера по умолчанию (если нет #lesson-N в адресе)
    if (!window.location.hash || !window.location.hash.startsWith('#lesson-')) {
      loadFromStorageOrInitial();
    }
  }

  // Обновление панели читаемости
  function updateReader() {
    const body = document.getElementById('readerBody');
    if (!body || !blocklyWorkspace) return;

    if (showJsCode) {
      body.classList.add('js-code');
      body.textContent = ProgramReader.toJavaScript(blocklyWorkspace);
    } else {
      body.classList.remove('js-code');
      body.textContent = ProgramReader.toHumanText(blocklyWorkspace);
    }
  }

  // Автосохранение в localStorage
  function saveToStorage() {
    if (!blocklyWorkspace) return;
    try {
      const state = Blockly.serialization.workspaces.save(blocklyWorkspace);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Не удалось сохранить программу в localStorage', e);
    }
  }

  function loadFromStorageOrInitial() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        Blockly.serialization.workspaces.load(state, blocklyWorkspace);
        updateReader();
        return;
      }
    } catch (e) {
      console.warn('Ошибка загрузки из localStorage', e);
    }

    // Если хранилище пусто — загружаем пример урока 1 (Вентилятор)
    const ex1 = ProgramExamples.get(1);
    if (ex1) {
      ProgramExamples.loadInto(blocklyWorkspace, ex1);
      updateReader();
    }
  }

  // Скачивание .json
  function downloadProgramJson() {
    if (!blocklyWorkspace) return;
    try {
      const state = Blockly.serialization.workspaces.save(blocklyWorkspace);
      const jsonStr = JSON.stringify({
        course: 'LEGO WeDo 2.0',
        version: '1.0',
        createdAt: new Date().toISOString(),
        state: state
      }, null, 2);

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wedo-program-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка при скачивании файла: ' + e.message);
    }
  }

  // Загрузка .json
  function uploadProgramJson(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !blocklyWorkspace) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const state = parsed.state || parsed;
        blocklyWorkspace.clear();
        Blockly.serialization.workspaces.load(state, blocklyWorkspace);
        updateReader();
        saveToStorage();
        alert('Программа успешно загружена!');
      } catch (err) {
        alert('Не удалось прочитать файл программы: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // сброс
  }

  // ── 7. МОДАЛЬНОЕ ОКНО ПРИМЕРОВ ──────────────────────────────
  function initExamplesModal() {
    const modal = document.getElementById('examplesModal');
    const openBtn = document.getElementById('btnOpenExamples');
    const closeBtn = document.getElementById('modalCloseBtn');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.classList.add('open');
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('open');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    }

    // Клик по карточке примера
    document.querySelectorAll('.example-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.example;
        const ex = ProgramExamples.get(id);
        if (ex && blocklyWorkspace) {
          ProgramExamples.loadInto(blocklyWorkspace, ex);
          updateReader();
          saveToStorage();
          if (modal) modal.classList.remove('open');
        }
      });
    });
  }

  // ── 8. СВЯЗЬ С УРОКАМИ (#lesson-N) ───────────────────────────
  function initHashRouting() {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#lesson-')) {
        const num = parseInt(hash.replace('#lesson-', ''), 10);
        if (num) {
          switchTab('tab-blocks');
          const ex = ProgramExamples.getOrTemplate(num);
          if (ex && blocklyWorkspace) {
            ProgramExamples.loadInto(blocklyWorkspace, ex);
            updateReader();
            saveToStorage();
          }
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
  }

  // ── 9. СИМУЛЯЦИОННЫЙ ЦИКЛ (АНИМАЦИЯ ШЕСТЕРЁНОК) ─────────────
  function startSimulationLoop() {
    function frame(now) {
      const dt = (now - lastAnimTime) / 1000;
      lastAnimTime = now;

      // Мотор A
      const pwrA = WeDo.getMotorPower('A'); // -100..100
      if (pwrA !== 0) {
        // Скорость вращения: до 360 град/сек на макс мощности
        angleGearA += (pwrA / 100) * 360 * dt;
        applyGearRotation('gearSvgA', angleGearA);
        applyGearRotation('progGearA', angleGearA);
      }

      // Мотор B
      const pwrB = WeDo.getMotorPower('B');
      if (pwrB !== 0) {
        angleGearB += (pwrB / 100) * 360 * dt;
        applyGearRotation('gearSvgB', angleGearB);
        applyGearRotation('progGearB', angleGearB);
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function applyGearRotation(elemId, angle) {
    const el = document.getElementById(elemId);
    if (el) {
      el.style.transform = `rotate(${angle % 360}deg)`;
    }
  }
})();

/*
 * shared/wedo.js
 * Общий модуль для работы со смартхабом LEGO WeDo 2.0 по Web Bluetooth (BLE)
 * и встроенным симулятором (когда реальный хаб не подключён).
 * 
 * Поддерживает:
 *  - Подключение/отключение смартхаба через Web Bluetooth
 *  - Автоопределение устройств в портах A (1) и B (2): мотор, наклон, расстояние
 *  - Управление мотором (мощность -100..100, реверс, стоп)
 *  - Чтение датчика наклона (X, Y, положение: ровно, вперёд, назад, влево, вправо)
 *  - Чтение датчика расстояния (0..10)
 *  - Управление RGB-светодиодом (0..10)
 *  - Очередь GATT-записей для стабильной связи
 *  - Аварийную остановку моторов (Стоп, Esc, Пробел, скрытие вкладки, уход со страницы)
 *  - Виртуальный режим симулятора для работы без смартхаба
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WeDo = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // UUID сервисов и характеристик WeDo 2.0
  const HUB_SERVICE   = '00001523-1212-efde-1523-785feabcd123';
  const IO_SERVICE    = '00004f0e-1212-efde-1523-785feabcd123';
  const CH_ATTACHED   = '00001527-1212-efde-1523-785feabcd123'; // подключение к портам
  const CH_SENSOR     = '00001560-1212-efde-1523-785feabcd123'; // значения датчиков
  const CH_INPUT_CMD  = '00001563-1212-efde-1523-785feabcd123'; // настройка режима датчика
  const CH_OUTPUT     = '00001565-1212-efde-1523-785feabcd123'; // моторы, светодиод

  // Типы устройств WeDo 2.0
  const TYPE_NONE     = 0x00;
  const TYPE_MOTOR    = 0x01; // WeDo 2.0 Medium Motor
  const TYPE_TILT     = 0x22; // WeDo 2.0 Tilt Sensor
  const TYPE_DISTANCE = 0x23; // WeDo 2.0 Motion Sensor (Distance)

  // Названия цветов светодиода WeDo
  const LED_COLORS = [
    { id: 0, name: 'Выкл', hex: '#334155' },
    { id: 1, name: 'Розовый', hex: '#EC4899' },
    { id: 2, name: 'Фиолетовый', hex: '#8B5CF6' },
    { id: 3, name: 'Синий', hex: '#3B82F6' },
    { id: 4, name: 'Голубой', hex: '#06B6D4' },
    { id: 5, name: 'Бирюзовый', hex: '#14B8A6' },
    { id: 6, name: 'Зелёный', hex: '#22C55E' },
    { id: 7, name: 'Жёлтый', hex: '#EAB308' },
    { id: 8, name: 'Оранжевый', hex: '#F97316' },
    { id: 9, name: 'Красный', hex: '#EF4444' },
    { id: 10, name: 'Белый', hex: '#F8FAFC' }
  ];

  // Нормализация порта: 'A' -> 1, 'B' -> 2, 1 -> 1, 2 -> 2
  function toPortNum(port) {
    if (port === 1 || port === 2) return port;
    if (typeof port === 'string') {
      const up = port.toUpperCase();
      if (up === 'A' || up === '1') return 1;
      if (up === 'B' || up === '2') return 2;
    }
    return 1;
  }

  function toPortLetter(port) {
    const num = toPortNum(port);
    return num === 1 ? 'A' : 'B';
  }

  // Очередь записи GATT
  let writeChain = Promise.resolve();
  function queueWrite(char, bytes) {
    if (!char) return Promise.resolve();
    writeChain = writeChain
      .then(() => char.writeValue(new Uint8Array(bytes)))
      .catch(err => {
        console.warn('[WeDo] Ошибка записи в GATT:', err);
      });
    return writeChain;
  }

  // Состояние клиента WeDo
  const state = {
    connected: false,
    connecting: false,
    name: 'Смартхаб',
    battery: null,
    ledColor: 6, // по умолчанию зелёный

    // Порты A (1) и B (2)
    ports: {
      A: { num: 1, type: TYPE_NONE, typeName: 'none', title: 'Ничего не подключено', raw: null },
      B: { num: 2, type: TYPE_NONE, typeName: 'none', title: 'Ничего не подключено', raw: null }
    },

    // Моторы: мощность -100..100 и реверс направления
    motors: {
      A: { power: 0, inverted: false },
      B: { power: 0, inverted: false }
    },

    // Датчик наклона (сырые данные и положение)
    tilt: {
      port: null,
      rawX: 0,
      rawY: 0,
      direction: 'flat' // 'flat' | 'forward' | 'backward' | 'left' | 'right'
    },

    // Датчик расстояния
    distance: {
      port: null,
      val: 10 // 0..10
    },

    // Виртуальные значения для симулятора (когда хаб не подключён)
    simulation: {
      enabled: true,
      tiltDirection: 'flat',
      tiltX: 0,
      tiltY: 0,
      distance: 10,
      ports: {
        A: { type: TYPE_MOTOR, typeName: 'motor', title: 'Мотор' },
        B: { type: TYPE_DISTANCE, typeName: 'distance', title: 'Датчик расстояния' }
      }
    }
  };

  // Web Bluetooth объекты
  let bluetoothDevice = null;
  let chInputCmd = null;
  let chOutputCmd = null;
  let chSensor = null;
  let chAttached = null;

  // Подписчики на события
  const listeners = {
    status: [],
    ports: [],
    sensor: [],
    motor: []
  };

  function emit(type, data) {
    (listeners[type] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[WeDo] Ошибка в слушателе ${type}:`, e); }
    });
  }

  // Вычисление направления по сырым X и Y датчика наклона
  function computeTiltDirection(x, y) {
    const THRESHOLD = 14;
    if (Math.abs(x) < THRESHOLD && Math.abs(y) < THRESHOLD) {
      return 'flat';
    }
    if (Math.abs(x) > Math.abs(y)) {
      return x > 0 ? 'right' : 'left';
    } else {
      // В WeDo 2.0 y отрицательный вперёд (или в зависимости от ориентации)
      return y < 0 ? 'forward' : 'backward';
    }
  }

  // Обработка подключения/отключения периферии
  function handleAttached(event) {
    const buf = new Uint8Array(event.target.value.buffer);
    const portNum = buf[0];
    const attached = buf[1] === 1;
    const type = buf[3];
    const letter = toPortLetter(portNum);
    const p = state.ports[letter];

    if (attached) {
      p.type = type;
      if (type === TYPE_MOTOR) {
        p.typeName = 'motor';
        p.title = 'Мотор';
      } else if (type === TYPE_TILT) {
        p.typeName = 'tilt';
        p.title = 'Датчик наклона';
        state.tilt.port = letter;
        // Настройка датчика наклона: режим 0 (угол X, Y), интервал 1
        queueWrite(chInputCmd, [0x01, 0x02, portNum, TYPE_TILT, 0x00, 0x01, 0, 0, 0, 0x00, 0x01]);
      } else if (type === TYPE_DISTANCE) {
        p.typeName = 'distance';
        p.title = 'Датчик расстояния';
        state.distance.port = letter;
        // Настройка датчика расстояния: режим 0 (расстояние 0..10), интервал 1
        queueWrite(chInputCmd, [0x01, 0x02, portNum, TYPE_DISTANCE, 0x00, 0x01, 0, 0, 0, 0x00, 0x01]);
      } else {
        p.typeName = 'unknown';
        p.title = 'Неизвестное устройство (0x' + type.toString(16) + ')';
      }
    } else {
      // Отключено
      if (state.tilt.port === letter) {
        state.tilt.port = null;
        state.tilt.rawX = 0;
        state.tilt.rawY = 0;
        state.tilt.direction = 'flat';
      }
      if (state.distance.port === letter) {
        state.distance.port = null;
      }
      p.type = TYPE_NONE;
      p.typeName = 'none';
      p.title = 'Ничего не подключено';
    }

    emit('ports', state.ports);
    emit('status', state);
  }

  // Обработка данных датчиков
  function handleSensor(event) {
    const dv = event.target.value;
    if (dv.byteLength < 3) return;
    const portNum = dv.getUint8(1);
    const letter = toPortLetter(portNum);
    const p = state.ports[letter];

    if (p.type === TYPE_TILT && dv.byteLength >= 4) {
      const rx = dv.getInt8(2);
      const ry = dv.getInt8(3);
      state.tilt.rawX = rx;
      state.tilt.rawY = ry;
      state.tilt.direction = computeTiltDirection(rx, ry);
      emit('sensor', { type: 'tilt', port: letter, x: rx, y: ry, direction: state.tilt.direction });
    } else if (p.type === TYPE_DISTANCE) {
      let dist = dv.getUint8(2);
      if (dist > 10) dist = 10;
      state.distance.val = dist;
      emit('sensor', { type: 'distance', port: letter, value: dist });
    }
  }

  function handleDisconnected() {
    state.connected = false;
    state.connecting = false;
    bluetoothDevice = null;
    chInputCmd = null;
    chOutputCmd = null;
    chSensor = null;
    chAttached = null;
    state.tilt.port = null;
    state.distance.port = null;
    state.ports.A.type = TYPE_NONE;
    state.ports.A.typeName = 'none';
    state.ports.A.title = 'Ничего не подключено';
    state.ports.B.type = TYPE_NONE;
    state.ports.B.typeName = 'none';
    state.ports.B.title = 'Ничего не подключено';
    state.motors.A.power = 0;
    state.motors.B.power = 0;

    emit('status', state);
    emit('ports', state.ports);
    emit('motor', { port: 'A', power: 0 });
    emit('motor', { port: 'B', power: 0 });
  }

  // Публичный интерфейс WeDo
  const WeDo = {
    // Проверка поддержки Web Bluetooth
    isBluetoothSupported() {
      return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
    },

    // Состояние
    getState() {
      return state;
    },

    // Подключение к смартхабу
    async connect() {
      if (!this.isBluetoothSupported()) {
        throw new Error('Bluetooth работает только в браузерах Chrome или Microsoft Edge.');
      }
      state.connecting = true;
      emit('status', state);

      try {
        bluetoothDevice = await navigator.bluetooth.requestDevice({
          filters: [
            { services: [HUB_SERVICE] },
            { namePrefix: 'LPF2' },
            { namePrefix: 'Smart' },
            { namePrefix: 'WeDo' }
          ],
          optionalServices: [HUB_SERVICE, IO_SERVICE]
        });

        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnected);

        const server = await bluetoothDevice.gatt.connect();
        const hubSvc = await server.getPrimaryService(HUB_SERVICE);
        const ioSvc  = await server.getPrimaryService(IO_SERVICE);

        chInputCmd  = await ioSvc.getCharacteristic(CH_INPUT_CMD);
        chOutputCmd = await ioSvc.getCharacteristic(CH_OUTPUT);

        chSensor = await ioSvc.getCharacteristic(CH_SENSOR);
        chSensor.addEventListener('characteristicvaluechanged', handleSensor);
        await chSensor.startNotifications();

        chAttached = await hubSvc.getCharacteristic(CH_ATTACHED);
        chAttached.addEventListener('characteristicvaluechanged', handleAttached);
        await chAttached.startNotifications();

        state.connected = true;
        state.connecting = false;
        state.name = bluetoothDevice.name || 'WeDo 2.0 SmartHub';

        emit('status', state);

        // По умолчанию зажигаем зелёный огонёк готовности
        this.setLed(6);
        return true;
      } catch (err) {
        state.connecting = false;
        if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
          bluetoothDevice.gatt.disconnect();
        }
        emit('status', state);
        throw err;
      }
    },

    // Отключение
    disconnect() {
      if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
      } else {
        handleDisconnected();
      }
    },

    // Управление мотором (port: 'A'|'B'|1|2, power: -100..100 или -10..10)
    setMotorPower(port, power) {
      const pNum = toPortNum(port);
      const pLet = toPortLetter(port);
      let pwr = Math.round(Number(power) || 0);

      // Если передана мощность от -10 до 10, масштабируем в -100..100
      if (Math.abs(pwr) <= 10 && pwr !== 0) {
        pwr = pwr * 10;
      }
      pwr = Math.max(-100, Math.min(100, pwr));

      // Учет инверсии направления для этого мотора
      if (state.motors[pLet].inverted) {
        pwr = -pwr;
      }

      state.motors[pLet].power = pwr;

      if (state.connected && chOutputCmd) {
        // WeDo 2.0 Motor write: [port, 0x01, 0x02, powerInt8]
        const rawByte = (pwr < 0 ? (256 + pwr) : pwr) & 0xFF;
        queueWrite(chOutputCmd, [pNum, 0x01, 0x02, rawByte]);
      }

      emit('motor', { port: pLet, power: pwr, pNum });
    },

    // Остановка конкретного мотора
    stopMotor(port) {
      this.setMotorPower(port, 0);
    },

    // Остановка всех моторов
    stopAllMotors() {
      this.setMotorPower('A', 0);
      this.setMotorPower('B', 0);
    },

    // Аварийный стоп (немедленная остановка моторов)
    emergencyStop() {
      this.stopAllMotors();
    },

    // Установка инверсии мотора
    setMotorInverted(port, inverted) {
      const pLet = toPortLetter(port);
      state.motors[pLet].inverted = !!inverted;
    },

    isMotorInverted(port) {
      const pLet = toPortLetter(port);
      return state.motors[pLet].inverted;
    },

    getMotorPower(port) {
      const pLet = toPortLetter(port);
      return state.motors[pLet].power;
    },

    // Управление светодиодом (color: 0..10)
    setLed(color) {
      const col = Math.max(0, Math.min(10, Math.round(Number(color) || 0)));
      state.ledColor = col;
      if (state.connected && chInputCmd && chOutputCmd) {
        queueWrite(chInputCmd, [0x06, 0x17, 0x01, 0x01]);
        queueWrite(chOutputCmd, [0x06, 0x04, 0x01, col]);
      }
      emit('status', state);
    },

    getLedColor() {
      return state.ledColor;
    },

    getLedColorsList() {
      return LED_COLORS;
    },

    // Получение текущего наклона (из хаба или из симулятора)
    getTilt() {
      if (state.connected && state.tilt.port) {
        return {
          port: state.tilt.port,
          direction: state.tilt.direction,
          x: state.tilt.rawX,
          y: state.tilt.rawY
        };
      }
      // Значения симулятора
      return {
        port: 'A',
        direction: state.simulation.tiltDirection,
        x: state.simulation.tiltX,
        y: state.simulation.tiltY
      };
    },

    // Получение текущего расстояния (из хаба или из симулятора)
    getDistance(port) {
      if (state.connected && state.distance.port) {
        return state.distance.val;
      }
      return state.simulation.distance;
    },

    // Симуляция датчиков (для работы без хаба)
    setSimulatedTilt(direction, x = 0, y = 0) {
      state.simulation.tiltDirection = direction;
      state.simulation.tiltX = x;
      state.simulation.tiltY = y;
      if (!state.connected) {
        emit('sensor', { type: 'tilt', port: 'sim', direction, x, y });
      }
    },

    setSimulatedDistance(dist) {
      const clamped = Math.max(0, Math.min(10, Math.round(Number(dist) || 0)));
      state.simulation.distance = clamped;
      if (!state.connected) {
        emit('sensor', { type: 'distance', port: 'sim', value: clamped });
      }
    },

    // Настройка симулируемых портов (что "вставлено" в порты в симуляторе)
    setSimulatedPortType(port, typeName) {
      const pLet = toPortLetter(port);
      let t = TYPE_NONE, title = 'Ничего не подключено';
      if (typeName === 'motor') {
        t = TYPE_MOTOR; title = 'Мотор';
      } else if (typeName === 'tilt') {
        t = TYPE_TILT; title = 'Датчик наклона';
      } else if (typeName === 'distance') {
        t = TYPE_DISTANCE; title = 'Датчик расстояния';
      }
      state.simulation.ports[pLet] = { type: t, typeName, title };
      emit('ports', this.getEffectivePorts());
    },

    // Получить активные порты (реальные или симулируемые)
    getEffectivePorts() {
      if (state.connected) {
        return state.ports;
      }
      return {
        A: { num: 1, ...state.simulation.ports.A },
        B: { num: 2, ...state.simulation.ports.B }
      };
    },

    // Подписка на события
    onStatus(fn) { listeners.status.push(fn); },
    onPorts(fn) { listeners.ports.push(fn); },
    onSensor(fn) { listeners.sensor.push(fn); },
    onMotor(fn) { listeners.motor.push(fn); }
  };

  // ── Безопасность: остановка моторов при любых критических событиях ──
  if (typeof document !== 'undefined') {
    // 1. Скрытие вкладки браузера
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        WeDo.emergencyStop();
      }
    });
  }

  if (typeof window !== 'undefined') {
    // 2. Уход со страницы или закрытие вкладки
    window.addEventListener('beforeunload', () => WeDo.emergencyStop());
    window.addEventListener('pagehide', () => WeDo.emergencyStop());

    // 3. Быстрая аварийная остановка по Esc или Space (если фокус не в поле ввода)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'Space') {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'textarea' && !e.target.isContentEditable) {
          if (e.code === 'Space') {
            // Если это не кнопка, на которую нажали пробелом
            if (tag !== 'button') e.preventDefault();
          }
          WeDo.emergencyStop();
        }
      }
    });
  }

  return WeDo;
});

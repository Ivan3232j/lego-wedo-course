/*
 * programming/blocks.js
 * Кастомные блоки Blockly для курса LEGO WeDo 2.0.
 * Цвета категорий:
 *  - События: #F59E0B (жёлтый)
 *  - Мотор: #006CB7 (LEGO синий)
 *  - Ожидание: #FF6B00 (LEGO оранжевый)
 *  - Повторы и условия: #00A650 (LEGO зелёный)
 *  - Свет и звук: #8B5CF6 (фиолетовый)
 */

(function () {
  'use strict';

  if (typeof Blockly === 'undefined') {
    console.warn('Blockly не загружен!');
    return;
  }

  const COLOR_EVENT = '#F59E0B';
  const COLOR_MOTOR = '#006CB7';
  const COLOR_WAIT  = '#FF6B00';
  const COLOR_LOOP  = '#00A650';
  const COLOR_MEDIA = '#8B5CF6';

  // Вспомогательная регистрация JS генератора
  function registerJs(name, fn) {
    const gen = (Blockly.JavaScript && Blockly.JavaScript.forBlock) 
      ? Blockly.JavaScript 
      : (window.javascript && window.javascript.javascriptGenerator) 
      ? window.javascript.javascriptGenerator 
      : null;

    if (gen) {
      if (gen.forBlock) {
        gen.forBlock[name] = fn;
      } else {
        gen[name] = fn;
      }
    }
  }

  // ── 1. СОБЫТИЯ (Hat-блоки) ──────────────────────────────────
  Blockly.Blocks['event_start'] = {
    init() {
      this.appendDummyInput()
          .appendField('▶ Когда нажат Старт');
      this.setNextStatement(true, null);
      this.setColour(COLOR_EVENT);
      this.setTooltip('Запускает программу по нажатию зелёной кнопки Старт.');
    }
  };
  registerJs('event_start', function (block, generator) {
    const nextCode = (generator ? generator.statementToCode(block, 'DO') : '') || '';
    return '// === Когда нажат Старт ===\n' + nextCode;
  });

  Blockly.Blocks['event_key'] = {
    init() {
      this.appendDummyInput()
          .appendField('⌨ Когда нажата клавиша')
          .appendField(new Blockly.FieldDropdown([
            ['↑ Стрелка вверх', 'ArrowUp'],
            ['↓ Стрелка вниз', 'ArrowDown'],
            ['← Стрелка влево', 'ArrowLeft'],
            ['→ Стрелка вправо', 'ArrowRight'],
            ['Пробел', 'Space'],
            ['W', 'KeyW'],
            ['S', 'KeyS'],
            ['A', 'KeyA'],
            ['D', 'KeyD']
          ]), 'KEY');
      this.setNextStatement(true, null);
      this.setColour(COLOR_EVENT);
      this.setTooltip('Запускается при нажатии выбранной клавиши на клавиатуре.');
    }
  };
  registerJs('event_key', function (block) {
    const key = block.getFieldValue('KEY');
    return `// === Когда нажата клавиша ${key} ===\n`;
  });

  Blockly.Blocks['event_tilt'] = {
    init() {
      this.appendDummyInput()
          .appendField('📐 Когда джойстик наклонён')
          .appendField(new Blockly.FieldDropdown([
            ['вперёд ⬆', 'forward'],
            ['назад ⬇', 'backward'],
            ['влево ⬅', 'left'],
            ['вправо ➡', 'right'],
            ['ровно ⚖️', 'flat']
          ]), 'DIR');
      this.setNextStatement(true, null);
      this.setColour(COLOR_EVENT);
      this.setTooltip('Запускается, когда датчик наклона принимает выбранное положение.');
    }
  };
  registerJs('event_tilt', function (block) {
    const dir = block.getFieldValue('DIR');
    return `// === Когда джойстик наклонён: ${dir} ===\n`;
  });

  Blockly.Blocks['event_distance'] = {
    init() {
      this.appendDummyInput()
          .appendField('📏 Когда расстояние меньше')
          .appendField(new Blockly.FieldNumber(5, 1, 10), 'DIST');
      this.setNextStatement(true, null);
      this.setColour(COLOR_EVENT);
      this.setTooltip('Запускается, когда перед датчиком расстояния появляется препятствие.');
    }
  };
  registerJs('event_distance', function (block) {
    const dist = block.getFieldValue('DIST');
    return `// === Когда расстояние < ${dist} ===\n`;
  });

  // ── 2. МОТОР (Синие) ─────────────────────────────────────────
  Blockly.Blocks['motor_on'] = {
    init() {
      this.appendDummyInput()
          .appendField('Мотор')
          .appendField(new Blockly.FieldDropdown([['A', 'A'], ['B', 'B']]), 'PORT')
          .appendField('крутить')
          .appendField(new Blockly.FieldDropdown([['вправо ↻', 'right'], ['влево ↺', 'left']]), 'DIR')
          .appendField('с мощностью')
          .appendField(new Blockly.FieldNumber(5, 1, 10), 'POWER');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_MOTOR);
      this.setTooltip('Включает мотор с указанной мощностью (1..10) в выбранную сторону.');
    }
  };
  registerJs('motor_on', function (block) {
    const port = block.getFieldValue('PORT');
    const dir = block.getFieldValue('DIR');
    const pwr = Number(block.getFieldValue('POWER'));
    const signedPower = (dir === 'left' ? -pwr : pwr);
    return `await WeDoRuntime.setMotorPower('${port}', ${signedPower});\n`;
  });

  Blockly.Blocks['motor_on_for'] = {
    init() {
      this.appendDummyInput()
          .appendField('Мотор')
          .appendField(new Blockly.FieldDropdown([['A', 'A'], ['B', 'B']]), 'PORT')
          .appendField('крутить')
          .appendField(new Blockly.FieldDropdown([['вправо ↻', 'right'], ['влево ↺', 'left']]), 'DIR')
          .appendField('мощность')
          .appendField(new Blockly.FieldNumber(5, 1, 10), 'POWER')
          .appendField('в течение')
          .appendField(new Blockly.FieldNumber(2, 0.1, 60, 0.5), 'SECONDS')
          .appendField('сек');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_MOTOR);
      this.setTooltip('Включает мотор на заданное количество секунд, а затем останавливает его.');
    }
  };
  registerJs('motor_on_for', function (block) {
    const port = block.getFieldValue('PORT');
    const dir = block.getFieldValue('DIR');
    const pwr = Number(block.getFieldValue('POWER'));
    const sec = Number(block.getFieldValue('SECONDS'));
    const signedPower = (dir === 'left' ? -pwr : pwr);
    return `await WeDoRuntime.motorRunFor('${port}', ${signedPower}, ${sec});\n`;
  });

  Blockly.Blocks['motor_stop'] = {
    init() {
      this.appendDummyInput()
          .appendField('Мотор')
          .appendField(new Blockly.FieldDropdown([['A', 'A'], ['B', 'B']]), 'PORT')
          .appendField('стоп ⏹');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_MOTOR);
      this.setTooltip('Останавливает выбранный мотор.');
    }
  };
  registerJs('motor_stop', function (block) {
    const port = block.getFieldValue('PORT');
    return `await WeDoRuntime.setMotorPower('${port}', 0);\n`;
  });

  Blockly.Blocks['motor_stop_all'] = {
    init() {
      this.appendDummyInput()
          .appendField('Все моторы стоп ⏹');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_MOTOR);
      this.setTooltip('Останавливает сразу все подключённые моторы.');
    }
  };
  registerJs('motor_stop_all', function () {
    return `await WeDoRuntime.stopAllMotors();\n`;
  });

  // ── 3. ОЖИДАНИЕ (Оранжевые) ───────────────────────────────────
  Blockly.Blocks['wait_seconds'] = {
    init() {
      this.appendDummyInput()
          .appendField('Ждать')
          .appendField(new Blockly.FieldNumber(1, 0.1, 60, 0.5), 'SECONDS')
          .appendField('сек');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_WAIT);
      this.setTooltip('Делает паузу в программе на указанное количество секунд.');
    }
  };
  registerJs('wait_seconds', function (block) {
    const sec = Number(block.getFieldValue('SECONDS'));
    return `await WeDoRuntime.waitSeconds(${sec});\n`;
  });

  Blockly.Blocks['wait_distance'] = {
    init() {
      this.appendDummyInput()
          .appendField('Ждать, пока расстояние меньше')
          .appendField(new Blockly.FieldNumber(5, 0, 10), 'DIST');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_WAIT);
      this.setTooltip('Ждёт, пока датчик расстояния не заметит объект ближе указанного порога.');
    }
  };
  registerJs('wait_distance', function (block) {
    const dist = Number(block.getFieldValue('DIST'));
    return `await WeDoRuntime.waitDistanceLessThan(${dist});\n`;
  });

  Blockly.Blocks['wait_tilt'] = {
    init() {
      this.appendDummyInput()
          .appendField('Ждать наклона джойстика')
          .appendField(new Blockly.FieldDropdown([
            ['вперёд ⬆', 'forward'],
            ['назад ⬇', 'backward'],
            ['влево ⬅', 'left'],
            ['вправо ➡', 'right'],
            ['ровно ⚖️', 'flat']
          ]), 'DIR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_WAIT);
      this.setTooltip('Ждёт, пока джойстик не наклонят в выбранное положение.');
    }
  };
  registerJs('wait_tilt', function (block) {
    const dir = block.getFieldValue('DIR');
    return `await WeDoRuntime.waitTilt('${dir}');\n`;
  });

  // ── 4. ПОВТОРЫ И УСЛОВИЯ (Зелёные) ───────────────────────────
  Blockly.Blocks['repeat_times'] = {
    init() {
      this.appendDummyInput()
          .appendField('Повторить')
          .appendField(new Blockly.FieldNumber(3, 1, 100), 'TIMES')
          .appendField('раз:');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_LOOP);
      this.setTooltip('Повторяет команды внутри указанное количество раз.');
    }
  };
  registerJs('repeat_times', function (block, generator) {
    const times = Number(block.getFieldValue('TIMES'));
    const branch = generator ? generator.statementToCode(block, 'DO') : '';
    return `for (let _i = 0; _i < ${times}; _i++) {\n${branch}  await WeDoRuntime.yield();\n}\n`;
  });

  Blockly.Blocks['repeat_forever'] = {
    init() {
      this.appendDummyInput()
          .appendField('Повторять всегда:');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_LOOP);
      this.setTooltip('Повторяет команды бесконечно, пока не нажат «Стоп».');
    }
  };
  registerJs('repeat_forever', function (block, generator) {
    const branch = generator ? generator.statementToCode(block, 'DO') : '';
    return `while (WeDoRuntime.isRunning()) {\n${branch}  await WeDoRuntime.yield();\n}\n`;
  });

  Blockly.Blocks['if_condition'] = {
    init() {
      this.appendValueInput('CONDITION')
          .setCheck('Boolean')
          .appendField('Если');
      this.appendStatementInput('DO')
          .appendField('то:');
      this.appendStatementInput('ELSE')
          .appendField('иначе:');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_LOOP);
      this.setTooltip('Выполняет первую ветку, если условие верно, иначе вторую.');
    }
  };
  registerJs('if_condition', function (block, generator) {
    const cond = generator ? (generator.valueToCode(block, 'CONDITION', 0) || 'false') : 'false';
    const doBranch = generator ? generator.statementToCode(block, 'DO') : '';
    const elseBranch = generator ? generator.statementToCode(block, 'ELSE') : '';
    let code = `if (${cond}) {\n${doBranch}}`;
    if (elseBranch) {
      code += ` else {\n${elseBranch}}`;
    }
    return code + '\n';
  });

  // Условия (Boolean)
  Blockly.Blocks['condition_tilt'] = {
    init() {
      this.appendDummyInput()
          .appendField('джойстик наклонён')
          .appendField(new Blockly.FieldDropdown([
            ['вперёд ⬆', 'forward'],
            ['назад ⬇', 'backward'],
            ['влево ⬅', 'left'],
            ['вправо ➡', 'right'],
            ['ровно ⚖️', 'flat']
          ]), 'DIR');
      this.setOutput(true, 'Boolean');
      this.setColour(COLOR_LOOP);
      this.setTooltip('Проверяет текущий наклон джойстика.');
    }
  };
  registerJs('condition_tilt', function (block) {
    const dir = block.getFieldValue('DIR');
    return [`WeDoRuntime.isTilt('${dir}')`, 0];
  });

  Blockly.Blocks['condition_distance'] = {
    init() {
      this.appendDummyInput()
          .appendField('расстояние <')
          .appendField(new Blockly.FieldNumber(5, 0, 10), 'DIST');
      this.setOutput(true, 'Boolean');
      this.setColour(COLOR_LOOP);
      this.setTooltip('Проверяет, меньше ли расстояние указанного числа.');
    }
  };
  registerJs('condition_distance', function (block) {
    const dist = Number(block.getFieldValue('DIST'));
    return [`(WeDoRuntime.getDistance() < ${dist})`, 0];
  });

  Blockly.Blocks['condition_key'] = {
    init() {
      this.appendDummyInput()
          .appendField('нажата клавиша')
          .appendField(new Blockly.FieldDropdown([
            ['↑ Стрелка вверх', 'ArrowUp'],
            ['↓ Стрелка вниз', 'ArrowDown'],
            ['← Стрелка влево', 'ArrowLeft'],
            ['→ Стрелка вправо', 'ArrowRight'],
            ['Пробел', 'Space']
          ]), 'KEY');
      this.setOutput(true, 'Boolean');
      this.setColour(COLOR_LOOP);
      this.setTooltip('Проверяет, зажата ли сейчас клавиша на клавиатуре.');
    }
  };
  registerJs('condition_key', function (block) {
    const key = block.getFieldValue('KEY');
    return [`WeDoRuntime.isKeyPressed('${key}')`, 0];
  });

  // ── 5. СВЕТ И ЗВУК (Фиолетовые) ──────────────────────────────
  Blockly.Blocks['hub_set_led'] = {
    init() {
      this.appendDummyInput()
          .appendField('Светодиод хаба')
          .appendField(new Blockly.FieldDropdown([
            ['зелёный 🟢', '6'],
            ['красный 🔴', '9'],
            ['синий 🔵', '3'],
            ['жёлтый 🟡', '7'],
            ['оранжевый 🟠', '8'],
            ['розовый 🌸', '1'],
            ['фиолетовый 🟣', '2'],
            ['голубой 🌊', '4'],
            ['бирюзовый 💠', '5'],
            ['белый ⚪', '10'],
            ['выключить ⚫', '0']
          ]), 'COLOR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_MEDIA);
      this.setTooltip('Меняет цвет подсветки на смартхабе.');
    }
  };
  registerJs('hub_set_led', function (block) {
    const col = block.getFieldValue('COLOR');
    return `await WeDoRuntime.setLed(${col});\n`;
  });

  Blockly.Blocks['play_sound'] = {
    init() {
      this.appendDummyInput()
          .appendField('Звук')
          .appendField(new Blockly.FieldDropdown([
            ['🚨 сирена', 'siren'],
            ['🏎️ мотор', 'motor'],
            ['🔔 бип', 'beep'],
            ['🎉 ура!', 'cheer'],
            ['🏆 победа', 'victory'],
            ['⚡ лазер', 'laser']
          ]), 'SOUND');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLOR_MEDIA);
      this.setTooltip('Воспроизводит звуковой эффект через динамики компьютера.');
    }
  };
  registerJs('play_sound', function (block) {
    const snd = block.getFieldValue('SOUND');
    return `await WeDoRuntime.playSound('${snd}');\n`;
  });

  // ── Тулбокс Blockly ──────────────────────────────────────────
  window.WeDoBlocks = {
    // Базовый детский тулбокс (без переменных и сложных математических блоков)
    getSimpleToolbox() {
      return {
        kind: 'categoryToolbox',
        contents: [
          {
            kind: 'category',
            name: '▶ События',
            colour: COLOR_EVENT,
            contents: [
              { kind: 'block', type: 'event_start' },
              { kind: 'block', type: 'event_key' },
              { kind: 'block', type: 'event_tilt' },
              { kind: 'block', type: 'event_distance' }
            ]
          },
          {
            kind: 'category',
            name: '⚙️ Мотор',
            colour: COLOR_MOTOR,
            contents: [
              { kind: 'block', type: 'motor_on' },
              { kind: 'block', type: 'motor_on_for' },
              { kind: 'block', type: 'motor_stop' },
              { kind: 'block', type: 'motor_stop_all' }
            ]
          },
          {
            kind: 'category',
            name: '⏳ Ожидание',
            colour: COLOR_WAIT,
            contents: [
              { kind: 'block', type: 'wait_seconds' },
              { kind: 'block', type: 'wait_distance' },
              { kind: 'block', type: 'wait_tilt' }
            ]
          },
          {
            kind: 'category',
            name: '🔄 Повторы и Если',
            colour: COLOR_LOOP,
            contents: [
              { kind: 'block', type: 'repeat_times' },
              { kind: 'block', type: 'repeat_forever' },
              { kind: 'block', type: 'if_condition' },
              { kind: 'block', type: 'condition_tilt' },
              { kind: 'block', type: 'condition_distance' },
              { kind: 'block', type: 'condition_key' }
            ]
          },
          {
            kind: 'category',
            name: '💡 Свет и звук',
            colour: COLOR_MEDIA,
            contents: [
              { kind: 'block', type: 'hub_set_led' },
              { kind: 'block', type: 'play_sound' }
            ]
          }
        ]
      };
    },

    // Продвинутый тулбокс с переменными и математикой
    getAdvancedToolbox() {
      const basic = this.getSimpleToolbox();
      basic.contents.push(
        {
          kind: 'category',
          name: '🔢 Числа и счёт',
          colour: '#3B82F6',
          contents: [
            { kind: 'block', type: 'math_number' },
            { kind: 'block', type: 'math_arithmetic' },
            { kind: 'block', type: 'math_random_int' }
          ]
        },
        {
          kind: 'category',
          name: '📦 Переменные',
          colour: '#EC4899',
          custom: 'VARIABLE'
        }
      );
      return basic;
    }
  };
})();

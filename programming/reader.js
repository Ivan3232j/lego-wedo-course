/*
 * programming/reader.js
 * Транслятор блоков Blockly в понятный русский текст с отступами
 * и генератор чистого JavaScript-кода для панели «Как читается программа».
 */

(function () {
  'use strict';

  const KEY_NAMES = {
    ArrowUp: 'стрелка вверх ↑',
    ArrowDown: 'стрелка вниз ↓',
    ArrowLeft: 'стрелка влево ←',
    ArrowRight: 'стрелка вправо →',
    Space: 'пробел',
    KeyW: 'клавиша W',
    KeyS: 'клавиша S',
    KeyA: 'клавиша A',
    KeyD: 'клавиша D'
  };

  const DIR_NAMES = {
    forward: 'вперёд',
    backward: 'назад',
    left: 'влево',
    right: 'вправо',
    flat: 'ровно'
  };

  const LED_NAMES = {
    '0': 'выключить',
    '1': 'розовый',
    '2': 'фиолетовый',
    '3': 'синий',
    '4': 'голубой',
    '5': 'бирюзовый',
    '6': 'зелёный',
    '7': 'жёлтый',
    '8': 'оранжевый',
    '9': 'красный',
    '10': 'белый'
  };

  const SOUND_NAMES = {
    siren: 'сирена 🚨',
    motor: 'звук мотора 🏎️',
    beep: 'бип 🔔',
    cheer: 'ура! 🎉',
    victory: 'победа 🏆',
    laser: 'лазер ⚡'
  };

  function pluralSec(n) {
    const num = Math.abs(Number(n));
    if (num === 1) return '1 секунду';
    if (num >= 2 && num <= 4) return `${num} секунды`;
    return `${num} секунд`;
  }

  function pluralTimes(n) {
    const num = Math.abs(Number(n));
    if (num % 10 === 1 && num % 100 !== 11) return `${num} раз`;
    if ([2, 3, 4].includes(num % 10) && ![12, 13, 14].includes(num % 100)) return `${num} раза`;
    return `${num} раз`;
  }

  // Преобразование условия в понятную строку
  function conditionToString(block) {
    if (!block) return 'условие';
    const type = block.type;
    if (type === 'condition_tilt') {
      const d = block.getFieldValue('DIR');
      return `джойстик наклонён ${DIR_NAMES[d] || d}`;
    }
    if (type === 'condition_distance') {
      const dist = block.getFieldValue('DIST');
      return `расстояние < ${dist}`;
    }
    if (type === 'condition_key') {
      const k = block.getFieldValue('KEY');
      return `нажата ${KEY_NAMES[k] || k}`;
    }
    return 'условие';
  }

  // Рекурсивный обход цепочки блоков
  function blockToText(block, indent = 0) {
    if (!block) return '';
    const pad = '    '.repeat(indent);
    let line = '';
    const type = block.type;

    switch (type) {
      // События
      case 'event_start':
        line = `${pad}Когда нажат Старт:`;
        break;
      case 'event_key': {
        const k = block.getFieldValue('KEY');
        line = `${pad}Когда нажата ${KEY_NAMES[k] || k}:`;
        break;
      }
      case 'event_tilt': {
        const d = block.getFieldValue('DIR');
        line = `${pad}Когда джойстик наклонён ${DIR_NAMES[d] || d}:`;
        break;
      }
      case 'event_distance': {
        const dist = block.getFieldValue('DIST');
        line = `${pad}Когда расстояние меньше ${dist}:`;
        break;
      }

      // Моторы
      case 'motor_on': {
        const port = block.getFieldValue('PORT');
        const dir = block.getFieldValue('DIR') === 'left' ? 'влево ↺' : 'вправо ↻';
        const pwr = block.getFieldValue('POWER');
        line = `${pad}Мотор ${port} крутить ${dir}, мощность ${pwr}`;
        break;
      }
      case 'motor_on_for': {
        const port = block.getFieldValue('PORT');
        const dir = block.getFieldValue('DIR') === 'left' ? 'влево ↺' : 'вправо ↻';
        const pwr = block.getFieldValue('POWER');
        const sec = block.getFieldValue('SECONDS');
        line = `${pad}Мотор ${port} крутить ${dir}, мощность ${pwr}, ${pluralSec(sec)}`;
        break;
      }
      case 'motor_stop': {
        const port = block.getFieldValue('PORT');
        line = `${pad}Мотор ${port} стоп`;
        break;
      }
      case 'motor_stop_all':
        line = `${pad}Все моторы стоп`;
        break;

      // Ожидание
      case 'wait_seconds': {
        const sec = block.getFieldValue('SECONDS');
        line = `${pad}Ждать ${pluralSec(sec)}`;
        break;
      }
      case 'wait_distance': {
        const dist = block.getFieldValue('DIST');
        line = `${pad}Ждать, пока расстояние меньше ${dist}`;
        break;
      }
      case 'wait_tilt': {
        const d = block.getFieldValue('DIR');
        line = `${pad}Ждать наклона джойстика ${DIR_NAMES[d] || d}`;
        break;
      }

      // Повторы и условия
      case 'repeat_times': {
        const times = block.getFieldValue('TIMES');
        line = `${pad}Повторить ${pluralTimes(times)}:`;
        const doBlock = block.getInputTargetBlock('DO');
        if (doBlock) {
          line += '\n' + blockToText(doBlock, indent + 1);
        } else {
          line += `\n${pad}    (пусто)`;
        }
        break;
      }
      case 'repeat_forever': {
        line = `${pad}Повторять всегда:`;
        const doBlock = block.getInputTargetBlock('DO');
        if (doBlock) {
          line += '\n' + blockToText(doBlock, indent + 1);
        } else {
          line += `\n${pad}    (пусто)`;
        }
        break;
      }
      case 'if_condition': {
        const condBlock = block.getInputTargetBlock('CONDITION');
        const condText = conditionToString(condBlock);
        line = `${pad}Если ${condText}:`;
        const doBlock = block.getInputTargetBlock('DO');
        if (doBlock) {
          line += '\n' + blockToText(doBlock, indent + 1);
        }
        const elseBlock = block.getInputTargetBlock('ELSE');
        if (elseBlock) {
          line += `\n${pad}Иначе:\n` + blockToText(elseBlock, indent + 1);
        }
        break;
      }

      // Свет и звук
      case 'hub_set_led': {
        const c = block.getFieldValue('COLOR');
        line = `${pad}Светодиод хаба: ${LED_NAMES[c] || c}`;
        break;
      }
      case 'play_sound': {
        const s = block.getFieldValue('SOUND');
        line = `${pad}Включить звук: ${SOUND_NAMES[s] || s}`;
        break;
      }

      default:
        line = `${pad}[${block.type}]`;
        break;
    }

    const next = block.getNextBlock();
    if (next) {
      const nextIndent = type.startsWith('event_') ? indent + 1 : indent;
      return line + '\n' + blockToText(next, nextIndent);
    }
    return line;
  }

  window.ProgramReader = {
    // Получение понятного текста программы
    toHumanText(workspace) {
      if (!workspace) return 'Поле программы пусто. Перетащи блоки из меню слева!';
      const topBlocks = workspace.getTopBlocks(true);
      if (!topBlocks.length) {
        return 'Поле программы пусто.\nПеретащи блоки из меню слева, чтобы собрать свою программу!';
      }

      const sections = [];
      for (const b of topBlocks) {
        const txt = blockToText(b, 0);
        if (txt.trim()) {
          sections.push(txt);
        }
      }

      return sections.join('\n\n');
    },

    // Получение JavaScript-кода
    toJavaScript(workspace) {
      if (!workspace) return '// Нет блоков';
      try {
        const gen = (Blockly.JavaScript && Blockly.JavaScript.workspaceToCode)
          ? Blockly.JavaScript
          : (window.javascript && window.javascript.javascriptGenerator)
          ? window.javascript.javascriptGenerator
          : null;

        if (gen && gen.workspaceToCode) {
          const code = gen.workspaceToCode(workspace);
          return code || '// Поле программы пусто';
        }
        return '// Генератор JavaScript недоступен';
      } catch (e) {
        return '// Ошибка генерации: ' + e.message;
      }
    }
  };
})();

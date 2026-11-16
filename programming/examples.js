/*
 * programming/examples.js
 * Готовые примеры программ для уроков LEGO WeDo 2.0.
 * Включает примеры:
 *  - Урок 1: «Вентилятор»
 *  - Урок 3: «Автоматические ворота» (датчик расстояния)
 *  - Урок 4: «Джойстик управляет мотором»
 *  - Урок 5: «Ровер Майло»
 */

(function () {
  'use strict';

  const EXAMPLES = {
    // ── Урок 1: Вентилятор ──────────────────────────────────────
    1: {
      id: 'lesson-1',
      title: 'Урок 1: Вентилятор',
      desc: 'Включение мотора по часовой стрелке, пауза, реверс против часовой и стоп.',
      state: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: 'event_start',
              x: 50,
              y: 50,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '6' }, // зелёный
                  next: {
                    block: {
                      type: 'play_sound',
                      fields: { SOUND: 'motor' },
                      next: {
                        block: {
                          type: 'motor_on_for',
                          fields: { PORT: 'A', DIR: 'right', POWER: 8, SECONDS: 3 },
                          next: {
                            block: {
                              type: 'wait_seconds',
                              fields: { SECONDS: 1 },
                              next: {
                                block: {
                                  type: 'hub_set_led',
                                  fields: { COLOR: '8' }, // оранжевый
                                  next: {
                                    block: {
                                      type: 'motor_on_for',
                                      fields: { PORT: 'A', DIR: 'left', POWER: 5, SECONDS: 3 },
                                      next: {
                                        block: {
                                          type: 'motor_stop_all',
                                          next: {
                                            block: {
                                              type: 'hub_set_led',
                                              fields: { COLOR: '3' } // синий
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    },

    // ── Урок 3: Автоматические ворота ───────────────────────────
    3: {
      id: 'lesson-3',
      title: 'Урок 3: Автоматические ворота',
      desc: 'Ворота ждут приближения машины по датчику расстояния, открываются, ждут и закрываются.',
      state: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: 'event_start',
              x: 50,
              y: 50,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '9' }, // красный (закрыто)
                  next: {
                    block: {
                      type: 'repeat_forever',
                      inputs: {
                        DO: {
                          block: {
                            type: 'wait_distance',
                            fields: { DIST: 4 },
                            next: {
                              block: {
                                type: 'hub_set_led',
                                fields: { COLOR: '6' }, // зелёный (проезжайте)
                                next: {
                                  block: {
                                    type: 'play_sound',
                                    fields: { SOUND: 'beep' },
                                    next: {
                                      block: {
                                        type: 'motor_on_for',
                                        fields: { PORT: 'A', DIR: 'right', POWER: 6, SECONDS: 2 },
                                        next: {
                                          block: {
                                            type: 'wait_seconds',
                                            fields: { SECONDS: 3 }, // машина проезжает
                                            next: {
                                              block: {
                                                type: 'motor_on_for',
                                                fields: { PORT: 'A', DIR: 'left', POWER: 6, SECONDS: 2 },
                                                next: {
                                                  block: {
                                                    type: 'hub_set_led',
                                                    fields: { COLOR: '9' } // снова красный
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    },

    // ── Урок 4: Джойстик управляет мотором ───────────────────────
    4: {
      id: 'lesson-4',
      title: 'Урок 4: Джойстик управляет мотором',
      desc: 'Параллельные события: наклон вперёд крутит мотор вперёд, наклон назад — назад, ровно — стоп.',
      state: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: 'event_tilt',
              fields: { DIR: 'forward' },
              x: 50,
              y: 50,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '6' }, // зелёный
                  next: {
                    block: {
                      type: 'motor_on',
                      fields: { PORT: 'A', DIR: 'right', POWER: 8 }
                    }
                  }
                }
              }
            },
            {
              type: 'event_tilt',
              fields: { DIR: 'backward' },
              x: 50,
              y: 220,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '8' }, // оранжевый
                  next: {
                    block: {
                      type: 'motor_on',
                      fields: { PORT: 'A', DIR: 'left', POWER: 8 }
                    }
                  }
                }
              }
            },
            {
              type: 'event_tilt',
              fields: { DIR: 'flat' },
              x: 50,
              y: 390,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '3' }, // синий
                  next: {
                    block: {
                      type: 'motor_stop',
                      fields: { PORT: 'A' }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    },

    // ── Урок 5: Ровер Майло ─────────────────────────────────────
    5: {
      id: 'lesson-5',
      title: 'Урок 5: Научный ровер Майло',
      desc: 'Майло едет вперед в поисках образца, останавливается перед ним, играет звук победы и отъезжает.',
      state: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: 'event_start',
              x: 50,
              y: 50,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '6' }, // зелёный
                  next: {
                    block: {
                      type: 'play_sound',
                      fields: { SOUND: 'motor' },
                      next: {
                        block: {
                          type: 'motor_on',
                          fields: { PORT: 'A', DIR: 'right', POWER: 7 },
                          next: {
                            block: {
                              type: 'wait_distance',
                              fields: { DIST: 4 }, // увидел объект
                              next: {
                                block: {
                                  type: 'motor_stop_all',
                                  next: {
                                    block: {
                                      type: 'hub_set_led',
                                      fields: { COLOR: '1' }, // розовый
                                      next: {
                                        block: {
                                          type: 'play_sound',
                                          fields: { SOUND: 'cheer' },
                                          next: {
                                            block: {
                                              type: 'wait_seconds',
                                              fields: { SECONDS: 2 },
                                              next: {
                                                block: {
                                                  type: 'motor_on_for',
                                                  fields: { PORT: 'A', DIR: 'left', POWER: 5, SECONDS: 1.5 },
                                                  next: {
                                                    block: {
                                                      type: 'hub_set_led',
                                                      fields: { COLOR: '3' }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    }
  };

  // Шаблон по умолчанию для любого урока
  function getDefaultTemplate(lessonNum) {
    return {
      id: `lesson-${lessonNum || 'custom'}`,
      title: lessonNum ? `Урок ${lessonNum}` : 'Моя программа',
      desc: 'Базовый шаблон программы управления мотором.',
      state: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: 'event_start',
              x: 50,
              y: 50,
              next: {
                block: {
                  type: 'hub_set_led',
                  fields: { COLOR: '6' },
                  next: {
                    block: {
                      type: 'motor_on_for',
                      fields: { PORT: 'A', DIR: 'right', POWER: 6, SECONDS: 3 },
                      next: {
                        block: {
                          type: 'motor_stop_all'
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    };
  }

  window.ProgramExamples = {
    getAll() {
      return Object.values(EXAMPLES);
    },

    get(idOrNum) {
      if (!idOrNum) return null;
      const num = parseInt(String(idOrNum).replace(/\D+/g, ''), 10);
      return EXAMPLES[num] || null;
    },

    getOrTemplate(idOrNum) {
      const ex = this.get(idOrNum);
      if (ex) return ex;
      const num = parseInt(String(idOrNum).replace(/\D+/g, ''), 10);
      return getDefaultTemplate(num);
    },

    loadInto(workspace, example) {
      if (!workspace || !example || !example.state) return;
      try {
        workspace.clear();
        Blockly.serialization.workspaces.load(example.state, workspace);
      } catch (err) {
        console.error('Ошибка загрузки примера:', err);
      }
    }
  };
})();

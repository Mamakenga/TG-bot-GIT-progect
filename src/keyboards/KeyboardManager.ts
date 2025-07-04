// src/keyboards/KeyboardManager.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
export class KeyboardManager {
  // ✅ УБРАЛИ static, теперь это обычный метод
  getMainKeyboard(user: any): any {
    if (!user) {
      return {
        keyboard: [
          ['🌱 Старт', '📋 Помощь']
        ],
        resize_keyboard: true,
        persistent: true
      };
    }

    if (user.course_completed) {
      return {
        keyboard: [
          ['🌱 Начать заново', '📊 Мой прогресс'],
          ['📋 Помощь']
        ],
        resize_keyboard: true,
        persistent: true
      };
    }

    const isPaused = Boolean(user.is_paused);
    
    if (isPaused) {
      return {
        keyboard: [
          ['▶️ Продолжить', '📊 Мой прогресс'],
          ['📋 Помощь']
        ],
        resize_keyboard: true,
        persistent: true
      };
    }

    return {
      keyboard: [
        ['📊 Мой прогресс', '⏸️ Пауза'],
        ['📋 Помощь']
      ],
      resize_keyboard: true,
      persistent: true
    };
  }

  // ✅ СТАТИЧЕСКИЙ МЕТОД для обратной совместимости (если где-то вызывается)
  static getMainKeyboard(user: any): any {
    const manager = new KeyboardManager();
    return manager.getMainKeyboard(user);
  }
}

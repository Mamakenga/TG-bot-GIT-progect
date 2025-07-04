// src/handlers/CommandHandlers.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
import TelegramBot from 'node-telegram-bot-api';
import { Database } from '../database';
import { KeyboardManager } from '../keyboards/KeyboardManager';
import { logger } from '../utils/Logger';
import { courseContent, getDayContent } from '../course-logic';
import { checkForAlerts, sendAlert } from '../utils';

export class CommandHandlers {
  constructor(
    private bot: TelegramBot,
    private database: Database,
    private keyboardManager: KeyboardManager
  ) {}

  async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const name = msg.from?.first_name;

    if (!telegramId) return;

    try {
      logger.info(`Пользователь ${telegramId} (${name}) запустил старт`);
      
      await this.database.createUser(telegramId, name);
      const user = await this.database.getUser(telegramId);
      
      if (user?.course_completed) {
        await this.sendReturningCompletedUserMessage(chatId, name, user);
      } else if (user && user.current_day > 1) {
        await this.sendReturningUserMessage(chatId, name, user);
      } else {
        await this.sendNewUserMessage(chatId, name, user);
      }
      
    } catch (error) {
      logger.error('Ошибка в handleStart', error);
      try {
        await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.', {
          reply_markup: KeyboardManager.getMainKeyboard(null)
        });
      } catch {}
    }
  }

  private async sendReturningCompletedUserMessage(chatId: number, name: string | undefined, user: any): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `🎉 Привет${name ? `, ${name}` : ''}! \n\nТы уже завершила 7-дневный курс заботы о себе! \nПоздравляю с этим достижением! 💙\n\nМожешь пройти курс заново или использовать полученные навыки в повседневной жизни.`, {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  private async sendReturningUserMessage(chatId: number, name: string | undefined, user: any): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `🌸 С возвращением${name ? `, ${name}` : ''}!\n\nТы сейчас на ${user.current_day} дне курса заботы о себе.\nПродолжим наше путешествие? 💙`, {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  private async sendNewUserMessage(chatId: number, name: string | undefined, user: any): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `🌸 Привет${name ? `, ${name}` : ''}! Я бот-помощник по заботе о себе.\n\nЗа 7 дней мы мягко исследуем, как быть добрее к себе.\n\nГотова начать это путешествие?`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🌱 Да, готова', callback_data: 'start_yes' },
          { text: '❓ Расскажи подробнее', callback_data: 'more_info' },
          { text: '⏰ Позже', callback_data: 'later' }
        ]]
      }
    });
    
    await this.bot.sendMessage(chatId, 'Для быстрого доступа используй кнопки ниже:', {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const user = telegramId ? await this.database.getUser(telegramId) : null;
    
    const helpText = `📋 Помощь по боту:\n\n🌸 Основные кнопки:\n• Старт - Начать или перезапустить курс\n• Мой прогресс - Показать текущий статус\n• Пауза/Продолжить - Управление курсом\n\n💙 О программе:\n7-дневный курс заботы о себе\n4 сообщения в день (9:00, 13:00, 16:00, 20:00)\n\n🆘 Поддержка:\n• Email: help@harmony4soul.com\n• Телеграм: @amalinovskaya_psy`;
    
    await this.bot.sendMessage(msg.chat.id, helpText, {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  async handleProgress(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(msg.chat.id, 'Сначала нужно запустить бота. Нажми "Старт" 🌱');
        return;
      }

      let progressText = `📊 Твой прогресс:\n\n`;
      
      if (user.course_completed) {
        progressText += `🎉 Курс завершен!\nПоздравляю! Ты прошла все 7 дней заботы о себе.`;
      } else {
        const currentDay = user.current_day || 1;
        progressText += `📅 День: ${currentDay} из 7\n`;
        progressText += `🌱 Статус: ${user.is_paused ? 'На паузе' : 'Активен'}`;
      }

      await this.bot.sendMessage(msg.chat.id, progressText, {
        reply_markup: KeyboardManager.getMainKeyboard(user)
      });

    } catch (error) {
      logger.error('Ошибка в handleProgress', error);
    }
  }

  async handleCallback(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = callbackQuery.message?.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (!chatId || !data) return;

    try {
      await this.bot.answerCallbackQuery(callbackQuery.id);

      if (data === 'start_yes') {
        await this.database.updateUserDay(telegramId, 1);
        const user = await this.database.getUser(telegramId);
        
        await this.bot.sendMessage(chatId, 
          `🎉 Отлично! Ты записана на курс!\n\nЗавтра в 9:00 утра тебе придет первое сообщение.\nЗа день будет 4 сообщения:\n🌅 09:00 - Утреннее приветствие\n🌸 13:00 - Упражнение дня\n💝 16:00 - Фраза для размышления\n🌙 20:00 - Вечерняя рефлексия\n\nГотова начать завтра? 💙`, {
          reply_markup: KeyboardManager.getMainKeyboard(user)
        });
      } else if (data === 'more_info') {
        const infoText = `📚 Курс состоит из 7 дней:\n\n` +
          courseContent.map((day, index) => `📅 День ${index + 1}: ${day.title}`).join('\n') +
          `\n\nКаждый день - 4 коротких сообщения.\nГотова попробовать?`;

        await this.bot.sendMessage(chatId, infoText, {
          reply_markup: {
            inline_keyboard: [[
              { text: '🌱 Да, начинаем!', callback_data: 'start_yes' },
              { text: '⏰ Позже', callback_data: 'later' }
            ]]
          }
        });
      } else if (data === 'later') {
        const user = await this.database.getUser(telegramId);
        await this.bot.sendMessage(chatId, 'Понимаю 🤗 Напиши "Старт" когда будешь готова.', {
          reply_markup: KeyboardManager.getMainKeyboard(user)
        });
      }

      // ✅ НОВОЕ: Обработка кнопки "Нужна помощь"
      if (data.includes('_exercise_help')) {
        const user = await this.database.getUser(telegramId);
        if (user) {
          const currentDay = user.current_day || 1;
          await this.handleExerciseHelp(chatId, currentDay);
        }
        return;
      }

      // Обработка других callback'ов
      if (data.startsWith('day_')) {
        const user = await this.database.getUser(telegramId);
        if (user) {
          await this.database.saveResponse(user.id, user.current_day || 1, 'button_choice', data);
          
          const responses = [
            'Спасибо за ответ! 💙',
            'Важно, что ты находишь время на себя! 🌸', 
            'Хорошо, что ты написала это 💙'
          ];
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];
          
          await this.bot.sendMessage(chatId, randomResponse, {
            reply_markup: KeyboardManager.getMainKeyboard(user)
          });
        }
      }

    } catch (error) {
      logger.error('Ошибка в handleCallback', error);
    }
  }

  // ✅ НОВЫЙ МЕТОД: Специализированная помощь для каждого упражнения
  private async handleExerciseHelp(chatId: number, day: number): Promise<void> {
    try {
      const helpTexts: { [key: number]: string } = {
        1: `💡 **Помощь с упражнением "Осознание боли":**

Это упражнение учит распознавать и принимать свою боль без попыток её исправить.

🔹 **Что делать:**
• Сядь удобно и закрой глаза
• Вспомни недавнюю ситуацию, которая расстроила
• НЕ думай "как это исправить"
• Просто скажи: "Да, мне было больно"

🔹 **Нормальные реакции:**
• Желание отвлечься - это нормально
• Слёзы или грусть - позволь им быть
• Сопротивление - тоже естественно

💙 **Помни:** цель НЕ избавиться от боли, а признать её.`,

        2: `💡 **Помощь с упражнением "Поймать критика":**

Внутренний критик - автоматические мысли, которые нас осуждают.

🔹 **Как заметить критика:**
• Обращай внимание на мысли после ошибок
• Слушай, что говоришь себе в зеркале
• Замечай фразы "опять ты...", "какая же ты..."

🔹 **Как переформулировать:**
• Вместо "дура" → "человек, который ошибся"
• Вместо "всё плохо" → "это сложно, но решаемо"
• Вместо "никогда не получится" → "пока не получается"

💙 **Помни:** цель не заглушить критика, а сделать его добрее.`,

        3: `💡 **Помощь с упражнением "Письмо себе":**

Это письмо от лица самого мудрого и доброго друга.

🔹 **С чего начать:**
• "Дорогая [имя], я вижу как тебе трудно..."
• "Я хочу, чтобы ты знала..."
• "Ты заслуживаешь..."

🔹 **О чём писать:**
• Признание твоих усилий
• Понимание твоих трудностей
• Слова поддержки и любви
• То, что сказал бы лучший друг

💙 **Помни:** пиши так, как писал бы кто-то, кто тебя очень любит.`,

        4: `💡 **Помощь с упражнением "Сострадательное прикосновение":**

Прикосновения активируют успокаивающую систему организма.

🔹 **Варианты прикосновений:**
• Рука на сердце
• Рука на щеке
• Объятие себя руками
• Поглаживание руки

🔹 **Что говорить:**
• "Я здесь"
• "Я поддержу тебя"
• "Ты не одна"
• "Это пройдёт"

💙 **Помни:** это не глупо, это научно обоснованный способ самоуспокоения.`,

        5: `💡 **Помощь с упражнением "Разрешение быть уязвимой":**

Уязвимость - это смелость быть настоящей.

🔹 **Как практиковать:**
• Назови эмоцию: "Сейчас я чувствую..."
• Не пытайся её изменить
• Просто побудь с чувством 1-2 минуты
• Скажи: "Это нормально чувствовать"

🔹 **Если сложно:**
• Начни с менее болезненных эмоций
• Представь, что утешаешь ребёнка
• Помни: чувства временны

💙 **Помни:** уязвимость - источник связи и роста.`,

        6: `💡 **Помощь с упражнением "Забота о потребностях":**

Учимся слышать и удовлетворять свои потребности.

🔹 **Базовые потребности:**
• Физические: вода, еда, сон, движение
• Эмоциональные: поддержка, понимание
• Ментальные: покой, стимуляция
• Духовные: смысл, красота

🔹 **Как определить потребность:**
• "Что мне сейчас нужно?"
• "Чего не хватает?"
• "Что помогло бы почувствовать себя лучше?"

💙 **Помни:** забота о себе не эгоизм, а необходимость.`,

        7: `💡 **Помощь с упражнением "Благодарность себе":**

Финальное упражнение - признание пройденного пути.

🔹 **За что благодарить:**
• За каждое выполненное упражнение
• За моменты самосострадания
• За попытки быть добрее к себе
• За завершение курса

🔹 **Как формулировать:**
• "Спасибо себе за..."
• "Я ценю в себе..."
• "Я горжусь тем, что..."

💙 **Помни:** ты проделала серьёзную внутреннюю работу. Это достижение!`
      };

      const helpText = helpTexts[day] || `💡 **Помощь с упражнением дня ${day}:**

Если упражнение кажется сложным, это нормально. Забота о себе требует практики.

💙 **Общие советы:**
• Не торопись
• Будь терпелива к себе  
• Начни с малого
• Главное - попробовать`;

      await this.bot.sendMessage(chatId, helpText);

      // Добавляем контакт психолога
      await this.bot.sendMessage(chatId, 
        `🧠 **Нужна персональная поддержка?**

Если упражнение вызывает сильные эмоции или ты чувствуешь, что нужна дополнительная помощь, можешь обратиться к психологу:

👩‍⚕️ **@amalinovskaya_psy** - профессиональная поддержка

💙 Помни: просить помощи - это сила, а не слабость.`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '💙 Понятно, спасибо', callback_data: 'help_understood' }
          ]]
        }
      });

    } catch (error) {
      logger.error('Ошибка в handleExerciseHelp', error);
    }
  }
}

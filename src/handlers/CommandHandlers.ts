// src/handlers/CommandHandlers.ts
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
    
    const helpText = `📋 Помощь по боту:\n\n🌸 Основные кнопки:\n• Старт - Начать или перезапустить курс\n• Мой прогресс - Показать текущий статус\n• Пауза/Продолжить - Управление курсом\n\n💙 О программе:\n7-дневный курс заботы о себе\n4 сообщения в день (9:00, 13:00, 16:00, 20:00)\n\n🆘 Поддержка: help@harmony4soul.com`;
    
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
}
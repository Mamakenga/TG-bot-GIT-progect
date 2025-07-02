// src/bot.ts - ИСПРАВЛЕННАЯ ФИНАЛЬНАЯ ВЕРСИЯ
console.log('🚀 Запуск бота...');

import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { Database } from './database';
import { courseContent, getDayContent } from './course-logic';
import { checkForAlerts, sendAlert } from './utils';
import { ExpressServer } from './server/ExpressServer';
import { ReminderScheduler } from './scheduling/ReminderScheduler';
import { KeyboardManager } from './keyboards/KeyboardManager';
import { CommandHandlers } from './handlers/CommandHandlers';
import { logger } from './utils/Logger';

class SelfCareBot {
  private bot: TelegramBot;
  private expressServer: ExpressServer;
  private database: Database;
  private reminderScheduler: ReminderScheduler;
  private commandHandlers: CommandHandlers;
  private keyboardManager: KeyboardManager;

  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { 
      polling: false,
      webHook: false
    });
    this.database = new Database();
    this.expressServer = new ExpressServer(this.bot, this.database);
    this.reminderScheduler = new ReminderScheduler(this.bot, this.database);
    this.keyboardManager = new KeyboardManager();
    this.commandHandlers = new CommandHandlers(this.bot, this.database, this.keyboardManager);
    
    this.setupHandlers();
  }

  async init(): Promise<void> {
    try {
      logger.info('Инициализация базы данных...');
      await this.database.init();
      
      const PORT = Number(process.env.PORT) || 3000;
      
      logger.info('Запуск веб-сервера...');
      await this.expressServer.start(PORT);

      logger.info('Настройка системы напоминаний...');
      this.reminderScheduler.setup();

      logger.success(`Сервер запущен на порту ${PORT}`);
      logger.success('Telegram бот активен');
      logger.info(`Дашборд: ${process.env.DASHBOARD_URL || 'http://localhost:3000'}/dashboard`);

      if (process.env.NODE_ENV === 'production') {
        logger.info('Настройка webhook...');
        this.setupWebhook();
      } else {
        logger.info('Запуск polling...');
        this.bot.startPolling();
        logger.success('Polling режим активен');
      }

      // Graceful shutdown
      const shutdown = async (signal: string) => {
        logger.info(`Получен сигнал ${signal}, корректное завершение...`);
        try {
          this.reminderScheduler.stop();
          await this.database.close();
          logger.success('База данных закрыта');
          process.exit(0);
        } catch (error) {
          logger.error('Ошибка при завершении', error);
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
      logger.error('Критическая ошибка при инициализации', error);
      process.exit(1);
    }
  }

  private setupWebhook(): void {
    const url = process.env.DASHBOARD_URL || 'https://tg-bot-git-progect-production.up.railway.app';
    const webhookUrl = `${url}/bot${config.telegram.token}`;
    
    this.bot.setWebHook(webhookUrl).then(() => {
      logger.success(`Webhook установлен: ${webhookUrl}`);
    }).catch((error) => {
      logger.error('Ошибка установки webhook', error);
    });
  }

  private setupHandlers(): void {
    // Команды через CommandHandlers
    this.bot.onText(/\/start/, this.commandHandlers.handleStart.bind(this.commandHandlers));
    this.bot.onText(/\/help/, this.commandHandlers.handleHelp.bind(this.commandHandlers));
    this.bot.onText(/\/stats/, this.handleStats.bind(this));
    this.bot.onText(/\/test/, this.handleTest.bind(this));
    this.bot.onText(/\/pause/, this.handlePause.bind(this));
    this.bot.onText(/\/resume/, this.handleResume.bind(this));

    // Обработка кнопок меню
    this.bot.onText(/^🌱 Старт$/, this.commandHandlers.handleStart.bind(this.commandHandlers));
    this.bot.onText(/^🌱 Начать заново$/, this.handleRestart.bind(this));
    this.bot.onText(/^📋 Помощь$/, this.commandHandlers.handleHelp.bind(this.commandHandlers));
    this.bot.onText(/^⏸️ Пауза$/, this.handlePause.bind(this));
    this.bot.onText(/^▶️ Продолжить$/, this.handleResume.bind(this));
    this.bot.onText(/^📊 Мой прогресс$/, this.commandHandlers.handleProgress.bind(this.commandHandlers));

    // Callback кнопки
    this.bot.on('callback_query', this.commandHandlers.handleCallback.bind(this.commandHandlers));

    // Текстовые сообщения
    this.bot.on('message', this.handleText.bind(this));

    // Обработка ошибок
    this.bot.on('error', (error) => {
      logger.error('Ошибка Telegram бота', error);
    });

    this.bot.on('polling_error', (error) => {
      logger.error('Ошибка polling', error);
    });

    this.bot.on('webhook_error', (error) => {
      logger.error('Ошибка webhook', error);
    });

    // Глобальная обработка ошибок
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
  }

  // Оставшиеся простые обработчики
  private async handleText(msg: TelegramBot.Message): Promise<void> {
    if (msg.text?.startsWith('/')) return;

    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const text = msg.text;

    if (!telegramId || !text) return;

    try {
      const alertFound = await checkForAlerts(text);
      if (alertFound) {
        const user = await this.database.getUser(telegramId);
        if (user) {
          await this.database.createAlert(user.id, alertFound, text);
          await sendAlert(`🚨 АЛЕРТ от пользователя ${user.name || telegramId}:\n"${text}"`);
          
          await this.bot.sendMessage(chatId, 
            `Я очень обеспокоена твоими словами 💙\n\nПожалуйста, обратись:\n📞 Телефон доверия: 8-800-2000-122\n🚨 Экстренная помощь: 112\n\nТы не одна.`
          );
          return;
        }
      }

      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, user.current_day || 1, 'free_text', text);
        
        const responses = [
          'Спасибо за откровенность 💙',
          'Благодарю за доверие 🌸',
          'Твои слова важны 💙',
          'Спасибо, что поделилась 🤗'
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        
        await this.bot.sendMessage(chatId, randomResponse);
      }
    } catch (error) {
      logger.error('Ошибка в handleText', error);
    }
  }

  private async handlePause(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      await this.database.pauseUser(telegramId);
      const user = await this.database.getUser(telegramId);
      
      await this.bot.sendMessage(msg.chat.id, 'Курс приостановлен. Нажми "Продолжить" когда будешь готова 💙', {
        reply_markup: KeyboardManager.getMainKeyboard(user)
      });
    } catch (error) {
      logger.error('Ошибка в handlePause', error);
    }
  }

  private async handleResume(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      await this.database.resumeUser(telegramId);
      const user = await this.database.getUser(telegramId);
      
      await this.bot.sendMessage(msg.chat.id, 'Курс возобновлен! Продолжаем путь заботы о себе 🌱', {
        reply_markup: KeyboardManager.getMainKeyboard(user)
      });
    } catch (error) {
      logger.error('Ошибка в handleResume', error);
    }
  }

  private async handleRestart(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    const name = msg.from?.first_name;

    if (!telegramId) return;

    try {
      await this.database.resetUserProgress(telegramId);
      await this.database.updateUserDay(telegramId, 1);
      const user = await this.database.getUser(telegramId);
      
      await this.bot.sendMessage(chatId, 
        `🎉 Отлично${name ? `, ${name}` : ''}! Ты записана на курс заново!\n\nЗавтра в 9:00 утра тебе придет первое сообщение. Готова начать завтра заново? 💙`, {
        reply_markup: KeyboardManager.getMainKeyboard(user)
      });
      
    } catch (error) {
      logger.error('Ошибка в handleRestart', error);
    }
  }

  private async handleTest(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(msg.chat.id, 'Сначала запусти /start');
        return;
      }

      const currentDay = user.current_day || 1;
      const dayContent = getDayContent(currentDay);
      
      if (!dayContent) {
        await this.bot.sendMessage(msg.chat.id, 'Контент для этого дня не найден');
        return;
      }

      await this.bot.sendMessage(msg.chat.id, `🧪 ТЕСТ: День ${currentDay}\n\n=== УТРО ===`);
      await this.bot.sendMessage(msg.chat.id, dayContent.morningMessage);

    } catch (error) {
      logger.error('Ошибка в handleTest', error);
    }
  }

  private async handleStats(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId || telegramId.toString() !== config.telegram.adminId) return;

    try {
      const stats = await this.database.getStats();
      const statsText = `📊 Статистика:\n\n👥 Всего: ${stats.totalUsers}\n📈 Сегодня: ${stats.activeToday}\n🎯 Завершили: ${stats.completedCourse}`;
      await this.bot.sendMessage(msg.chat.id, statsText);
    } catch (error) {
      logger.error('Ошибка статистики', error);
    }
  }
}

// Запуск бота
const bot = new SelfCareBot();
bot.init().catch(console.error);

export default SelfCareBot;
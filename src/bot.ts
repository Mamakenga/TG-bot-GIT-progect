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
import cron from 'node-cron';

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
    this.setupReminders();
  }

  async init(): Promise<void> {
    try {
      logger.info('Инициализация базы данных...');
      await this.database.init();
      
      const PORT = Number(process.env.PORT) || 3000;
      
      logger.info('Запуск веб-сервера...');
      await this.expressServer.start(PORT);

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
    
    // ✅ ВАЖНО: КОМАНДЫ АНТИДУБЛИРОВАНИЯ ПЕРЕД /test!
this.bot.onText(/\/testreminder$/, this.handleTestReminder.bind(this));
this.bot.onText(/\/clearlogs$/, this.handleClearLogs.bind(this));
this.bot.onText(/\/checklogs$/, this.handleCheckLogs.bind(this));

// ✅ КОМАНДЫ ТЕСТИРОВАНИЯ (ПОСЛЕ команд антидублирования)
this.bot.onText(/\/test$/, this.handleTest.bind(this));
this.bot.onText(/\/nextday$/, this.handleNextDay.bind(this));
this.bot.onText(/\/pause$/, this.handlePause.bind(this));
this.bot.onText(/\/resume$/, this.handleResume.bind(this));

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

  // ✅ === ИСПРАВЛЕННАЯ СИСТЕМА НАПОМИНАНИЙ С АНТИДУБЛИРОВАНИЕМ ===
  private setupReminders(): void {
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Отправка утренних напоминаний...');
      await this.sendMorningMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    cron.schedule('0 13 * * *', async () => {
      console.log('⏰ Отправка дневных упражнений...');
      await this.sendExerciseMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    cron.schedule('0 16 * * *', async () => {
      console.log('⏰ Отправка фраз дня...');
      await this.sendPhraseMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    cron.schedule('0 20 * * *', async () => {
      console.log('⏰ Отправка вечерних рефлексий...');
      await this.sendEveningMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    console.log('⏰ Напоминания настроены на московское время:');
    console.log('   🌅 09:00 - Утренние сообщения');  
    console.log('   🌸 13:00 - Упражнения дня');
    console.log('   💝 16:00 - Фразы дня');
    console.log('   🌙 20:00 - Вечерние рефлексии');
  }

  // ✅ УТРЕННИЕ СООБЩЕНИЯ с антидублированием
  private async sendMorningMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();
      console.log(`📊 Найдено ${activeUsers.length} активных пользователей для утренних сообщений`);

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) {
            continue;
          }

          const currentDay = user.current_day || 1;
          
          // ✅ ПРОВЕРЯЕМ, НЕ ОТПРАВЛЯЛИ ЛИ УЖЕ СЕГОДНЯ
          const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'morning');
          if (alreadySent) {
            console.log(`⏩ Утреннее напоминание уже отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
            continue;
          }

          const dayContent = getDayContent(currentDay);
          if (!dayContent) {
            console.log(`⚠️ Контент для дня ${currentDay} не найден`);
            continue;
          }

          // ✅ ОТПРАВЛЯЕМ ТОЛЬКО ТЕКСТ УТРОМ, БЕЗ КНОПОК
          await this.bot.sendMessage(user.telegram_id, dayContent.morningMessage);

          // ✅ ЛОГИРУЕМ ОТПРАВКУ ДЛЯ ПРЕДОТВРАЩЕНИЯ ДУБЛЕЙ
          await this.database.logReminderSent(user.id, currentDay, 'morning');

          console.log(`✅ Утреннее сообщение отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (userError) {
          console.error(`❌ Ошибка отправки утреннего сообщения пользователю ${user.telegram_id}:`, userError);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в sendMorningMessages:', error);
    }
  }

  // ✅ УПРАЖНЕНИЯ с антидублированием
  private async sendExerciseMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();
      console.log(`📊 Найдено ${activeUsers.length} активных пользователей для упражнений`);

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
          
          // ✅ ПРОВЕРЯЕМ, НЕ ОТПРАВЛЯЛИ ЛИ УЖЕ СЕГОДНЯ
          const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'exercise');
          if (alreadySent) {
            console.log(`⏩ Упражнение уже отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
            continue;
          }

          const dayContent = getDayContent(currentDay);
          if (!dayContent) continue;

          await this.bot.sendMessage(user.telegram_id, dayContent.exerciseMessage, {
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Готова попробовать', callback_data: `day_${currentDay}_exercise_ready` },
                { text: '❓ Нужна помощь', callback_data: `day_${currentDay}_exercise_help` },
                { text: '⏰ Сделаю позже', callback_data: `day_${currentDay}_exercise_later` }
              ]]
            }
          });

          // ✅ ЛОГИРУЕМ ОТПРАВКУ
          await this.database.logReminderSent(user.id, currentDay, 'exercise');

          console.log(`✅ Упражнение отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (userError) {
          console.error(`❌ Ошибка отправки упражнения пользователю ${user.telegram_id}:`, userError);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в sendExerciseMessages:', error);
    }
  }

  // ✅ ФРАЗЫ ДНЯ с антидублированием
  private async sendPhraseMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();
      console.log(`📊 Найдено ${activeUsers.length} активных пользователей для фраз дня`);

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
          
          // ✅ ПРОВЕРЯЕМ, НЕ ОТПРАВЛЯЛИ ЛИ УЖЕ СЕГОДНЯ
          const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'phrase');
          if (alreadySent) {
            console.log(`⏩ Фраза дня уже отправлена пользователю ${user.telegram_id} (день ${currentDay})`);
            continue;
          }

          const dayContent = getDayContent(currentDay);
          if (!dayContent) continue;

          await this.bot.sendMessage(user.telegram_id, dayContent.phraseOfDay, {
            reply_markup: {
              inline_keyboard: [[
                { text: '💙 Откликается', callback_data: `day_${currentDay}_phrase_resonates` },
                { text: '🤔 Звучит странно', callback_data: `day_${currentDay}_phrase_strange` },
                { text: '😔 Сложно поверить', callback_data: `day_${currentDay}_phrase_difficult` }
              ]]
            }
          });

          // ✅ ЛОГИРУЕМ ОТПРАВКУ
          await this.database.logReminderSent(user.id, currentDay, 'phrase');

          console.log(`✅ Фраза дня отправлена пользователю ${user.telegram_id} (день ${currentDay})`);
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (userError) {
          console.error(`❌ Ошибка отправки фразы дня пользователю ${user.telegram_id}:`, userError);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в sendPhraseMessages:', error);
    }
  }

  // ✅ ВЕЧЕРНИЕ СООБЩЕНИЯ с антидублированием
  private async sendEveningMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();
      console.log(`📊 Найдено ${activeUsers.length} активных пользователей для вечерних сообщений`);

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
          
          // ✅ ПРОВЕРЯЕМ, НЕ ОТПРАВЛЯЛИ ЛИ УЖЕ СЕГОДНЯ
          const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'evening');
          if (alreadySent) {
            console.log(`⏩ Вечернее сообщение уже отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
            continue;
          }

          const dayContent = getDayContent(currentDay);
          if (!dayContent) continue;

          await this.bot.sendMessage(user.telegram_id, dayContent.eveningMessage, {
            reply_markup: dayContent.options ? {
              // ✅ КНОПКИ ВЕЧЕРОМ ВЕРТИКАЛЬНО (каждая на своей строке)
              inline_keyboard: dayContent.options.map((option, index) => [{
                text: option.text,
                callback_data: `day_${currentDay}_evening_${index}`
              }])
            } : undefined
          });

          // ✅ ЛОГИРУЕМ ОТПРАВКУ
          await this.database.logReminderSent(user.id, currentDay, 'evening');

          // ✅ ПРОВЕРЯЕМ, НУЖНО ЛИ ПЕРЕВЕСТИ НА СЛЕДУЮЩИЙ ДЕНЬ
          const shouldAdvance = await this.database.shouldAdvanceUserDay(user.id, currentDay);
          if (shouldAdvance && currentDay < 7) {
            await this.database.updateUserDay(user.telegram_id, currentDay + 1);
            console.log(`📅 Пользователь ${user.telegram_id} переведен на день ${currentDay + 1}`);
          }

          console.log(`✅ Вечернее сообщение отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (userError) {
          console.error(`❌ Ошибка отправки вечернего сообщения пользователю ${user.telegram_id}:`, userError);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в sendEveningMessages:', error);
    }
  }

  // ✅ === ИСПРАВЛЕННЫЕ КОМАНДЫ ТЕСТИРОВАНИЯ ===

  // ИСПРАВЛЕННАЯ команда /test - отправляет ВСЕ сообщения дня с интервалами
  private async handleTest(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Сначала запусти /start');
        return;
      }

      const currentDay = user.current_day || 1;
      const dayContent = getDayContent(currentDay);
      
      if (!dayContent) {
        await this.bot.sendMessage(chatId, 'Контент для этого дня не найден');
        return;
      }

      // ОТПРАВЛЯЕМ ВСЕ 4 СООБЩЕНИЯ ДНЯ С ИНТЕРВАЛАМИ

      // 1. УТРЕННЕЕ СООБЩЕНИЕ
      await this.bot.sendMessage(chatId, `🧪 ТЕСТ: День ${currentDay} - ВСЕ СООБЩЕНИЯ\n\n=== 09:00 УТРО ===`);
      await this.bot.sendMessage(chatId, dayContent.morningMessage);

      // 2. УПРАЖНЕНИЕ (через 3 сек)
      setTimeout(async () => {
        try {
          await this.bot.sendMessage(chatId, `=== 13:00 УПРАЖНЕНИЕ ===`);
          await this.bot.sendMessage(chatId, dayContent.exerciseMessage, {
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Готова попробовать', callback_data: `day_${currentDay}_exercise_ready` },
                { text: '❓ Нужна помощь', callback_data: `day_${currentDay}_exercise_help` },
                { text: '⏰ Сделаю позже', callback_data: `day_${currentDay}_exercise_later` }
              ]]
            }
          });
        } catch (error) {
          console.error('Ошибка отправки упражнения:', error);
        }
      }, 3000);

      // 3. ФРАЗА ДНЯ (через 6 сек)
      setTimeout(async () => {
        try {
          await this.bot.sendMessage(chatId, `=== 16:00 ФРАЗА ДНЯ ===`);
          await this.bot.sendMessage(chatId, dayContent.phraseOfDay, {
            reply_markup: {
              inline_keyboard: [[
                { text: '💙 Откликается', callback_data: `day_${currentDay}_phrase_resonates` },
                { text: '🤔 Звучит странно', callback_data: `day_${currentDay}_phrase_strange` },
                { text: '😔 Сложно поверить', callback_data: `day_${currentDay}_phrase_difficult` }
              ]]
            }
          });
        } catch (error) {
          console.error('Ошибка отправки фразы дня:', error);
        }
      }, 6000);

      // 4. ВЕЧЕРНЕЕ СООБЩЕНИЕ (через 9 сек)
      setTimeout(async () => {
        try {
          await this.bot.sendMessage(chatId, `=== 20:00 ВЕЧЕРНЯЯ РЕФЛЕКСИЯ ===`);
          await this.bot.sendMessage(chatId, dayContent.eveningMessage, {
            reply_markup: dayContent.options ? {
              inline_keyboard: dayContent.options.map((option, index) => [{
                text: option.text,
                callback_data: `day_${currentDay}_evening_${index}`
              }])
            } : undefined
          });
        } catch (error) {
          console.error('Ошибка отправки вечернего сообщения:', error);
        }
      }, 9000);

      // 5. ЗАВЕРШЕНИЕ ТЕСТА (через 12 сек)
      setTimeout(async () => {
        try {
          await this.bot.sendMessage(chatId, 
            `✅ ТЕСТ ЗАВЕРШЕН!\n\n` +
            `Ты получила все сообщения дня ${currentDay}.\n` +
            `Используй команды:\n` +
            `• /nextday - перейти к дню ${currentDay + 1}\n` +
            `• /test - повторить тест текущего дня`
          );
        } catch (error) {
          console.error('Ошибка завершения теста:', error);
        }
      }, 12000);

    } catch (error) {
      console.error('❌ Ошибка в handleTest:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при тестировании');
    }
  }

  // ✅ ИСПРАВЛЕННАЯ команда /nextday
  private async handleNextDay(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;

    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Сначала запусти /start');
        return;
      }

      const currentDay = user.current_day || 1;
      const nextDay = currentDay + 1;

      if (nextDay > 7) {
        await this.database.markCourseCompleted(telegramId);
        await this.bot.sendMessage(chatId, '🎉 Курс завершен! Поздравляю!\n\nИспользуй /start для перезапуска курса.');
        return;
      }

      // Помечаем текущий день как завершенный
      await this.database.markDayCompleted(user.id, currentDay);
      
      // Переходим к следующему дню
      await this.database.updateUserDay(telegramId, nextDay);
      
      const nextDayContent = getDayContent(nextDay);
      const dayTitle = nextDayContent ? nextDayContent.title : `День ${nextDay}`;
      
      await this.bot.sendMessage(chatId, 
        `✅ Переход на день ${nextDay}!\n\n` +
        `📋 Тема: "${dayTitle}"\n\n` +
        `Теперь команда /test покажет день ${nextDay}.\n\n` +
        `💡 Доступные команды:\n` +
        `• /test - тест дня ${nextDay}\n` +
       `• /nextday - перейти к дню ${nextDay + 1 <= 7 ? nextDay + 1 : 'завершить курс'}`
      );

    } catch (error) {
      console.error('❌ Ошибка в handleNextDay:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при переходе к следующему дню');
    }
  }

  // ✅ === КОМАНДЫ ТЕСТИРОВАНИЯ АНТИДУБЛИРОВАНИЯ (только для админа) ===

  private async handleTestReminder(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!telegramId || telegramId.toString() !== config.telegram.adminId) {
      await this.bot.sendMessage(chatId, '❌ Команда только для администратора');
      return;
    }

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Сначала запусти /start');
        return;
      }

      const currentDay = user.current_day || 1;
      
      // Проверяем, отправляли ли уже утреннее напоминание сегодня
      const morningAlreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'morning');
      
      await this.bot.sendMessage(chatId, 
        `🧪 ТЕСТ СИСТЕМЫ АНТИДУБЛИРОВАНИЯ\n\n` +
        `👤 Пользователь: ${user.telegram_id}\n` +
        `📅 День: ${currentDay}\n` +
        `🌅 Утреннее напоминание сегодня: ${morningAlreadySent ? '✅ УЖЕ ОТПРАВЛЕНО' : '❌ НЕ ОТПРАВЛЕНО'}\n\n` +
        `Отправляю тестовое утреннее сообщение...`
      );

      // Принудительно отправляем утреннее сообщение
      const dayContent = getDayContent(currentDay);
      if (dayContent) {
        await this.bot.sendMessage(chatId, `🧪 ТЕСТ: ${dayContent.morningMessage}`);
        
        // Логируем как отправленное
        await this.database.logReminderSent(user.id, currentDay, 'morning');
        
        await this.bot.sendMessage(chatId, 
          `✅ Сообщение отправлено и залогировано!\n\n` +
          `Теперь попробуй команду /testreminder еще раз - должно сказать "УЖЕ ОТПРАВЛЕНО"`
        );
      }
      
    } catch (error) {
      console.error('❌ Ошибка в handleTestReminder:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при тестировании');
    }
  }

  private async handleClearLogs(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!telegramId || telegramId.toString() !== config.telegram.adminId) {
      await this.bot.sendMessage(chatId, '❌ Команда только для администратора');
      return;
    }

    try {
      // Очищаем логи напоминаний за сегодня
      const query = `DELETE FROM reminder_log WHERE sent_date = CURRENT_DATE`;
      await this.database.pool.query(query);
      
      await this.bot.sendMessage(chatId, 
        `✅ Логи напоминаний за сегодня очищены!\n\n` +
        `Теперь все напоминания можно отправить заново.\n` +
        `Используй /testreminder для проверки.`
      );
      
    } catch (error) {
      console.error('❌ Ошибка в handleClearLogs:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при очистке логов');
    }
  }

  private async handleCheckLogs(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!telegramId || telegramId.toString() !== config.telegram.adminId) {
      await this.bot.sendMessage(chatId, '❌ Команда только для администратора');
      return;
    }

    try {
      // Получаем логи за сегодня
      const query = `
        SELECT 
          rl.user_id,
          u.telegram_id,
          u.name,
          rl.day,
          rl.reminder_type,
          rl.sent_at
        FROM reminder_log rl
        JOIN users u ON rl.user_id = u.id
        WHERE rl.sent_date = CURRENT_DATE
        ORDER BY rl.sent_at DESC
        LIMIT 20
      `;
      
      const result = await this.database.pool.query(query);
      const logs = result.rows;
      
      if (logs.length === 0) {
        await this.bot.sendMessage(chatId, '📋 Сегодня напоминания не отправлялись');
        return;
      }
      
      let logText = `📋 ЛОГИ НАПОМИНАНИЙ ЗА СЕГОДНЯ (${logs.length}):\n\n`;
      
      logs.forEach((log, index) => {
        const time = new Date(log.sent_at).toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        logText += `${index + 1}. ${time} | ${log.name || 'Неизвестно'} (${log.telegram_id})\n`;
        logText += `   День ${log.day} | Тип: ${log.reminder_type}\n\n`;
      });
      
      await this.bot.sendMessage(chatId, logText);
      
    } catch (error) {
      console.error('❌ Ошибка в handleCheckLogs:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при проверке логов');
    }
  }

  // === ОСТАЛЬНЫЕ МЕТОДЫ (без изменений) ===

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
        reply_markup: this.keyboardManager.getMainKeyboard(user)
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
        reply_markup: this.keyboardManager.getMainKeyboard(user)
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
        reply_markup: this.keyboardManager.getMainKeyboard(user)
      });
      
    } catch (error) {
      logger.error('Ошибка в handleRestart', error);
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
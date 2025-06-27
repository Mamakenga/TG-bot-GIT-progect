console.log('🚀 Запуск бота...');

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config';
import { Database, DbUser } from './database';
import { courseContent, getDayContent } from './course-logic';
import { checkForAlerts, sendAlert } from './utils';
import { ReminderType } from './types';

class SelfCareBot {
  private bot: TelegramBot;
  private app: express.Application;
  private database: Database;

  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { 
      polling: false,
      webHook: false
    });
    
    this.app = express();
    this.database = new Database();
    
    this.setupMiddleware();
    this.setupHandlers();
    this.setupAdminRoutes();
    this.setupReminders();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.static('public'));
    
    this.app.use((req, res, next) => {
      req.setTimeout(25000);
      next();
    });
  }

  async init(): Promise<void> {
    try {
      console.log('🔧 Инициализация базы данных...');
      await this.database.init();
      
      const PORT = Number(process.env.PORT) || 3000;
      
      console.log('🌐 Запуск веб-сервера...');
      this.app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`🤖 Telegram бот активен`);
        console.log(`📊 Дашборд: ${process.env.DASHBOARD_URL || 'http://localhost:3000'}/dashboard`);
        
        if (process.env.NODE_ENV === 'production') {
          console.log('🔧 Настройка webhook...');
          this.setupWebhook();
        } else {
          console.log('🔧 Запуск polling...');
          this.bot.startPolling();
          console.log('🔄 Polling режим активен');
        }
      });

      // Graceful shutdown
      const shutdown = async (signal: string) => {
        console.log(`📡 Получен сигнал ${signal}, корректное завершение...`);
        try {
          await this.database.close();
          console.log('✅ База данных закрыта');
          process.exit(0);
        } catch (error) {
          console.error('❌ Ошибка при завершении:', error);
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
      console.error('❌ Критическая ошибка при инициализации:', error);
      process.exit(1);
    }
  }

  private setupWebhook(): void {
    const url = process.env.DASHBOARD_URL || 'https://tg-bot-git-progect-production.up.railway.app';
    const webhookUrl = `${url}/bot${config.telegram.token}`;
    
    this.bot.setWebHook(webhookUrl).then(() => {
      console.log(`🔗 Webhook установлен: ${webhookUrl}`);
    }).catch((error) => {
      console.error('❌ Ошибка установки webhook:', error);
    });
  }

  private setupHandlers(): void {
    // Webhook endpoint для Telegram
    this.app.post(`/bot${config.telegram.token}`, async (req, res) => {
      try {
        console.log('📨 Получено обновление от Telegram');
        await this.bot.processUpdate(req.body);
        res.status(200).json({ ok: true });
        console.log('✅ Обновление обработано успешно');
      } catch (error) {
        console.error('❌ Ошибка обработки webhook:', error);
        res.status(200).json({ ok: false, error: 'Internal error' });
      }
    });

    // Команды
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
    this.bot.onText(/\/stats/, this.handleStats.bind(this));
    this.bot.onText(/\/pause/, this.handlePause.bind(this));
    this.bot.onText(/\/resume/, this.handleResume.bind(this));

    // Обработка кнопок меню
    this.bot.onText(/^🌱 Старт$/, this.handleStart.bind(this));
    this.bot.onText(/^📋 Помощь$/, this.handleHelp.bind(this));
    this.bot.onText(/^⏸️ Пауза$/, this.handlePause.bind(this));
    this.bot.onText(/^▶️ Продолжить$/, this.handleResume.bind(this));
    this.bot.onText(/^📊 Мой прогресс$/, this.handleProgress.bind(this));

    // Callback кнопки
    this.bot.on('callback_query', this.handleCallback.bind(this));

    // Текстовые сообщения
    this.bot.on('message', this.handleText.bind(this));

    // Обработка ошибок
    this.bot.on('error', (error) => {
      console.error('❌ Ошибка Telegram бота:', error.message);
      // Не падаем, просто логируем
    });

    this.bot.on('polling_error', (error) => {
      console.error('❌ Ошибка polling:', error.message);
      // Не падаем, просто логируем
    });

    this.bot.on('webhook_error', (error) => {
      console.error('❌ Ошибка webhook:', error.message);
      // Не падаем, просто логируем
    });

    // Глобальная обработка ошибок
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection:', reason);
      // Не падаем, просто логируем
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error.message);
      // При критической ошибке корректно завершаемся
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
  }

  // === СИСТЕМА НАПОМИНАНИЙ ===
  private setupReminders(): void {
    // Утренние сообщения - 9:00 по UTC (12:00 по московскому времени)
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Отправка утренних напоминаний...');
      await this.sendMorningMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    // Дневные упражнения - 13:00 по московскому времени
    cron.schedule('0 13 * * *', async () => {
      console.log('⏰ Отправка дневных упражнений...');
      await this.sendExerciseMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    // Фразы дня - 16:00 по московскому времени  
    cron.schedule('0 16 * * *', async () => {
      console.log('⏰ Отправка фраз дня...');
      await this.sendPhraseMessages();
    }, {
      timezone: "Europe/Moscow"
    });

    // Вечерние рефлексии - 20:00 по московскому времени
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

  // Утренние сообщения - новый день курса
  private async sendMorningMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();
      console.log(`📊 Найдено ${activeUsers.length} активных пользователей`);

      for (const user of activeUsers) {
        try {
          // Проверяем, не завершен ли курс
          if (user.course_completed || (user.current_day || 1) > 7) {
            continue;
          }

          const currentDay = user.current_day || 1;
          const dayContent = getDayContent(currentDay);
          if (!dayContent) {
            console.log(`⚠️ Контент для дня ${currentDay} не найден`);
            continue;
          }

          // Отправляем утреннее сообщение
          await this.bot.sendMessage(user.telegram_id, dayContent.morningMessage, {
            reply_markup: dayContent.options ? {
              inline_keyboard: [
                dayContent.options.map((option, index) => ({
                  text: option.text,
                  callback_data: `day_${currentDay}_morning_${index}`
                }))
              ]
            } : undefined
          });

          console.log(`✅ Утреннее сообщение отправлено пользователю ${user.telegram_id} (день ${currentDay})`);
          
          // Небольшая задержка между отправками
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (userError) {
          console.error(`❌ Ошибка отправки утреннего сообщения пользователю ${user.telegram_id}:`, userError);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в sendMorningMessages:', error);
    }
  }

  // Дневные упражнения
  private async sendExerciseMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
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

  // Фразы дня
  private async sendPhraseMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
          const dayContent = getDayContent(currentDay);
          if (!dayContent) continue;

          await this.bot.sendMessage(user.telegram_id, dayContent.phraseOfDay, {
            reply_markup: {
              inline_keyboard: [[
                { text: '💙 Откликается', callback_data: `day_${currentDay}_phrase_good` },
                { text: '🤔 Звучит странно', callback_data: `day_${currentDay}_phrase_strange` },
                { text: '😔 Сложно поверить', callback_data: `day_${currentDay}_phrase_hard` }
              ]]
            }
          });

          console.log(`✅ Фраза дня отправлена пользователю ${user.telegram_id} (день ${currentDay})`);
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (userError) {
          console.error(`❌ Ошибка отправки фразы пользователю ${user.telegram_id}:`, userError);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка в sendPhraseMessages:', error);
    }
  }

  // Вечерние рефлексии
  private async sendEveningMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
          const dayContent = getDayContent(currentDay);
          if (!dayContent) continue;

          await this.bot.sendMessage(user.telegram_id, dayContent.eveningMessage, {
            reply_markup: dayContent.options ? {
              inline_keyboard: [
                dayContent.options.map((option, index) => ({
                  text: option.text,
                  callback_data: `day_${currentDay}_evening_${index}`
                }))
              ]
            } : undefined
          });

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

  // === ADMIN ROUTES === (сокращено для экономии места)
  private setupAdminRoutes(): void {
    const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = req.headers.authorization;
      if (!auth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        return res.status(401).send('Требуется авторизация');
      }
      const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
      if (credentials[0] === 'admin' && credentials[1] === config.security.adminPassword) {
        next();
      } else {
        res.status(401).send('Неверные данные');
      }
    };

    this.app.get('/dashboard', authenticate, async (req, res) => {
      try {
        const stats = await this.database.getStats();
        const alerts = await this.database.getAlerts();
        const unhandledAlerts = alerts.filter((alert: any) => !alert.handled).length;
        
        const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Дашборд бота</title></head>
<body>
<h1>📊 Дашборд бота "Забота о себе"</h1>
<p>Пользователей: ${stats.totalUsers} | Активных сегодня: ${stats.activeToday} | Завершили курс: ${stats.completedCourse} | Алертов: ${alerts.length}${unhandledAlerts > 0 ? ` (${unhandledAlerts} новых)` : ''}</p>
<p><a href="/dashboard/export/responses">📄 Экспорт ответов</a> | <a href="/dashboard/export/users">👥 Экспорт пользователей</a></p>
</body></html>`;
        res.send(html);
      } catch (error) {
        res.status(500).send(`Ошибка: ${error}`);
      }
    });

    this.app.get('/', (req, res) => res.redirect('/dashboard'));
  }

  // === ОБРАБОТЧИКИ КОМАНД ===
  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const name = msg.from?.first_name;

    if (!telegramId) return;

    try {
      console.log(`👤 Пользователь ${telegramId} (${name}) запустил старт`);
      
      await this.database.createUser(telegramId, name);
      const user = await this.database.getUser(telegramId);
      
      // Определяем какую клавиатуру показать
      const keyboard = this.getMainKeyboard(user);
      
      // Проверяем статус пользователя
      if (user?.course_completed) {
        await this.bot.sendMessage(chatId, 
          `🎉 Привет${name ? `, ${name}` : ''}! 

Ты уже завершила 7-дневный курс заботы о себе! 
Поздравляю с этим достижением! 💙

Можешь пройти курс заново или использовать полученные навыки в повседневной жизни.`, {
          reply_markup: keyboard
        });
      } else if (user && user.current_day > 1) {
        await this.bot.sendMessage(chatId, 
          `🌸 С возвращением${name ? `, ${name}` : ''}!

Ты сейчас на ${user.current_day} дне курса заботы о себе.
Продолжим наше путешествие? 💙`, {
          reply_markup: keyboard
        });
      } else {
        // Отправляем приветствие и потом клавиатуру
        await this.bot.sendMessage(chatId, 
          `🌸 Привет${name ? `, ${name}` : ''}! Я бот-помощник по заботе о себе.

За 7 дней мы мягко исследуем, как быть добрее к себе.

Готова начать это путешествие?`, {
          reply_markup: {
            inline_keyboard: [[
              { text: '🌱 Да, готова', callback_data: 'start_yes' },
              { text: '❓ Расскажи подробнее', callback_data: 'more_info' },
              { text: '⏰ Позже', callback_data: 'later' }
            ]]
          }
        });
        
        // Отправляем основную клавиатуру
        setTimeout(async () => {
          await this.bot.sendMessage(chatId, 'Для быстрого доступа используй кнопки ниже:', {
            reply_markup: this.getMainKeyboard(user)
          });
        }, 1000);
      }
      
    } catch (error) {
      console.error(`❌ Ошибка в handleStart:`, error);
      try {
        await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.', {
          reply_markup: this.getMainKeyboard(null)
        });
      } catch {}
    }
  }

  // Генерация основной клавиатуры в зависимости от статуса пользователя
  private getMainKeyboard(user: DbUser | null): any {
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

    if (user.is_paused) {
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

  private async handleCallback(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
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
          `🎉 Отлично! Ты записана на курс!\n\n` +
          `Завтра в 9:00 утра тебе придет первое сообщение.\n` +
          `За день будет 4 сообщения:\n` +
          `🌅 09:00 - Утреннее приветствие\n` +
          `🌸 13:00 - Упражнение дня\n` +
          `💝 16:00 - Фраза для размышления\n` +
          `🌙 20:00 - Вечерняя рефлексия\n\n` +
          `Готова начать завтра? 💙`, {
          reply_markup: this.getMainKeyboard(user)
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
          reply_markup: this.getMainKeyboard(user)
        });
      }

      // Обработка ответов на дни курса
      if (data.startsWith('day_')) {
        await this.handleDayCallback(chatId, telegramId, data);
      }

    } catch (error) {
      console.error(`❌ Ошибка в handleCallback:`, error);
    }
  }

  private async handleDayCallback(chatId: number, telegramId: number, data: string): Promise<void> {
    try {
      const user = await this.database.getUser(telegramId);
      if (!user) return;

      const currentDay = user.current_day || 1;

      // Сохраняем ответ пользователя
      await this.database.saveResponse(user.id, currentDay, 'button_choice', data);

      // Отправляем подтверждение
      const responses = [
        'Спасибо за ответ! 💙',
        'Важно, что ты откликаешься 🌸', 
        'Твоя честность ценна 💙',
        'Благодарю за участие 🤗'
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      await this.bot.sendMessage(chatId, randomResponse, {
        reply_markup: this.getMainKeyboard(user)
      });

      // Если это вечернее сообщение - переводим на следующий день
      if (data.includes('_evening_')) {
        const nextDay = currentDay + 1;
        if (nextDay <= 7) {
          await this.database.updateUserDay(telegramId, nextDay);
          await this.database.markDayCompleted(user.id, currentDay);
        } else {
          await this.database.markCourseCompleted(telegramId);
          const completedUser = await this.database.getUser(telegramId);
          
          await this.bot.sendMessage(chatId, 
            `🎉 Поздравляю! Ты завершила 7-дневный курс заботы о себе!\n\n` +
            `Это настоящее достижение. Используй полученные навыки каждый день! 💙`, {
            reply_markup: this.getMainKeyboard(completedUser)
          });
        }
      }

    } catch (error) {
      console.error('❌ Ошибка в handleDayCallback:', error);
    }
  }

  private async handleText(msg: TelegramBot.Message): Promise<void> {
    if (msg.text?.startsWith('/')) return;

    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const text = msg.text;

    if (!telegramId || !text) return;

    try {
      // Проверка на алерты
      const alertFound = await checkForAlerts(text);
      if (alertFound) {
        const user = await this.database.getUser(telegramId);
        if (user) {
          await this.database.createAlert(user.id, alertFound, text);
          await sendAlert(`🚨 АЛЕРТ от пользователя ${user.name || telegramId}:\n"${text}"`);
          
          await this.bot.sendMessage(chatId, 
            `Я очень обеспокоена твоими словами 💙\n\n` +
            `Пожалуйста, обратись:\n📞 Телефон доверия: 8-800-2000-122\n` +
            `🚨 Экстренная помощь: 112\n\nТы не одна.`
          );
          return;
        }
      }

      // Сохранение обычного ответа
      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, user.current_day, 'free_text', text);
        
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
      console.error('❌ Ошибка в handleText:', error);
    }
  }

  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const user = telegramId ? await this.database.getUser(telegramId) : null;
    
    const helpText = `📋 Помощь по боту:\n\n` +
      `🌸 Основные кнопки:\n• Старт - Начать или перезапустить курс\n• Мой прогресс - Показать текущий статус\n• Пауза/Продолжить - Управление курсом\n\n` +
      `💙 О программе:\n7-дневный курс заботы о себе\n4 сообщения в день (9:00, 13:00, 16:00, 20:00)\n\n` +
      `🆘 Поддержка: help@harmony4soul.com`;
    
    await this.bot.sendMessage(msg.chat.id, helpText, {
      reply_markup: this.getMainKeyboard(user)
    });
  }

  private async handleProgress(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(msg.chat.id, 'Сначала нужно запустить бота. Нажми "Старт" 🌱', {
          reply_markup: this.getMainKeyboard(null)
        });
        return;
      }

      let progressText = `📊 Твой прогресс:\n\n`;
      
      if (user.course_completed) {
        progressText += `🎉 Курс завершен!\nПоздравляю! Ты прошла все 7 дней заботы о себе.\n\n`;
        progressText += `💙 Используй полученные навыки каждый день:\n`;
        progressText += `• Замечай свои эмоции\n• Говори себе добрые слова\n• Заботься о своих потребностях\n• Принимай свою уязвимость`;
      } else if (user.is_paused) {
        progressText += `⏸️ Курс на паузе\n`;
        progressText += `📅 Текущий день: ${user.current_day || 1} из 7\n\n`;
        progressText += `Нажми "Продолжить" когда будешь готова! 💙`;
      } else {
        const currentDay = user.current_day || 1;
        progressText += `📅 День: ${currentDay} из 7\n`;
        progressText += `🌱 Статус: Активен\n\n`;
        
        if (currentDay === 1) {
          progressText += `Сегодня: Осознание боли\nЗавтра в 9:00 придет первое сообщение дня.`;
        } else {
          const dayContent = getDayContent(currentDay);
          if (dayContent) {
            progressText += `Сегодня: ${dayContent.title}\n`;
            progressText += `Следующее сообщение ждет тебя по расписанию! 🕐`;
          }
        }
      }

      const currentDay = user.current_day || 1;
      const completionPercentage = user.course_completed ? 100 : Math.round(((currentDay - 1) / 7) * 100);
      progressText += `\n\n📈 Прогресс: ${completionPercentage}%`;
      progressText += `\n${'▓'.repeat(Math.floor(completionPercentage / 10))}${'░'.repeat(10 - Math.floor(completionPercentage / 10))}`;

      await this.bot.sendMessage(msg.chat.id, progressText, {
        reply_markup: this.getMainKeyboard(user)
      });

    } catch (error) {
      console.error('❌ Ошибка в handleProgress:', error);
      await this.bot.sendMessage(msg.chat.id, 'Произошла ошибка при получении прогресса.');
    }
  }

  private async handlePause(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      await this.database.pauseUser(telegramId);
      const user = await this.database.getUser(telegramId);
      
      await this.bot.sendMessage(msg.chat.id, 'Курс приостановлен. Нажми "Продолжить" когда будешь готова 💙', {
        reply_markup: this.getMainKeyboard(user)
      });
    } catch (error) {
      console.error('❌ Ошибка в handlePause:', error);
    }
  }

  private async handleResume(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      await this.database.resumeUser(telegramId);
      const user = await this.database.getUser(telegramId);
      
      await this.bot.sendMessage(msg.chat.id, 'Курс возобновлен! Продолжаем путь заботы о себе 🌱', {
        reply_markup: this.getMainKeyboard(user)
      });
    } catch (error) {
      console.error('❌ Ошибка в handleResume:', error);
    }
  }

  private async handleStats(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId || telegramId.toString() !== config.telegram.adminId) return;

    try {
      const stats = await this.database.getStats();
      const statsText = `📊 Статистика:\n\n` +
        `👥 Всего: ${stats.totalUsers}\n📈 Сегодня: ${stats.activeToday}\n🎯 Завершили: ${stats.completedCourse}`;
      await this.bot.sendMessage(msg.chat.id, statsText);
    } catch (error) {
      console.error('❌ Ошибка статистики:', error);
    }
  }
}

// Запуск бота
const bot = new SelfCareBot();
bot.init().catch(console.error);

export default SelfCareBot;
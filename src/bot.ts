console.log('Бот запущен...');

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config';
import { Database } from './database';
import { courseContent } from './course-logic';
import { checkForAlerts, sendAlert, createCSV } from './utils';

class SelfCareBot {
  private bot: TelegramBot;
  private app: express.Application;
  private database: Database;

  constructor() {
    // В продакшене НЕ используем webhook в конструкторе бота
    // Создаем бота БЕЗ webhook, настроим позже
    this.bot = new TelegramBot(config.telegram.token, { polling: false });
    this.app = express();
    this.database = new Database();
    
    this.setupMiddleware();
    this.setupHandlers();
    this.setupAdminRoutes();
    this.setupReminders();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  async init(): Promise<void> {
    await this.database.init();
    
    // Запускаем ОДИН сервер для всего
    const PORT = Number(process.env.PORT) || 3000;
    
    this.app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
      console.log(`🤖 Telegram бот активен`);
      console.log(`📊 Дашборд: https://tg-bot-git-progect.up.railway.app/dashboard`);
      
      // ПОСЛЕ запуска сервера устанавливаем webhook
      if (process.env.NODE_ENV === 'production') {
        this.setupWebhook();
      } else {
        // В разработке используем polling
        this.bot.startPolling();
        console.log('🔄 Polling режим активен');
      }
    });
  }

  private setupWebhook(): void {
    const url = 'https://tg-bot-git-progect.up.railway.app';
    const webhookUrl = `${url}/bot${config.telegram.token}`;
    
    this.bot.setWebHook(webhookUrl).then(() => {
      console.log(`🔗 Webhook установлен: ${webhookUrl}`);
    }).catch((error) => {
      console.error('Ошибка установки webhook:', error);
    });
  }

  private setupHandlers(): void {
    // Webhook endpoint для Telegram
    this.app.post(`/bot${config.telegram.token}`, (req, res) => {
      console.log('📨 Получено обновление от Telegram');
      this.bot.processUpdate(req.body);
      res.sendStatus(200);
    });

    // Команды
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
    this.bot.onText(/\/stats/, this.handleStats.bind(this));
    this.bot.onText(/\/pause/, this.handlePause.bind(this));
    this.bot.onText(/\/resume/, this.handleResume.bind(this));

    // Callback кнопки
    this.bot.on('callback_query', this.handleCallback.bind(this));

    // Текстовые сообщения
    this.bot.on('message', this.handleText.bind(this));

    // Обработка ошибок
    this.bot.on('error', (error) => {
      console.error('Ошибка Telegram бота:', error);
    });
  }

  // === ADMIN ROUTES ===
  private setupAdminRoutes(): void {
    // Простая аутентификация
    const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = req.headers.authorization;
      
      if (!auth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        return res.status(401).send('Требуется авторизация');
      }

      const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
      const username = credentials[0];
      const password = credentials[1];

      if (username === 'admin' && password === config.security.adminPassword) {
        next();
      } else {
        res.status(401).send('Неверные данные');
      }
    };

    // Главная страница дашборда
    this.app.get('/dashboard', authenticate, async (req, res) => {
      try {
        const stats = await this.database.getStats();
        const alerts = await this.database.getAlerts();
        const unhandledAlerts = alerts.filter((alert: any) => !alert.handled).length;
        
        const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Дашборд бота "Забота о себе"</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            line-height: 1.6;
            min-height: 100vh;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header {
            background: rgba(255, 255, 255, 0.95);
            color: #667eea;
            padding: 30px;
            text-align: center;
            margin-bottom: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .stat-card:hover {
            transform: translateY(-5px);
        }
        .stat-card h3 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.2em;
        }
        .big-number {
            font-size: 3em;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 15px 0;
        }
        .actions-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .action-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            text-decoration: none;
            display: inline-block;
            margin: 8px 8px 8px 0;
            transition: all 0.3s ease;
        }
        .action-btn:hover { 
            transform: translateY(-2px);
        }
        .alert-badge {
            background: #ff6b6b;
            color: white;
            border-radius: 50%;
            padding: 4px 8px;
            font-size: 0.8em;
            margin-left: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Дашборд бота "Забота о себе"</h1>
            <p>Аналитика и управление курсом самосострадания</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>👥 Пользователи</h3>
                <div class="big-number">${stats.totalUsers}</div>
                <p>Всего зарегистрировано</p>
            </div>
            
            <div class="stat-card">
                <h3>📈 Активность сегодня</h3>
                <div class="big-number">${stats.activeToday}</div>
                <p>Активных пользователей</p>
            </div>
            
            <div class="stat-card">
                <h3>🎯 Завершили курс</h3>
                <div class="big-number">${stats.completedCourse}</div>
                <p>Прошли все 7 дней</p>
            </div>

            <div class="stat-card">
                <h3>🚨 Алерты ${unhandledAlerts > 0 ? `<span class="alert-badge">${unhandledAlerts}</span>` : ''}</h3>
                <div class="big-number">${alerts.length}</div>
                <p>Всего сигналов безопасности</p>
            </div>
        </div>

        <div class="actions-card">
            <h3>📤 Управление данными</h3>
            <p>Экспорт и анализ данных пользователей:</p>
            <div style="margin-top: 15px;">
                <a href="/dashboard/export/responses" class="action-btn">📄 Ответы пользователей (CSV)</a>
                <a href="/dashboard/export/users" class="action-btn">👥 Список пользователей (CSV)</a>
                <a href="/dashboard/alerts" class="action-btn">🚨 Алерты безопасности</a>
            </div>
        </div>

        <div style="text-align: center; color: rgba(255, 255, 255, 0.8); margin-top: 30px;">
            <p>🕐 Последнее обновление: ${new Date().toLocaleString('ru-RU')}</p>
        </div>
    </div>
</body>
</html>`;

        res.send(html);
      } catch (error) {
        console.error('Ошибка дашборда:', error);
        res.status(500).send(`Ошибка: ${error}`);
      }
    });

    // Тестовый endpoint
    this.app.get('/test', (req, res) => {
      res.json({ 
        status: 'OK', 
        time: new Date().toISOString(),
        env: process.env.NODE_ENV,
        port: process.env.PORT 
      });
    });

    // Экспорт данных
    this.app.get('/dashboard/export/responses', authenticate, async (req, res) => {
      try {
        const responses = await this.database.getAllResponses();
        const csv = createCSV(responses, ['Имя', 'Telegram ID', 'День', 'Тип вопроса', 'Ответ', 'Дата']);
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=user-responses.csv');
        res.send('\ufeff' + csv);
      } catch (error) {
        res.status(500).send('Ошибка экспорта: ' + error);
      }
    });

    this.app.get('/dashboard/export/users', authenticate, async (req, res) => {
      try {
        const users = await this.database.getAllUsers();
        const csv = createCSV(users, ['Имя', 'Telegram ID', 'Текущий день', 'Курс завершен', 'Дата регистрации']);
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
        res.send('\ufeff' + csv);
      } catch (error) {
        res.status(500).send('Ошибка экспорта: ' + error);
      }
    });

    // Редирект главной страницы на дашборд
    this.app.get('/', (req, res) => {
      res.redirect('/dashboard');
    });
  }

  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const name = msg.from?.first_name;

    if (!telegramId) return;

    try {
      await this.database.createUser(telegramId, name);
      
      await this.bot.sendMessage(chatId, 
        `🌸 Привет${name ? `, ${name}` : ''}! Я бот-помощник по заботе о себе.

За 7 дней мы мягко исследуем, как быть добрее к себе. 
Не через насилие или давление, а через понимание и заботу.

Готова начать это путешествие к себе?`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🌱 Да, готова', callback_data: 'start_yes' },
            { text: '❓ Расскажи подробнее', callback_data: 'more_info' },
            { text: '⏰ Позже', callback_data: 'later' }
          ]]
        }
      });
    } catch (error) {
      console.error('Ошибка в handleStart:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  }

  private async handleCallback(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = callbackQuery.message?.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (!chatId || !data) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.handleStart(callbackQuery.message!);
        return;
      }

      await this.bot.answerCallbackQuery(callbackQuery.id);

      switch (data) {
        case 'start_yes':
          await this.startDay1(chatId, telegramId);
          break;
        
        case 'more_info':
          await this.showCourseInfo(chatId);
          break;

        case 'later':
          await this.bot.sendMessage(chatId, 'Понимаю 🤗 Забота о себе требует готовности.\n\nНапиши /start когда будешь готова.');
          break;

        default:
          if (data.startsWith('day_')) {
            await this.handleDayResponse(chatId, telegramId, data);
          }
      }
    } catch (error) {
      console.error('Ошибка в handleCallback:', error);
    }
  }

  private async startDay1(chatId: number, telegramId: number): Promise<void> {
    const day1 = courseContent[0];
    
    await this.bot.sendMessage(chatId, day1.baseContent, {
      reply_markup: {
        inline_keyboard: [
          day1.options?.map((option: any, index: number) => ({
            text: option.text,
            callback_data: `day_1_${index}`
          })) || []
        ]
      }
    });

    await this.database.updateUserDay(telegramId, 1);
  }

  private async handleDayResponse(chatId: number, telegramId: number, data: string): Promise<void> {
    const [, dayStr, optionStr] = data.split('_');
    const day = parseInt(dayStr);
    const optionIndex = parseInt(optionStr);

    const dayContent = courseContent[day - 1];
    const option = dayContent.options?.[optionIndex];

    if (!option) return;

    const user = await this.database.getUser(telegramId);
    if (!user) return;

    await this.database.saveResponse(user.id, day, 'button_choice', option.text);
    await this.bot.sendMessage(chatId, option.response);
    await this.scheduleNextDay(chatId, telegramId, day);
  }

  private async scheduleNextDay(chatId: number, telegramId: number, currentDay: number): Promise<void> {
    if (currentDay < 7) {
      setTimeout(async () => {
        const nextDay = currentDay + 1;
        const nextDayContent = courseContent[nextDay - 1];
        
        await this.bot.sendMessage(chatId, `🌅 День ${nextDay}: ${nextDayContent.title}\n\n${nextDayContent.baseContent}`, {
          reply_markup: {
            inline_keyboard: [
              nextDayContent.options?.map((option: any, index: number) => ({
                text: option.text,
                callback_data: `day_${nextDay}_${index}`
              })) || []
            ]
          }
        });

        await this.database.updateUserDay(telegramId, nextDay);
      }, 60000);
    } else {
      await this.bot.sendMessage(chatId, 
        `🎉 Поздравляю! Ты завершила 7-дневный курс заботы о себе!\n\n` +
        `Это настоящее достижение. Ты проделала важную работу и научилась быть добрее к себе.\n\n` +
        `Помни: забота о себе - это ежедневная практика. Используй полученные навыки и будь счастлива! 💙`
      );
      
      await this.database.markCourseCompleted(telegramId);
    }
  }

  private async showCourseInfo(chatId: number): Promise<void> {
    const infoText = `📚 Курс состоит из 7 дней:\n\n` +
      courseContent.map((day: any, index: number) => `📅 День ${index + 1}: ${day.title}`).join('\n') +
      `\n\nКаждое задание занимает 5-15 минут.\nГотова попробовать?`;

    await this.bot.sendMessage(chatId, infoText, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🌱 Да, начинаем!', callback_data: 'start_yes' },
          { text: '⏰ Позже', callback_data: 'later' }
        ]]
      }
    });
  }

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
            `Я очень обеспокоена твоими словами 💙\nТвоя жизнь ценна и важна.\n\n` +
            `Пожалуйста, обратись:\n📞 Телефон доверия: 8-800-2000-122 (круглосуточно)\n` +
            `🚨 Служба экстренной помощи: 112\n💬 Сайт поддержки: www.harmony4soul.com\n\n` +
            `Я остаюсь с тобой. Ты не одна.`
          );
          return;
        }
      }

      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, user.current_day, 'free_text', text);
        
        const responses = [
          'Спасибо за откровенность 💙',
          'Благодарю за доверие 🌸',
          'Твои слова важны для меня 💙',
          'Спасибо, что поделилась 🤗'
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        
        await this.bot.sendMessage(chatId, randomResponse);
      }
    } catch (error) {
      console.error('Ошибка в handleText:', error);
    }
  }

  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const helpText = `📋 Помощь по боту:\n\n` +
      `🌸 Команды:\n/start - Начать программу заново\n/help - Показать эту справку\n` +
      `/pause - Приостановить курс\n/resume - Возобновить курс\n\n` +
      `💙 О программе:\nЭто 7-дневный курс заботы о себе. Каждый день включает упражнение и размышления.\n\n` +
      `🆘 Поддержка:\nhelp@harmony4soul.com`;

    await this.bot.sendMessage(msg.chat.id, helpText);
  }

  private async handlePause(msg: TelegramBot.Message): Promise<void> {
    await this.bot.sendMessage(msg.chat.id, 'Курс приостановлен. Напиши /resume когда будешь готова продолжить 💙');
  }

  private async handleResume(msg: TelegramBot.Message): Promise<void> {
    await this.bot.sendMessage(msg.chat.id, 'Курс возобновлен! Продолжаем путь заботы о себе 🌱');
  }

  private async handleStats(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    
    if (!telegramId || telegramId.toString() !== config.telegram.adminId) {
      return;
    }

    try {
      const stats = await this.database.getStats();
      
      let statsText = `📊 Статистика:\n\n`;
      statsText += `👥 Всего пользователей: ${stats.totalUsers}\n`;
      statsText += `📈 Активных сегодня: ${stats.activeToday}\n`;
      statsText += `🎯 Завершили курс: ${stats.completedCourse}\n\n`;
      statsText += `📊 Дашборд: https://tg-bot-git-progect.up.railway.app/dashboard\n`;

      await this.bot.sendMessage(msg.chat.id, statsText);
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
    }
  }

  private setupReminders(): void {
    cron.schedule('0 9 * * *', async () => {
      console.log('Отправка утренних напоминаний...');
    });

    cron.schedule('0 20 * * *', async () => {
      console.log('Отправка вечерних напоминаний...');
    });
  }
}

// Запуск бота
const bot = new SelfCareBot();
bot.init().catch(console.error);

export default SelfCareBot;
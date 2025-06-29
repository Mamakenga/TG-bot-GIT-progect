console.log('🚀 Запуск бота...');

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config';
import { Database, DbUser } from './database';
import { courseContent, getDayContent } from './course-logic';
import { checkForAlerts, sendAlert, createCSV } from './utils';
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
    this.bot.onText(/\/test/, this.handleTest.bind(this));
    this.bot.onText(/\/nextday/, this.handleNextDay.bind(this));
    this.bot.onText(/\/testday (\d+)/, this.handleTestDay.bind(this));
    this.bot.onText(/\/pause/, this.handlePause.bind(this));
    this.bot.onText(/\/resume/, this.handleResume.bind(this));
    this.bot.onText(/\/menu/, this.handleMenu.bind(this));

    // Обработка кнопок меню
    this.bot.onText(/^🌱 Старт$/, this.handleStart.bind(this));
    this.bot.onText(/^🌱 Начать заново$/, this.handleRestart.bind(this));
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
    });

    this.bot.on('polling_error', (error) => {
      console.error('❌ Ошибка polling:', error.message);
    });

    this.bot.on('webhook_error', (error) => {
      console.error('❌ Ошибка webhook:', error.message);
    });

    // Глобальная обработка ошибок
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error.message);
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
  }

  // === СИСТЕМА НАПОМИНАНИЙ ===
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

  // ✅ ИСПРАВЛЕНО: Утром ТОЛЬКО текст, БЕЗ кнопок
  private async sendMorningMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();
      console.log(`📊 Найдено ${activeUsers.length} активных пользователей`);

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) {
            continue;
          }

          const currentDay = user.current_day || 1;
          const dayContent = getDayContent(currentDay);
          if (!dayContent) {
            console.log(`⚠️ Контент для дня ${currentDay} не найден`);
            continue;
          }

          // ✅ ТОЛЬКО ТЕКСТ УТРОМ, БЕЗ КНОПОК
          await this.bot.sendMessage(user.telegram_id, dayContent.morningMessage);

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

  // ✅ ИСПРАВЛЕНО: Вечером кнопки ВЕРТИКАЛЬНО
  private async sendEveningMessages(): Promise<void> {
    try {
      const activeUsers = await this.database.getActiveUsers();

      for (const user of activeUsers) {
        try {
          if (user.course_completed || (user.current_day || 1) > 7) continue;

          const currentDay = user.current_day || 1;
          const dayContent = getDayContent(currentDay);
          if (!dayContent) continue;

          // ✅ КНОПКИ ВЕРТИКАЛЬНО (каждая на отдельной строке)
          await this.bot.sendMessage(user.telegram_id, dayContent.eveningMessage, {
            reply_markup: dayContent.options ? {
              inline_keyboard: dayContent.options.map((option, index) => [{
                text: option.text,
                callback_data: `day_${currentDay}_evening_${index}`
              }])
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

  // === ИСПРАВЛЕННЫЕ АДМИН РОУТЫ ===
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

  // Функция для экранирования CSV
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Еженедельный отчет
  this.app.get('/dashboard/weekly-report', authenticate, async (req, res) => {
    try {
      const [stats, alerts] = await Promise.all([
        this.database.getStats(),
        this.database.getAlerts()
      ]);
      
      const unhandledAlerts = alerts.filter((a: any) => !a.handled).length;

      const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Еженедельный отчет - Забота о себе</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            line-height: 1.6;
            min-height: 100vh;
            padding: 20px;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto;
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
            font-weight: 500;
        }
        .action-btn:hover { 
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        }
        .alert-badge {
            background: #ff6b6b;
            color: white;
            border-radius: 50%;
            padding: 4px 8px;
            font-size: 0.8em;
            margin-left: 8px;
        }
        .info-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            border-left: 5px solid #667eea;
        }
        .feature-list {
            list-style: none;
            padding: 0;
        }
        .feature-list li {
            padding: 8px 0;
            color: #555;
        }
        .feature-list li::before {
            content: "✓";
            color: #28a745;
            font-weight: bold;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Еженедельный отчет</h1>
            <h4>Аналитика курса самосострадания</h4>
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
          <h3>📤 Экспорт и управление</h3>
           <p>Основные функции для работы с данными:</p>
           <div style="margin-top: 15px;">
             <a href="/dashboard/export/responses" class="action-btn">📄 Экспорт ответов (CSV)</a>
             <a href="/dashboard/export/users" class="action-btn">👥 Экспорт пользователей (CSV)</a>
             <a href="/dashboard/export/alerts" class="action-btn">🚨 Экспорт алертов (CSV)</a>
            <a href="/dashboard/alerts" class="action-btn">📋 Просмотр алертов</a>
             <a href="/dashboard" class="action-btn">🏠 На главную</a>
           </div>
        </div> 

        <div class="info-card">
            <h3>📊 Возможности системы</h3>
            <p>Текущий дашборд предоставляет:</p>
            <ul class="feature-list">
                <li>Мониторинг активных пользователей в реальном времени</li>
                <li>Отслеживание завершения 7-дневного курса</li>
                <li>Система алертов для критических ситуаций</li>
                <li>Экспорт всех данных в формате CSV</li>
                <li>Безопасное управление через Basic Auth</li>
            </ul>
        </div>

        <div class="info-card">
            <h3>🔮 Планируемые улучшения</h3>
            <p>В следующих версиях будут добавлены:</p>
            <ul class="feature-list">
                <li>Детальная аналитика по дням курса</li>
                <li>Графики эмоциональной динамики участников</li>
                <li>Поиск и фильтрация ответов пользователей</li>
                <li>Визуализация статистики в реальном времени</li>
                <li>Интеграция с внешними аналитическими системами</li>
            </ul>
        </div>

        <div style="text-align: center; color: rgba(255, 255, 255, 0.8); margin-top: 30px;">
            <p>🕐 Последнее обновление: ${new Date().toLocaleString('ru-RU')}</p>
            <p style="margin-top: 10px; font-size: 14px;">
                💙 Сделано с заботой для психологического благополучия
            </p>
        </div>
    </div>
</body>
</html>`;

      res.send(html);
    } catch (error) {
      console.error('❌ Ошибка еженедельного отчета:', error);
      res.status(500).send('Ошибка генерации отчета: ' + error);
    }
  });

  // Главная страница дашборда
  this.app.get('/dashboard', authenticate, async (req, res) => {
    try {
      const stats = await this.database.getStats();
      const alerts = await this.database.getAlerts();
      const unhandledAlerts = alerts.filter((alert: any) => !alert.handled).length;
      
      const html = `<!DOCTYPE html>
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
            padding: 20px;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto;
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
        .nav-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .nav-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            text-decoration: none;
            color: #333;
            transition: all 0.3s ease;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .nav-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2);
        }
        .nav-card h3 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 1.3em;
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
            <h1>Дашборд бота "Забота о себе"</h1>
            <p>Аналитика и управление курсом самосострадания</p>
        </div>

        <div class="nav-grid">
            <a href="/dashboard/analytics" class="nav-card">
                <h3>📊 Аналитика</h3>
                <p>Глубокий анализ данных, графики завершаемости и эмоциональная карта курса</p>
            </a>
            
            <a href="/dashboard/responses" class="nav-card">
                <h3>💭 Ответы пользователей</h3>
                <p>Просмотр, поиск и фильтрация всех ответов участников курса</p>
            </a>
            
            <a href="/dashboard/weekly-report" class="nav-card">
                <h3>📄 Еженедельный отчет</h3>
                <p>Готовый отчет для печати с основными инсайтами и рекомендациями</p>
            </a>
            
            <a href="/dashboard/export/responses" class="nav-card">
                <h3>📥 Экспорт данных</h3>
                <p>Скачать все данные в CSV для анализа в Excel или других программах</p>
            </a>
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

        <div style="text-align: center; color: rgba(255, 255, 255, 0.8); margin-top: 30px;">
            <p>🕐 Последнее обновление: ${new Date().toLocaleString('ru-RU')}</p>
            <p style="margin-top: 10px;">
                💡 <strong>Новое:</strong> Теперь доступен детальный анализ данных и визуальные отчеты!
            </p>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Анимация чисел
            const numbers = document.querySelectorAll('.big-number');
            numbers.forEach(num => {
                const finalNumber = parseInt(num.textContent);
                let currentNumber = 0;
                const increment = finalNumber / 30;
                const timer = setInterval(() => {
                    currentNumber += increment;
                    if (currentNumber >= finalNumber) {
                        num.textContent = finalNumber;
                        clearInterval(timer);
                    } else {
                        num.textContent = Math.floor(currentNumber);
                    }
                }, 50);
            });
        });
    </script>
</body>
</html>`;
      res.send(html);
    } catch (error) {
      res.status(500).send(`Ошибка: ${error}`);
    }
  });

  // Редирект с корня на дашборд
  this.app.get('/', (req, res) => res.redirect('/dashboard'));

  // Экспорт ответов пользователей в CSV (адаптировано для PostgreSQL)
  this.app.get('/dashboard/export/responses', authenticate, async (req, res) => {
    try {
      console.log('📥 Запрос на экспорт ответов');
      
      // Получаем все ответы из базы данных (PostgreSQL)
      const responses = await this.database.getAllResponses();
      
      // Создаем CSV контент
      let csv = '\ufeff'; // BOM для корректного отображения кириллицы в Excel
      csv += 'ID пользователя,Имя,Username,День,Тип вопроса,Ответ,Дата и время\n';
      
      responses.forEach((response: any) => {
        csv += [
          escapeCSV(response.user_id),
          escapeCSV(response.first_name || response.name),
          escapeCSV(response.username || response.telegram_id),
          escapeCSV(response.day),
          escapeCSV(response.question || response.question_type),
          escapeCSV(response.answer || response.response_text),
          escapeCSV(new Date(response.created_at).toLocaleString('ru-RU'))
        ].join(',') + '\n';
      });
      
      // Устанавливаем заголовки для скачивания файла
      const filename = `responses_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      console.log(`✅ Экспортировано ${responses.length} ответов`);
      res.send(csv);
      
    } catch (error) {
      console.error('❌ Ошибка экспорта ответов:', error);
      res.status(500).send(`Ошибка экспорта: ${error}`);
    }
  });

  // Экспорт алертов в CSV (адаптировано для PostgreSQL)
  this.app.get('/dashboard/export/alerts', authenticate, async (req, res) => {
    try {
      console.log('📥 Запрос на экспорт алертов');
      
      const alerts = await this.database.getAlerts();
      
      // Создаем CSV контент
      let csv = '\ufeff'; // BOM для корректного отображения кириллицы в Excel
      csv += 'ID алерта,ID пользователя,Имя,Telegram ID,Триггер,Сообщение,Обработан,Дата создания\n';
      
      alerts.forEach((alert: any) => {
        csv += [
          escapeCSV(alert.id),
          escapeCSV(alert.user_id),
          escapeCSV(alert.first_name || alert.name || 'Не указано'),
          escapeCSV(alert.username || alert.telegram_id),
          escapeCSV(alert.trigger_word || 'general'),
          escapeCSV(alert.message),
          escapeCSV(alert.handled ? 'Да' : 'Нет'),
          escapeCSV(new Date(alert.created_at).toLocaleString('ru-RU'))
        ].join(',') + '\n';
      });
   
      // Устанавливаем заголовки для скачивания файла
      const filename = `alerts_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      console.log(`✅ Экспортировано ${alerts.length} алертов`);
      res.send(csv);
      
    } catch (error) {
      console.error('❌ Ошибка экспорта алертов:', error);
      res.status(500).send(`Ошибка экспорта: ${error}`);
    }
  });

  // Экспорт данных пользователей в CSV (адаптировано для PostgreSQL)
  this.app.get('/dashboard/export/users', authenticate, async (req, res) => {
    try {
      console.log('📥 Запрос на экспорт пользователей');
      
      const users = await this.database.getAllUsers();
      
      let csv = '\ufeff';
      csv += 'ID,Имя,Username,Текущий день,Дата регистрации,Последняя активность,Завершил курс,Количество ответов\n';
      
      for (const user of users) {
        const userResponses = await this.database.getUserResponses(user.telegram_id);
        const responseCount = userResponses.length;
        
        csv += [
          escapeCSV(user.id),
          escapeCSV(user.first_name || user.name),
          escapeCSV(user.username || user.telegram_id),
          escapeCSV(user.current_day),
          escapeCSV(new Date(user.created_at).toLocaleString('ru-RU')),
          escapeCSV(new Date(user.last_activity || user.updated_at).toLocaleString('ru-RU')),
          escapeCSV(user.current_day >= 7 ? 'Да' : 'Нет'),
          escapeCSV(responseCount)
        ].join(',') + '\n';
      }
      
      // Устанавливаем заголовки для скачивания файла
      const filename = `users_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      console.log(`✅ Экспортировано ${users.length} пользователей`);
      res.send(csv);
      
    } catch (error) {
      console.error('❌ Ошибка экспорта пользователей:', error);
      res.status(500).send(`Ошибка экспорта: ${error}`);
    }
  });
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
      
      if (user?.course_completed) {
        await this.bot.sendMessage(chatId, 
          `🎉 Привет${name ? `, ${name}` : ''}! 

Ты уже завершила 7-дневный курс заботы о себе! 
Поздравляю с этим достижением! 💙

Можешь пройти курс заново или использовать полученные навыки в повседневной жизни.`, {
          reply_markup: this.getMainKeyboard(user)
        });
      } else if (user && user.current_day > 1) {
        await this.bot.sendMessage(chatId, 
          `🌸 С возвращением${name ? `, ${name}` : ''}!

Ты сейчас на ${user.current_day} дне курса заботы о себе.
Продолжим наше путешествие? 💙`, {
          reply_markup: this.getMainKeyboard(user)
        });
      } else {
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
        
        // ✅ ИСПРАВЛЕНО: убран setTimeout, показываем клавиатуру сразу
        await this.bot.sendMessage(chatId, 'Для быстрого доступа используй кнопки ниже:', {
          reply_markup: this.getMainKeyboard(user)
        });
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

  private getMainKeyboard(user: DbUser | null): any {
    if (!user) {
      return {
        keyboard: [
          ['🌱 Старт', '📋 Помощь']
        ],
        resize_keyboard: true,
        persistent: true,
        one_time_keyboard: false 
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

      if (data.startsWith('day_')) {
        await this.handleDayCallback(chatId, telegramId, data);
      }

    } catch (error) {
      console.error(`❌ Ошибка в handleCallback:`, error);
    }
  }

  // ✅ ИСПРАВЛЕНО: Специальная обработка кнопки "Нужна помощь"
  private async handleDayCallback(chatId: number, telegramId: number, data: string): Promise<void> {
    try {
      const user = await this.database.getUser(telegramId);
      if (!user) return;

      const currentDay = user.current_day || 1;

      // ✅ НОВАЯ ЛОГИКА: Специальная обработка кнопки "Нужна помощь"
      if (data.includes('_exercise_help')) {
        await this.handleExerciseHelp(chatId, currentDay);
        return;
      }

      // Сохраняем ответ пользователя (для обычных кнопок)
      await this.database.saveResponse(user.id, currentDay, 'button_choice', data);

      // Обычные ответы для других кнопок
      const responses = [
        'Спасибо за ответ! 💙',
        'Важно, что ты находишь время на себя! 🌸', 
        'Хорошо, что ты написала это 💙',
        'Я рад, что ты пишешь 🤗'
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      await this.bot.sendMessage(chatId, randomResponse, {
        reply_markup: this.getMainKeyboard(user)
      });

      // Переход на следующий день (только для вечерних ответов)
      if (data.includes('_evening_')) {
        const dayCompleted = await this.database.isDayCompleted(user.id, currentDay);
        
        if (!dayCompleted) {
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
      }

    } catch (error) {
      console.error('❌ Ошибка в handleDayCallback:', error);
    }
  }

  // ✅ НОВЫЙ МЕТОД: Подробная помощь с упражнениями
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
      console.error('❌ Ошибка в handleExerciseHelp:', error);
    }
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
            `Я очень обеспокоена твоими словами 💙\n\n` +
            `Пожалуйста, обратись:\n📞 Телефон доверия: 8-800-2000-122\n` +
            `🚨 Экстренная помощь: 112\n\nТы не одна.`
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
      } else if (Boolean(user.is_paused)) {
        progressText += `⏸️ Курс на паузе\n`;
        progressText += `📅 Текущий день: ${user.current_day || 1} из 7\n\n`;
        progressText += `Нажми "Продолжить" когда будешь готова! 💙`;
      } else {
        const currentDay = user.current_day || 1;
        const isPaused = Boolean(user.is_paused);
        
        progressText += `📅 День: ${currentDay} из 7\n`;
        progressText += `🌱 Статус: ${isPaused ? 'На паузе' : 'Активен'}\n\n`;
        
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

  private async handleRestart(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    const name = msg.from?.first_name;

    if (!telegramId) return;

    try {
      console.log(`👤 Пользователь ${telegramId} перезапускает курс`);
      
      await this.database.resetUserProgress(telegramId);
      await this.database.updateUserDay(telegramId, 1);
      const user = await this.database.getUser(telegramId);
      
      await this.bot.sendMessage(chatId, 
        `🎉 Отлично${name ? `, ${name}` : ''}! Ты записана на курс заново!\n\n` +
        `Завтра в 9:00 утра тебе придет первое сообщение.\n` +
        `За день будет 4 сообщения:\n` +
        `🌅 09:00 - Утреннее приветствие\n` +
        `🌸 13:00 - Упражнение дня\n` +
        `💝 16:00 - Фраза для размышления\n` +
        `🌙 20:00 - Вечерняя рефлексия\n\n` +
        `Готова начать завтра заново? 💙`, {
        reply_markup: this.getMainKeyboard(user)
      });
      
    } catch (error) {
      console.error(`❌ Ошибка в handleRestart:`, error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при перезапуске курса.');
    }
  }

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

      await this.bot.sendMessage(chatId, `🧪 ТЕСТ: День ${currentDay}\n\n=== УТРО ===`);
      
      // ✅ Утреннее сообщение (ТОЛЬКО ТЕКСТ)
      await this.bot.sendMessage(chatId, dayContent.morningMessage);

      // Через 3 секунды - упражнение
      setTimeout(async () => {
        await this.bot.sendMessage(chatId, `=== УПРАЖНЕНИЕ ===`);
        await this.bot.sendMessage(chatId, dayContent.exerciseMessage, {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Попробую', callback_data: `day_${currentDay}_exercise_ready` },
              { text: '❓ Нужна помощь', callback_data: `day_${currentDay}_exercise_help` },
              { text: '⏰ Сделаю позже', callback_data: `day_${currentDay}_exercise_later` }
            ]]
          }
        });
      }, 3000);

      // Через 6 секунд - фраза дня
      setTimeout(async () => {
        await this.bot.sendMessage(chatId, `=== ФРАЗА ДНЯ ===`);
        await this.bot.sendMessage(chatId, dayContent.phraseOfDay, {
          reply_markup: {
            inline_keyboard: [[
              { text: '💙 Откликается', callback_data: `day_${currentDay}_phrase_good` },
              { text: '🤔 Звучит странно', callback_data: `day_${currentDay}_phrase_strange` },
              { text: '😔 Сложно поверить', callback_data: `day_${currentDay}_phrase_hard` }
            ]]
          }
        });
      }, 6000);

      // Через 9 секунд - вечер (ВЕРТИКАЛЬНЫЕ кнопки)
      setTimeout(async () => {
        await this.bot.sendMessage(chatId, `=== ВЕЧЕР ===`);
        await this.bot.sendMessage(chatId, dayContent.eveningMessage, {
          reply_markup: dayContent.options ? {
            inline_keyboard: dayContent.options.map((option, index) => [{
              text: option.text,
              callback_data: `day_${currentDay}_evening_${index}`
            }])
          } : undefined
        });
      }, 9000);

    } catch (error) {
      console.error('❌ Ошибка в handleTest:', error);
      await this.bot.sendMessage(chatId, 'Произошла ошибка при тестировании');
    }
  }

  private async handleMenu(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;

    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      await this.bot.sendMessage(chatId, 'Вот твоё меню:', {
        reply_markup: this.getMainKeyboard(user)
      });
    } catch (error) {
      console.error('❌ Ошибка в handleMenu:', error);
    }
  }

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
        await this.bot.sendMessage(chatId, '🎉 Курс завершен! Используй /start для перезапуска');
      } else {
        await this.database.updateUserDay(telegramId, nextDay);
        await this.database.markDayCompleted(user.id, currentDay);
        await this.bot.sendMessage(chatId, `✅ Переключен на день ${nextDay}. Теперь /test покажет день ${nextDay}`);
      }

    } catch (error) {
      console.error('❌ Ошибка в handleNextDay:', error);
    }
  }

  private async handleTestDay(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    const telegramId = msg.from?.id;
    const chatId = msg.chat.id;
    const dayNumber = match ? parseInt(match[1]) : 1;

    if (!telegramId) return;

    try {
      if (dayNumber < 1 || dayNumber > 7) {
        await this.bot.sendMessage(chatId, 'Укажи день от 1 до 7. Например: /testday 3');
        return;
      }

      const dayContent = getDayContent(dayNumber);
      if (!dayContent) {
        await this.bot.sendMessage(chatId, 'Контент для этого дня не найден');
        return;
      }

      await this.bot.sendMessage(chatId, `🧪 ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР: День ${dayNumber}\n\n=== УТРО ===`);
      
      await this.bot.sendMessage(chatId, dayContent.morningMessage);
      
      setTimeout(async () => {
        await this.bot.sendMessage(chatId, `=== УПРАЖНЕНИЕ ===`);
        await this.bot.sendMessage(chatId, dayContent.exerciseMessage);
      }, 2000);

      setTimeout(async () => {
        await this.bot.sendMessage(chatId, `=== ФРАЗА ДНЯ ===`);
        await this.bot.sendMessage(chatId, dayContent.phraseOfDay);
      }, 4000);

      setTimeout(async () => {
        await this.bot.sendMessage(chatId, `=== ВЕЧЕР ===`);
        await this.bot.sendMessage(chatId, dayContent.eveningMessage);
      }, 6000);

    } catch (error) {
      console.error('❌ Ошибка в handleTestDay:', error);
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
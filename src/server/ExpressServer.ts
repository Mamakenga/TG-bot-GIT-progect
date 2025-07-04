// src/server/ExpressServer.ts - ДАШБОРД
import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import { Database } from '../database';
import { config } from '../config';
import { logger } from '../utils/Logger';

export class ExpressServer {
  private app: express.Application;
  private server?: any;

  constructor(
    private bot: TelegramBot,
    private database: Database
  ) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
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

  private setupRoutes(): void {
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

      if (username === 'admin' && password === (config.security?.adminPassword || 'admin123')) {
        next();
      } else {
        res.status(401).send('Неверные данные');
      }
    };

    // CSV escape функция
    const escapeCSV = (str: any): string => {
      if (str === null || str === undefined) return '';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    // Redirect с корня
    this.app.get('/', (req, res) => res.redirect('/dashboard'));
    
    // Webhook для Telegram
    this.app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
      try {
        logger.info('📨 Получено обновление от Telegram');
        await this.bot.processUpdate(req.body);
        res.status(200).json({ ok: true });
        logger.success('✅ Обновление обработано успешно');
      } catch (error) {
        logger.error('❌ Ошибка обработки webhook:', error);
        res.status(200).json({ ok: false, error: 'Internal error' });
      }
    });

    // === ПОЛНОЦЕННЫЙ ДАШБОРД ===
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
    background: linear-gradient(135deg, #7636f2 0%,rgb(184, 70, 212) 30%, #7636f2 70%, #ffb9ff 100%);
    background-attachment: fixed;
    color: #1e3a8a;
    min-height: 100vh;
    line-height: 1.6;
}
.container {
    max-width: 1420px;
    margin: 0 auto;
    padding: 20px;
}
.header {
    text-align: center;
    color: white;
    margin-bottom: 40px;
    background: rgba(255, 255, 255, 0.1);
    padding: 30px;
    border-radius: 20px;
    backdrop-filter: blur(25px);
    box-shadow: 0 8px 32px rgba(31, 38, 135, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.3);
}
.header h1 {
    font-size: 2.5rem;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}
.header p {
    font-size: 1.2rem;
    opacity: 0.9;
}
.main-content {
    display: grid;
    grid-template-columns: 450px 1fr;
    gap: 30px;
    margin-bottom: 40px;
}
.stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
}
.stat-card {
    background: rgba(255, 255, 255, 0.9);
    padding: 20px;
    border-radius: 20px;
    text-align: center;
    box-shadow: 0 15px 35px rgba(0,0,0,0.15);
    backdrop-filter: blur(20px);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    border: 1px solid rgba(255, 255, 255, 0.6);
}
.stat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 25px 50px rgba(0,0,0,0.2);
    background: rgba(255, 255, 255, 0.95);
}
.stat-card h3 {
    font-size: 1.5rem;
    color: #1e3a8a;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
    text-shadow: none;
}
.big-number {
    font-size: 3rem;
    font-weight: bold;
    color: #1e3a8a;
    margin-bottom: 8px;
    text-shadow: none;
}
.stat-card p {
    color: #1e40af;
    font-size: 1.2rem;
    text-shadow: none;
}
.alert-badge {
    background: #e53e3e;
    color: white;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.8rem;
    margin-left: 8px;
    animation: pulse 2s infinite;
}
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* ========= ИСПРАВЛЕННЫЕ СТИЛИ ДЛЯ КНОПОК ========= */
.actions-card {
    background: rgba(255, 255, 255, 0.9);
    padding: 30px;
    border-radius: 20px;
    margin-bottom: 20px;
    box-shadow: 0 15px 35px rgba(0,0,0,0.15);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.6);
}
.actions-card h3 {
    color: #1e3a8a;
    margin-bottom: 20px;
    font-size: 1.3rem;
    text-shadow: none;
}
.actions-card p {
    color: #1e40af;
    text-shadow: none;
    margin-bottom: 20px;
}

/* ОСНОВНЫЕ СТИЛИ КОНТЕЙНЕРА КНОПОК */
.actions-grid {
    background: linear-gradient(135deg, #7636f2 0%, #e578ff 100%) !important;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 4px 15px rgba(118, 54, 242, 0.3);
    display: flex;
    flex-direction: column;
}

/* СТИЛИ КНОПОК */
.action-btn {
    display: block;
    background: none;
    color: white;
    padding: 12px 16px;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.3s ease;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    margin: 0;
    font-size: 0.95rem;
}
.action-btn:last-child {
    border-bottom: none;
}
.action-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    text-decoration: none;
    color: white;
    padding-left: 24px;
    border-radius: 8px;
}
.action-btn:focus {
    outline: 2px solid rgba(255, 255, 255, 0.5);
    outline-offset: 2px;
}

.info-card {
    background: rgba(255, 255, 255, 0.95);
    padding: 25px;
    border-radius: 20px;
    margin-bottom: 20px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}
.info-card h3 {
    color: #1e3a8a;
    margin-bottom: 15px;
    font-size: 1.2rem;
    text-shadow: none;
}
.info-card p {
    color: #1e40af;
    text-shadow: none;
}
.feature-list {
    list-style: none;
    padding-left: 0;
}
.feature-list li {
    padding: 8px 0;
    border-bottom: 1px solid rgba(30, 58, 138, 0.2);
    color: #1e40af;
    text-shadow: none;
}
.feature-list li:before {
    content: "✅ ";
    margin-right: 8px;
}
.footer {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
    margin-top: 40px;
    padding: 20px;
}

/* ========= МЕДИА-ЗАПРОСЫ ========= */
@media (max-width: 1200px) {
    .main-content {
        grid-template-columns: 1fr;
        gap: 20px;
    }
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
    }
}

@media (max-width: 768px) {
    .container { 
        padding: 10px; 
    }
    .header h1 { 
        font-size: 2rem; 
    }
    .big-number { 
        font-size: 2rem; 
    }
    .stats-grid {
        grid-template-columns: 1fr;
        gap: 12px;
    }
    .stat-card {
        padding: 15px;
    }
    .actions-card {
        padding: 20px;
    }
}

@media (max-width: 480px) {
    .big-number { 
        font-size: 1.8rem; 
    }
    .stat-card h3 { 
        font-size: 0.9rem; 
    }
    .stat-card { 
        padding: 12px; 
    }
    .header h1 {
        font-size: 1.8rem;
    }
    .actions-card {
        padding: 15px;
    }
    .actions-grid {
        padding: 15px;
    }
    .action-btn {
        padding: 10px 12px;
        font-size: 0.9rem;
    }
}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Дашборд бота "Забота о себе"</h1>
            <p>Система поддержки эмоционального здоровья</p>
        </div>

        <div class="main-content">
            <div class="actions-card">
                <h3>📤 Экспорт и управление</h3>
                <p>Основные функции для работы с данными:</p>
                <div class="actions-grid">
                    <a href="/dashboard/export/responses" class="action-btn">📄 Экспорт ответов (CSV)</a>
                    <a href="/dashboard/export/free-responses" class="action-btn">💬 Экспорт свободных ответов (CSV)</a>
                    <a href="/dashboard/export/users" class="action-btn">👥 Экспорт пользователей (CSV)</a>
                    <a href="/dashboard/export/alerts" class="action-btn">🚨 Экспорт алертов (CSV)</a>
                    <a href="/dashboard/alerts" class="action-btn">📋 Просмотр алертов</a>
                    <a href="/dashboard" class="action-btn">🏠 На главную</a>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <h3>👥 Всего пользователей</h3>
                    <div class="big-number">${stats.totalUsers}</div>
                    <p>Зарегистрировано в системе</p>
                </div>
                <div class="stat-card">
                    <h3>📈 Активных сегодня</h3>
                    <div class="big-number">${stats.activeToday}</div>
                    <p>Пользователей взаимодействовало сегодня</p>
                </div>
                <div class="stat-card">
                    <h3>🎯 Завершили курс</h3>
                    <div class="big-number">${stats.completedCourse}</div>
                    <p>Прошли все 7 дней программы</p>
                </div>
                <div class="stat-card">
                    <h3>🚨 Алерты безопасности${unhandledAlerts > 0 ? 
                    `<span class="alert-badge">${unhandledAlerts}</span>` : ''}</h3>
                    <div class="big-number">${alerts.length}</div>
                    <p>Всего сигналов безопасности</p>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>🕐 Последнее обновление: ${new Date().toLocaleString('ru-RU')}</p>
            <p style="margin-top: 10px;">
                💡 <strong>Новое:</strong> Улучшенный дизайн и экспорт свободных ответов!
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

    // Страница алертов
    this.app.get('/dashboard/alerts', authenticate, async (req, res) => {
      try {
        const alerts = await this.database.getAlerts();
        
        const alertRows = alerts.map((alert: any) => `
          <tr style="${!alert.handled ? 'background-color: #fff5f5;' : ''}">
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${alert.id}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${alert.first_name || 'Неизвестно'}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${alert.telegram_id}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; max-width: 300px; word-wrap: break-word;">${alert.message}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
              <span style="padding: 4px 8px; border-radius: 12px; color: white; background: ${alert.handled ? '#48bb78' : '#e53e3e'};">
                ${alert.handled ? 'Обработан' : 'Новый'}
              </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${new Date(alert.created_at).toLocaleString('ru-RU')}</td>
          </tr>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <title>🚨 Алерты безопасности</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f7fafc; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .table-container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; }
            th { background: #4a5568; color: white; padding: 12px; text-align: left; }
            .btn { display: inline-block; background: #4299e1; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin-right: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Алерты безопасности</h1>
              <p>Всего алертов: ${alerts.length} | Необработанных: ${alerts.filter((a: any) => !a.handled).length}</p>
              <a href="/dashboard" class="btn">← Назад к дашборду</a>
              <a href="/dashboard/export/alerts" class="btn">📥 Экспорт CSV</a>
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Имя</th>
                    <th>Telegram ID</th>
                    <th>Сообщение</th>
                    <th>Статус</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  ${alertRows}
                </tbody>
              </table>
            </div>
          </div>
        </body>
        </html>`;
        
        res.send(html);
      } catch (error) {
        res.status(500).send(`Ошибка: ${error}`);
      }
    });

    // Экспорт ответов в CSV
    this.app.get('/dashboard/export/responses', authenticate, async (req, res) => {
      try {
        logger.info('📥 Запрос на экспорт ответов');
        
        const responses = await this.database.getAllResponses();
        
        let csv = '\ufeff'; // BOM для кириллицы
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
        
        const filename = `responses_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        logger.success(`✅ Экспортировано ${responses.length} ответов`);
        res.send(csv);
        
      } catch (error) {
        logger.error('❌ Ошибка экспорта ответов:', error);
        res.status(500).send(`Ошибка экспорта: ${error}`);
      }
    });

    // Экспорт алертов в CSV
    this.app.get('/dashboard/export/alerts', authenticate, async (req, res) => {
      try {
        logger.info('📥 Запрос на экспорт алертов');
        
        const alerts = await this.database.getAlerts();
        
        let csv = '\ufeff';
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
     
        const filename = `alerts_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        logger.success(`✅ Экспортировано ${alerts.length} алертов`);
        res.send(csv);
        
      } catch (error) {
        logger.error('❌ Ошибка экспорта алертов:', error);
        res.status(500).send(`Ошибка экспорта: ${error}`);
      }
    });

    // Экспорт свободных ответов пользователей в CSV
    this.app.get('/dashboard/export/free-responses', authenticate, async (req, res) => {
      try {
        logger.info('📥 Запрос на экспорт свободных ответов');
        
        // Получаем только свободные текстовые ответы (не callback кнопки)
        const freeResponses = await this.database.getFreeTextResponses();
        
        let csv = '\ufeff'; // BOM для кириллицы
        csv += 'ID пользователя,Имя,День курса,Время отправки,Контекст (сообщение бота),Ответ пользователя,Дата и время\n';
        
        freeResponses.forEach((response: any) => {
          // Определяем контекст - на какое сообщение бота отвечал пользователь
          let context = '';
          const day = response.day || response.current_day || 1;
          
          // Получаем временную метку ответа для определения контекста
          const responseHour = new Date(response.created_at).getHours();
          
          if (responseHour >= 9 && responseHour < 13) {
            context = `День ${day}: Ответ на утреннее приветствие`;
          } else if (responseHour >= 13 && responseHour < 16) {
            context = `День ${day}: Ответ на упражнение дня`;
          } else if (responseHour >= 16 && responseHour < 20) {
            context = `День ${day}: Ответ на фразу для размышления`;
          } else if (responseHour >= 20 || responseHour < 9) {
            context = `День ${day}: Ответ на вечернюю рефлексию`;
          } else {
            context = `День ${day}: Свободное сообщение`;
          }
          
          csv += [
            escapeCSV(response.user_id),
            escapeCSV(response.first_name || response.name || 'Не указано'),
            escapeCSV(day),
            escapeCSV(new Date(response.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })),
            escapeCSV(context),
            escapeCSV(response.answer || response.response_text || response.message),
            escapeCSV(new Date(response.created_at).toLocaleString('ru-RU'))
          ].join(',') + '\n';
        });
        
        const filename = `free_responses_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        logger.success(`✅ Экспортировано ${freeResponses.length} свободных ответов`);
        res.send(csv);
        
      } catch (error) {
        logger.error('❌ Ошибка экспорта свободных ответов:', error);
        res.status(500).send(`Ошибка экспорта: ${error}`);
      }
    });

    // Экспорт пользователей в CSV
    this.app.get('/dashboard/export/users', authenticate, async (req, res) => {
      try {
        logger.info('📥 Запрос на экспорт пользователей');
        
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
        
        const filename = `users_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        logger.success(`✅ Экспортировано ${users.length} пользователей`);
        res.send(csv);
        
      } catch (error) {
        logger.error('❌ Ошибка экспорта пользователей:', error);
        res.status(500).send(`Ошибка экспорта: ${error}`);
      }
    });
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        logger.success(`🚀 Сервер запущен на порту ${port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.success('✅ Express сервер остановлен');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
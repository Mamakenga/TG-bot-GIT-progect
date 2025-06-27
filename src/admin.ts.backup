import express from 'express';
import cors from 'cors';
import path from 'path';
import { Database } from './database';
import { config } from './config';
import { createCSV } from './utils';

const app = express();
const database = new Database();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Простая аутентификация
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
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
}

// Главная страница дашборда
app.get('/dashboard', authenticate, async (req, res) => {
  try {
    await database.init();
    const stats = await database.getStats();
    const alerts = await database.getAlerts();
    const unhandledAlerts = alerts.filter(alert => !alert.handled).length;
    
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
            backdrop-filter: blur(10px);
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
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.15);
        }
        .stat-card h3 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.2em;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .big-number {
            font-size: 3em;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 15px 0;
        }
        .stat-description {
            color: #666;
            font-size: 0.9em;
        }
        .actions-card {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
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
        .alert-btn {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        }
        .alert-btn:hover {
            box-shadow: 0 8px 20px rgba(255, 107, 107, 0.4);
        }
        .refresh-info {
            text-align: center;
            color: rgba(255, 255, 255, 0.8);
            margin-top: 30px;
            font-size: 0.9em;
        }
        .alert-badge {
            background: #ff6b6b;
            color: white;
            border-radius: 50%;
            padding: 4px 8px;
            font-size: 0.8em;
            font-weight: bold;
            margin-left: 8px;
        }
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .feature-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .feature-card h4 {
            color: white;
            margin-bottom: 10px;
        }
        .feature-card p {
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.9em;
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
                <p class="stat-description">Всего зарегистрировано</p>
            </div>
            
            <div class="stat-card">
                <h3>📈 Активность сегодня</h3>
                <div class="big-number">${stats.activeToday}</div>
                <p class="stat-description">Активных пользователей</p>
            </div>
            
            <div class="stat-card">
                <h3>🎯 Завершили курс</h3>
                <div class="big-number">${stats.completedCourse}</div>
                <p class="stat-description">Прошли все 7 дней</p>
            </div>

            <div class="stat-card">
                <h3>🚨 Алерты ${unhandledAlerts > 0 ? `<span class="alert-badge">${unhandledAlerts}</span>` : ''}</h3>
                <div class="big-number">${alerts.length}</div>
                <p class="stat-description">Всего сигналов безопасности</p>
            </div>
        </div>

        <div class="actions-card">
            <h3>📤 Управление данными</h3>
            <p>Экспорт и анализ данных пользователей:</p>
            <div style="margin-top: 15px;">
                <a href="/dashboard/export/responses" class="action-btn">📄 Ответы пользователей (CSV)</a>
                <a href="/dashboard/export/users" class="action-btn">👥 Список пользователей (CSV)</a>
                <a href="/dashboard/alerts" class="action-btn alert-btn">🚨 Алерты безопасности</a>
                <a href="/dashboard/analytics" class="action-btn">📊 Подробная аналитика</a>
            </div>
        </div>

        <div class="feature-grid">
            <div class="feature-card">
                <h4>💙 Цель проекта</h4>
                <p>Помочь людям развить навыки самосострадания через 7-дневный курс с ежедневными упражнениями и рефлексией.</p>
            </div>
            <div class="feature-card">
                <h4>🔒 Безопасность</h4>
                <p>Автоматическое выявление тревожных сигналов и уведомление о критических ситуациях для своевременной помощи.</p>
            </div>
            <div class="feature-card">
                <h4>📈 Аналитика</h4>
                <p>Отслеживание прогресса пользователей, анализ эффективности курса и выявление точек для улучшения.</p>
            </div>
        </div>

        <div class="refresh-info">
            <p>🕐 Последнее обновление: ${new Date().toLocaleString('ru-RU')}</p>
            <p>Страница обновляется автоматически каждые 5 минут</p>
        </div>
    </div>

    <script>
        // Автообновление каждые 5 минут
        setTimeout(() => location.reload(), 300000);
        
        // Анимация чисел при загрузке
        document.addEventListener('DOMContentLoaded', function() {
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
    console.error('Ошибка дашборда:', error);
    res.status(500).send(`Ошибка: ${error}`);
  }
});

// Экспорт ответов пользователей
app.get('/dashboard/export/responses', authenticate, async (req, res) => {
  try {
    await database.init();
    const responses = await database.getAllResponses();
    
    const csv = createCSV(responses, ['Имя', 'Telegram ID', 'День', 'Тип вопроса', 'Ответ', 'Дата']);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=user-responses.csv');
    res.send('\ufeff' + csv); // UTF-8 BOM для Excel
  } catch (error) {
    res.status(500).send('Ошибка экспорта: ' + error);
  }
});

// Экспорт пользователей
app.get('/dashboard/export/users', authenticate, async (req, res) => {
  try {
    await database.init();
    const users = await database.getAllUsers();
    
    const csv = createCSV(users, ['Имя', 'Telegram ID', 'Текущий день', 'Курс завершен', 'Дата регистрации']);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    res.send('\ufeff' + csv);
  } catch (error) {
    res.status(500).send('Ошибка экспорта: ' + error);
  }
});

// Страница алертов
app.get('/dashboard/alerts', authenticate, async (req, res) => {
  try {
    await database.init();
    const alerts = await database.getAlerts();
    
    const alertsHtml = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>🚨 Алерты безопасности</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .back-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            margin-bottom: 20px;
            display: inline-block;
            transition: transform 0.3s ease;
        }
        .back-btn:hover { transform: translateY(-2px); }
        h1 { color: #333; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
        .alert-new { background: #ffebee; }
        .alert-handled { background: #e8f5e8; }
        .message-preview { max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
        .no-alerts {
            text-align: center;
            padding: 60px;
            color: #666;
            font-size: 1.2em;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/dashboard" class="back-btn">← Назад к дашборду</a>
        <h1>🚨 Алерты безопасности</h1>
        
        ${alerts.length === 0 ? '<div class="no-alerts">Алертов пока нет 😊<br>Это хорошо!</div>' : `
        <table>
            <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Триггер</th>
                <th>Сообщение</th>
                <th>Статус</th>
            </tr>
            ${alerts.map(alert => `
            <tr class="${alert.handled ? 'alert-handled' : 'alert-new'}">
                <td>${new Date(alert.created_at).toLocaleString('ru-RU')}</td>
                <td>${alert.name || 'Аноним'}<br><small>${alert.telegram_id}</small></td>
                <td><strong>${alert.trigger_word}</strong></td>
                <td class="message-preview">${alert.message.substring(0, 100)}${alert.message.length > 100 ? '...' : ''}</td>
                <td>${alert.handled ? '✅ Обработан' : '🔴 Новый'}</td>
            </tr>
            `).join('')}
        </table>
        `}
    </div>
</body>
</html>`;

    res.send(alertsHtml);
  } catch (error) {
    res.status(500).send('Ошибка: ' + error);
  }
});

// API для статистики
app.get('/api/stats', authenticate, async (req, res) => {
  try {
    await database.init();
    const stats = await database.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error });
  }
});

// Главная страница (редирект на дашборд)
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

const PORT = config.server.port;

if (require.main === module) {
  database.init().then(() => {
    app.listen(PORT, () => {
      console.log(`📊 Веб-дашборд запущен на порту ${PORT}`);
      console.log(`🌐 Доступен по адресу: http://localhost:${PORT}/dashboard`);
      console.log(`🔐 Логин: admin, Пароль: ${config.security.adminPassword}`);
    });
  }).catch(console.error);
}

export default app;
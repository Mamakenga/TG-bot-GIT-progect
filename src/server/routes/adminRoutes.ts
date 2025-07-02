// src/server/routes/adminRoutes.ts
import { Router } from 'express';
import { Database } from '../../database';

export function adminRoutes(database: Database) {
  const router = Router();

  // Middleware авторизации
  const authenticate = (req: any, res: any, next: any) => {
    const auth = req.headers.authorization;
    if (!auth) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
      return res.status(401).send('Требуется авторизация');
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (credentials[0] === 'admin' && credentials[1] === process.env.ADMIN_PASSWORD) {
      next();
    } else {
      res.status(401).send('Неверные данные');
    }
  };

  // Применяем аутентификацию ко всем роутам
  router.use(authenticate);

  // Функция для экранирования CSV
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Главная страница дашборда
  router.get('/', async (req, res) => {
    try {
      const stats = await database.getStats();
      const alerts = await database.getAlerts();
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
            background: linear-gradient(135deg, #8B5CF6 0%, #EC4899 30%, #F59E0B 70%, #EF4444 100%);
            color: #1E293B;
            line-height: 1.6;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            background: rgba(255, 255, 255, 0.95);
            color: #1E293B;
            padding: 30px;
            text-align: center;
            margin-bottom: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
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
            text-align: center;
        }
        .big-number {
            font-size: 3em;
            font-weight: bold;
            background: linear-gradient(135deg, #8B5CF6, #EC4899);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Дашборд бота "Забота о себе"</h1>
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
                <h3>🚨 Алерты</h3>
                <div class="big-number">${alerts.length}</div>
                <p>Всего сигналов безопасности</p>
            </div>
        </div>
    </div>
</body>
</html>`;
      res.send(html);
    } catch (error) {
      res.status(500).send(`Ошибка: ${error}`);
    }
  });

  // Экспорт ответов
  router.get('/export/responses', async (req, res) => {
    try {
      const responses = await database.getAllResponses();
      
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
      
      const filename = `responses_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
      
    } catch (error) {
      res.status(500).send(`Ошибка экспорта: ${error}`);
    }
  });

  return router;
}
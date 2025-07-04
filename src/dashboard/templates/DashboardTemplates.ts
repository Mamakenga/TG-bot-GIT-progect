// src/dashboard/templates/DashboardTemplates.ts
export class DashboardTemplates {
  static getMainTemplate(stats: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>📊 Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
          .stat-card { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
          .stat-number { font-size: 24px; font-weight: bold; color: #007bff; }
          .export-btn { background: #28a745; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 Статистика бота</h1>
          
          <div class="stat-card">
            <div class="stat-number">${stats.totalUsers}</div>
            <div>👥 Всего пользователей</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-number">${stats.activeToday}</div>
            <div>📈 Активных сегодня</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-number">${stats.completedCourse}</div>
            <div>🎯 Завершили курс</div>
          </div>
          
          <h2>📥 Экспорт данных</h2>
          <a href="/dashboard/export/users" class="export-btn">Экспорт пользователей</a>
          <a href="/dashboard/export/responses" class="export-btn">Экспорт ответов</a>
          <a href="/dashboard/export/alerts" class="export-btn">Экспорт алертов</a>
        </div>
      </body>
      </html>
    `;
  }

  static getErrorTemplate(error: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>❌ Ошибка</title>
        <meta charset="utf-8">
      </head>
      <body>
        <h1>❌ Ошибка</h1>
        <p>${error}</p>
        <a href="/dashboard">← Вернуться к дашборду</a>
      </body>
      </html>
    `;
  }
}

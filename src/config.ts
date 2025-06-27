import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    adminId: process.env.ADMIN_TELEGRAM_ID || ''
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/selfcare'
  },
  server: {
    port: Number(process.env.PORT) || 3000
  },
  security: {
    alertKeywords: process.env.ALERT_KEYWORDS?.split(',') || [
      'не хочу жить',
      'покончить с собой', 
      'бессмысленно',
      'суицид',
      'умереть',
      'покончить с жизнью',
      'нет смысла жить'
    ],
    psychologistEmail: process.env.PSYCHOLOGIST_EMAIL || 'help@harmony4soul.com',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123'
  },
  reminders: {
    morning: '09:00',
    afternoon: '13:00',
    evening: '20:00'
  }
};
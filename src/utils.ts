import { config } from './config';

// Проверка на тревожные слова
export function checkForAlerts(text: string): string | null {
  if (!text) {
    return null;
  }
  
  const lowerText = text.toLowerCase();
  
  for (const keyword of config.security.alertKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  
  return null;
}

// Отправка алерта (можно расширить email уведомлениями)
export async function sendAlert(message: string): Promise<void> {
  try {
    console.log(`🚨 АЛЕРТ: ${message}`);
    
    // Здесь можно добавить отправку email
    // или уведомление в Slack/Discord
    // Например:
    // await sendEmailAlert(message);
    // await sendSlackAlert(message);
    
  } catch (error) {
    console.error('Ошибка отправки алерта:', error);
  }
}

// Форматирование времени
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

// Валидация текста
export function validateText(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  if (text.length < 1 || text.length > 4000) return false;
  return true;
}

// Случайный выбор из массива
export function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Функция для создания CSV
export function createCSV(data: any[], headers: string[]): string {
  let csv = headers.join(',') + '\n';
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Экранируем значения с запятыми или кавычками
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  }
  
  return csv;
}

// Функция для безопасного парсинга JSON
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Ошибка парсинга JSON:', error);
    return fallback;
  }
}

// Функция для задержки (полезно для rate limiting)
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для проверки валидности Telegram ID
export function isValidTelegramId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

// Функция для очистки HTML тегов из текста
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// Функция для ограничения длины текста
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Функция для логирования с временной меткой
export function logWithTimestamp(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  switch (level) {
    case 'info':
      console.log(logMessage);
      break;
    case 'warn':
      console.warn(logMessage);
      break;
    case 'error':
      console.error(logMessage);
      break;
  }
}
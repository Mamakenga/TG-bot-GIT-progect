// src/scheduling/ReminderScheduler.ts
import cron from 'node-cron';
import TelegramBot from 'node-telegram-bot-api';
import { Database } from '../database';
import { logger } from '../utils/Logger';

export class ReminderScheduler {
  private tasks: cron.ScheduledTask[] = [];

  constructor(
    private bot: TelegramBot,
    private database: Database
  ) {}

  setup(): void {
    logger.info('Настройка системы напоминаний...');

    // Утренние сообщения - 9:00 по московскому времени
    const morningTask = cron.schedule('0 9 * * *', async () => {
      logger.info('Отправка утренних напоминаний...');
      // TODO: Реализовать отправку утренних сообщений
    }, {
      timezone: "Europe/Moscow",
      scheduled: false
    });

    // Дневные упражнения - 13:00
    const exerciseTask = cron.schedule('0 13 * * *', async () => {
      logger.info('Отправка дневных упражнений...');
      // TODO: Реализовать отправку упражнений
    }, {
      timezone: "Europe/Moscow", 
      scheduled: false
    });

    // Фразы дня - 16:00
    const phraseTask = cron.schedule('0 16 * * *', async () => {
      logger.info('Отправка фраз дня...');
      // TODO: Реализовать отправку фраз
    }, {
      timezone: "Europe/Moscow",
      scheduled: false
    });

    // Вечерние рефлексии - 20:00
    const eveningTask = cron.schedule('0 20 * * *', async () => {
      logger.info('Отправка вечерних рефлексий...');
      // TODO: Реализовать отправку вечерних сообщений
    }, {
      timezone: "Europe/Moscow",
      scheduled: false
    });

    this.tasks.push(morningTask, exerciseTask, phraseTask, eveningTask);
    
    // Запускаем все задачи
    this.tasks.forEach(task => task.start());

    logger.success('Напоминания настроены на московское время');
    logger.info('   🌅 09:00 - Утренние сообщения');  
    logger.info('   🌸 13:00 - Упражнения дня');
    logger.info('   💝 16:00 - Фразы дня');
    logger.info('   🌙 20:00 - Вечерние рефлексии');
  }

  stop(): void {
  // ИСПРАВЛЕНО: убираем destroy(), используем только stop()
  this.tasks.forEach(task => {
    task.stop();
  });
  this.tasks = [];
  logger.info('Все напоминания остановлены');
}
}

console.log('Бот запущен...');

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cron from 'node-cron';
import { config } from './config';
import { Database } from './database';
import { courseContent } from './course-logic';
import { checkForAlerts, sendAlert } from './utils';

class SelfCareBot {
  private bot: TelegramBot;
  private app: express.Application;
  private database: Database;

  constructor() {
    // Webhook для продакшена, polling для разработки
    const options = process.env.NODE_ENV === 'production' 
      ? { webHook: { port: Number(process.env.PORT) || 3000 } }
      : { polling: true };
    
    this.bot = new TelegramBot(config.telegram.token, options);
    this.app = express();
    this.database = new Database();
    
    this.setupWebhook();
    this.setupHandlers();
    this.setupReminders();
  }

  private setupWebhook(): void {
    if (process.env.NODE_ENV === 'production') {
      const url = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL;
      if (url) {
        this.bot.setWebHook(`https://${url}/bot${config.telegram.token}`);
        console.log(`🔗 Webhook установлен: https://${url}`);
      }
    }
  }

  async init(): Promise<void> {
    await this.database.init();
    
    // Запуск веб-сервера для webhook
    if (process.env.NODE_ENV === 'production') {
      this.app.listen(process.env.PORT || 3000, () => {
        console.log(`🚀 Бот запущен на порту ${process.env.PORT || 3000}`);
      });
    }
    
    console.log('🤖 Бот инициализирован!');
  }

  private setupHandlers(): void {
    // Webhook endpoint
    this.app.post(`/bot${config.telegram.token}`, (req, res) => {
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
          // Обработка ответов на дни курса
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

    // Получаем пользователя для сохранения ответа
    const user = await this.database.getUser(telegramId);
    if (!user) return;

    // Сохраняем ответ пользователя
    await this.database.saveResponse(user.id, day, 'button_choice', option.text);

    // Отправляем ответ бота
    await this.bot.sendMessage(chatId, option.response);

    // Планируем следующий день
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
      }, 60000); // 1 минута для тестирования
    } else {
      // Курс завершен
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
      // Проверка на алерты
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

      // Сохранение обычного ответа
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
      statsText += `📊 Дашборд: ${process.env.DASHBOARD_URL}/dashboard\n`;

      await this.bot.sendMessage(msg.chat.id, statsText);
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
    }
  }

  private setupReminders(): void {
    // Утренние напоминания
    cron.schedule('0 9 * * *', async () => {
      console.log('Отправка утренних напоминаний...');
    });

    // Вечерние напоминания
    cron.schedule('0 20 * * *', async () => {
      console.log('Отправка вечерних напоминаний...');
    });
  }
}

// Запуск бота
const bot = new SelfCareBot();
bot.init().catch(console.error);

export default SelfCareBot;
import { Database } from '../../src/database';
import { getDayContent } from '../../src/course-logic';

// Mock для бота
const mockBot = {
  sendMessage: jest.fn().mockResolvedValue({}),
};

// Симуляция системы напоминаний
class ReminderSystemTest {
  constructor(private bot: any, private database: Database) {}

  async sendMorningMessages(): Promise<void> {
    const activeUsers = await this.database.getActiveUsers();
    
    for (const user of activeUsers) {
      if (user.course_completed || (user.current_day || 1) > 7) {
        continue;
      }

      const currentDay = user.current_day || 1;
      
      // Проверяем, не отправляли ли уже сегодня
      const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'morning');
      if (alreadySent) {
        continue;
      }

      const dayContent = getDayContent(currentDay);
      if (!dayContent) continue;

      // Отправляем сообщение
      await this.bot.sendMessage(user.telegram_id, dayContent.morningMessage);
      
      // Логируем отправку
      await this.database.logReminderSent(user.id, currentDay, 'morning');
    }
  }

  async sendExerciseMessages(): Promise<void> {
    const activeUsers = await this.database.getActiveUsers();
    
    for (const user of activeUsers) {
      if (user.course_completed || (user.current_day || 1) > 7) continue;

      const currentDay = user.current_day || 1;
      
      const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'exercise');
      if (alreadySent) continue;

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

      await this.database.logReminderSent(user.id, currentDay, 'exercise');
    }
  }

  async sendPhraseMessages(): Promise<void> {
    const activeUsers = await this.database.getActiveUsers();
    
    for (const user of activeUsers) {
      if (user.course_completed || (user.current_day || 1) > 7) continue;

      const currentDay = user.current_day || 1;
      
      const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'phrase');
      if (alreadySent) continue;

      const dayContent = getDayContent(currentDay);
      if (!dayContent) continue;

      await this.bot.sendMessage(user.telegram_id, dayContent.phraseOfDay, {
        reply_markup: {
          inline_keyboard: [[
            { text: '💙 Откликается', callback_data: `day_${currentDay}_phrase_resonates` },
            { text: '🤔 Звучит странно', callback_data: `day_${currentDay}_phrase_strange` },
            { text: '😔 Сложно поверить', callback_data: `day_${currentDay}_phrase_difficult` }
          ]]
        }
      });

      await this.database.logReminderSent(user.id, currentDay, 'phrase');
    }
  }

  async sendEveningMessages(): Promise<void> {
    const activeUsers = await this.database.getActiveUsers();
    
    for (const user of activeUsers) {
      if (user.course_completed || (user.current_day || 1) > 7) continue;

      const currentDay = user.current_day || 1;
      
      const alreadySent = await this.database.wasReminderSentToday(user.id, currentDay, 'evening');
      if (alreadySent) continue;

      const dayContent = getDayContent(currentDay);
      if (!dayContent) continue;

      await this.bot.sendMessage(user.telegram_id, dayContent.eveningMessage, {
        reply_markup: dayContent.options ? {
          inline_keyboard: dayContent.options.map((option, index) => [{
            text: option.text,
            callback_data: `day_${currentDay}_evening_${index}`
          }])
        } : undefined
      });

      await this.database.logReminderSent(user.id, currentDay, 'evening');

      // Проверяем, нужно ли перевести на следующий день
      const shouldAdvance = await this.database.shouldAdvanceUserDay(user.id, currentDay);
      if (shouldAdvance && currentDay < 7) {
        await this.database.updateUserDay(user.telegram_id, currentDay + 1);
      }
    }
  }
}

describe('Reminder System Integration Tests', () => {
  let database: Database;
  let reminderSystem: ReminderSystemTest;
  let testUserIds: number[] = [];

  beforeAll(async () => {
    database = new Database();
    await database.init();
    reminderSystem = new ReminderSystemTest(mockBot, database);
  });

  afterAll(async () => {
    // Очистка всех тестовых пользователей
    for (const userId of testUserIds) {
      await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [userId]);
    }
    await database.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Очистка логов напоминаний для тестовых пользователей
    for (const userId of testUserIds) {
      const user = await database.getUser(userId);
      if (user) {
        await database.pool.query('DELETE FROM reminder_log WHERE user_id = $1', [user.id]);
      }
    }
  });

  describe('Morning Messages', () => {
    it('should send morning message to active user', async () => {
      const user = await database.createUser(999999001, 'Test User 1');
      testUserIds.push(999999001);

      await reminderSystem.sendMorningMessages();

      // Проверяем отправку сообщения
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        999999001,
        expect.stringContaining('день')
      );

      // Проверяем логирование
      const wasSent = await database.wasReminderSentToday(user.id, 1, 'morning');
      expect(wasSent).toBe(true);
    });

    it('should not send duplicate morning messages', async () => {
      const user = await database.createUser(999999002, 'Test User 2');
      testUserIds.push(999999002);

      // Первая отправка
      await reminderSystem.sendMorningMessages();
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Вторая отправка - не должна произойти
      await reminderSystem.sendMorningMessages();
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    it('should skip completed course users', async () => {
      const user = await database.createUser(999999003, 'Completed User');
      testUserIds.push(999999003);
      await database.markCourseCompleted(999999003);

      await reminderSystem.sendMorningMessages();

      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    it('should skip paused users', async () => {
      const user = await database.createUser(999999004, 'Paused User');
      testUserIds.push(999999004);
      await database.pauseUser(999999004);

      await reminderSystem.sendMorningMessages();

      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Exercise Messages', () => {
    it('should send exercise with interactive buttons', async () => {
      const user = await database.createUser(999999005, 'Exercise User');
      testUserIds.push(999999005);

      await reminderSystem.sendExerciseMessages();

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        999999005,
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '✅ Готова попробовать',
                  callback_data: 'day_1_exercise_ready'
                })
              ])
            ])
          })
        })
      );
    });

    it('should not send duplicate exercise messages', async () => {
      const user = await database.createUser(999999006, 'Exercise User 2');
      testUserIds.push(999999006);

      await reminderSystem.sendExerciseMessages();
      jest.clearAllMocks();
      
      await reminderSystem.sendExerciseMessages();
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Phrase Messages', () => {
    it('should send phrase with feedback buttons', async () => {
      const user = await database.createUser(999999007, 'Phrase User');
      testUserIds.push(999999007);

      await reminderSystem.sendPhraseMessages();

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        999999007,
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '💙 Откликается',
                  callback_data: 'day_1_phrase_resonates'
                })
              ])
            ])
          })
        })
      );
    });
  });

  describe('Evening Messages and Day Advancement', () => {
    it('should send evening message and advance day when all reminders sent', async () => {
      const user = await database.createUser(999999008, 'Evening User');
      testUserIds.push(999999008);

      // Отправляем все типы напоминаний
      await reminderSystem.sendMorningMessages();
      await reminderSystem.sendExerciseMessages();
      await reminderSystem.sendPhraseMessages();
      await reminderSystem.sendEveningMessages();

      // Проверяем переход на день 2
      const updatedUser = await database.getUser(999999008);
      expect(updatedUser!.current_day).toBe(2);
    });

    it('should not advance day if not all reminders sent', async () => {
      const user = await database.createUser(999999009, 'Partial User');
      testUserIds.push(999999009);

      // Отправляем только утреннее сообщение
      await reminderSystem.sendMorningMessages();
      await reminderSystem.sendEveningMessages();

      // День не должен измениться
      const updatedUser = await database.getUser(999999009);
      expect(updatedUser!.current_day).toBe(1);
    });

    it('should send evening message with options for reflection days', async () => {
      const user = await database.createUser(999999010, 'Reflection User');
      testUserIds.push(999999010);
      await database.updateUserDay(999999010, 3); // День с опциями

      await reminderSystem.sendEveningMessages();

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        999999010,
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
    });
  });

  describe('Multi-User Scenarios', () => {
    it('should handle multiple users at different days', async () => {
      // Создаем пользователей на разных днях
      const user1 = await database.createUser(999999011, 'User Day 1');
      const user2 = await database.createUser(999999012, 'User Day 3');
      testUserIds.push(999999011, 999999012);
      
      await database.updateUserDay(999999012, 3);

      await reminderSystem.sendMorningMessages();

      // Должны быть отправлены сообщения для обоих пользователей
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(2);
      
      // Проверяем содержимое для разных дней
      const calls = mockBot.sendMessage.mock.calls;
      expect(calls.some(call => call[0] === 999999011)).toBe(true);
      expect(calls.some(call => call[0] === 999999012)).toBe(true);
    });

    it('should handle mixed user states', async () => {
      // Активный пользователь
      const activeUser = await database.createUser(999999013, 'Active');
      // Приостановленный пользователь
      const pausedUser = await database.createUser(999999014, 'Paused');
      // Завершивший курс
      const completedUser = await database.createUser(999999015, 'Completed');
      
      testUserIds.push(999999013, 999999014, 999999015);
      
      await database.pauseUser(999999014);
      await database.markCourseCompleted(999999015);

      await reminderSystem.sendMorningMessages();

      // Должно быть отправлено только одно сообщение (активному пользователю)
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        999999013,
        expect.any(String)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle users beyond day 7', async () => {
      const user = await database.createUser(999999016, 'Beyond Course');
      testUserIds.push(999999016);
      await database.updateUserDay(999999016, 8);

      await reminderSystem.sendMorningMessages();

      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Мокаем ошибку при получении активных пользователей
      const originalGetActiveUsers = database.getActiveUsers;
      database.getActiveUsers = jest.fn().mockRejectedValue(new Error('DB Error'));

      await expect(reminderSystem.sendMorningMessages()).resolves.not.toThrow();

      // Восстанавливаем метод
      database.getActiveUsers = originalGetActiveUsers;
    });

    it('should handle missing course content gracefully', async () => {
      const user = await database.createUser(999999017, 'Invalid Day');
      testUserIds.push(999999017);
      await database.updateUserDay(999999017, 999); // Несуществующий день

      await reminderSystem.sendMorningMessages();

      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
  });
});
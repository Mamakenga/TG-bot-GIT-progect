import { Database } from '../../src/database';
import { Pool } from 'pg';

describe('Database Integration Tests', () => {
  let database: Database;
  let testUserId: number;
  
  beforeAll(async () => {
    // Используем тестовую БД
    database = new Database();
    
    // Мокаем pool для тестов (так как реальной БД может не быть)
    database.pool = {
      query: jest.fn().mockImplementation((query: string, params?: any[]) => {
        // Простая симуляция БД операций
        if (query.includes('INSERT INTO users')) {
          return Promise.resolve({
            rows: [{ id: 1, telegram_id: params?.[0], name: params?.[1], current_day: 1, course_completed: false, is_paused: false, created_at: new Date(), updated_at: new Date() }]
          });
        }
        if (query.includes('SELECT * FROM users WHERE telegram_id')) {
          return Promise.resolve({
            rows: params?.[0] === 999999999 ? [{ id: 1, telegram_id: 999999999, name: 'Test User', current_day: 1, course_completed: false, is_paused: false }] : []
          });
        }
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      connect: jest.fn(),
      end: jest.fn(),
    } as any;
  });

  afterAll(async () => {
    // Очистка тестовых данных
    if (testUserId) {
      await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [999999999]);
    }
    await database.close();
  });

  beforeEach(async () => {
    // Очистка перед каждым тестом
    await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [999999999]);
  });

  describe('User Operations', () => {
    it('should create a new user', async () => {
      const user = await database.createUser(999999999, 'Test User');
      
      expect(user).toBeDefined();
      expect(user.telegram_id).toBe(999999999);
      expect(user.name).toBe('Test User');
      expect(user.current_day).toBe(1);
      expect(user.course_completed).toBe(false);
      
      testUserId = user.id;
    });

    it('should get existing user', async () => {
      // Создаем пользователя
      await database.createUser(999999999, 'Test User');
      
      // Получаем пользователя
      const user = await database.getUser(999999999);
      
      expect(user).toBeDefined();
      expect(user!.telegram_id).toBe(999999999);
      expect(user!.name).toBe('Test User');
    });

    it('should return null for non-existing user', async () => {
      const user = await database.getUser(888888888);
      expect(user).toBeNull();
    });

    it('should update user day', async () => {
      const user = await database.createUser(999999999, 'Test User');
      
      await database.updateUserDay(999999999, 3);
      
      const updatedUser = await database.getUser(999999999);
      expect(updatedUser!.current_day).toBe(3);
    });

    it('should pause and resume user', async () => {
      await database.createUser(999999999, 'Test User');
      
      await database.pauseUser(999999999);
      let user = await database.getUser(999999999);
      expect(user!.is_paused).toBe(true);
      
      await database.resumeUser(999999999);
      user = await database.getUser(999999999);
      expect(user!.is_paused).toBe(false);
    });

    it('should mark course as completed', async () => {
      await database.createUser(999999999, 'Test User');
      
      await database.markCourseCompleted(999999999);
      
      const user = await database.getUser(999999999);
      expect(user!.course_completed).toBe(true);
    });

    it('should reset user progress', async () => {
      const user = await database.createUser(999999999, 'Test User');
      await database.updateUserDay(999999999, 5);
      await database.markCourseCompleted(999999999);
      
      await database.resetUserProgress(999999999);
      
      const resetUser = await database.getUser(999999999);
      expect(resetUser!.current_day).toBe(1);
      expect(resetUser!.course_completed).toBe(false);
    });
  });

  describe('Response Operations', () => {
    beforeEach(async () => {
      const user = await database.createUser(999999999, 'Test User');
      testUserId = user.id;
    });

    it('should save user response', async () => {
      await database.saveResponse(testUserId, 1, 'test_question', 'Test response');
      
      const responses = await database.pool.query(
        'SELECT * FROM responses WHERE user_id = $1', 
        [testUserId]
      );
      
      expect(responses.rows).toHaveLength(1);
      expect(responses.rows[0].response_text).toBe('Test response');
      expect(responses.rows[0].question_type).toBe('test_question');
    });

    it('should get user responses by day', async () => {
      await database.saveResponse(testUserId, 1, 'morning', 'Morning response');
      await database.saveResponse(testUserId, 1, 'evening', 'Evening response');
      await database.saveResponse(testUserId, 2, 'morning', 'Day 2 response');
      
      const day1Responses = await database.pool.query(
        'SELECT * FROM responses WHERE user_id = $1 AND day = $2', 
        [testUserId, 1]
      );
      
      expect(day1Responses.rows).toHaveLength(2);
    });
  });

  describe('Alert Operations', () => {
    beforeEach(async () => {
      const user = await database.createUser(999999999, 'Test User');
      testUserId = user.id;
    });

    it('should create alert', async () => {
      await database.createAlert(testUserId, 'тест', 'Test alert message');
      
      const alerts = await database.pool.query(
        'SELECT * FROM alerts WHERE user_id = $1', 
        [testUserId]
      );
      
      expect(alerts.rows).toHaveLength(1);
      expect(alerts.rows[0].trigger_word).toBe('тест');
      expect(alerts.rows[0].message).toBe('Test alert message');
      expect(alerts.rows[0].handled).toBe(false);
    });
  });

  describe('Reminder System', () => {
    beforeEach(async () => {
      const user = await database.createUser(999999999, 'Test User');
      testUserId = user.id;
    });

    it('should log reminder sent', async () => {
      await database.logReminderSent(testUserId, 1, 'morning');
      
      const logs = await database.pool.query(
        'SELECT * FROM reminder_log WHERE user_id = $1', 
        [testUserId]
      );
      
      expect(logs.rows).toHaveLength(1);
      expect(logs.rows[0].day).toBe(1);
      expect(logs.rows[0].reminder_type).toBe('morning');
    });

    it('should check if reminder was sent today', async () => {
      await database.logReminderSent(testUserId, 1, 'morning');
      
      const wasSent = await database.wasReminderSentToday(testUserId, 1, 'morning');
      const wasNotSent = await database.wasReminderSentToday(testUserId, 1, 'evening');
      
      expect(wasSent).toBe(true);
      expect(wasNotSent).toBe(false);
    });

    it('should determine when to advance user day', async () => {
      // Отправляем все 4 типа напоминаний
      await database.logReminderSent(testUserId, 1, 'morning');
      await database.logReminderSent(testUserId, 1, 'exercise');
      await database.logReminderSent(testUserId, 1, 'phrase');
      await database.logReminderSent(testUserId, 1, 'evening');
      
      const shouldAdvance = await database.shouldAdvanceUserDay(testUserId, 1);
      expect(shouldAdvance).toBe(true);
      
      // Проверяем частичную отправку
      await database.pool.query('DELETE FROM reminder_log WHERE user_id = $1', [testUserId]);
      await database.logReminderSent(testUserId, 1, 'morning');
      
      const shouldNotAdvance = await database.shouldAdvanceUserDay(testUserId, 1);
      expect(shouldNotAdvance).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await database.createUser(999999999, 'Test User');
    });

    it('should get correct statistics', async () => {
      const stats = await database.getStats();
      
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('activeToday');
      expect(stats).toHaveProperty('completedCourse');
      
      expect(typeof stats.totalUsers).toBe('number');
      expect(stats.totalUsers).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Progress Operations', () => {
    beforeEach(async () => {
      const user = await database.createUser(999999999, 'Test User');
      testUserId = user.id;
    });

    it('should mark day as completed', async () => {
      await database.markDayCompleted(testUserId, 1);
      
      const progress = await database.pool.query(
        'SELECT * FROM progress WHERE user_id = $1 AND day = $2', 
        [testUserId, 1]
      );
      
      expect(progress.rows).toHaveLength(1);
      expect(progress.rows[0].completed).toBe(true);
    });
  });
});

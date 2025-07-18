import { Pool, PoolClient } from 'pg';
import { config } from './config';
import { User, Stats } from './types';

export class Database {
  // ✅ ИСПРАВЛЕНО: Сделали pool публичным для команд тестирования
  public pool: Pool;

  constructor() {
    const connectionConfig = {
      connectionString: config.database.url,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    this.pool = new Pool(connectionConfig);
  }

  async init(): Promise<void> {
    try {
      await this.createTables();
      console.log('✅ База данных инициализирована');
    } catch (error) {
      console.error('❌ Ошибка инициализации БД:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    try {
      // Сначала создаем основные таблицы
      const createQueries = [
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          telegram_id BIGINT UNIQUE NOT NULL,
          name VARCHAR(255),
          current_day INTEGER DEFAULT 1,
          personalization_type VARCHAR(50),
          notifications_enabled BOOLEAN DEFAULT true,
          preferred_time TIME DEFAULT '09:00',
          course_completed BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS responses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          day INTEGER NOT NULL,
          question_type VARCHAR(100) NOT NULL,
          response_text TEXT,
          response_type VARCHAR(50) DEFAULT 'text',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS progress (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          day INTEGER NOT NULL,
          completed BOOLEAN DEFAULT false,
          completed_at TIMESTAMP,
          skipped BOOLEAN DEFAULT false,
          UNIQUE(user_id, day)
        )`,
        
        `CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          trigger_word VARCHAR(255),
          message TEXT,
          handled BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // ✅ ВАЖНАЯ ТАБЛИЦА ДЛЯ АНТИДУБЛИРОВАНИЯ
        `CREATE TABLE IF NOT EXISTS reminder_log (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          day INTEGER NOT NULL,
          reminder_type VARCHAR(50) NOT NULL,
          sent_date DATE DEFAULT CURRENT_DATE,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, day, reminder_type, sent_date)
        )`
      ];

      // Выполняем создание таблиц
      for (const query of createQueries) {
        await this.pool.query(query);
        console.log(`✅ Создана таблица: ${query.substring(0, 30)}...`);
      }

      // Безопасно добавляем поле is_paused если его нет
      try {
        const checkColumn = await this.pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'is_paused'
        `);
        
        if (checkColumn.rows.length === 0) {
          await this.pool.query(`ALTER TABLE users ADD COLUMN is_paused BOOLEAN DEFAULT false`);
          console.log(`✅ Добавлено поле is_paused в таблицу users`);
        } else {
          console.log(`ℹ️ Поле is_paused уже существует в таблице users`);
        }
      } catch (alterError) {
        console.error('❌ Ошибка добавления поля is_paused:', alterError);
        // Не падаем, продолжаем без этого поля
      }

      // Создаем базовые индексы
      const basicIndexes = [
        `CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`,
        `CREATE INDEX IF NOT EXISTS idx_responses_user_day ON responses(user_id, day)`,
        `CREATE INDEX IF NOT EXISTS idx_alerts_handled ON alerts(handled, created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_reminder_log_user_day ON reminder_log(user_id, day, reminder_type, sent_date)`
      ];

      for (const query of basicIndexes) {
        try {
          await this.pool.query(query);
          console.log(`✅ Создан индекс: ${query.substring(20, 50)}...`);
        } catch (err) {
          const error = err as Error;
          console.error(`❌ Ошибка создания индекса: ${error.message || 'Неизвестная ошибка'}`);
        }
      }

      // Пробуем создать индекс с is_paused только если поле существует
      try {
        await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_users_active ON users(course_completed, current_day)`);
        console.log(`✅ Создан индекс idx_users_active`);
      } catch (err) {
        const error = err as Error;
        console.log(`ℹ️ Создание расширенного индекса пропущено: ${error.message || 'Неизвестная ошибка'}`);
      }

    } catch (error) {
      console.error('❌ Критическая ошибка при создании таблиц:', error);
      throw error;
    }
  }

  async createUser(telegramId: number, name?: string): Promise<User> {
    const query = `
      INSERT INTO users (telegram_id, name) 
      VALUES ($1, $2) 
      ON CONFLICT (telegram_id) DO UPDATE SET 
        updated_at = CURRENT_TIMESTAMP,
        name = COALESCE($2, users.name)
      RETURNING *
    `;
    const result = await this.pool.query(query, [telegramId, name]);
    return result.rows[0];
  }

  async getUser(telegramId: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await this.pool.query(query, [telegramId]);
    return result.rows[0] || null;
  }

  async updateUserDay(telegramId: number, day: number): Promise<void> {
    const query = 'UPDATE users SET current_day = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2';
    await this.pool.query(query, [day, telegramId]);
  }

  async setPersonalization(telegramId: number, type: string): Promise<void> {
    const query = 'UPDATE users SET personalization_type = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2';
    await this.pool.query(query, [type, telegramId]);
  }

  async pauseUser(telegramId: number): Promise<void> {
    try {
      // Проверяем существование поля is_paused
      const checkColumn = await this.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_paused'
      `);
      
      if (checkColumn.rows.length > 0) {
        const query = 'UPDATE users SET is_paused = true, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $1';
        await this.pool.query(query, [telegramId]);
        console.log(`✅ Пользователь ${telegramId} поставлен на паузу`);
      } else {
        console.log(`ℹ️ Поле is_paused не существует, пауза не установлена для ${telegramId}`);
      }
    } catch (error) {
      console.error('❌ Ошибка в pauseUser:', error);
      // Не падаем, просто логируем
    }
  }

  async resumeUser(telegramId: number): Promise<void> {
    try {
      // Проверяем существование поля is_paused
      const checkColumn = await this.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_paused'
      `);
      
      if (checkColumn.rows.length > 0) {
        const query = 'UPDATE users SET is_paused = false, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $1';
        await this.pool.query(query, [telegramId]);
        console.log(`✅ Пользователь ${telegramId} снят с паузы`);
      } else {
        console.log(`ℹ️ Поле is_paused не существует, возобновление не требуется для ${telegramId}`);
      }
    } catch (error) {
      console.error('❌ Ошибка в resumeUser:', error);
      // Не падаем, просто логируем
    }
  }

  // ✅ НОВЫЙ МЕТОД: Получение активных пользователей для отправки напоминаний
  async getActiveUsers(): Promise<User[]> {
    try {
      // Сначала проверяем, существует ли поле is_paused
      const checkColumn = await this.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_paused'
      `);
      
      let query: string;
      if (checkColumn.rows.length > 0) {
        // Если поле is_paused существует, используем его
        query = `
          SELECT * FROM users 
          WHERE course_completed = false 
            AND (is_paused = false OR is_paused IS NULL)
            AND notifications_enabled = true 
            AND current_day BETWEEN 1 AND 7
            AND updated_at > NOW() - INTERVAL '30 days'
          ORDER BY current_day, created_at
        `;
      } else {
        // Если поля is_paused нет, работаем без него
        query = `
          SELECT * FROM users 
          WHERE course_completed = false 
            AND notifications_enabled = true 
            AND current_day BETWEEN 1 AND 7
            AND updated_at > NOW() - INTERVAL '30 days'
          ORDER BY current_day, created_at
        `;
      }
      
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка в getActiveUsers:', error);
      return [];
    }
  }

  // ✅ КЛЮЧЕВОЙ МЕТОД: Проверка, было ли уже отправлено напоминание сегодня
  async wasReminderSentToday(userId: number, day: number, reminderType: string): Promise<boolean> {
    try {
      const query = `
        SELECT COUNT(*) as count FROM reminder_log 
        WHERE user_id = $1 AND day = $2 AND reminder_type = $3 
          AND DATE(sent_at) = CURRENT_DATE
      `;
      const result = await this.pool.query(query, [userId, day, reminderType]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('❌ Ошибка в wasReminderSentToday:', error);
      return false; // При ошибке разрешаем отправку
    }
  }

  // ✅ НОВЫЙ МЕТОД: Проверка, нужно ли переводить пользователя на следующий день
  async shouldAdvanceUserDay(userId: number, currentDay: number): Promise<boolean> {
    try {
      // Проверяем, отправлены ли уже все 4 типа сообщений за текущий день
      const query = `
        SELECT DISTINCT reminder_type FROM reminder_log 
        WHERE user_id = $1 AND day = $2 AND DATE(sent_at) = CURRENT_DATE
      `;
      const result = await this.pool.query(query, [userId, currentDay]);
      const sentTypes = result.rows.map(row => row.reminder_type);
      
      // Все 4 типа сообщений: morning, exercise, phrase, evening
      const allTypes = ['morning', 'exercise', 'phrase', 'evening'];
      const allSent = allTypes.every(type => sentTypes.includes(type));
      
      return allSent;
    } catch (error) {
      console.error('❌ Ошибка в shouldAdvanceUserDay:', error);
      return false;
    }
  }

  // ✅ КЛЮЧЕВОЙ МЕТОД: Логирование отправленного напоминания
  async logReminderSent(userId: number, day: number, reminderType: string): Promise<void> {
    try {
      const query = `
        INSERT INTO reminder_log (user_id, day, reminder_type, sent_date) 
        VALUES ($1, $2, $3, CURRENT_DATE)
        ON CONFLICT (user_id, day, reminder_type, sent_date) DO NOTHING
      `;
      await this.pool.query(query, [userId, day, reminderType]);
    } catch (error) {
      console.error('❌ Ошибка в logReminderSent:', error);
      // Не падаем, просто логируем
    }
  }

  async saveResponse(userId: number, day: number, questionType: string, responseText: string): Promise<void> {
    try {
      const query = `
        INSERT INTO responses (user_id, day, question_type, response_text, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      
      await this.pool.query(query, [userId, day, questionType, responseText]);
      console.log(`✅ Ответ сохранен для пользователя ${userId}`);
    } catch (error) {
      console.error('❌ Ошибка сохранения ответа:', error);
    }
  }

  async markDayCompleted(userId: number, day: number): Promise<void> {
    const query = `
      INSERT INTO progress (user_id, day, completed, completed_at) 
      VALUES ($1, $2, true, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, day) DO UPDATE SET 
        completed = true, completed_at = CURRENT_TIMESTAMP
    `;
    await this.pool.query(query, [userId, day]);
  }

  async isDayCompleted(userId: number, day: number): Promise<boolean> {
    const query = `
      SELECT completed FROM progress 
      WHERE user_id = $1 AND day = $2 AND completed = true
    `;
    const result = await this.pool.query(query, [userId, day]);
    return result.rows.length > 0;
  }

  async markCourseCompleted(telegramId: number): Promise<void> {
    const query = 'UPDATE users SET course_completed = true, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $1';
    await this.pool.query(query, [telegramId]);
  }

  async resetUserProgress(telegramId: number): Promise<void> {
    try {
      // Проверяем, есть ли поле is_paused
      const checkColumn = await this.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_paused'
      `);
      
      let query: string;
      if (checkColumn.rows.length > 0) {
        // Если поле is_paused существует
        query = `
          UPDATE users 
          SET course_completed = false, 
              current_day = 1, 
              is_paused = false,
              updated_at = CURRENT_TIMESTAMP 
          WHERE telegram_id = $1
        `;
      } else {
        // Если поля is_paused нет
        query = `
          UPDATE users 
          SET course_completed = false, 
              current_day = 1, 
              updated_at = CURRENT_TIMESTAMP 
          WHERE telegram_id = $1
        `;
      }
      
      await this.pool.query(query, [telegramId]);
      
      // Также очищаем прогресс
      await this.pool.query('DELETE FROM progress WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)', [telegramId]);
      
      console.log(`✅ Прогресс пользователя ${telegramId} сброшен`);
    } catch (error) {
      console.error('❌ Ошибка в resetUserProgress:', error);
      throw error;
    }
  }

  async createAlert(userId: number, triggerWord: string, message: string): Promise<void> {
    const query = `
      INSERT INTO alerts (user_id, trigger_word, message) 
      VALUES ($1, $2, $3)
    `;
    await this.pool.query(query, [userId, triggerWord, message]);
  }

  // Пометить алерт как обработанный
  async markAlertAsHandled(alertId: number): Promise<void> {
    try {
      const query = `
        UPDATE alerts 
        SET handled = true 
        WHERE id = $1
      `;
      await this.pool.query(query, [alertId]);
      console.log(`✅ Алерт ${alertId} помечен как обработанный`);
    } catch (error) {
      console.error('❌ Ошибка markAlertAsHandled:', error);
      throw error;
    }
  }

  async getStats(): Promise<Stats> {
    const queries = {
      totalUsers: 'SELECT COUNT(*) as count FROM users',
      activeToday: `SELECT COUNT(DISTINCT user_id) as count FROM responses WHERE DATE(created_at) = CURRENT_DATE`,
      completedCourse: 'SELECT COUNT(*) as count FROM users WHERE course_completed = true'
    };

    const stats: Stats = {
      totalUsers: 0,
      activeToday: 0,
      completedCourse: 0
    };

    const totalResult = await this.pool.query(queries.totalUsers);
    stats.totalUsers = parseInt(totalResult.rows[0].count);

    const activeResult = await this.pool.query(queries.activeToday);
    stats.activeToday = parseInt(activeResult.rows[0].count);

    const completedResult = await this.pool.query(queries.completedCourse);
    stats.completedCourse = parseInt(completedResult.rows[0].count);

    return stats;
  }

  // Расширенная статистика
  async getDetailedStats(): Promise<any> {
    try {
      // Проверяем существование поля is_paused
      const checkColumn = await this.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_paused'
      `);
      
      let usersByDayQuery: string;
      if (checkColumn.rows.length > 0) {
        // Если поле is_paused существует, используем его
        usersByDayQuery = `
          SELECT current_day, COUNT(*) as count 
          FROM users 
          WHERE course_completed = false 
            AND (is_paused = false OR is_paused IS NULL)
          GROUP BY current_day 
          ORDER BY current_day
        `;
      } else {
        // Если поля is_paused нет, работаем без него
        usersByDayQuery = `
          SELECT current_day, COUNT(*) as count 
          FROM users 
          WHERE course_completed = false 
          GROUP BY current_day 
          ORDER BY current_day
        `;
      }

      const queries = {
        usersByDay: usersByDayQuery,
        completionRate: `
          SELECT 
            day,
            COUNT(*) as completed
          FROM progress 
          WHERE completed = true 
          GROUP BY day 
          ORDER BY day
        `,
        dailyActivity: `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as responses
          FROM responses 
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at)
          ORDER BY date
        `
      };

      const results: any = {};
      for (const [key, query] of Object.entries(queries)) {
        try {
          const result = await this.pool.query(query);
          results[key] = result.rows;
        } catch (error) {
          console.error(`❌ Ошибка в запросе ${key}:`, error);
          results[key] = [];
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Ошибка getDetailedStats:', error);
      return { usersByDay: [], completionRate: [], dailyActivity: [] };
    }
  }

  // Получить все ответы пользователей
  async getAllResponses(): Promise<any[]> {
    const query = `
      SELECT 
        r.user_id,
        u.name as first_name,
        u.telegram_id as username,
        r.day,
        r.question_type as question,
        r.response_text as answer,
        r.created_at
      FROM responses r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  // Получить всех пользователей 
  async getAllUsers(): Promise<any[]> {
    const query = `
      SELECT 
        id,
        telegram_id,
        name as first_name,
        telegram_id as username,
        current_day,
        created_at,
        updated_at as last_activity
      FROM users
      ORDER BY created_at DESC
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  // Получить ответы конкретного пользователя 
  async getUserResponses(telegramId: number): Promise<any[]> {
    const query = `
      SELECT * FROM responses r
      JOIN users u ON r.user_id = u.id
      WHERE u.telegram_id = $1
      ORDER BY r.day ASC, r.created_at ASC
    `;
    
    const result = await this.pool.query(query, [telegramId]);
    return result.rows;
  }

  // Получить все алерты
  async getAlerts(): Promise<any[]> {
    const query = `
      SELECT 
        a.*,
        u.name as first_name,
        u.telegram_id as username
      FROM alerts a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  // Получить свободные текстовые ответы
  async getFreeTextResponses(): Promise<any[]> {
    try {
      // Получаем только свободные текстовые ответы пользователей (не callback кнопки)
      const query = `
        SELECT 
          r.id,
          r.user_id,
          r.day,
          r.question_type,
          r.response_text as answer,
          r.created_at,
          u.name as first_name,
          u.telegram_id,
          u.current_day
        FROM responses r
        JOIN users u ON r.user_id = u.id  
        WHERE r.question_type = 'free_text'
           OR r.question_type IS NULL
           OR r.question_type = ''
        ORDER BY r.created_at DESC
      `;
      
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка получения свободных ответов:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Получить пользователя по userId (не telegramId)
  async getUserById(userId: number): Promise<any> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  // Обновить активность пользователя
  async updateUserActivity(userId: number): Promise<void> {
    const query = 'UPDATE users SET updated_at = NOW() WHERE id = $1';
    await this.pool.query(query, [userId]);
  }
  // Получить ответы пользователя на тест персонализации
async getUserTestResponses(userId: number): Promise<any[]> {
  try {
    const query = `
      SELECT question_type, response_text, created_at
      FROM responses 
      WHERE user_id = $1 AND day = 8 
        AND question_type LIKE 'test_q%'
      ORDER BY created_at ASC
    `;
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка получения ответов теста:', error);
    return [];
  }
}
}

export default Database;

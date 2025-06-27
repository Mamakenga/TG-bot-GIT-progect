import { Pool, PoolClient } from 'pg';
import { config } from './config';

export interface DbUser {
  id: number;
  telegram_id: number;
  name: string | null;
  current_day: number;
  personalization_type: string | null;
  notifications_enabled: boolean;
  preferred_time: string;
  course_completed: boolean;
  is_paused?: boolean; // Опциональное поле для совместимости
  created_at: Date;
  updated_at: Date;
}

export interface DbStats {
  totalUsers: number;
  activeToday: number;
  completedCourse: number;
}

export class Database {
  private pool: Pool;

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

      // Создаем базовые индексы (без is_paused)
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
        console.log(`✅ Создан индекс idx_users_active (без is_paused)`);
      } catch (err) {
        const error = err as Error;
        console.log(`ℹ️ Создание расширенного индекса пропущено: ${error.message || 'Неизвестная ошибка'}`);
      }

    } catch (error) {
      console.error('❌ Критическая ошибка при создании таблиц:', error);
      throw error;
    }
  }

  async createUser(telegramId: number, name?: string): Promise<DbUser> {
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

  async getUser(telegramId: number): Promise<DbUser | null> {
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

  // НОВЫЙ МЕТОД: Получение активных пользователей для отправки напоминаний
  async getActiveUsers(): Promise<DbUser[]> {
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

  // НОВЫЙ МЕТОД: Проверка, было ли уже отправлено напоминание сегодня
  async wasReminderSentToday(userId: number, day: number, reminderType: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count FROM reminder_log 
      WHERE user_id = $1 AND day = $2 AND reminder_type = $3 
        AND sent_date = CURRENT_DATE
    `;
    const result = await this.pool.query(query, [userId, day, reminderType]);
    return parseInt(result.rows[0].count) > 0;
  }

  // НОВЫЙ МЕТОД: Логирование отправленного напоминания
  async logReminderSent(userId: number, day: number, reminderType: string): Promise<void> {
    const query = `
      INSERT INTO reminder_log (user_id, day, reminder_type, sent_date) 
      VALUES ($1, $2, $3, CURRENT_DATE)
      ON CONFLICT (user_id, day, reminder_type, sent_date) DO NOTHING
    `;
    await this.pool.query(query, [userId, day, reminderType]);
  }

  async saveResponse(userId: number, day: number, questionType: string, responseText: string, responseType: string = 'text'): Promise<void> {
    const query = `
      INSERT INTO responses (user_id, day, question_type, response_text, response_type) 
      VALUES ($1, $2, $3, $4, $5)
    `;
    await this.pool.query(query, [userId, day, questionType, responseText, responseType]);
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

  async markCourseCompleted(telegramId: number): Promise<void> {
    const query = 'UPDATE users SET course_completed = true, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $1';
    await this.pool.query(query, [telegramId]);
  }

  async createAlert(userId: number, triggerWord: string, message: string): Promise<void> {
    const query = `
      INSERT INTO alerts (user_id, trigger_word, message) 
      VALUES ($1, $2, $3)
    `;
    await this.pool.query(query, [userId, triggerWord, message]);
  }

  async getStats(): Promise<DbStats> {
    const queries = {
      totalUsers: 'SELECT COUNT(*) as count FROM users',
      activeToday: `SELECT COUNT(*) as count FROM users WHERE DATE(updated_at) = CURRENT_DATE`,
      completedCourse: 'SELECT COUNT(*) as count FROM users WHERE course_completed = true'
    };

    const stats: DbStats = {
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

  // НОВЫЙ МЕТОД: Расширенная статистика
  async getDetailedStats(): Promise<any> {
    const queries = {
      usersByDay: `
        SELECT current_day, COUNT(*) as count 
        FROM users 
        WHERE course_completed = false AND is_paused = false
        GROUP BY current_day 
        ORDER BY current_day
      `,
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
      const result = await this.pool.query(query);
      results[key] = result.rows;
    }

    return results;
  }

  async getAllResponses(): Promise<any[]> {
    const query = `
      SELECT 
        u.name as "Имя",
        u.telegram_id as "Telegram ID",
        r.day as "День",
        r.question_type as "Тип вопроса",
        r.response_text as "Ответ",
        r.response_type as "Тип ответа",
        r.created_at as "Дата"
      FROM responses r
      JOIN users u ON r.user_id = u.id
      WHERE r.response_type = 'text' AND r.response_text IS NOT NULL
      ORDER BY r.created_at DESC
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  async getAllUsers(): Promise<any[]> {
    const query = `
      SELECT 
        name as "Имя",
        telegram_id as "Telegram ID", 
        current_day as "Текущий день",
        personalization_type as "Тип персонализации",
        course_completed as "Курс завершен",
        is_paused as "На паузе",
        created_at as "Дата регистрации",
        updated_at as "Последняя активность"
      FROM users 
      ORDER BY created_at DESC
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  async getAlerts(): Promise<any[]> {
    const query = `
      SELECT 
        a.id,
        u.name,
        u.telegram_id,
        a.trigger_word,
        a.message,
        a.handled,
        a.created_at
      FROM alerts a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 50
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default Database;
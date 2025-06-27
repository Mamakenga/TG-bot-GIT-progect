import { Pool, PoolClient } from 'pg';
import { config } from './config';

export interface DbUser {
  id: number;
  telegram_id: number;
  name: string | null;
  currentDay: number;
  personalization_type: string | null;
  notifications_enabled: boolean;
  preferred_time: string;
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
    // Автоматическая настройка для Railway/Render/Heroku
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
    const queries = [
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

      // Индексы для производительности
      `CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`,
      `CREATE INDEX IF NOT EXISTS idx_responses_user_day ON responses(user_id, day)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_handled ON alerts(handled, created_at)`
    ];

    for (const query of queries) {
      await this.pool.query(query);
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
      activeToday: `SELECT COUNT(*) as count FROM users WHERE updated_at::date = CURRENT_DATE`,
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
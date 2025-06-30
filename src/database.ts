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

  // Анализ завершаемости по дням
  async getCompletionByDays(): Promise<any[]> {
    const query = `
      WITH day_stats AS (
        SELECT 
          day,
          COUNT(DISTINCT user_id) as started_day,
          COUNT(DISTINCT CASE WHEN completed = true THEN user_id END) as completed_day
        FROM progress 
        GROUP BY day
      )
      SELECT 
        day,
        started_day,
        completed_day,
        ROUND((completed_day::float / NULLIF(started_day, 0) * 100), 1) as completion_rate
      FROM day_stats 
      ORDER BY day;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  // Эмоциональная динамика
  async getEmotionalDynamics(): Promise<any[]> {
    const query = `
      SELECT 
        r.day,
        COUNT(*) as total_responses,
        COUNT(CASE 
          WHEN r.response_text ILIKE '%хорошо%' 
            OR r.response_text ILIKE '%радост%' 
            OR r.response_text = '😊' 
            OR r.response_text ILIKE '%отлично%'
            OR r.response_text ILIKE '%прекрасно%'
          THEN 1 
        END) as positive,
        COUNT(CASE 
          WHEN r.response_text ILIKE '%плохо%' 
            OR r.response_text ILIKE '%грустн%' 
            OR r.response_text = '😔'
            OR r.response_text ILIKE '%сложно%'
            OR r.response_text ILIKE '%тяжело%'
          THEN 1 
        END) as negative
      FROM responses r
      WHERE r.response_type = 'text'
        AND r.created_at > NOW() - INTERVAL '30 days'
      GROUP BY r.day 
      ORDER BY r.day;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  // Содержательные ответы для анализа
 async getMeaningfulResponses(limit: number = 20): Promise<any[]> {
  try {
    const query = `
      SELECT 
        u.name,
        u.telegram_id,
        r.day,
        r.question_type,
        r.response_text,
        LENGTH(r.response_text) as text_length,
        r.created_at
      FROM responses r
      JOIN users u ON r.user_id = u.id
      WHERE r.response_type = 'text' 
        AND LENGTH(r.response_text) > 50
        AND r.question_type != 'button_choice'
        AND r.question_type NOT ILIKE '%callback%'
        AND r.question_type NOT ILIKE '%evening_%'
        AND r.question_type NOT ILIKE '%phrase_%'
        AND r.question_type NOT ILIKE '%exercise_%'
        AND r.response_text NOT ILIKE '%спасибо%'
        AND r.response_text NOT ILIKE '%понятно%'
        AND r.response_text NOT ILIKE '%ок%'
        AND r.response_text NOT ILIKE '%хорошо%' 
        AND r.created_at > NOW() - INTERVAL '30 days'
      ORDER BY LENGTH(r.response_text) DESC, r.created_at DESC
      LIMIT $1;
    `;
    
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка getMeaningfulResponses:', error);
    return [];
  }
}

  // Поиск ответов с фильтрами

async searchResponses(filters: {
  day?: number;
  keyword?: string;
  minLength?: number;
  limit?: number;
}): Promise<any[]> {
  try {
    let query = `
      SELECT 
        u.name,
        u.telegram_id,
        r.day,
        r.question_type,
        r.response_text,
        r.created_at
      FROM responses r
      JOIN users u ON r.user_id = u.id
      WHERE r.response_type = 'text'
        AND r.response_text IS NOT NULL
        AND LENGTH(r.response_text) > 3
        AND r.question_type != 'button_choice'
        AND r.question_type NOT ILIKE '%callback%'
        AND r.question_type NOT ILIKE '%evening_%'
        AND r.question_type NOT ILIKE '%phrase_%'
        AND r.question_type NOT ILIKE '%exercise_%'
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filters.day) {
      query += ` AND r.day = $${paramIndex}`;
      params.push(filters.day);
      paramIndex++;
    }
    
    if (filters.keyword) {
      query += ` AND r.response_text ILIKE $${paramIndex}`;
      params.push(`%${filters.keyword}%`);
      paramIndex++;
    }
    
    if (filters.minLength) {
      query += ` AND LENGTH(r.response_text) >= $${paramIndex}`;
      params.push(filters.minLength);
      paramIndex++;
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT ${paramIndex}`;
    params.push(filters.limit || 200);
    
    const result = await this.pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка searchResponses:', error);
    return [];
  }
}
// === АНАЛИЗ ЭФФЕКТИВНОСТИ УПРАЖНЕНИЙ ===

// 1. Анализ откликов на упражнения по дням
async getExerciseEngagement(): Promise<any[]> {
  try {
    const query = `
      WITH exercise_stats AS (
        SELECT 
          r.day,
          COUNT(*) as total_responses,
          COUNT(DISTINCT r.user_id) as unique_users,
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_ready%' THEN 1 END) as ready_to_try,
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_help%' THEN 1 END) as need_help,
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_later%' THEN 1 END) as do_later,
          AVG(LENGTH(CASE WHEN r.response_type = 'text' THEN r.response_text END)) as avg_text_length
        FROM responses r
        WHERE r.question_type ILIKE '%exercise%'
          AND r.created_at > NOW() - INTERVAL '30 days'
        GROUP BY r.day
      ),
      user_counts AS (
        SELECT 
          current_day as day,
          COUNT(*) as users_on_day
        FROM users 
        WHERE current_day BETWEEN 1 AND 7
        GROUP BY current_day
      )
      SELECT 
        e.day,
        e.total_responses,
        e.unique_users,
        u.users_on_day,
        ROUND((e.unique_users::float / NULLIF(u.users_on_day, 0) * 100), 1) as engagement_rate,
        e.ready_to_try,
        e.need_help,
        e.do_later,
        ROUND(e.avg_text_length, 1) as avg_text_length,
        ROUND((e.ready_to_try::float / NULLIF(e.total_responses, 0) * 100), 1) as readiness_rate,
        ROUND((e.need_help::float / NULLIF(e.total_responses, 0) * 100), 1) as help_request_rate
      FROM exercise_stats e
      LEFT JOIN user_counts u ON e.day = u.day
      ORDER BY e.day;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка getExerciseEngagement:', error);
    return [];
  }
}

// 2. Анализ эмоциональной реакции после упражнений
async getExerciseEmotionalImpact(): Promise<any[]> {
  try {
    const query = `
      WITH emotional_analysis AS (
        SELECT 
          r.day,
          r.user_id,
          r.response_text,
          r.created_at,
          CASE 
            WHEN r.response_text ILIKE '%лучше%' 
              OR r.response_text ILIKE '%помогло%'
              OR r.response_text ILIKE '%хорошо%'
              OR r.response_text ILIKE '%спокойн%'
              OR r.response_text ILIKE '%легче%'
              OR r.response_text ILIKE '%благодар%'
            THEN 'positive'
            WHEN r.response_text ILIKE '%сложно%'
              OR r.response_text ILIKE '%трудно%'
              OR r.response_text ILIKE '%не получается%'
              OR r.response_text ILIKE '%непонятно%'
              OR r.response_text ILIKE '%не помогает%'
            THEN 'negative'
            ELSE 'neutral'
          END as emotional_tone
        FROM responses r
        WHERE r.response_type = 'text'
          AND LENGTH(r.response_text) > 10
          AND r.created_at > NOW() - INTERVAL '30 days'
          AND EXISTS (
            SELECT 1 FROM responses r2 
            WHERE r2.user_id = r.user_id 
              AND r2.day = r.day 
              AND r2.question_type ILIKE '%exercise%'
              AND r2.created_at < r.created_at
          )
      )
      SELECT 
        day,
        COUNT(*) as total_feedback,
        COUNT(CASE WHEN emotional_tone = 'positive' THEN 1 END) as positive_count,
        COUNT(CASE WHEN emotional_tone = 'negative' THEN 1 END) as negative_count,
        COUNT(CASE WHEN emotional_tone = 'neutral' THEN 1 END) as neutral_count,
        ROUND((COUNT(CASE WHEN emotional_tone = 'positive' THEN 1 END)::float / COUNT(*) * 100), 1) as positive_rate
      FROM emotional_analysis
      GROUP BY day
      ORDER BY day;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка getExerciseEmotionalImpact:', error);
    return [];
  }
}

// 3. Анализ удержания после каждого упражнения
async getExerciseRetention(): Promise<any[]> {
  try {
    const query = `
      WITH daily_users AS (
        SELECT 
          day,
          COUNT(DISTINCT user_id) as completed_exercise
        FROM responses 
        WHERE question_type ILIKE '%exercise%'
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY day
      ),
      next_day_users AS (
        SELECT 
          p1.day,
          COUNT(DISTINCT p1.user_id) as started_next_day
        FROM progress p1
        WHERE p1.completed = true
          AND EXISTS (
            SELECT 1 FROM progress p2 
            WHERE p2.user_id = p1.user_id 
              AND p2.day = p1.day + 1
          )
        GROUP BY p1.day
      )
      SELECT 
        d.day,
        d.completed_exercise,
        COALESCE(n.started_next_day, 0) as started_next_day,
        ROUND((COALESCE(n.started_next_day, 0)::float / NULLIF(d.completed_exercise, 0) * 100), 1) as retention_rate
      FROM daily_users d
      LEFT JOIN next_day_users n ON d.day = n.day
      WHERE d.day < 7
      ORDER BY d.day;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка getExerciseRetention:', error);
    return [];
  }
}

// 4. Рейтинг упражнений по эффективности
async getExerciseEffectivenessRating(): Promise<any[]> {
  try {
    const query = `
      WITH exercise_metrics AS (
        SELECT 
          r.day,
          -- Метрика 1: Уровень участия
          COUNT(DISTINCT r.user_id)::float / NULLIF(
            (SELECT COUNT(*) FROM users WHERE current_day = r.day), 0
          ) * 100 as participation_rate,
          
          -- Метрика 2: Готовность к выполнению
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_ready%' THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN r.question_type ILIKE '%exercise%' THEN 1 END), 0) * 100 as readiness_rate,
          
          -- Метрика 3: Средняя длина ответов (качество)
          AVG(LENGTH(CASE WHEN r.response_type = 'text' THEN r.response_text END)) as avg_response_quality,
          
          -- Метрика 4: Процент обращений за помощью (чем меньше, тем лучше)
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_help%' THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN r.question_type ILIKE '%exercise%' THEN 1 END), 0) * 100 as help_request_rate
          
        FROM responses r
        WHERE r.created_at > NOW() - INTERVAL '30 days'
        GROUP BY r.day
      ),
      day_titles AS (
        SELECT day, title FROM (VALUES
          (1, 'Осознание боли'),
          (2, 'Внутренний критик'),
          (3, 'Письмо себе'),
          (4, 'Сострадательное прикосновение'),
          (5, 'Разрешение быть уязвимой'),
          (6, 'Забота о потребностях'),
          (7, 'Благодарность себе')
        ) AS t(day, title)
      )
      SELECT 
        m.day,
        t.title as exercise_name,
        ROUND(m.participation_rate, 1) as participation_rate,
        ROUND(m.readiness_rate, 1) as readiness_rate,
        ROUND(m.avg_response_quality, 1) as avg_response_quality,
        ROUND(m.help_request_rate, 1) as help_request_rate,
        -- Общий рейтинг эффективности (формула)
        ROUND(
          (m.participation_rate * 0.3 + 
           m.readiness_rate * 0.3 + 
           LEAST(m.avg_response_quality / 10, 10) * 0.2 + 
           (100 - m.help_request_rate) * 0.2), 1
        ) as effectiveness_score
      FROM exercise_metrics m
      JOIN day_titles t ON m.day = t.day
      ORDER BY effectiveness_score DESC NULLS LAST;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка getExerciseEffectivenessRating:', error);
    return [];
  }
}

// 5. Подробный анализ конкретного упражнения
async getExerciseDetailedAnalysis(day: number): Promise<any> {
  try {
    const queries = {
      overview: `
        SELECT 
          COUNT(DISTINCT r.user_id) as total_participants,
          COUNT(*) as total_interactions,
          AVG(LENGTH(CASE WHEN r.response_type = 'text' THEN r.response_text END)) as avg_text_length,
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_ready%' THEN 1 END) as ready_count,
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_help%' THEN 1 END) as help_count,
          COUNT(CASE WHEN r.question_type ILIKE '%exercise_later%' THEN 1 END) as later_count
        FROM responses r
        WHERE r.day = $1 AND r.created_at > NOW() - INTERVAL '30 days'
      `,
      
      timeDistribution: `
        SELECT 
          EXTRACT(HOUR FROM r.created_at) as hour,
          COUNT(*) as responses
        FROM responses r
        WHERE r.day = $1 
          AND r.question_type ILIKE '%exercise%'
          AND r.created_at > NOW() - INTERVAL '30 days'
        GROUP BY EXTRACT(HOUR FROM r.created_at)
        ORDER BY hour
      `,
      
      qualitativeResponses: `
        SELECT 
          r.response_text,
          LENGTH(r.response_text) as text_length,
          r.created_at
        FROM responses r
        WHERE r.day = $1 
          AND r.response_type = 'text'
          AND LENGTH(r.response_text) > 50
          AND r.created_at > NOW() - INTERVAL '30 days'
        ORDER BY LENGTH(r.response_text) DESC
        LIMIT 10
      `
    };

    const results: any = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await this.pool.query(query, [day]);
      results[key] = key === 'overview' ? result.rows[0] : result.rows;
    }

    return results;
  } catch (error) {
    console.error('❌ Ошибка getExerciseDetailedAnalysis:', error);
    return { overview: {}, timeDistribution: [], qualitativeResponses: [] };
  }
}

  // Проблемные дни (низкое удержание)
  async getDropoffDays(): Promise<any[]> {
    const query = `
      WITH day_transitions AS (
        SELECT 
          current_day as day,
          COUNT(*) as users_on_day,
          LAG(COUNT(*)) OVER (ORDER BY current_day) as users_prev_day
        FROM users 
        WHERE current_day BETWEEN 1 AND 7
          AND course_completed = false
        GROUP BY current_day
      )
      SELECT 
        day,
        users_on_day,
        users_prev_day,
        CASE 
          WHEN users_prev_day > 0 
          THEN ROUND((users_on_day::float / users_prev_day * 100), 1)
          ELSE 100 
        END as retention_rate
      FROM day_transitions
      WHERE users_prev_day IS NOT NULL
        AND users_prev_day > 0
      ORDER BY day;
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
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

  // Создать алерт с типом (расширенная версия)
  async createAlertWithType(userId: number, type: string, message: string): Promise<void> {
    const query = `
      INSERT INTO alerts (user_id, type, message, created_at, handled)
      VALUES ($1, $2, $3, NOW(), false)
    `;
    await this.pool.query(query, [userId, type, message]);
  }

  // Если нужна синхронная версия close для совместимости
  closeSync(): void {
    // Для PostgreSQL pool это не имеет смысла, но для совместимости:
    this.pool.end(() => {
      console.log('Pool закрыт');
    });
  }

  // Дополнительно: обновим структуру таблицы alerts если нужно добавить поле type
  async updateAlertsTableStructure(): Promise<void> {
    try {
      // Проверяем, есть ли колонка type
      const checkColumn = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'type'
      `;
      const result = await this.pool.query(checkColumn);
      
      if (result.rows.length === 0) {
        // Добавляем колонку type если её нет
        await this.pool.query(`
          ALTER TABLE alerts 
          ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'general'
        `);
        console.log('✅ Добавлена колонка type в таблицу alerts');
      }
    } catch (error) {
      console.error('Ошибка при обновлении структуры alerts:', error);
    }
  }
}

export default Database;
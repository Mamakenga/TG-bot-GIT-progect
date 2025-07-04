import request from 'supertest';
import express from 'express';
import { Database } from '../../src/database';
import { DashboardService } from '../../src/dashboard/DashboardService';

// Создаем тестовое Express приложение
const createTestApp = (database: Database) => {
  const app = express();
  const dashboardService = new DashboardService(database);
  
  app.use(express.json());
  
  // Basic Auth middleware для тестов
  const basicAuth = (req: any, res: any, next: any) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const credentials = Buffer.from(auth.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    if (username === 'admin' && password === 'test_password') {
      next();
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  };

  // Dashboard routes
  app.get('/dashboard', basicAuth, async (req, res) => {
    try {
      const stats = await database.getStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/dashboard/weekly-report', basicAuth, async (req, res) => {
    try {
      const report = await dashboardService.getWeeklyReport();
      res.json({ success: true, report });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/dashboard/export/users', basicAuth, async (req, res) => {
    try {
      const users = await database.pool.query('SELECT * FROM users LIMIT 100');
      res.setHeader('Content-Type', 'text/csv');
      res.send('id,telegram_id,name\n' + users.rows.map(u => `${u.id},${u.telegram_id},${u.name}`).join('\n'));
    } catch (error) {
      res.status(500).json({ error: 'Export failed' });
    }
  });

  app.get('/dashboard/export/responses', basicAuth, async (req, res) => {
    try {
      const responses = await database.pool.query(`
        SELECT r.*, u.name, u.telegram_id 
        FROM responses r 
        JOIN users u ON r.user_id = u.id 
        LIMIT 100
      `);
      res.json({ success: true, data: responses.rows });
    } catch (error) {
      res.status(500).json({ error: 'Export failed' });
    }
  });

  app.get('/dashboard/export/alerts', basicAuth, async (req, res) => {
    try {
      const alerts = await database.pool.query(`
        SELECT a.*, u.name, u.telegram_id 
        FROM alerts a 
        JOIN users u ON a.user_id = u.id 
        ORDER BY a.created_at DESC 
        LIMIT 100
      `);
      res.json({ success: true, data: alerts.rows });
    } catch (error) {
      res.status(500).json({ error: 'Export failed' });
    }
  });

  // Bot webhook endpoint
  app.post('/bot:token', (req, res) => {
    // Simulate webhook processing
    res.json({ success: true });
  });

  return app;
};

describe('Dashboard API Integration Tests', () => {
  let database: Database;
  let app: express.Application;
  let testUserIds: number[] = [];

  beforeAll(async () => {
    database = new Database();
    
    // Мокаем database для API тестов
    database.pool = {
      query: jest.fn().mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return Promise.resolve({ rows: [{ id: 1, telegram_id: 999999101, name: 'Test User' }] });
        }
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        return Promise.resolve({ rows: [] });
      })
    } as any;
    
    database.getStats = jest.fn().mockResolvedValue({
      totalUsers: 2,
      activeToday: 1,
      completedCourse: 0
    });
    
    app = createTestApp(database);
  });

  afterAll(async () => {
    // Очистка тестовых данных
    for (const userId of testUserIds) {
      await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [userId]);
    }
    await database.close();
  });

  beforeEach(async () => {
    // Создаем тестовые данные
    const user1 = await database.createUser(999999101, 'Dashboard Test User 1');
    const user2 = await database.createUser(999999102, 'Dashboard Test User 2');
    testUserIds = [999999101, 999999102];
    
    // Добавляем тестовые ответы
    await database.saveResponse(user1.id, 1, 'test_question', 'Test response 1');
    await database.saveResponse(user2.id, 2, 'test_question', 'Test response 2');
    
    // Добавляем тестовые алерты
    await database.createAlert(user1.id, 'тест', 'Test alert message');
  });

  afterEach(async () => {
    // Очистка после каждого теста
    for (const userId of testUserIds) {
      const user = await database.getUser(userId);
      if (user) {
        await database.pool.query('DELETE FROM responses WHERE user_id = $1', [user.id]);
        await database.pool.query('DELETE FROM alerts WHERE user_id = $1', [user.id]);
      }
      await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [userId]);
    }
    testUserIds = [];
  });

  describe('Authentication', () => {
    it('should require authentication for dashboard access', async () => {
      const response = await request(app)
        .get('/dashboard')
        .expect(401);
      
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should accept valid credentials', async () => {
      const response = await request(app)
        .get('/dashboard')
        .auth('admin', 'test_password')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.stats).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .get('/dashboard')
        .auth('admin', 'wrong_password')
        .expect(401);
      
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject malformed auth header', async () => {
      const response = await request(app)
        .get('/dashboard')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('Dashboard Statistics', () => {
    it('should return dashboard statistics', async () => {
      const response = await request(app)
        .get('/dashboard')
        .auth('admin', 'test_password')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        stats: expect.objectContaining({
          totalUsers: expect.any(Number),
          activeToday: expect.any(Number),
          completedCourse: expect.any(Number)
        })
      });
      
      expect(response.body.stats.totalUsers).toBeGreaterThanOrEqual(2);
    });

    it('should handle database errors in stats', async () => {
      // Мокаем ошибку БД
      const originalGetStats = database.getStats;
      database.getStats = jest.fn().mockRejectedValue(new Error('DB Error'));
      
      const response = await request(app)
        .get('/dashboard')
        .auth('admin', 'test_password')
        .expect(500);
      
      expect(response.body.error).toBe('Internal server error');
      
      // Восстанавливаем метод
      database.getStats = originalGetStats;
    });
  });

  describe('Weekly Report', () => {
    it('should return weekly report', async () => {
      const response = await request(app)
        .get('/dashboard/weekly-report')
        .auth('admin', 'test_password')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        report: expect.objectContaining({
          period: expect.any(String),
          totalUsers: expect.any(Number),
          newUsers: expect.any(Number),
          activeUsers: expect.any(Number),
          completedCourses: expect.any(Number),
          totalResponses: expect.any(Number),
          alertsCount: expect.any(Number)
        })
      });
    });

    it('should require authentication for weekly report', async () => {
      await request(app)
        .get('/dashboard/weekly-report')
        .expect(401);
    });
  });

  describe('Data Export Endpoints', () => {
    it('should export users data', async () => {
      const response = await request(app)
        .get('/dashboard/export/users')
        .auth('admin', 'test_password')
        .expect(200);
      
      // Проверяем, что данные экспортированы (mock CSV response)
      expect(response.status).toBe(200);
    });

    it('should export responses data', async () => {
      const response = await request(app)
        .get('/dashboard/export/responses')
        .auth('admin', 'test_password')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        data: expect.any(Array)
      });
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toEqual(
        expect.objectContaining({
          response_text: expect.any(String),
          question_type: expect.any(String),
          name: expect.any(String),
          telegram_id: expect.any(Number)
        })
      );
    });

    it('should export alerts data', async () => {
      const response = await request(app)
        .get('/dashboard/export/alerts')
        .auth('admin', 'test_password')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        data: expect.any(Array)
      });
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toEqual(
        expect.objectContaining({
          trigger_word: expect.any(String),
          message: expect.any(String),
          handled: expect.any(Boolean),
          name: expect.any(String),
          telegram_id: expect.any(Number)
        })
      );
    });

    it('should require authentication for all exports', async () => {
      await request(app).get('/dashboard/export/users').expect(401);
      await request(app).get('/dashboard/export/responses').expect(401);
      await request(app).get('/dashboard/export/alerts').expect(401);
    });

    it('should handle database errors in exports', async () => {
      // Мокаем ошибку для responses export
      const originalQuery = database.pool.query;
      database.pool.query = jest.fn().mockRejectedValue(new Error('DB Error'));
      
      const response = await request(app)
        .get('/dashboard/export/responses')
        .auth('admin', 'test_password')
        .expect(500);
      
      expect(response.body.error).toBe('Export failed');
      
      // Восстанавливаем метод
      database.pool.query = originalQuery;
    });
  });

  describe('Webhook Endpoint', () => {
    it('should accept webhook posts', async () => {
      const webhookData = {
        update_id: 123,
        message: {
          message_id: 456,
          from: { id: 999999101, first_name: 'Test' },
          chat: { id: 999999101 },
          date: Date.now() / 1000,
          text: '/start'
        }
      };

      const response = await request(app)
        .post('/bot:token')
        .send(webhookData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    it('should handle empty webhook posts', async () => {
      const response = await request(app)
        .post('/bot:token')
        .send({})
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent routes', async () => {
      await request(app)
        .get('/dashboard/non-existent')
        .auth('admin', 'test_password')
        .expect(404);
    });

    it('should handle malformed JSON in webhook', async () => {
      const response = await request(app)
        .post('/bot:token')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('should handle large export requests efficiently', async () => {
      // Создаем много тестовых данных
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(database.createUser(999990000 + i, `Bulk User ${i}`));
      }
      await Promise.all(promises);

      const response = await request(app)
        .get('/dashboard/export/users')
        .auth('admin', 'test_password')
        .expect(200);
      
      // Очищаем данные
      for (let i = 0; i < 50; i++) {
        await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [999990000 + i]);
      }
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .get('/dashboard')
          .auth('admin', 'test_password')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Response Format Validation', () => {
    it('should return consistent JSON structure for all endpoints', async () => {
      const endpoints = [
        '/dashboard',
        '/dashboard/weekly-report',
        '/dashboard/export/responses',
        '/dashboard/export/alerts'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .auth('admin', 'test_password')
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.headers['content-type']).toMatch(/json/);
      }
    });

    it('should return proper error format for failed requests', async () => {
      const response = await request(app)
        .get('/dashboard')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });
});
import { CommandHandlers } from '../../src/handlers/CommandHandlers';
import { Database } from '../../src/database';
import { KeyboardManager } from '../../src/keyboards/KeyboardManager';

// Mock TelegramBot
const mockBot = {
  sendMessage: jest.fn().mockResolvedValue({}),
  answerCallbackQuery: jest.fn().mockResolvedValue({}),
};

// Mock Message objects
const createMockMessage = (text: string, telegramId: number = 999999999) => ({
  chat: { id: 123456789 },
  from: { id: telegramId, first_name: 'Test User' },
  text,
  message_id: 1,
  date: Date.now() / 1000,
});

const createMockCallbackQuery = (data: string, telegramId: number = 999999999) => ({
  id: 'callback_123',
  from: { id: telegramId, first_name: 'Test User' },
  message: {
    chat: { id: 123456789 },
    message_id: 1,
    date: Date.now() / 1000,
  },
  data,
});

describe('Bot Commands Integration Tests', () => {
  let database: Database;
  let commandHandlers: CommandHandlers;
  let keyboardManager: KeyboardManager;

  beforeAll(async () => {
    database = new Database();
    await database.init();
    keyboardManager = new KeyboardManager();
    commandHandlers = new CommandHandlers(mockBot as any, database, keyboardManager);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    // Очистка тестовых данных
    await database.pool.query('DELETE FROM users WHERE telegram_id = $1', [999999999]);
    jest.clearAllMocks();
  });

  describe('/start Command Flow', () => {
    it('should handle new user start command', async () => {
      const message = createMockMessage('/start');
      
      await commandHandlers.handleStart(message);
      
      // Проверяем создание пользователя в БД
      const user = await database.getUser(999999999);
      expect(user).toBeDefined();
      expect(user!.telegram_id).toBe(999999999);
      expect(user!.current_day).toBe(1);
      
      // Проверяем отправку сообщения
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Привет'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
    });

    it('should handle returning user start command', async () => {
      // Создаем существующего пользователя
      await database.createUser(999999999, 'Test User');
      await database.updateUserDay(999999999, 3);
      
      const message = createMockMessage('/start');
      await commandHandlers.handleStart(message);
      
      // Проверяем сообщение для возвращающегося пользователя
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('С возвращением'),
        expect.any(Object)
      );
    });

    it('should handle completed course user', async () => {
      // Создаем пользователя с завершенным курсом
      await database.createUser(999999999, 'Test User');
      await database.markCourseCompleted(999999999);
      
      const message = createMockMessage('/start');
      await commandHandlers.handleStart(message);
      
      // Проверяем сообщение для завершившего курс
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('завершила 7-дневный курс'),
        expect.any(Object)
      );
    });
  });

  describe('Callback Query Handling', () => {
    beforeEach(async () => {
      await database.createUser(999999999, 'Test User');
    });

    it('should handle start_yes callback', async () => {
      const callbackQuery = createMockCallbackQuery('start_yes');
      
      await commandHandlers.handleCallback(callbackQuery);
      
      // Проверяем обновление пользователя
      const user = await database.getUser(999999999);
      expect(user!.current_day).toBe(1);
      
      // Проверяем отправку подтверждающего сообщения
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Отлично! Ты записана на курс'),
        expect.any(Object)
      );
      
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('callback_123');
    });

    it('should handle more_info callback', async () => {
      const callbackQuery = createMockCallbackQuery('more_info');
      
      await commandHandlers.handleCallback(callbackQuery);
      
      // Проверяем отправку информации о курсе
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Курс состоит из 7 дней'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      );
    });

    it('should handle later callback', async () => {
      const callbackQuery = createMockCallbackQuery('later');
      
      await commandHandlers.handleCallback(callbackQuery);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Понимаю'),
        expect.any(Object)
      );
    });

    it('should handle exercise help callback', async () => {
      const callbackQuery = createMockCallbackQuery('day_1_exercise_help');
      
      await commandHandlers.handleCallback(callbackQuery);
      
      // Проверяем отправку детальной помощи
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Помощь с упражнением')
      );
      
      // Проверяем отправку контакта психолога
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('@amalinovskaya_psy'),
        expect.any(Object)
      );
    });

    it('should save user responses from day callbacks', async () => {
      const callbackQuery = createMockCallbackQuery('day_1_evening_0');
      
      await commandHandlers.handleCallback(callbackQuery);
      
      // Проверяем сохранение ответа в БД
      const user = await database.getUser(999999999);
      const responses = await database.pool.query(
        'SELECT * FROM responses WHERE user_id = $1',
        [user!.id]
      );
      
      expect(responses.rows).toHaveLength(1);
      expect(responses.rows[0].response_text).toBe('day_1_evening_0');
      expect(responses.rows[0].response_type).toBe('button_choice');
      
      // Проверяем отправку подтверждения
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringMatching(/Спасибо|Благодарю|важны|поделилась/),
        expect.any(Object)
      );
    });
  });

  describe('/help Command', () => {
    it('should provide help information', async () => {
      const message = createMockMessage('/help');
      
      await commandHandlers.handleHelp(message);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Помощь по боту'),
        expect.any(Object)
      );
      
      // Проверяем наличие контактной информации
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('help@harmony4soul.com');
      expect(sentMessage).toContain('@amalinovskaya_psy');
    });
  });

  describe('/progress Command', () => {
    it('should show progress for new user', async () => {
      await database.createUser(999999999, 'Test User');
      const message = createMockMessage('📊 Мой прогресс');
      
      await commandHandlers.handleProgress(message);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('День: 1 из 7'),
        expect.any(Object)
      );
    });

    it('should show progress for completed user', async () => {
      await database.createUser(999999999, 'Test User');
      await database.markCourseCompleted(999999999);
      
      const message = createMockMessage('📊 Мой прогресс');
      await commandHandlers.handleProgress(message);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Курс завершен'),
        expect.any(Object)
      );
    });

    it('should show paused status', async () => {
      await database.createUser(999999999, 'Test User');
      await database.pauseUser(999999999);
      
      const message = createMockMessage('📊 Мой прогресс');
      await commandHandlers.handleProgress(message);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('На паузе'),
        expect.any(Object)
      );
    });

    it('should handle non-existing user', async () => {
      const message = createMockMessage('📊 Мой прогресс');
      
      await commandHandlers.handleProgress(message);
      
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Сначала нужно запустить бота'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Мокаем ошибку БД
      const originalGetUser = database.getUser;
      database.getUser = jest.fn().mockRejectedValue(new Error('DB Error'));
      
      const message = createMockMessage('/start');
      
      // Команда не должна падать
      await expect(commandHandlers.handleStart(message)).resolves.not.toThrow();
      
      // Восстанавливаем метод
      database.getUser = originalGetUser;
    });

    it('should handle missing user data in callbacks', async () => {
      const callbackQuery = createMockCallbackQuery('start_yes', 888888888); // Несуществующий пользователь
      
      await expect(commandHandlers.handleCallback(callbackQuery)).resolves.not.toThrow();
      expect(mockBot.answerCallbackQuery).toHaveBeenCalled();
    });
  });
});
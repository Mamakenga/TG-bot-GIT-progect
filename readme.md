# 💙 Телеграм-бот "Забота о себе"

**7-дневный курс самосострадания** — интерактивный телеграм-бот для развития навыков самосострадания и эмоционального благополучия.

## 🌟 Возможности

### Для пользователей:
- **7-дневный курс** с ежедневными упражнениями
- **Персонализированные вопросы** для саморефлексии
- **Трекинг прогресса** прохождения курса
- **Безопасная среда** для выражения эмоций
- **Автоматические напоминания** о занятиях (9:00, 13:00, 16:00, 20:00 МСК)
- **Тест персонализации** после завершения курса для подбора следующих программ
- **Прямые ссылки** на терапевтические программы и консультации

### Для администраторов:
- **Веб-дашборд** с аналитикой и статистикой
- **Система алертов** для критических ситуаций
- **Экспорт данных** в CSV формате
- **Мониторинг активности** пользователей в реальном времени
- **Защищенный доступ** через Basic Auth

## 🚀 Быстрый старт

### Предварительные требования

- Node.js (версия 18+)
- PostgreSQL (или облачная БД)
- Telegram Bot Token от @BotFather

### Установка

1. **Клонируйте репозиторий:**
```bash
git clone <your-repo-url>
cd telegram-bot-self-care
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Настройте переменные окружения в `.env`:**
```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_BOT_LINK=https://t.me/your_bot_username
ADMIN_TELEGRAM_ID=your_telegram_id

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:port/database_name

# Admin Access
ADMIN_PASSWORD=your_secure_admin_password

# Psychologist Contact
PSYCHOLOGIST_EMAIL=help@example.com

# Security Keywords (разделенные запятыми)
ALERT_KEYWORDS=не хочу жить,покончить с собой,бессмысленно,суицид,умереть

# Server Configuration
PORT=3000
NODE_ENV=development

# Dashboard URL
DASHBOARD_URL=http://localhost:3000
```

4. **Соберите проект:**
```bash
npm run build
```

5. **Запустите бота:**
```bash
# Для разработки
npm run dev

# Для продакшена
npm start
```

## 📁 Структура проекта

```
TG-bot-GIT-progect/
├── src/
│   ├── bot.ts                      # Основной класс бота
│   ├── config.ts                   # Конфигурация
│   ├── course-logic.ts             # Логика курса
│   ├── database.ts                 # Работа с PostgreSQL  
│   ├── types.ts                    # TypeScript типы
│   ├── utils.ts                    # Утилиты
│   ├── dashboard/                  # Веб-дашборд
│   │   ├── DashboardService.ts     # Сервис дашборда
│   │   └── templates/              # HTML шаблоны
│   │       └── DashboardTemplates.ts
│   ├── handlers/                   # Обработчики команд
│   │   └── CommandHandlers.ts      # Telegram команды
│   ├── keyboards/                  # Клавиатуры бота
│   │   └── KeyboardManager.ts      # Управление кнопками
│   ├── scheduling/                 # Планировщик
│   │   └── ReminderScheduler.ts    # Напоминания
│   ├── server/                     # Веб-сервер
│   │   ├── ExpressServer.ts        # Express сервер
│   │   └── routes/                 # API роуты
│   │       ├── adminRoutes.ts      # Админ панель
│   │       └── webhookRoutes.ts    # Webhook для Telegram
│   └── utils/                      # Дополнительные утилиты
│       └── Logger.ts               # Система логирования
├── scripts/                        # Вспомогательные скрипты
│   └── check-progress.js           # Проверка прогресса
├── tests/                          # Автоматизированные тесты
│   ├── unit/                       # Юнит-тесты (~23 теста)
│   │   ├── utils.test.ts           # Тесты утилит
│   │   ├── course-logic.test.ts    # Тесты логики курса
│   │   └── config.test.ts          # Тесты конфигурации
│   ├── integration/                # Интеграционные тесты (~75 тестов)
│   │   ├── database.test.ts        # Тесты БД операций
│   │   ├── bot-commands.test.ts    # Тесты команд бота
│   │   ├── reminder-system.test.ts # Тесты системы напоминаний
│   │   └── dashboard-api.test.ts   # Тесты API дашборда
│   ├── __mocks__/                  # Моки для тестов
│   │   └── pg.ts                   # Мок PostgreSQL
│   └── setup.ts                    # Настройка Jest
├── dist/                           # Скомпилированный JavaScript
├── jest.config.js                  # Конфигурация Jest
├── LICENSE                         # MIT лицензия
├── package.json                    # Зависимости проекта
├── tsconfig.json                   # Настройки TypeScript
├── .env                            # Конфигурация (не в git)
├── .env.test                       # Тестовая конфигурация (не в git)
└── README.md                       # Документация
```

## 🎯 Использование

### Для пользователей:

1. **Начало курса:** `/start` - регистрация и начало 7-дневного курса
2. **Ежедневные занятия:** бот автоматически отправляет вопросы каждый день
3. **Ответы:** пользователи отвечают на вопросы в свободной форме
4. **Прогресс:** бот отслеживает прохождение курса
5. **Завершение курса:** финальное сообщение и тест персонализации для подбора следующих программ

### Команды для тестирования (только для разработки):

- `/test` - просмотр всех сообщений текущего дня курса с интервалами
- `/testfinal` - тест финального сообщения и системы персонализации 
- `/nextday` - принудительный переход к следующему дню курса
- `/pause` / `/resume` - приостановка/возобновление курса
- `/clearlogs` / `/checklogs` - управление логами напоминаний

### Для администраторов:

**Веб-дашборд доступен по адресу:** `http://localhost:3000/dashboard`

**Логин:** `admin`  
**Пароль:** значение из `ADMIN_PASSWORD` в `.env`

#### Доступные страницы:
- `/dashboard` - главная страница с общей статистикой
- `/dashboard/weekly-report` - еженедельный отчет
- `/dashboard/export/responses` - экспорт ответов пользователей (CSV)
- `/dashboard/export/users` - экспорт данных пользователей (CSV)
- `/dashboard/export/alerts` - экспорт алертов безопасности (CSV)

## 🛡️ Безопасность

### Система алертов
Бот автоматически отслеживает потенциально опасные сообщения и создает алерты при обнаружении:
- Упоминаний о самоповреждении
- Суицидальных мыслей
- Признаков депрессии или тревожности

### Защита данных
- **Basic Auth** для доступа к дашборду
- **PostgreSQL** с защищенным соединением
- **Логирование** всех критических операций
- **SSL** соединения в продакшене

## 🔧 Технологии

- **Node.js + TypeScript** - серверная часть
- **node-telegram-bot-api** - работа с Telegram API
- **PostgreSQL + pg** - база данных
- **Express.js** - веб-сервер для дашборда
- **HTML/CSS/JavaScript** - веб-интерфейс дашборда

## 📊 База данных PostgreSQL

### Структура таблиц:

#### `users`
```sql
CREATE TABLE users (
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
);
```

#### `responses`
```sql
CREATE TABLE responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  question_type VARCHAR(100) NOT NULL,
  response_text TEXT,
  response_type VARCHAR(50) DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `progress`
```sql
CREATE TABLE progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP,
  skipped BOOLEAN DEFAULT false,
  UNIQUE(user_id, day)
);
```

#### `alerts`
```sql
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  trigger_word VARCHAR(255),
  message TEXT,
  handled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `reminder_log`
```sql
CREATE TABLE reminder_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  reminder_type VARCHAR(50) NOT NULL, -- 'morning', 'exercise', 'phrase', 'evening'
  sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, day, reminder_type, sent_date)
);
```

## 🚦 Разработка

### Команды для разработки:
```bash
# Запуск в режиме разработки с hot-reload
npm run dev

# Сборка проекта
npm run build

# Запуск скомпилированной версии
npm start

# Проверка типов TypeScript
npx tsc --noEmit
```

### 🧪 Тестирование

Проект включает автоматизированные тесты:

#### Команды тестирования:
```bash
# Запуск всех тестов (~98 тестов)
npm test

# Только юнит-тесты (~23 теста)
npm run test:unit

# Только интеграционные тесты (~75 тестов)
npm run test:integration

# Режим наблюдения (автоперезапуск при изменениях)
npm run test:watch

# Отчет покрытия кода
npm run test:coverage
```

#### Структура тестов:
```
tests/
├── unit/                           # Юнит-тесты (быстрые)
│   ├── utils.test.ts              # Тесты утилит
│   ├── course-logic.test.ts       # Тесты логики курса
│   └── config.test.ts             # Тесты конфигурации
├── integration/                    # Интеграционные тесты
│   ├── database.test.ts           # Тесты БД операций
│   ├── bot-commands.test.ts       # Тесты команд бота
│   ├── reminder-system.test.ts    # Тесты системы напоминаний
│   └── dashboard-api.test.ts      # Тесты API дашборда
├── __mocks__/                     # Моки для тестов
│   └── pg.ts                      # Мок PostgreSQL
└── setup.ts                       # Настройка Jest
```

#### Что тестируется:

**Юнит-тесты:**
- ✅ Утилиты (валидация, форматирование, безопасность)
- ✅ Логика курса (контент дней, структура)
- ✅ Конфигурация (переменные окружения)

**Интеграционные тесты:**
- ✅ Операции с базой данных (CRUD пользователей)
- ✅ Команды Telegram бота (`/start`, `/help`, `/progress`)
- ✅ Система напоминаний и антидублирование
- ✅ API дашборда (аутентификация, экспорт данных)
- ✅ Обработка ошибок и edge cases

#### Настройка тестовой среды:
```bash
# Создайте .env.test файл
cp .env .env.test

# Укажите тестовую БД в .env.test
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
TELEGRAM_BOT_TOKEN=test_token_123
```

#### Покрытие кода:
Текущее покрытие тестами:
- **Юнит-тесты:** Покрывают основные утилиты и логику курса
- **Интеграционные:** Тестируют ключевые функции (некоторые тесты требуют настройки БД)
- **Общее покрытие:** ~98 тестов в 7 файлах

### Переменные окружения для разработки:
```bash
# Локальная PostgreSQL
DATABASE_URL=postgresql://username:password@localhost:5432/telegram_bot_db

# Или для Docker
DATABASE_URL=postgresql://postgres:password@localhost:5432/telegram_bot_db
```

## 🌐 Деплой

### Railway (рекомендуется):
1. Подключите репозиторий к Railway
2. Railway автоматически создаст PostgreSQL БД
3. Настройте переменные окружения в Railway Dashboard
4. Деплой произойдет автоматически

### Render:
1. Создайте Web Service на Render
2. Добавьте PostgreSQL базу данных
3. Настройте переменные окружения
4. Подключите репозиторий

### Heroku:
```bash
# Установите Heroku CLI
heroku create your-app-name
heroku addons:create heroku-postgresql:hobby-dev
heroku config:set TELEGRAM_BOT_TOKEN=your_token
# ... остальные переменные
git push heroku main
```

## 📈 Мониторинг

### Логи
Все важные события логируются в консоль с префиксами:
- `✅` - успешные операции
- `❌` - ошибки
- `📥` - входящие запросы
- `🚨` - критические алерты

### Метрики PostgreSQL
```sql
-- Количество активных пользователей
SELECT COUNT(*) FROM users WHERE updated_at > NOW() - INTERVAL '24 hours';

-- Завершенность курса по дням
SELECT current_day, COUNT(*) FROM users GROUP BY current_day;

-- Необработанные алерты
SELECT COUNT(*) FROM alerts WHERE handled = false;
```

## 🛠️ Добавление функций

### Новые вопросы курса:
Отредактируйте файл `src/course-logic.ts`

### Новые алерт-слова:
Обновите `ALERT_KEYWORDS` в `.env`

### Дополнительные роуты дашборда:
Добавьте в метод `setupAdminRoutes()` в `src/bot.ts`

### Система персонализации:
После завершения 7-дневного курса пользователи проходят тест из 3 вопросов для получения персональных рекомендаций:

**Доступные рекомендации:**
- **"Освобождение от тревожности"** - для работы с тревогой и напряжением
- **"Возрождение или Новая-Я"** - для работы с самооценкой и внутренним критиком  
- **Личная консультация** - для глубокого исследования вопросов смысла и идентичности

Все рекомендации включают прямые ссылки на программы: https://harmony4soul.com/

### Антидублирование напоминаний:
Система предотвращает повторную отправку сообщений в один день через:
- Таблицу `reminder_log` для отслеживания отправленных напоминаний
- Методы `wasReminderSentToday()` и `logReminderSent()` в Database
- Автоматический переход на следующий день только после получения всех 4 типов сообщений

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add some amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 🐛 Решение проблем

### База данных:
```bash
# Проверка подключения
npx ts-node -e "console.log(process.env.DATABASE_URL)"

# Тест соединения
npx ts-node src/database.ts
```

### Бот не отвечает:
1. Проверьте `TELEGRAM_BOT_TOKEN`
2. Убедитесь, что бот добавлен в чат
3. Проверьте логи в консоли

### Дашборд недоступен:
1. Проверьте `PORT` и `ADMIN_PASSWORD`
2. Убедитесь, что Express сервер запущен
3. Проверьте файрвол и сетевые настройки

### Тесты не проходят:
```bash
# Проверка тестовой среды
npm run test:unit       # Быстрые юнит-тесты

# Проблемы с БД в интеграционных тестах
npm run test:integration

# Проверка покрытия кода
npm run test:coverage
```

**Частые проблемы:**
- **Тесты БД:** Убедитесь, что `DATABASE_URL` в `.env.test` указывает на тестовую БД
- **Таймауты:** Увеличьте `testTimeout` в `jest.config.js`
- **Порты заняты:** Измените порты в тестовой конфигурации

## 📝 Лицензия

Этот проект создан для образовательных целей и поддержки психологического благополучия.

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи в консоли
2. Убедитесь, что все переменные окружения настроены
3. Проверьте подключение к PostgreSQL
4. Создайте issue в репозитории с описанием проблемы

---

💙 **Сделано с заботой для психологического благополучия**

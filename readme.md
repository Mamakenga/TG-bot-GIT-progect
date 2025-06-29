# 💙 Телеграм-бот "Забота о себе"

**7-дневный курс самосострадания** — интерактивный телеграм-бот для развития навыков самосострадания и эмоционального благополучия.

## 🌟 Возможности

### Для пользователей:
- **7-дневный курс** с ежедневными упражнениями
- **Персонализированные вопросы** для саморефлексии
- **Трекинг прогресса** прохождения курса
- **Безопасная среда** для выражения эмоций
- **Автоматические напоминания** о занятиях

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
telegram-bot-self-care/
├── src/
│   ├── bot.ts              # Основной класс бота
│   ├── database.ts         # Работа с PostgreSQL
│   ├── config.ts           # Конфигурация
│   ├── course-logic.ts     # Логика курса
│   ├── types.ts            # TypeScript типы
│   └── utils.ts            # Утилиты
├── dist/                   # Скомпилированный JavaScript
├── package.json            # Зависимости проекта
├── tsconfig.json           # Настройки TypeScript
├── railway.json            # Конфиг для Railway
├── .env                    # Конфигурация (не в git)
└── README.md               # Документация
```

## 🎯 Использование

### Для пользователей:

1. **Начало курса:** `/start` - регистрация и начало 7-дневного курса
2. **Ежедневные занятия:** бот автоматически отправляет вопросы каждый день
3. **Ответы:** пользователи отвечают на вопросы в свободной форме
4. **Прогресс:** бот отслеживает прохождение курса

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

# Инициализация базы данных
npm run setup-db
```

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
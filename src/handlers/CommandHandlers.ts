// src/handlers/CommandHandlers.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ С ЛОГИКОЙ ЗАВЕРШЕНИЯ КУРСА И ТЕСТОМ
import TelegramBot from 'node-telegram-bot-api';
import { Database } from '../database';
import { KeyboardManager } from '../keyboards/KeyboardManager';
import { logger } from '../utils/Logger';
import { courseContent, getDayContent } from '../course-logic';
import { checkForAlerts, sendAlert } from '../utils';

export class CommandHandlers {
  constructor(
    private bot: TelegramBot,
    private database: Database,
    private keyboardManager: KeyboardManager
  ) {}

  async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const name = msg.from?.first_name;

    if (!telegramId) return;

    try {
      logger.info(`Пользователь ${telegramId} (${name}) запустил старт`);
      
      await this.database.createUser(telegramId, name);
      const user = await this.database.getUser(telegramId);
      
      if (user?.course_completed) {
        await this.sendReturningCompletedUserMessage(chatId, name, user);
      } else if (user && user.current_day > 1) {
        await this.sendReturningUserMessage(chatId, name, user);
      } else {
        await this.sendNewUserMessage(chatId, name, user);
      }
      
    } catch (error) {
      logger.error('Ошибка в handleStart', error);
      try {
        await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.', {
          reply_markup: KeyboardManager.getMainKeyboard(null)
        });
      } catch {}
    }
  }

  private async sendReturningCompletedUserMessage(chatId: number, name: string | undefined, user: any): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `🎉 Привет${name ? `, ${name}` : ''}! \n\nТы уже завершила 7-дневный курс заботы о себе! \nПоздравляю с этим достижением! 💙\n\nМожешь пройти курс заново или использовать полученные навыки в повседневной жизни.`, {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  private async sendReturningUserMessage(chatId: number, name: string | undefined, user: any): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `🌸 С возвращением${name ? `, ${name}` : ''}!\n\nТы сейчас на ${user.current_day} дне курса заботы о себе.\nПродолжим наше путешествие? 💙`, {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  private async sendNewUserMessage(chatId: number, name: string | undefined, user: any): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `🌸 Привет${name ? `, ${name}` : ''}! Я бот-помощник по заботе о себе.\n\nЗа 7 дней мы мягко исследуем, как быть добрее к себе.\n\nГотова начать это путешествие?`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🌱 Да, готова', callback_data: 'start_yes' },
          { text: '❓ Расскажи подробнее', callback_data: 'more_info' },
          { text: '⏰ Позже', callback_data: 'later' }
        ]]
      }
    });
    
    await this.bot.sendMessage(chatId, 'Для быстрого доступа используй кнопки ниже:', {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    const user = telegramId ? await this.database.getUser(telegramId) : null;
    
    const helpText = `📋 Помощь по боту:\n\n🌸 Основные кнопки:\n• Старт - Начать или перезапустить курс\n• Мой прогресс - Показать текущий статус\n• Пауза/Продолжить - Управление курсом\n\n💙 О программе:\n7-дневный курс заботы о себе\n4 сообщения в день (9:00, 13:00, 16:00, 20:00)\n\n🆘 Поддержка:\n• Email: help@harmony4soul.com\n• Телеграм: @amalinovskaya_psy`;
    
    await this.bot.sendMessage(msg.chat.id, helpText, {
      reply_markup: KeyboardManager.getMainKeyboard(user)
    });
  }

  async handleProgress(msg: TelegramBot.Message): Promise<void> {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await this.database.getUser(telegramId);
      if (!user) {
        await this.bot.sendMessage(msg.chat.id, 'Сначала нужно запустить бота. Нажми "Старт" 🌱');
        return;
      }

      let progressText = `📊 Твой прогресс:\n\n`;
      
      if (user.course_completed) {
        progressText += `🎉 Курс завершен!\nПоздравляю! Ты прошла все 7 дней заботы о себе.`;
      } else {
        const currentDay = user.current_day || 1;
        progressText += `📅 День: ${currentDay} из 7\n`;
        progressText += `🌱 Статус: ${user.is_paused ? 'На паузе' : 'Активен'}`;
      }

      await this.bot.sendMessage(msg.chat.id, progressText, {
        reply_markup: KeyboardManager.getMainKeyboard(user)
      });

    } catch (error) {
      logger.error('Ошибка в handleProgress', error);
    }
  }

  async handleCallback(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = callbackQuery.message?.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (!chatId || !data) return;

    try {
      await this.bot.answerCallbackQuery(callbackQuery.id);

      if (data === 'start_yes') {
        await this.database.updateUserDay(telegramId, 1);
        const user = await this.database.getUser(telegramId);
        
        await this.bot.sendMessage(chatId, 
          `🎉 Отлично! Ты записана на курс!\n\nЗавтра в 9:00 утра тебе придет первое сообщение.\nЗа день будет 4 сообщения:\n🌅 09:00 - Утреннее приветствие\n🌸 13:00 - Упражнение дня\n💝 16:00 - Фраза для размышления\n🌙 20:00 - Вечерняя рефлексия\n\nГотова начать завтра? 💙`, {
          reply_markup: KeyboardManager.getMainKeyboard(user)
        });
      } else if (data === 'more_info') {
        const infoText = `📚 Курс состоит из 7 дней:\n\n` +
          courseContent.map((day, index) => `📅 День ${index + 1}: ${day.title}`).join('\n') +
          `\n\nКаждый день - 4 коротких сообщения.\nГотова попробовать?`;

        await this.bot.sendMessage(chatId, infoText, {
          reply_markup: {
            inline_keyboard: [[
              { text: '🌱 Да, начинаем!', callback_data: 'start_yes' },
              { text: '⏰ Позже', callback_data: 'later' }
            ]]
          }
        });
      } else if (data === 'later') {
        const user = await this.database.getUser(telegramId);
        await this.bot.sendMessage(chatId, 'Понимаю 🤗 Напиши "Старт" когда будешь готова.', {
          reply_markup: KeyboardManager.getMainKeyboard(user)
        });
      } else if (data === 'help_understood') {
        // Обработка кнопки "Понятно, спасибо" из помощи с упражнениями
        await this.bot.sendMessage(chatId, 'Рада помочь! 💙 Если будут вопросы - обращайся.');
      } else if (data === 'start_personalization_test') {
        await this.startPersonalizationTest(chatId, telegramId);
      } else if (data === 'contact_psychologist') {
        await this.showContactInfo(chatId);
      } else if (data.startsWith('test_q1_')) {
        await this.handleTestQuestion1(chatId, telegramId, data);
      } else if (data.startsWith('test_q2_')) {
        await this.handleTestQuestion2(chatId, telegramId, data);
      } else if (data.startsWith('test_q3_')) {
        await this.handleTestQuestion3(chatId, telegramId, data);
      } else if (data === 'show_test_results') {
        await this.showTestResults(chatId, telegramId);
      } else if (data.startsWith('recommend_')) {
        await this.handleRecommendationClick(chatId, data);
      }

      // ✅ НОВОЕ: Обработка кнопки "Нужна помощь"
      if (data.includes('_exercise_help')) {
        const user = await this.database.getUser(telegramId);
        if (user) {
          const currentDay = user.current_day || 1;
          await this.handleExerciseHelp(chatId, currentDay);
        }
        return;
      }

      // ✅ ГЛАВНОЕ ИСПРАВЛЕНИЕ: Полная обработка callback'ов дня с переходом между днями
      if (data.startsWith('day_')) {
        await this.handleDayCallback(chatId, telegramId, data);
      }

    } catch (error) {
      logger.error('Ошибка в handleCallback', error);
    }
  }

  // ✅ НОВЫЙ МЕТОД: Полная обработка callback'ов дня с переходом между днями
  private async handleDayCallback(chatId: number, telegramId: number, data: string): Promise<void> {
    try {
      const user = await this.database.getUser(telegramId);
      if (!user) return;

      const currentDay = user.current_day || 1;

      // Сохраняем ответ пользователя
      await this.database.saveResponse(user.id, currentDay, 'button_choice', data);

      // Отправляем подтверждение
      const responses = [
        'Спасибо за ответ! 💙',
        'Важно, что ты откликаешься 🌸', 
        'Твоя честность ценна 💙',
        'Благодарю за участие 🤗'
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      await this.bot.sendMessage(chatId, randomResponse, {
        reply_markup: KeyboardManager.getMainKeyboard(user)
      });

      // ✅ КЛЮЧЕВАЯ ЛОГИКА: Переход между днями только для вечерних ответов
      if (data.includes('_evening_')) {
        // Проверяем, не завершен ли уже этот день (защита от дублирования)
        const dayCompleted = await this.database.isDayCompleted(user.id, currentDay);
        
        if (!dayCompleted) {
          
          // ✅ РЕШЕНИЕ ПРОБЛЕМЫ: если это день 7 - завершаем курс полностью
          if (currentDay === 7) {
            // Помечаем день как завершенный
            await this.database.markDayCompleted(user.id, currentDay);
            
            // ✅ ВАЖНО: Помечаем весь курс как завершенный
            await this.database.markCourseCompleted(telegramId);
            
            // Получаем обновленные данные пользователя
            const completedUser = await this.database.getUser(telegramId);
            
            // ✅ ОБНОВЛЕННОЕ ФИНАЛЬНОЕ СООБЩЕНИЕ
            const finalMessage = 
              `🎉Поздравляю! Ты сделала это.\n` +
              `7 дней ты была внимательна к себе. Училась замечать, чувствовать, поддерживать.\n` +
              `Ты уже не та, что в начале — теперь ты знаешь: ты можешь быть себе опорой.\n\n` +
              
              `🌱Но это только начало пути!\n` +
              `Осознанность требует постоянной практики. Чем регулярнее ты к ней возвращаешься, тем естественнее она становится частью твоей жизни.\n\n` +
              
              `Спасибо, что выбрала позаботиться о себе. Это самое важное решение.`;
            
            await this.bot.sendMessage(chatId, finalMessage, {
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔍 Узнать свой путь дальше', callback_data: 'start_personalization_test' }
                ], [
                  { text: '📱 Связаться с психологом', callback_data: 'contact_psychologist' }
                ]]
              }
            });
            
            logger.info(`✅ Пользователь ${telegramId} завершил курс!`);
            
          } else {
            // ✅ Для дней 1-6: переходим к следующему дню
            const nextDay = currentDay + 1;
            await this.database.updateUserDay(telegramId, nextDay);
            await this.database.markDayCompleted(user.id, currentDay);
            
            logger.info(`📅 Пользователь ${telegramId} перешел с дня ${currentDay} на день ${nextDay}`);
          }
        } else {
          logger.info(`⚠️ День ${currentDay} уже завершен для пользователя ${telegramId}`);
        }
      }

    } catch (error) {
      logger.error('❌ Ошибка в handleDayCallback:', error);
    }
  }

  // ✅ НОВЫЙ МЕТОД: Специализированная помощь для каждого упражнения
  private async handleExerciseHelp(chatId: number, day: number): Promise<void> {
    try {
      const helpTexts: { [key: number]: string } = {
        1: `💡 **Помощь с упражнением "Осознание боли":**

Это упражнение учит распознавать и принимать свою боль без попыток её исправить.

🔹 **Что делать:**
• Сядь удобно и закрой глаза
• Вспомни недавнюю ситуацию, которая расстроила
• НЕ думай "как это исправить"
• Просто скажи: "Да, мне было больно"

🔹 **Нормальные реакции:**
• Желание отвлечься - это нормально
• Слёзы или грусть - позволь им быть
• Сопротивление - тоже естественно

💙 **Помни:** цель НЕ избавиться от боли, а признать её.`,

        2: `💡 **Помощь с упражнением "Поймать критика":**

Внутренний критик - автоматические мысли, которые нас осуждают.

🔹 **Как заметить критика:**
• Обращай внимание на мысли после ошибок
• Слушай, что говоришь себе в зеркале
• Замечай фразы "опять ты...", "какая же ты..."

🔹 **Как переформулировать:**
• Вместо "дура" → "человек, который ошибся"
• Вместо "всё плохо" → "это сложно, но решаемо"
• Вместо "никогда не получится" → "пока не получается"

💙 **Помни:** цель не заглушить критика, а сделать его добрее.`,

        3: `💡 **Помощь с упражнением "Письмо себе":**

Это письмо от лица самого мудрого и доброго друга.

🔹 **С чего начать:**
• "Дорогая [имя], я вижу как тебе трудно..."
• "Я хочу, чтобы ты знала..."
• "Ты заслуживаешь..."

🔹 **О чём писать:**
• Признание твоих усилий
• Понимание твоих трудностей
• Слова поддержки и любви
• То, что сказал бы лучший друг

💙 **Помни:** пиши так, как писал бы кто-то, кто тебя очень любит.`,

        4: `💡 **Помощь с упражнением "Сострадательное прикосновение":**

Прикосновения активируют успокаивающую систему организма.

🔹 **Варианты прикосновений:**
• Рука на сердце
• Рука на щеке
• Объятие себя руками
• Поглаживание руки

🔹 **Что говорить:**
• "Я здесь"
• "Я поддержу тебя"
• "Ты не одна"
• "Это пройдёт"

💙 **Помни:** это не глупо, это научно обоснованный способ самоуспокоения.`,

        5: `💡 **Помощь с упражнением "Разрешение быть уязвимой":**

Уязвимость - это смелость быть настоящей.

🔹 **Как практиковать:**
• Назови эмоцию: "Сейчас я чувствую..."
• Не пытайся её изменить
• Просто побудь с чувством 1-2 минуты
• Скажи: "Это нормально чувствовать"

🔹 **Если сложно:**
• Начни с менее болезненных эмоций
• Представь, что утешаешь ребёнка
• Помни: чувства временны

💙 **Помни:** уязвимость - источник связи и роста.`,

        6: `💡 **Помощь с упражнением "Забота о потребностях":**

Учимся слышать и удовлетворять свои потребности.

🔹 **Базовые потребности:**
• Физические: вода, еда, сон, движение
• Эмоциональные: поддержка, понимание
• Ментальные: покой, стимуляция
• Духовные: смысл, красота

🔹 **Как определить потребность:**
• "Что мне сейчас нужно?"
• "Чего не хватает?"
• "Что помогло бы почувствовать себя лучше?"

💙 **Помни:** забота о себе не эгоизм, а необходимость.`,

        7: `💡 **Помощь с упражнением "Благодарность себе":**

Финальное упражнение - признание пройденного пути.

🔹 **За что благодарить:**
• За каждое выполненное упражнение
• За моменты самосострадания
• За попытки быть добрее к себе
• За завершение курса

🔹 **Как формулировать:**
• "Спасибо себе за..."
• "Я ценю в себе..."
• "Я горжусь тем, что..."

💙 **Помни:** ты проделала серьёзную внутреннюю работу. Это достижение!`
      };

      const helpText = helpTexts[day] || `💡 **Помощь с упражнением дня ${day}:**

Если упражнение кажется сложным, это нормально. Забота о себе требует практики.

💙 **Общие советы:**
• Не торопись
• Будь терпелива к себе  
• Начни с малого
• Главное - попробовать`;

      await this.bot.sendMessage(chatId, helpText);

      // Добавляем контакт психолога
      await this.bot.sendMessage(chatId, 
        `🧠 **Нужна персональная поддержка?**

Если упражнение вызывает сильные эмоции или ты чувствуешь, что нужна дополнительная помощь, можешь обратиться к психологу:

👩‍⚕️ **@amalinovskaya_psy** - профессиональная поддержка

💙 Помни: просить помощи - это сила, а не слабость.`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '💙 Понятно, спасибо', callback_data: 'help_understood' }
          ]]
        }
      });

    } catch (error) {
      logger.error('Ошибка в handleExerciseHelp', error);
    }
  }

  // ✅ НОВЫЕ МЕТОДЫ для теста персонализации

  private async startPersonalizationTest(chatId: number, telegramId: number): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, 
        `🔍 **Что дальше подходит именно тебе?**\n\n` +
        `Пройди короткий тест — он подскажет, куда двигаться дальше.\n` +
        `Ответь искренне, интуитивно. Здесь нет правильных или неправильных ответов — есть только ты.\n\n` +
        `**Вопрос 1 из 3:**\n` +
        `Что я чаще всего чувствую в последнее время?`
      , {
        reply_markup: {
          inline_keyboard: [
            [{ text: '😞 Усталость, тревога, напряжение', callback_data: 'test_q1_tired' }],
            [{ text: '🤯 Внутреннюю гонку и самокритику', callback_data: 'test_q1_critic' }],
            [{ text: '🤷 Недоумение: «А кто я вообще?»', callback_data: 'test_q1_identity' }],
            [{ text: '🌿 Спокойствие, но хочется расти', callback_data: 'test_q1_growth' }]
          ]
        }
      });
      
      // Сбрасываем предыдущие ответы теста
      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, 8, 'test_reset', 'started');
      }
      
    } catch (error) {
      logger.error('Ошибка в startPersonalizationTest', error);
    }
  }

  private async handleTestQuestion1(chatId: number, telegramId: number, data: string): Promise<void> {
    try {
      const answer = data.split('_')[2]; // tired, critic, identity, growth
      
      // Сохраняем ответ
      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, 8, 'test_q1', answer);
      }
      
      await this.bot.sendMessage(chatId, 
        `✅ Ответ сохранен!\n\n` +
        `**Вопрос 2 из 3:**\n` +
        `Чего мне сейчас больше всего не хватает?`
      , {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🧡 Заботы и поддержки', callback_data: 'test_q2_support' }],
            [{ text: '🎯 Чёткого направления и целей', callback_data: 'test_q2_direction' }],
            [{ text: '👥 Настоящих, глубоких связей', callback_data: 'test_q2_connection' }],
            [{ text: '📘 Знаний о себе и новых практик', callback_data: 'test_q2_knowledge' }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Ошибка в handleTestQuestion1', error);
    }
  }

  private async handleTestQuestion2(chatId: number, telegramId: number, data: string): Promise<void> {
    try {
      const answer = data.split('_')[2]; // support, direction, connection, knowledge
      
      // Сохраняем ответ
      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, 8, 'test_q2', answer);
      }
      
      await this.bot.sendMessage(chatId, 
        `✅ Ответ сохранен!\n\n` +
        `**Вопрос 3 из 3:**\n` +
        `Что для меня звучит наиболее близко?`
      , {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💙 «Я хочу, чтобы меня просто поняли»', callback_data: 'test_q3_understood' }],
            [{ text: '🎯 «Хочу разобраться с собой и двигаться вперёд»', callback_data: 'test_q3_forward' }],
            [{ text: '🛡️ «Мне нужно безопасное пространство»', callback_data: 'test_q3_safe' }],
            [{ text: '🚀 «Я готова к следующему уровню»', callback_data: 'test_q3_next_level' }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Ошибка в handleTestQuestion2', error);
    }
  }

  private async handleTestQuestion3(chatId: number, telegramId: number, data: string): Promise<void> {
    try {
      const answer = data.split('_')[2]; // understood, forward, safe, next_level
      
      // Сохраняем ответ
      const user = await this.database.getUser(telegramId);
      if (user) {
        await this.database.saveResponse(user.id, 8, 'test_q3', answer);
      }
      
      await this.bot.sendMessage(chatId, 
        `✅ Все ответы собраны!\n\n` +
        `🔍 Анализирую твои ответы и подбираю персональные рекомендации...`
      );
      
      // Показываем результаты через 2 секунды для эффекта
      setTimeout(async () => {
        await this.showTestResults(chatId, telegramId);
      }, 2000);
      
    } catch (error) {
      logger.error('Ошибка в handleTestQuestion3', error);
    }
  }

  private async showTestResults(chatId: number, telegramId: number): Promise<void> {
    try {
      // Получаем ответы пользователя
      const user = await this.database.getUser(telegramId);
      if (!user) return;
      
      const responses = await this.database.getUserTestResponses(user.id);
      
      const q1 = responses.find(r => r.question_type === 'test_q1')?.response_text || '';
      const q2 = responses.find(r => r.question_type === 'test_q2')?.response_text || '';
      const q3 = responses.find(r => r.question_type === 'test_q3')?.response_text || '';
      
      // Определяем рекомендацию на основе ответов
      const recommendation = this.getPersonalizedRecommendation(q1, q2, q3);
      
      await this.bot.sendMessage(chatId, 
        `🎯 **Твои персональные рекомендации:**\n\n${recommendation.text}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `💫 ${recommendation.button}`, callback_data: recommendation.action }],
            [{ text: '📱 Связаться для консультации', callback_data: 'contact_psychologist' }]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Ошибка в showTestResults', error);
    }
  }

  private getPersonalizedRecommendation(q1: string, q2: string, q3: string): any {
    // Логика определения рекомендации на основе новых требований
    
    // Если часто про самокритику и перегруз
    if (q1 === 'critic' || (q1 === 'critic' && q2 === 'direction')) {
      return {
        text: `👉 **Если часто — про самокритику и перегруз:**\n\n🌟 Терапевтическая группа "Возрождение или Новая-Я": про самооценку, внутреннего критика, тревогу.\n\n🔗 https://harmony4soul.com/product/rebirth_or_a_new_self/`,
        button: 'Перейти к программе',
        action: 'recommend_course_mind'
      };
    }
    
    // Если тянет к вопросам смысла, глубины, идентичности
    if (q1 === 'identity' || (q2 === 'connection' && q3 === 'safe') || q3 === 'safe') {
      return {
        text: `👉 **Если тянет к вопросам смысла, глубины, идентичности:**\n\n🔎 Подойдет личная консультация — исследование себя через практики и контакт.\n\n🔗 https://harmony4soul.com/product/30min_consultation/`,
        button: 'Записаться на консультацию',
        action: 'recommend_group_identity'
      };
    }
    
    // Если готова к следующему уровню развития
    if (q1 === 'growth' || q3 === 'next_level') {
      return {
        text: `👉 **Если тебе просто хочется расти дальше:**\n\n🌱 Терапевтическая группа "Возрождение или Новая —Я" - эмоциональный интеллект, границы, женственность, отношения.\n\n🔗 https://harmony4soul.com/product/rebirth_or_a_new_self/`,
        button: 'Перейти к программе',
        action: 'recommend_advanced'
      };
    }
    
    // Если в основном первые ответы (tired, support, understood) - дефолтный случай
    return {
      text: `👉 **Если в основном ты выбирала первые ответы:**\n\n💆 Тебе подойдёт терапевтическая группа "Освобождение от тревожности" — бережно разберём, что происходит, и найдём внутренние ресурсы.\n\n🔗 https://harmony4soul.com/product/relief_from_anxiety/`,
      button: 'Перейти к программе',
      action: 'recommend_individual'
    };
  }

  private async showContactInfo(chatId: number): Promise<void> {
    await this.bot.sendMessage(chatId, 
      `📱 **Контакты для связи:**\n\n` +
      `Напиши, чтобы узнать больше или записаться на консультацию:\n\n` +
      `📧 Email: help@harmony4soul.com\n` +
      `📱 Telegram: @amalinovskaya_psy\n\n` +
      `Я отвечаю в течение дня. Жду твоего сообщения! 💙`
    );
  }

  private async handleRecommendationClick(chatId: number, data: string): Promise<void> {
    const recommendationType = data.replace('recommend_', '');
    
    let message = '';
    switch (recommendationType) {
      case 'individual':
        message = `💆 **Терапевтическая группа "Освобождение от тревожности"**\n\n` +
          `🔹 Длительность: 4 недели – 8 встреч\n` +
          `🔹 Формат: Групповые встречи\n` +
          `🔹 Что изучаем: Бережно разберём, что происходит, и найдём внутренние ресурсы\n\n` +
          `🔗 Подробнее: https://harmony4soul.com/product/relief_from_anxiety/\n\n` +
          `Для записи напиши @amalinovskaya_psy`;
        break;
      case 'course_mind':
        message = `🧭 **Терапевтическая группа "Возрождение или Новая-Я"**\n\n` +
          `🔹 Длительность: 5 недель – 6 встреч\n` +
          `🔹 Формат: Групповые встречи + материалы\n` +
          `🔹 Что изучаем: Самооценка, внутренний критик, тревога\n\n` +
          `🔗 Подробнее: https://harmony4soul.com/product/rebirth_or_a_new_self/\n\n` +
          `Следующий поток стартует скоро. Напиши для уточнения деталей!`;
        break;
      case 'group_identity':
        message = `🔎 **Личная консультация**\n\n` +
          `🔹 Длительность: 30 минут\n` +
          `🔹 Формат: Онлайн или очно\n` +
          `🔹 Что входит: Исследование себя через практики и контакт\n\n` +
          `🔗 Подробнее: https://harmony4soul.com/product/30min_consultation/\n\n` +
          `Глубокая трансформационная работа в индивидуальном формате.`;
        break;
      case 'advanced':
        message = `🌱 **Терапевтическая группа "Возрождение или Новая-Я"**\n\n` +
          `🔹 Длительность: 5 недель – 6 встреч\n` +
          `🔹 Формат: Групповые встречи\n` +
          `🔹 Что изучаем: Эмоциональный интеллект, границы, женственность, отношения\n\n` +
          `🔗 Подробнее: https://harmony4soul.com/product/rebirth_or_a_new_self/\n\n` +
          `Выбери то, что откликается больше всего!`;
        break;
    }
    
    await this.bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '📱 Записаться / Узнать больше', callback_data: 'contact_psychologist' }
        ]]
      }
    });
  }
}
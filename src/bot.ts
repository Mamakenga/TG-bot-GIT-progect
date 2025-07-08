import TelegramBot from 'node-telegram-bot-api';
import { courses } from './course-logic'; // Пример импорта
import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

// Получаем токен из переменных окружения
const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN не найден в переменных окружения! Проверьте файл .env');
    }

    const bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Привет! Я твой новый телеграм бот.');
        });

        // Пример использования импортированной логики
        bot.onText(/\/course_day_1/, (msg) => {
            const chatId = msg.chat.id;
                const day1Content = courses.find(course => course.day === 1)?.baseContent;
                    if (day1Content) {
                            bot.sendMessage(chatId, day1Content.replace('[Имя]', msg.from?.first_name || ''));
                                } else {
                                        bot.sendMessage(chatId, 'Информация по первому дню курса не найдена.');
                                            }
                                            });

                                            console.log('Бот запущен...');
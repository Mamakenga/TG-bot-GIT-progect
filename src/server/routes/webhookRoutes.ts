// src/server/routes/webhookRoutes.ts
import { Router } from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { config } from '../../config';

export function webhookRoutes(bot: TelegramBot) {
  const router = Router();

  // Webhook endpoint для Telegram
  router.post(`/bot${config.telegram.token}`, async (req, res) => {
    try {
      console.log('📨 Получено обновление от Telegram');
      await bot.processUpdate(req.body);
      res.status(200).json({ ok: true });
      console.log('✅ Обновление обработано успешно');
    } catch (error) {
      console.error('❌ Ошибка обработки webhook:', error);
      res.status(200).json({ ok: false, error: 'Internal error' });
    }
  });

  return router;
}
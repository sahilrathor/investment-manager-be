import { Request, Response } from "express";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import logger from "../utils/logger";
import { sendMessage, isConfigured } from "../utils/telegram";

const TelegramService = {
  async link(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { chatId } = req.body;

      if (!chatId) {
        return res
          .status(400)
          .json({ success: false, message: "Telegram chat ID is required" });
      }

      if (!isConfigured()) {
        return res
          .status(503)
          .json({ success: false, message: "Telegram bot not configured" });
      }

      await db
        .update(users)
        .set({ telegramChatId: chatId })
        .where(eq(users.id, userId));

      await sendMessage(
        chatId,
        "✅ Telegram linked to Investments Manager successfully!"
      );

      res.json({ success: true, message: "Telegram linked successfully" });
    } catch (error) {
      logger.error(error, "Link Telegram failed");
      res
        .status(500)
        .json({ success: false, message: "Failed to link Telegram" });
    }
  },

  async unlink(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      await db
        .update(users)
        .set({ telegramChatId: null })
        .where(eq(users.id, userId));

      res.json({ success: true, message: "Telegram unlinked" });
    } catch (error) {
      logger.error(error, "Unlink Telegram failed");
      res
        .status(500)
        .json({ success: false, message: "Failed to unlink Telegram" });
    }
  },
};

export default TelegramService;

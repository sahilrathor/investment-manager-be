import TelegramBot from "node-telegram-bot-api";
import { envConfig } from "../config/envConfig";
import logger from "./logger";

let botInstance: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  if (!envConfig.TELEGRAM_BOT_TOKEN) {
    logger.warn("Telegram bot token not configured");
    return null;
  }

  if (!botInstance) {
    botInstance = new TelegramBot(envConfig.TELEGRAM_BOT_TOKEN, {
      polling: false,
    });
    logger.info("Telegram bot initialized");
  }

  return botInstance;
}

export async function sendMessage(
  chatId: string,
  message: string
): Promise<boolean> {
  try {
    const bot = getBot();
    if (!bot) return false;

    await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    return true;
  } catch (error) {
    logger.error({ error, chatId }, "Failed to send Telegram message");
    return false;
  }
}

export async function sendPriceAlert(
  chatId: string,
  assetName: string,
  assetSymbol: string,
  currentPrice: number,
  targetPrice: number,
  direction: "above" | "below"
): Promise<boolean> {
  const emoji = direction === "above" ? "📈" : "📉";
  const message = [
    `${emoji} <b>PRICE ALERT</b>`,
    ``,
    `<b>${assetName}</b> (${assetSymbol})`,
    `Current: <b>$${currentPrice.toFixed(2)}</b>`,
    `Target: ${direction} $${targetPrice.toFixed(2)}`,
    ``,
    `Time: ${new Date().toISOString().slice(0, 19)}`,
  ].join("\n");

  return sendMessage(chatId, message);
}

export async function sendSipReminder(
  chatId: string,
  assetName: string,
  amount: number,
  nextDate: Date
): Promise<boolean> {
  const message = [
    `💰 <b>SIP REMINDER</b>`,
    ``,
    `<b>${assetName}</b>`,
    `Amount: <b>$${amount.toFixed(2)}</b>`,
    `Due: ${nextDate.toISOString().slice(0, 10)}`,
  ].join("\n");

  return sendMessage(chatId, message);
}

export async function sendPortfolioSummary(
  chatId: string,
  totalValue: number,
  totalInvested: number
): Promise<boolean> {
  const pnl = totalValue - totalInvested;
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
  const emoji = pnl >= 0 ? "🟢" : "🔴";

  const message = [
    `📊 <b>PORTFOLIO SUMMARY</b>`,
    ``,
    `Value: <b>$${totalValue.toFixed(2)}</b>`,
    `Invested: $${totalInvested.toFixed(2)}`,
    `${emoji} P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`,
  ].join("\n");

  return sendMessage(chatId, message);
}

export function isConfigured(): boolean {
  return !!envConfig.TELEGRAM_BOT_TOKEN;
}

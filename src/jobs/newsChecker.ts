import axios from 'axios';
import { db } from '../db';
import { assets, users, portfolios } from '../db/schema';
import { eq } from 'drizzle-orm';
import { envConfig } from '../config/envConfig';
import { sendNewsAlert, sendEarningsAlert } from '../utils/telegram';
import logger from '../utils/logger';

const finnhub = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: { token: envConfig.FINNHUB_API_KEY },
});

// Store sent news headlines to avoid duplicates
const sentNews = new Set<string>();

function getDateRange(days: number = 1) {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { from, to };
}

function detectSentiment(headline: string): 'positive' | 'negative' | 'neutral' {
  const text = headline.toLowerCase();

  const positiveWords = [
    'gain', 'gains', 'up', 'rise', 'surge', 'jump', 'high', 'record', 'beat', 'beats',
    'profit', 'growth', 'strong', 'boost', 'upgrade', 'buy', 'rally', 'breakthrough',
    'expansion', 'recovery', 'dividend', 'buyback', 'acquisition', 'partnership'
  ];

  const negativeWords = [
    'loss', 'losses', 'down', 'fall', 'drop', 'low', 'miss', 'misses', 'weak',
    'decline', 'downgrade', 'sell', 'underperform', 'negative', 'crash', 'crisis',
    'risk', 'warning', 'lawsuit', 'investigation', 'fraud', 'bankruptcy', 'layoff',
    'debt', 'default', 'scandal', 'recall', 'delay', 'cut', 'cuts', 'concern'
  ];

  let positiveCount = positiveWords.filter(w => text.includes(w)).length;
  let negativeCount = negativeWords.filter(w => text.includes(w)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

export async function checkNews(): Promise<void> {
  if (!envConfig.FINNHUB_API_KEY) return;

  try {
    // Get all users with Telegram linked
    const telegramUsers = await db.select({
      id: users.id,
      telegramChatId: users.telegramChatId,
    }).from(users);

    const usersWithTelegram = telegramUsers.filter(u => u.telegramChatId);
    if (usersWithTelegram.length === 0) return;

    // Get all stock/crypto assets
    const allAssets = await db.select({
      id: assets.id,
      symbol: assets.symbol,
      name: assets.name,
      type: assets.type,
      portfolioId: assets.portfolioId,
    }).from(assets);

    const stockAssets = allAssets.filter(a => a.type === 'stock' || a.type === 'mutual_fund');

    if (stockAssets.length === 0) return;

    // Get unique symbols
    const uniqueSymbols = [...new Set(stockAssets.map(a => a.symbol.replace(/\.(NS|BO|NSE|BSE)$/, '').toUpperCase()))];

    // Fetch news for each unique symbol
    for (const symbol of uniqueSymbols.slice(0, 5)) { // Limit to 5 symbols to avoid rate limits
      try {
        const { from, to } = getDateRange(1);
        const newsRes = await finnhub.get('/company-news', {
          params: { symbol, from, to },
        });

        const newsItems = (newsRes.data || []).slice(0, 3); // Top 3 news per symbol

        for (const item of newsItems) {
          const newsKey = `${symbol}-${item.id}`;
          if (sentNews.has(newsKey)) continue;

          const headline = item.headline;
          const sentiment = detectSentiment(headline);
          const url = item.url;

          // Only send positive or negative news
          if (sentiment === 'neutral') continue;

          // Find all assets with this symbol and their owners
          const matchingAssets = stockAssets.filter(a =>
            a.symbol.replace(/\.(NS|BO|NSE|BSE)$/, '').toUpperCase() === symbol
          );

          for (const asset of matchingAssets) {
            // Get portfolio owner
            const [portfolio] = await db.select({ userId: portfolios.userId })
              .from(portfolios)
              .where(eq(portfolios.id, asset.portfolioId));

            if (!portfolio) continue;

            // Find user with Telegram
            const user = usersWithTelegram.find(u => u.id === portfolio.userId);
            if (!user) continue;

            await sendNewsAlert(
              user.telegramChatId!,
              asset.name,
              asset.symbol,
              headline,
              sentiment,
              url
            );

            logger.info({ symbol, headline, sentiment }, 'Sent news alert');
          }

          sentNews.add(newsKey);
        }

        // Check for earnings
        try {
          const { from, to } = getDateRange(7);
          const earningsRes = await finnhub.get('/calendar/earnings', {
            params: { symbol, from, to },
          });

          const earnings = (earningsRes.data?.earningsCalendar || []).filter((e: any) =>
            e.date === new Date().toISOString().split('T')[0]
          );

          for (const e of earnings) {
            const matchingAssets = stockAssets.filter(a =>
              a.symbol.replace(/\.(NS|BO|NSE|BSE)$/, '').toUpperCase() === symbol
            );

            for (const asset of matchingAssets) {
              const [portfolio] = await db.select({ userId: portfolios.userId })
                .from(portfolios)
                .where(eq(portfolios.id, asset.portfolioId));

              if (!portfolio) continue;

              const user = usersWithTelegram.find(u => u.id === portfolio.userId);
              if (!user) continue;

              const beat = e.epsActual != null && e.epsEstimate != null
                ? e.epsActual >= e.epsEstimate
                : null;

              await sendEarningsAlert(
                user.telegramChatId!,
                asset.name,
                asset.symbol,
                e.date,
                e.epsActual,
                e.epsEstimate,
                beat
              );

              logger.info({ symbol, date: e.date }, 'Sent earnings alert');
            }
          }
        } catch (error) {
          logger.warn({ symbol }, 'Failed to check earnings');
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        logger.warn({ symbol }, 'Failed to fetch news');
      }
    }
  } catch (error) {
    logger.error(error, 'News check job failed');
  }
}

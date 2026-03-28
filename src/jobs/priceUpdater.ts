import axios from 'axios';
import { db } from '../db';
import { assets, users, priceAlerts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { envConfig } from '../config/envConfig';
import { sendPriceAlert } from '../utils/telegram';
import logger from '../utils/logger';

const finnhub = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: { token: envConfig.FINNHUB_API_KEY },
});

const coingecko = axios.create({
  baseURL: envConfig.COINGECKO_BASE_URL,
});

export async function updatePrices(): Promise<void> {
  try {
    const liveAssets = await db.select().from(assets).where(eq(assets.useLivePrice, true));

    if (liveAssets.length === 0) return;

    const stocks = liveAssets.filter((a) => a.type === 'stock' || a.type === 'mutual_fund');
    const cryptos = liveAssets.filter((a) => a.type === 'crypto');

    // Update stocks
    if (stocks.length > 0 && envConfig.FINNHUB_API_KEY) {
      for (const asset of stocks) {
        try {
          const response = await finnhub.get('/quote', { params: { symbol: asset.symbol } });
          const price = response.data.c;
          // console.log({price})
          if (price > 0) {
            await db.update(assets)
              .set({ currentPrice: price, updatedAt: new Date() })
              .where(eq(assets.id, asset.id));
          }
        } catch (error) {
          logger.warn({ symbol: asset.symbol }, 'Failed to update stock price');
        }
      }
    }

    // Update cryptos
    if (cryptos.length > 0) {
      const cryptoIds = [...new Set(cryptos.map((a) => a.symbol.toLowerCase()))];

      try {
        const response = await coingecko.get('/simple/price', {
          params: {
            ids: cryptoIds.join(','),
            vs_currencies: 'usd',
          },
        });

        for (const asset of cryptos) {
          const price = response.data[asset.symbol.toLowerCase()]?.usd;
          // console.log({price});
          if (price) {
            await db.update(assets)
              .set({ currentPrice: price, updatedAt: new Date() })
              .where(eq(assets.id, asset.id));
          }
        }
      } catch (error) {
        logger.warn('Failed to update crypto prices');
      }
    }

    logger.info(`Updated prices for ${liveAssets.length} assets`);
  } catch (error) {
    logger.error(error, 'Price update job failed');
  }
}

export async function checkAlerts(): Promise<void> {
  try {
    const alerts = await db.select({
      id: priceAlerts.id,
      userId: priceAlerts.userId,
      assetId: priceAlerts.assetId,
      targetPrice: priceAlerts.targetPrice,
      direction: priceAlerts.direction,
      assetName: assets.name,
      assetSymbol: assets.symbol,
      currentPrice: assets.currentPrice,
    })
      .from(priceAlerts)
      .innerJoin(assets, eq(priceAlerts.assetId, assets.id))
      .where(eq(priceAlerts.isTriggered, false));

    for (const alert of alerts) {
      let triggered = false;

      if (alert.direction === 'above' && alert.currentPrice >= alert.targetPrice) {
        triggered = true;
      } else if (alert.direction === 'below' && alert.currentPrice <= alert.targetPrice) {
        triggered = true;
      }

      if (triggered) {
        await db.update(priceAlerts)
          .set({ isTriggered: true })
          .where(eq(priceAlerts.id, alert.id));

        // Send Telegram notification
        const [user] = await db.select({ telegramChatId: users.telegramChatId })
          .from(users)
          .where(eq(users.id, alert.userId));

        if (user?.telegramChatId) {
          await sendPriceAlert(
            user.telegramChatId,
            alert.assetName,
            alert.assetSymbol,
            alert.currentPrice!,
            alert.targetPrice,
            alert.direction
          );
        }

        logger.info({ alertId: alert.id }, 'Price alert triggered');
      }
    }
  } catch (error) {
    logger.error(error, 'Alert check job failed');
  }
}

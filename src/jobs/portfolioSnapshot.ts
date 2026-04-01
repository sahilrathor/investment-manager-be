import { db } from '../db';
import { portfolios, assets, portfolioSnapshots } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { fetchLivePrices } from '../utils/priceFetcher';
import logger from '../utils/logger';

export async function capturePortfolioSnapshots(): Promise<void> {
  try {
    const allPortfolios = await db.select().from(portfolios);

    for (const portfolio of allPortfolios) {
      try {
        const portfolioAssets = await db.select().from(assets).where(eq(assets.portfolioId, portfolio.id));

        if (portfolioAssets.length === 0) continue;

        // Fetch live prices
        const priceMap = await fetchLivePrices(
          portfolioAssets.map((a) => ({ id: a.id, symbol: a.symbol, type: a.type, useLivePrice: a.useLivePrice }))
        );

        let totalValue = 0;
        let totalInvested = 0;

        for (const asset of portfolioAssets) {
          const currentPrice = priceMap.get(asset.id) || asset.currentPrice || asset.avgBuyPrice;
          totalValue += asset.quantity * currentPrice;
          totalInvested += asset.quantity * asset.avgBuyPrice;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if snapshot already exists for today
        const existing = await db.select()
          .from(portfolioSnapshots)
          .where(
            and(
              eq(portfolioSnapshots.portfolioId, portfolio.id),
              gte(portfolioSnapshots.date, today),
              lte(portfolioSnapshots.date, new Date(today.getTime() + 24 * 60 * 60 * 1000))
            )
          );

        if (existing.length > 0) {
          // Update existing snapshot
          await db.update(portfolioSnapshots)
            .set({ totalValue, totalInvested })
            .where(eq(portfolioSnapshots.id, existing[0].id));
        } else {
          // Insert new snapshot
          await db.insert(portfolioSnapshots).values({
            portfolioId: portfolio.id,
            date: today,
            totalValue,
            totalInvested,
          });
        }
      } catch (error) {
        logger.warn({ err: error, portfolioId: portfolio.id }, 'Failed to capture snapshot for portfolio');
      }
    }

    logger.info(`Captured snapshots for ${allPortfolios.length} portfolios`);
  } catch (error) {
    logger.error(error, 'Portfolio snapshot job failed');
  }
}

import { Request, Response } from 'express';
import { db } from '../db';
import { assets, transactions, portfolios } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import logger from '../utils/logger';
import { fetchLivePrices } from '../utils/priceFetcher';

const ImportExportService = {
  async importCsv(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { type, data } = req.body;

      if (!type || !data || !Array.isArray(data)) {
        return res.status(400).json({ success: false, message: 'Type and data array are required' });
      }

      let imported = 0;

      if (type === 'transactions') {
        for (const row of data) {
          const [asset] = await db.select({ id: assets.id })
            .from(assets)
            .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
            .where(and(eq(assets.id, row.assetId), eq(portfolios.userId, userId)));

          if (asset) {
            await db.insert(transactions).values({
              assetId: row.assetId,
              type: row.type,
              quantity: Number(row.quantity),
              pricePerUnit: Number(row.pricePerUnit),
              totalAmount: Number(row.quantity) * Number(row.pricePerUnit),
              date: new Date(row.date),
              notes: row.notes || null,
            });
            imported++;
          }
        }
      } else if (type === 'assets') {
        for (const row of data) {
          const [portfolio] = await db.select({ id: portfolios.id })
            .from(portfolios)
            .where(and(eq(portfolios.id, row.portfolioId), eq(portfolios.userId, userId)));

          if (portfolio) {
            await db.insert(assets).values({
              portfolioId: row.portfolioId,
              type: row.type,
              symbol: row.symbol,
              name: row.name,
              quantity: Number(row.quantity) || 0,
              avgBuyPrice: Number(row.avgBuyPrice) || 0,
              currentPrice: Number(row.currentPrice) || 0,
              useLivePrice: row.useLivePrice !== 'false',
            });
            imported++;
          }
        }
      }

      res.json({ success: true, message: `Imported ${imported} records` });
    } catch (error) {
      logger.error(error, 'CSV import failed');
      res.status(500).json({ success: false, message: 'Import failed' });
    }
  },

  async exportCsv(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { type } = req.query;

      if (type === 'transactions') {
        const txns = await db.select({
          id: transactions.id,
          assetId: transactions.assetId,
          assetSymbol: assets.symbol,
          assetName: assets.name,
          type: transactions.type,
          quantity: transactions.quantity,
          pricePerUnit: transactions.pricePerUnit,
          totalAmount: transactions.totalAmount,
          date: transactions.date,
          notes: transactions.notes,
        })
          .from(transactions)
          .innerJoin(assets, eq(transactions.assetId, assets.id))
          .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
          .where(eq(portfolios.userId, userId))
          .orderBy(desc(transactions.date));

        res.json({ success: true, data: txns });
      } else if (type === 'assets') {
        const userAssets = await db.select({
          id: assets.id,
          portfolioId: assets.portfolioId,
          type: assets.type,
          symbol: assets.symbol,
          name: assets.name,
          quantity: assets.quantity,
          avgBuyPrice: assets.avgBuyPrice,
          currentPrice: assets.currentPrice,
          manualPrice: assets.manualPrice,
          useLivePrice: assets.useLivePrice,
        })
          .from(assets)
          .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
          .where(eq(portfolios.userId, userId));

        const livePrices = await fetchLivePrices(userAssets);

        const data = userAssets.map((asset) => {
          const livePrice = livePrices.get(asset.id);
          return {
            ...asset,
            currentPrice: livePrice ?? asset.manualPrice ?? asset.currentPrice,
          };
        });

        res.json({ success: true, data });
      } else {
        res.status(400).json({ success: false, message: 'Invalid export type. Use "transactions" or "assets"' });
      }
    } catch (error) {
      logger.error(error, 'CSV export failed');
      res.status(500).json({ success: false, message: 'Export failed' });
    }
  },
};

export default ImportExportService;

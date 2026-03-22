import { Request, Response } from 'express';
import { db } from '../db';
import { priceAlerts, assets, portfolios } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';
import { fetchLivePrices } from '../utils/priceFetcher';

const AlertService = {
  async getAll(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const alerts = await db.select({
        id: priceAlerts.id,
        assetId: priceAlerts.assetId,
        targetPrice: priceAlerts.targetPrice,
        direction: priceAlerts.direction,
        isTriggered: priceAlerts.isTriggered,
        createdAt: priceAlerts.createdAt,
        assetName: assets.name,
        assetSymbol: assets.symbol,
        assetType: assets.type,
        currentPrice: assets.currentPrice,
        useLivePrice: assets.useLivePrice,
        manualPrice: assets.manualPrice,
      })
        .from(priceAlerts)
        .innerJoin(assets, eq(priceAlerts.assetId, assets.id))
        .where(eq(priceAlerts.userId, userId));

      const seen = new Set<string>();
      const assetList = alerts
        .filter((a) => {
          if (seen.has(a.assetId)) return false;
          seen.add(a.assetId);
          return true;
        })
        .map((a) => ({
          id: a.assetId,
          symbol: a.assetSymbol,
          type: a.assetType,
          useLivePrice: a.useLivePrice,
        }));

      const livePrices = await fetchLivePrices(assetList);

      const data = alerts.map((alert) => {
        const livePrice = livePrices.get(alert.assetId);
        const price = livePrice ?? alert.manualPrice ?? alert.currentPrice;
        return {
          id: alert.id,
          assetId: alert.assetId,
          targetPrice: alert.targetPrice,
          direction: alert.direction,
          isTriggered: alert.isTriggered,
          createdAt: alert.createdAt,
          assetName: alert.assetName,
          assetSymbol: alert.assetSymbol,
          assetType: alert.assetType,
          currentPrice: price,
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      logger.error(error, 'Get alerts failed');
      res.status(500).json({ success: false, message: 'Failed to get alerts' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { assetId, targetPrice, direction } = req.body;

      if (!assetId || !targetPrice || !direction) {
        return res.status(400).json({ success: false, message: 'assetId, targetPrice and direction are required' });
      }

      const [asset] = await db.select({ id: assets.id })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, assetId), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      const [alert] = await db.insert(priceAlerts).values({
        userId,
        assetId,
        targetPrice,
        direction,
        isTriggered: false,
      }).returning();

      res.status(201).json({ success: true, data: alert });
    } catch (error) {
      logger.error(error, 'Create alert failed');
      res.status(500).json({ success: false, message: 'Failed to create alert' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [alert] = await db.delete(priceAlerts)
        .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
        .returning();

      if (!alert) {
        return res.status(404).json({ success: false, message: 'Alert not found' });
      }

      res.json({ success: true, message: 'Alert deleted' });
    } catch (error) {
      logger.error(error, 'Delete alert failed');
      res.status(500).json({ success: false, message: 'Failed to delete alert' });
    }
  },
};

export default AlertService;

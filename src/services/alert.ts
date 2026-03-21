import { Request, Response } from 'express';
import { db } from '../db';
import { priceAlerts, assets, portfolios } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';

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
      })
        .from(priceAlerts)
        .innerJoin(assets, eq(priceAlerts.assetId, assets.id))
        .where(eq(priceAlerts.userId, userId));

      res.json({ success: true, data: alerts });
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

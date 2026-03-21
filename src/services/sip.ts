import { Request, Response } from 'express';
import { db } from '../db';
import { sips, assets, portfolios } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';

function getNextPaymentDate(startDate: Date, frequency: string): Date {
  const next = new Date(startDate);
  switch (frequency) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

const SipService = {
  async getAll(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const userSips = await db.select({
        id: sips.id,
        assetId: sips.assetId,
        amount: sips.amount,
        frequency: sips.frequency,
        startDate: sips.startDate,
        nextPaymentDate: sips.nextPaymentDate,
        status: sips.status,
        createdAt: sips.createdAt,
        assetName: assets.name,
        assetSymbol: assets.symbol,
        assetType: assets.type,
      })
        .from(sips)
        .innerJoin(assets, eq(sips.assetId, assets.id))
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(eq(portfolios.userId, userId));

      res.json({ success: true, data: userSips });
    } catch (error) {
      logger.error(error, 'Get SIPs failed');
      res.status(500).json({ success: false, message: 'Failed to get SIPs' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { assetId, amount, frequency, startDate } = req.body;

      if (!assetId || !amount || !frequency || !startDate) {
        return res.status(400).json({ success: false, message: 'assetId, amount, frequency and startDate are required' });
      }

      const [asset] = await db.select({ id: assets.id })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, assetId), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      const start = new Date(startDate);

      const [sip] = await db.insert(sips).values({
        assetId,
        amount,
        frequency,
        startDate: start,
        nextPaymentDate: getNextPaymentDate(start, frequency),
        status: 'active',
      }).returning();

      res.status(201).json({ success: true, data: sip });
    } catch (error) {
      logger.error(error, 'Create SIP failed');
      res.status(500).json({ success: false, message: 'Failed to create SIP' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { status, amount, frequency } = req.body;

      const [sip] = await db.select({ id: sips.id, assetId: sips.assetId })
        .from(sips)
        .innerJoin(assets, eq(sips.assetId, assets.id))
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(sips.id, id), eq(portfolios.userId, userId)));

      if (!sip) {
        return res.status(404).json({ success: false, message: 'SIP not found' });
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (amount) updateData.amount = amount;
      if (frequency) updateData.frequency = frequency;

      const [updated] = await db.update(sips)
        .set(updateData)
        .where(eq(sips.id, id))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error(error, 'Update SIP failed');
      res.status(500).json({ success: false, message: 'Failed to update SIP' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [sip] = await db.select({ id: sips.id })
        .from(sips)
        .innerJoin(assets, eq(sips.assetId, assets.id))
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(sips.id, id), eq(portfolios.userId, userId)));

      if (!sip) {
        return res.status(404).json({ success: false, message: 'SIP not found' });
      }

      await db.delete(sips).where(eq(sips.id, id));

      res.json({ success: true, message: 'SIP deleted' });
    } catch (error) {
      logger.error(error, 'Delete SIP failed');
      res.status(500).json({ success: false, message: 'Failed to delete SIP' });
    }
  },
};

export default SipService;

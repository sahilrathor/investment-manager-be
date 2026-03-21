import { Request, Response } from 'express';
import { db } from '../db';
import { transactions, assets, portfolios } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import logger from '../utils/logger';

const TransactionService = {
  async getAll(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { assetId } = req.params;

      const [asset] = await db.select({ id: assets.id })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, assetId), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      const txns = await db.select().from(transactions)
        .where(eq(transactions.assetId, assetId))
        .orderBy(desc(transactions.date));

      res.json({ success: true, data: txns });
    } catch (error) {
      logger.error(error, 'Get transactions failed');
      res.status(500).json({ success: false, message: 'Failed to get transactions' });
    }
  },

  async getAllForUser(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const txns = await db.select({
        id: transactions.id,
        assetId: transactions.assetId,
        type: transactions.type,
        quantity: transactions.quantity,
        pricePerUnit: transactions.pricePerUnit,
        totalAmount: transactions.totalAmount,
        date: transactions.date,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        assetName: assets.name,
        assetSymbol: assets.symbol,
        assetType: assets.type,
      })
        .from(transactions)
        .innerJoin(assets, eq(transactions.assetId, assets.id))
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(eq(portfolios.userId, userId))
        .orderBy(desc(transactions.date));

      res.json({ success: true, data: txns });
    } catch (error) {
      logger.error(error, 'Get all transactions failed');
      res.status(500).json({ success: false, message: 'Failed to get transactions' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { assetId } = req.params;
      const { type, quantity, pricePerUnit, date, notes } = req.body;

      if (!type || !quantity || !pricePerUnit || !date) {
        return res.status(400).json({ success: false, message: 'Type, quantity, pricePerUnit and date are required' });
      }

      const [asset] = await db.select({ id: assets.id })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, assetId), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      const totalAmount = quantity * pricePerUnit;

      const [txn] = await db.insert(transactions).values({
        assetId,
        type,
        quantity,
        pricePerUnit,
        totalAmount,
        date: new Date(date),
        notes: notes || null,
      }).returning();

      res.status(201).json({ success: true, data: txn });
    } catch (error) {
      logger.error(error, 'Create transaction failed');
      res.status(500).json({ success: false, message: 'Failed to create transaction' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [txn] = await db.select({ id: transactions.id })
        .from(transactions)
        .innerJoin(assets, eq(transactions.assetId, assets.id))
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(transactions.id, id), eq(portfolios.userId, userId)));

      if (!txn) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      await db.delete(transactions).where(eq(transactions.id, id));

      res.json({ success: true, message: 'Transaction deleted' });
    } catch (error) {
      logger.error(error, 'Delete transaction failed');
      res.status(500).json({ success: false, message: 'Failed to delete transaction' });
    }
  },
};

export default TransactionService;

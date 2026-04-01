import { Request, Response } from 'express';
import { db } from '../db';
import { portfolios, assets, transactions, portfolioSnapshots } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import logger from '../utils/logger';
import { fetchLivePrices } from '../utils/priceFetcher';

const PortfolioService = {
  async getAll(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));

      res.json({ success: true, data: userPortfolios });
    } catch (error) {
      logger.error(error, 'Get portfolios failed');
      res.status(500).json({ success: false, message: 'Failed to get portfolios' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [portfolio] = await db.select().from(portfolios).where(
        and(eq(portfolios.id, id), eq(portfolios.userId, userId))
      );

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      res.json({ success: true, data: portfolio });
    } catch (error) {
      logger.error(error, 'Get portfolio failed');
      res.status(500).json({ success: false, message: 'Failed to get portfolio' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Portfolio name is required' });
      }

      const [portfolio] = await db.insert(portfolios).values({
        userId,
        name,
        description: description || null,
      }).returning();

      res.status(201).json({ success: true, data: portfolio });
    } catch (error) {
      logger.error(error, 'Create portfolio failed');
      res.status(500).json({ success: false, message: 'Failed to create portfolio' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { name, description } = req.body;

      const [portfolio] = await db.update(portfolios)
        .set({ name, description })
        .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)))
        .returning();

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      res.json({ success: true, data: portfolio });
    } catch (error) {
      logger.error(error, 'Update portfolio failed');
      res.status(500).json({ success: false, message: 'Failed to update portfolio' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [portfolio] = await db.delete(portfolios)
        .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)))
        .returning();

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      res.json({ success: true, message: 'Portfolio deleted' });
    } catch (error) {
      logger.error(error, 'Delete portfolio failed');
      res.status(500).json({ success: false, message: 'Failed to delete portfolio' });
    }
  },

  async getAnalytics(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      // Verify portfolio ownership
      const [portfolio] = await db.select().from(portfolios).where(
        and(eq(portfolios.id, id), eq(portfolios.userId, userId))
      );

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      // Get all assets with their transactions
      const portfolioAssets = await db.select().from(assets).where(eq(assets.portfolioId, id));

      if (portfolioAssets.length === 0) {
        return res.json({
          success: true,
          data: {
            totalInvested: 0,
            currentValue: 0,
            totalPnL: 0,
            returnPercent: 0,
            bestPerformer: null,
            worstPerformer: null,
            allocation: [],
            sectorAllocation: [],
            stockVsCrypto: { stocks: 0, crypto: 0 },
          },
        });
      }

      // Fetch live prices
      const priceMap = await fetchLivePrices(
        portfolioAssets.map((a) => ({ id: a.id, symbol: a.symbol, type: a.type, useLivePrice: a.useLivePrice }))
      );

      // Compute per-asset P&L
      const assetMetrics = portfolioAssets.map((a) => {
        const currentPrice = priceMap.get(a.id) || a.currentPrice || a.avgBuyPrice;
        const invested = a.quantity * a.avgBuyPrice;
        const currentValue = a.quantity * currentPrice;
        const pnl = currentValue - invested;
        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

        return {
          id: a.id,
          symbol: a.symbol,
          name: a.name,
          type: a.type,
          invested,
          currentValue,
          pnl,
          pnlPercent,
        };
      });

      const totalInvested = assetMetrics.reduce((sum, a) => sum + a.invested, 0);
      const currentValue = assetMetrics.reduce((sum, a) => sum + a.currentValue, 0);
      const totalPnL = currentValue - totalInvested;
      const returnPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

      const sorted = [...assetMetrics].sort((a, b) => b.pnlPercent - a.pnlPercent);
      const bestPerformer = sorted[0] ? { symbol: sorted[0].symbol, pnlPercent: sorted[0].pnlPercent } : null;
      const worstPerformer = sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1].symbol, pnlPercent: sorted[sorted.length - 1].pnlPercent } : null;

      // Allocation by asset
      const allocation = assetMetrics.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        value: a.currentValue,
        percent: currentValue > 0 ? (a.currentValue / currentValue) * 100 : 0,
      }));

      // Stock vs crypto
      const stockValue = assetMetrics.filter((a) => a.type === 'stock' || a.type === 'mutual_fund').reduce((s, a) => s + a.currentValue, 0);
      const cryptoValue = assetMetrics.filter((a) => a.type === 'crypto').reduce((s, a) => s + a.currentValue, 0);

      res.json({
        success: true,
        data: {
          totalInvested: Math.round(totalInvested * 100) / 100,
          currentValue: Math.round(currentValue * 100) / 100,
          totalPnL: Math.round(totalPnL * 100) / 100,
          returnPercent: Math.round(returnPercent * 100) / 100,
          bestPerformer,
          worstPerformer,
          allocation,
          stockVsCrypto: { stocks: stockValue, crypto: cryptoValue },
        },
      });
    } catch (error) {
      logger.error(error, 'Get portfolio analytics failed');
      res.status(500).json({ success: false, message: 'Failed to get portfolio analytics' });
    }
  },

  async getPerformance(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      // Verify portfolio ownership
      const [portfolio] = await db.select().from(portfolios).where(
        and(eq(portfolios.id, id), eq(portfolios.userId, userId))
      );

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      // Get snapshots
      const snapshots = await db.select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.portfolioId, id))
        .orderBy(portfolioSnapshots.date);

      // Format dates
      const data = snapshots.map((s) => ({
        date: new Date(s.date).toISOString().split('T')[0],
        value: s.totalValue,
        invested: s.totalInvested,
      }));

      res.json({ success: true, data });
    } catch (error) {
      logger.error(error, 'Get portfolio performance failed');
      res.status(500).json({ success: false, message: 'Failed to get portfolio performance' });
    }
  },
};

export default PortfolioService;

import { Request, Response } from 'express';
import { db } from '../db';
import { assets, portfolios, transactions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';
import { fetchLivePrices } from '../utils/priceFetcher';

const AssetService = {
  async getAllForUser(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

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
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        portfolioName: portfolios.name,
      })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(eq(portfolios.userId, userId));

      res.json({ success: true, data: userAssets });
    } catch (error) {
      logger.error(error, 'Get all assets failed');
      res.status(500).json({ success: false, message: 'Failed to get assets' });
    }
  },

  async getAll(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { portfolioId } = req.params;

      const [portfolio] = await db.select().from(portfolios).where(
        and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))
      );

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      const portfolioAssets = await db.select().from(assets).where(eq(assets.portfolioId, portfolioId));

      const livePrices = await fetchLivePrices(portfolioAssets);

      const data = portfolioAssets.map((asset) => {
        const livePrice = livePrices.get(asset.id);
        return {
          ...asset,
          currentPrice: livePrice ?? asset.manualPrice ?? asset.currentPrice,
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      logger.error(error, 'Get assets failed');
      res.status(500).json({ success: false, message: 'Failed to get assets' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [asset] = await db.select({
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
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
      })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, id), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      res.json({ success: true, data: asset });
    } catch (error) {
      logger.error(error, 'Get asset failed');
      res.status(500).json({ success: false, message: 'Failed to get asset' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { portfolioId } = req.params;
      const { type, symbol, name, quantity, avgBuyPrice, currentPrice, manualPrice, useLivePrice } = req.body;

      if (!type || !symbol || !name) {
        return res.status(400).json({ success: false, message: 'Type, symbol and name are required' });
      }

      const [portfolio] = await db.select().from(portfolios).where(
        and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))
      );

      if (!portfolio) {
        return res.status(404).json({ success: false, message: 'Portfolio not found' });
      }

      const buyQty = Number(quantity) || 0;
      const buyPrice = Number(avgBuyPrice) || Number(currentPrice) || 0;

      const [asset] = await db.insert(assets).values({
        portfolioId,
        type,
        symbol,
        name,
        quantity: buyQty,
        avgBuyPrice: buyPrice,
        currentPrice: Number(currentPrice) || buyPrice,
        manualPrice: manualPrice || null,
        useLivePrice: useLivePrice !== false,
      }).returning();

      // Auto-create initial buy transaction if quantity > 0
      if (buyQty > 0 && buyPrice > 0) {
        await db.insert(transactions).values({
          assetId: asset.id,
          type: 'buy',
          quantity: buyQty,
          pricePerUnit: buyPrice,
          totalAmount: buyQty * buyPrice,
          date: new Date(),
          notes: 'Initial purchase',
        });
      }

      res.status(201).json({ success: true, data: asset });
    } catch (error) {
      logger.error(error, 'Create asset failed');
      res.status(500).json({ success: false, message: 'Failed to create asset' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const updateData = req.body;

      const [asset] = await db.select({ id: assets.id, portfolioId: assets.portfolioId })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, id), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      const [updated] = await db.update(assets)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(assets.id, id))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error(error, 'Update asset failed');
      res.status(500).json({ success: false, message: 'Failed to update asset' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const [asset] = await db.select({ id: assets.id })
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, id), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      await db.delete(assets).where(eq(assets.id, id));

      res.json({ success: true, message: 'Asset deleted' });
    } catch (error) {
      logger.error(error, 'Delete asset failed');
      res.status(500).json({ success: false, message: 'Failed to delete asset' });
    }
  },
};

export default AssetService;

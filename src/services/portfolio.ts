import { Request, Response } from 'express';
import { db } from '../db';
import { portfolios, assets } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';

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
};

export default PortfolioService;

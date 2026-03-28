import { Request, Response } from 'express';
import axios from 'axios';
import { envConfig } from '../config/envConfig';
import { db } from '../db';
import { assets, portfolios } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';

const finnhub = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: { token: envConfig.FINNHUB_API_KEY },
});

function getDateRange(days: number = 7) {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { from, to };
}

function detectSentiment(headline: string, summary: string): { sentiment: 'positive' | 'negative' | 'neutral'; score: number } {
  const text = `${headline} ${summary}`.toLowerCase();

  const positiveWords = [
    'gain', 'gains', 'up', 'rise', 'rises', 'rising', 'bull', 'bullish', 'surge', 'surges',
    'jump', 'jumps', 'jumped', 'high', 'higher', 'record', 'beat', 'beats', 'beating',
    'profit', 'profits', 'growth', 'growing', 'strong', 'boost', 'boosts', 'upgrade',
    'upgraded', 'buy', 'outperform', 'positive', 'rally', 'rallies', 'rallying',
    'breakthrough', 'success', 'successful', 'innovation', 'expansion', 'recovery',
    'dividend', 'buyback', 'acquisition', 'partnership', 'breakthrough'
  ];

  const negativeWords = [
    'loss', 'losses', 'down', 'fall', 'falls', 'falling', 'bear', 'bearish', 'drop', 'drops',
    'dropped', 'low', 'lower', 'miss', 'misses', 'missed', 'weak', 'weaker', 'weakness',
    'decline', 'declines', 'declining', 'downgrade', 'downgraded', 'sell', 'underperform',
    'negative', 'crash', 'crashes', 'crisis', 'risk', 'risks', 'risky', 'warning',
    'warning', 'lawsuit', 'investigation', 'fraud', 'bankruptcy', 'layoff', 'layoffs',
    'debt', 'default', 'scandal', 'recall', 'delay', 'delayed', 'cut', 'cuts'
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  positiveWords.forEach(word => {
    if (text.includes(word)) positiveCount++;
  });

  negativeWords.forEach(word => {
    if (text.includes(word)) negativeCount++;
  });

  const total = positiveCount + negativeCount;
  if (total === 0) return { sentiment: 'neutral', score: 0 };

  const score = (positiveCount - negativeCount) / total;

  if (score > 0.2) return { sentiment: 'positive', score: Math.min(score, 1) };
  if (score < -0.2) return { sentiment: 'negative', score: Math.max(score, -1) };
  return { sentiment: 'neutral', score };
}

const NewsService = {
  async getNews(req: Request, res: Response) {
    const userId = req.user!.userId;
    const { id } = req.params;

    try {
      // Verify ownership
      const [asset] = await db.select()
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, id), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      if (!envConfig.FINNHUB_API_KEY) {
        return res.json({ success: true, data: { news: [], sentiment: null } });
      }

      const { from, to } = getDateRange(7);
      const symbol = asset.assets.symbol.replace(/\.(NS|BO|NSE|BSE)$/, '').toUpperCase();

      // Fetch company news
      let news: any[] = [];
      try {
        const newsRes = await finnhub.get('/company-news', {
          params: { symbol, from, to },
        });
        news = (newsRes.data || []).slice(0, 15).map((item: any) => {
          const { sentiment, score } = detectSentiment(item.headline, item.summary || '');
          return {
            id: item.id,
            headline: item.headline,
            summary: item.summary,
            source: item.source,
            url: item.url,
            image: item.image,
            datetime: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
            sentiment,
            sentimentScore: score,
            category: item.category,
          };
        });
      } catch (error) {
        logger.warn({ symbol }, 'Failed to fetch company news');
      }

      // Fetch news sentiment from Finnhub
      let sentiment: any = null;
      try {
        const sentimentRes = await finnhub.get('/news-sentiment', { params: { symbol } });
        if (sentimentRes.data) {
          sentiment = {
            buzz: sentimentRes.data.buzz,
            companyNewsScore: sentimentRes.data.companyNewsScore,
            sectorAverageBullishPercent: sentimentRes.data.sectorAverageBullishPercent,
            sectorAverageNewsScore: sentimentRes.data.sectorAverageNewsScore,
            bullishPercent: sentimentRes.data.bullishPercent,
            bearishPercent: sentimentRes.data.bearishPercent,
          };
        }
      } catch (error) {
        logger.warn({ symbol }, 'Failed to fetch news sentiment');
      }

      res.json({ success: true, data: { news, sentiment } });
    } catch (error) {
      logger.error(error, 'Get news failed');
      res.status(500).json({ success: false, message: 'Failed to fetch news' });
    }
  },

  async getEvents(req: Request, res: Response) {
    const userId = req.user!.userId;
    const { id } = req.params;

    try {
      // Verify ownership
      const [asset] = await db.select()
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, id), eq(portfolios.userId, userId)));

      if (!asset) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      if (!envConfig.FINNHUB_API_KEY) {
        return res.json({ success: true, data: { earnings: [], ratings: [] } });
      }

      const symbol = asset.assets.symbol.replace(/\.(NS|BO|NSE|BSE)$/, '').toUpperCase();

      // Fetch earnings calendar
      let earnings: any[] = [];
      try {
        const { from, to } = getDateRange(90);
        const earningsRes = await finnhub.get('/calendar/earnings', {
          params: { from, to, symbol },
        });
        const earningsData = earningsRes.data?.earningsCalendar || [];
        earnings = earningsData.map((item: any) => ({
          date: item.date,
          epsActual: item.epsActual,
          epsEstimate: item.epsEstimate,
          hour: item.hour,
          quarter: item.quarter,
          revenueActual: item.revenueActual,
          revenueEstimate: item.revenueEstimate,
          year: item.year,
          beat: item.epsActual != null && item.epsEstimate != null
            ? item.epsActual >= item.epsEstimate
            : null,
        }));
      } catch (error) {
        logger.warn({ symbol }, 'Failed to fetch earnings');
      }

      // Fetch analyst recommendations
      let ratings: any[] = [];
      try {
        const ratingsRes = await finnhub.get('/stock/recommendation', { params: { symbol } });
        ratings = (ratingsRes.data || []).slice(0, 4).map((item: any) => ({
          period: item.period,
          strongBuy: item.strongBuy,
          buy: item.buy,
          hold: item.hold,
          sell: item.sell,
          strongSell: item.strongSell,
        }));
      } catch (error) {
        logger.warn({ symbol }, 'Failed to fetch analyst ratings');
      }

      res.json({ success: true, data: { earnings, ratings } });
    } catch (error) {
      logger.error(error, 'Get events failed');
      res.status(500).json({ success: false, message: 'Failed to fetch events' });
    }
  },

  async getAssetDetail(req: Request, res: Response) {
    const userId = req.user!.userId;
    const { id } = req.params;

    try {
      // Get asset with ownership check
      const [result] = await db.select()
        .from(assets)
        .innerJoin(portfolios, eq(assets.portfolioId, portfolios.id))
        .where(and(eq(assets.id, id), eq(portfolios.userId, userId)));

      if (!result) {
        return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      const asset = result.assets;
      const portfolio = result.portfolios;

      // Get transactions
      const txns = await db.select({
        id: assets.id,
        assetId: assets.id,
      }).from(assets).where(eq(assets.id, id));

      // Simple query for transactions
      const { transactions: txnTable } = await import('../db/schema');
      const assetTransactions = await db.select()
        .from(txnTable)
        .where(eq(txnTable.assetId, id))
        .orderBy(txnTable.date);

      // Calculate investment summary
      const totalQuantity = asset.quantity;
      const avgBuyPrice = asset.avgBuyPrice;
      const currentPrice = asset.currentPrice;
      const totalInvested = totalQuantity * avgBuyPrice;
      const currentValue = totalQuantity * currentPrice;
      const pnl = currentValue - totalInvested;
      const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

      res.json({
        success: true,
        data: {
          asset: {
            id: asset.id,
            portfolioId: asset.portfolioId,
            portfolioName: portfolio.name,
            type: asset.type,
            symbol: asset.symbol,
            name: asset.name,
            quantity: asset.quantity,
            avgBuyPrice: asset.avgBuyPrice,
            currentPrice: asset.currentPrice,
            useLivePrice: asset.useLivePrice,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
          },
          summary: {
            totalInvested,
            currentValue,
            pnl,
            pnlPercent,
            totalQuantity,
            avgBuyPrice,
            currentPrice,
          },
          transactions: assetTransactions.map((t: any) => ({
            id: t.id,
            type: t.type,
            quantity: t.quantity,
            pricePerUnit: t.pricePerUnit,
            totalAmount: t.totalAmount,
            date: t.date,
            notes: t.notes,
          })),
        },
      });
    } catch (error) {
      logger.error(error, 'Get asset detail failed');
      res.status(500).json({ success: false, message: 'Failed to get asset detail' });
    }
  },
};

export default NewsService;

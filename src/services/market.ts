import { Request, Response } from 'express';
import axios from 'axios';
import { envConfig } from '../config/envConfig';
import logger from '../utils/logger';

const finnhub = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: { token: envConfig.FINNHUB_API_KEY },
});

const coingecko = axios.create({
  baseURL: envConfig.COINGECKO_BASE_URL,
});

const MarketService = {
  async getStockPrice(req: Request, res: Response) {
    try {
      const { symbol } = req.params;

      if (!envConfig.FINNHUB_API_KEY) {
        return res.status(503).json({ success: false, message: 'Finnhub API key not configured' });
      }

      const response = await finnhub.get('/quote', { params: { symbol: symbol.toUpperCase() } });
      const data = response.data;

      res.json({
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          high: data.h,
          low: data.l,
          open: data.o,
          previousClose: data.pc,
        },
      });
    } catch (error) {
      logger.error(error, 'Get stock price failed');
      res.status(500).json({ success: false, message: 'Failed to fetch stock price' });
    }
  },

  async getCryptoPrice(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const response = await coingecko.get('/simple/price', {
        params: {
          ids: id.toLowerCase(),
          vs_currencies: 'usd',
          include_24hr_change: true,
          include_24hr_vol: true,
          include_market_cap: true,
        },
      });

      const data = response.data[id.toLowerCase()];

      if (!data) {
        return res.status(404).json({ success: false, message: 'Cryptocurrency not found' });
      }

      res.json({
        success: true,
        data: {
          id: id.toLowerCase(),
          price: data.usd,
          change24h: data.usd_24h_change,
          volume24h: data.usd_24h_vol,
          marketCap: data.usd_market_cap,
        },
      });
    } catch (error) {
      logger.error(error, 'Get crypto price failed');
      res.status(500).json({ success: false, message: 'Failed to fetch crypto price' });
    }
  },

  async search(req: Request, res: Response) {
    try {
      const { q, type } = req.query;

      if (!q) {
        return res.status(400).json({ success: false, message: 'Search query required' });
      }

      if (type === 'crypto') {
        const response = await coingecko.get('/search', { params: { query: q } });
        const coins = response.data.coins.slice(0, 10).map((coin: any) => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          type: 'crypto',
        }));
        return res.json({ success: true, data: coins });
      }

      if (!envConfig.FINNHUB_API_KEY) {
        return res.status(503).json({ success: false, message: 'Finnhub API key not configured' });
      }

      const response = await finnhub.get('/search', { params: { q } });
      const results = response.data.result.slice(0, 10).map((item: any) => ({
        symbol: item.symbol,
        name: item.description,
        type: 'stock',
      }));

      res.json({ success: true, data: results });
    } catch (error) {
      logger.error(error, 'Market search failed');
      res.status(500).json({ success: false, message: 'Search failed' });
    }
  },
};

export default MarketService;

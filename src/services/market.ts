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

// Yahoo Finance (free, no API key needed, supports Indian stocks)
const yahooFinance = axios.create({
  baseURL: 'https://query1.finance.yahoo.com/v8/finance',
  headers: { 'User-Agent': 'Mozilla/5.0' },
});

const MarketService = {
  async getStockPrice(req: Request, res: Response) {
    const { symbol } = req.params;
    const rawSymbol = symbol.toUpperCase();

    // Try Finnhub first if API key is set
    if (envConfig.FINNHUB_API_KEY) {
      try {
        // Try multiple symbol formats for Finnhub
        const candidates = [rawSymbol];
        if (rawSymbol.endsWith('.NS')) {
          candidates.push(`NSE:${rawSymbol.replace('.NS', '')}`, rawSymbol.replace('.NS', ''));
        }
        if (rawSymbol.endsWith('.BO')) {
          candidates.push(`BSE:${rawSymbol.replace('.BO', '')}`, rawSymbol.replace('.BO', ''));
        }

        for (const sym of candidates) {
          try {
            const response = await finnhub.get('/quote', { params: { symbol: sym } });
            if (response.data?.c && response.data.c > 0) {
              return res.json({
                success: true,
                data: {
                  symbol: sym,
                  price: response.data.c,
                  change: response.data.d,
                  changePercent: response.data.dp,
                  high: response.data.h,
                  low: response.data.l,
                  open: response.data.o,
                  previousClose: response.data.pc,
                },
              });
            }
          } catch {
            // try next
          }
        }
      } catch (error) {
        logger.warn({ err: error, symbol: rawSymbol }, 'Finnhub fetch failed, trying Yahoo');
      }
    }

    // Fallback to Yahoo Finance
    try {
      const response = await yahooFinance.get(`/chart/${rawSymbol}`, {
        params: { interval: '1d', range: '1d' },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) {
        return res.status(404).json({ success: false, message: `Stock '${rawSymbol}' not found` });
      }

      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = price - prevClose;
      const changePercent = prevClose ? (change / prevClose) * 100 : 0;

      return res.json({
        success: true,
        data: {
          symbol: rawSymbol,
          price,
          change,
          changePercent,
          high: meta.regularMarketDayHigh || price,
          low: meta.regularMarketDayLow || price,
          open: meta.regularMarketOpen || price,
          previousClose: prevClose,
        },
      });
    } catch (error) {
      logger.error({ err: error, symbol: rawSymbol }, 'Yahoo Finance fetch failed');
      return res.status(500).json({ success: false, message: 'Failed to fetch stock price' });
    }
  },

  async getCryptoPrice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const query = id.toLowerCase();

      // CoinGecko expects full IDs like "bitcoin", not symbols like "btc"
      let coinId = query;
      let priceData = null;

      // Try direct lookup first
      try {
        const response = await coingecko.get('/simple/price', {
          params: {
            ids: query,
            vs_currencies: 'usd',
            include_24hr_change: true,
            include_24hr_vol: true,
            include_market_cap: true,
          },
        });
        priceData = response.data[query];
      } catch {
        // Direct lookup failed
      }

      // If direct lookup failed, search by symbol
      if (!priceData) {
        try {
          const searchRes = await coingecko.get('/search', { params: { query } });
          const coin = searchRes.data?.coins?.[0];
          if (coin) {
            coinId = coin.id;
            const response = await coingecko.get('/simple/price', {
              params: {
                ids: coin.id,
                vs_currencies: 'usd',
                include_24hr_change: true,
                include_24hr_vol: true,
                include_market_cap: true,
              },
            });
            priceData = response.data[coin.id];
          }
        } catch {
          // Search also failed
        }
      }

      if (!priceData) {
        return res.status(404).json({ success: false, message: 'Cryptocurrency not found' });
      }

      res.json({
        success: true,
        data: {
          id: coinId,
          price: priceData.usd,
          change24h: priceData.usd_24h_change,
          volume24h: priceData.usd_24h_vol,
          marketCap: priceData.usd_market_cap,
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

      // Stock search - try Yahoo Finance
      try {
        const response = await yahooFinance.get('/search', {
          params: { q, quotesCount: 10, newsCount: 0 },
        });
        const results = (response.data?.quotes || []).map((item: any) => ({
          symbol: item.symbol,
          name: item.shortname || item.longname || item.symbol,
          type: 'stock',
        }));
        return res.json({ success: true, data: results });
      } catch {
        // Yahoo search failed, try Finnhub
      }

      // Fallback to Finnhub search
      if (envConfig.FINNHUB_API_KEY) {
        const response = await finnhub.get('/search', { params: { q } });
        const results = response.data.result.slice(0, 10).map((item: any) => ({
          symbol: item.symbol,
          name: item.description,
          type: 'stock',
        }));
        return res.json({ success: true, data: results });
      }

      res.json({ success: true, data: [] });
    } catch (error) {
      logger.error(error, 'Market search failed');
      res.status(500).json({ success: false, message: 'Search failed' });
    }
  },
};

export default MarketService;

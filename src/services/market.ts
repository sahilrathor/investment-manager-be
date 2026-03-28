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

  async getPriceHistory(req: Request, res: Response) {
    const { symbol } = req.params;
    const range = (req.query.range as string) || '1m'; // 1w, 1m, 3m, 6m, 1y
    const rawSymbol = symbol.toUpperCase();

    try {
      // Map range to Yahoo Finance intervals
      const rangeMap: Record<string, { interval: string; range: string }> = {
        '1w': { interval: '1d', range: '5d' },
        '1m': { interval: '1d', range: '1mo' },
        '3m': { interval: '1d', range: '3mo' },
        '6m': { interval: '1wk', range: '6mo' },
        '1y': { interval: '1wk', range: '1y' },
      };

      const config = rangeMap[range] || rangeMap['1m'];

      const response = await yahooFinance.get(`/chart/${rawSymbol}`, {
        params: { interval: config.interval, range: config.range },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) {
        return res.status(404).json({ success: false, message: 'Price history not found' });
      }

      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      const closes = quotes.close || [];
      const highs = quotes.high || [];
      const lows = quotes.low || [];
      const volumes = quotes.volume || [];

      const history = timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        close: closes[i] || 0,
        high: highs[i] || 0,
        low: lows[i] || 0,
        volume: volumes[i] || 0,
      })).filter((h: any) => h.close > 0);

      res.json({ success: true, data: history });
    } catch (error) {
      logger.error({ err: error, symbol: rawSymbol }, 'Get price history failed');
      res.status(500).json({ success: false, message: 'Failed to fetch price history' });
    }
  },

  async getIndices(req: Request, res: Response) {
    const indices = [
      { symbol: '^NSEI', name: 'NIFTY 50', fullName: 'NSE Nifty 50' },
      { symbol: '^BSESN', name: 'SENSEX', fullName: 'BSE Sensex' },
      { symbol: '^NSEBANK', name: 'BANK NIFTY', fullName: 'Nifty Bank' },
      { symbol: '^CNXIT', name: 'NIFTY IT', fullName: 'Nifty IT' },
      { symbol: '^CNXPHARMA', name: 'NIFTY PHARMA', fullName: 'Nifty Pharma' },
      { symbol: '^CNXAUTO', name: 'NIFTY AUTO', fullName: 'Nifty Auto' },
      { symbol: '^CNXFMCG', name: 'NIFTY FMCG', fullName: 'Nifty FMCG' },
      { symbol: '^NSEMDCP50', name: 'NIFTY MIDCAP 50', fullName: 'Nifty Midcap 50' },
    ];

    try {
      const results = await Promise.allSettled(
        indices.map(async (index) => {
          const response = await yahooFinance.get(`/chart/${encodeURIComponent(index.symbol)}`, {
            params: { interval: '1d', range: '5d' },
          });
          const result = response.data?.chart?.result?.[0];
          if (!result) return null;

          const meta = result.meta;
          const price = meta.regularMarketPrice;
          const prevClose = meta.chartPreviousClose || meta.previousClose;
          const change = price - prevClose;
          const changePercent = prevClose ? (change / prevClose) * 100 : 0;

          // Get last 5 days for sparkline
          const quotes = result.indicators?.quote?.[0] || {};
          const closes = (quotes.close || []).filter((c: number) => c > 0);
          const sparkline = closes.slice(-5);

          return {
            symbol: index.symbol,
            name: index.name,
            fullName: index.fullName,
            price,
            change,
            changePercent,
            high: meta.regularMarketDayHigh || price,
            low: meta.regularMarketDayLow || price,
            sparkline,
          };
        })
      );

      const data = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      res.json({ success: true, data });
    } catch (error) {
      logger.error(error, 'Get indices failed');
      res.status(500).json({ success: false, message: 'Failed to fetch indices' });
    }
  },

  async getCompare(req: Request, res: Response) {
    const { symbol1, symbol2 } = req.query;
    const range = (req.query.range as string) || '1m';

    if (!symbol1 || !symbol2) {
      return res.status(400).json({ success: false, message: 'symbol1 and symbol2 are required' });
    }

    try {
      const rangeMap: Record<string, { interval: string; range: string }> = {
        '1w': { interval: '1d', range: '5d' },
        '1m': { interval: '1d', range: '1mo' },
        '3m': { interval: '1d', range: '3mo' },
        '6m': { interval: '1wk', range: '6mo' },
        '1y': { interval: '1wk', range: '1y' },
      };
      const config = rangeMap[range] || rangeMap['1m'];

      const [res1, res2] = await Promise.all([
        yahooFinance.get(`/chart/${encodeURIComponent(symbol1 as string)}`, { params: config }),
        yahooFinance.get(`/chart/${encodeURIComponent(symbol2 as string)}`, { params: config }),
      ]);

      const extractHistory = (response: any) => {
        const result = response.data?.chart?.result?.[0];
        if (!result) return [];
        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        return timestamps.map((ts: number, i: number) => ({
          date: new Date(ts * 1000).toISOString().split('T')[0],
          close: closes[i] || 0,
        })).filter((h: any) => h.close > 0);
      };

      const history1 = extractHistory(res1);
      const history2 = extractHistory(res2);

      // Normalize to percentage change from first value
      const normalize = (data: any[]) => {
        if (data.length === 0) return [];
        const base = data[0].close;
        return data.map(d => ({
          date: d.date,
          value: ((d.close - base) / base) * 100,
          price: d.close,
        }));
      };

      res.json({
        success: true,
        data: {
          asset1: { symbol: symbol1, history: normalize(history1) },
          asset2: { symbol: symbol2, history: normalize(history2) },
        },
      });
    } catch (error) {
      logger.error(error, 'Compare assets failed');
      res.status(500).json({ success: false, message: 'Failed to compare assets' });
    }
  },

  async getExchangeRate(req: Request, res: Response) {
    try {
      // Use free open.er-api.com for USD to INR rate
      const response = await axios.get('https://open.er-api.com/v6/latest/USD');
      const inrRate = response.data?.rates?.INR;

      if (!inrRate) {
        return res.status(500).json({ success: false, message: 'Could not fetch exchange rate' });
      }

      res.json({
        success: true,
        data: {
          from: 'USD',
          to: 'INR',
          rate: inrRate,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error(error, 'Get exchange rate failed');
      res.status(500).json({ success: false, message: 'Failed to fetch exchange rate' });
    }
  },
};

export default MarketService;

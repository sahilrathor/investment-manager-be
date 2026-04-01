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

// Yahoo Finance v10 for quoteSummary (fundamentals) - uses crumb auth
const yahooFinanceV10 = axios.create({
  baseURL: 'https://query2.finance.yahoo.com/v10/finance',
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
});

// Get Yahoo Finance crumb for authenticated requests
async function getYahooCrumb(): Promise<string | null> {
  try {
    const response = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    return response.data || null;
  } catch {
    return null;
  }
}

// NIFTY 500 curated list for screener (subset of popular symbols)
const NIFTY_STOCKS = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS',
  'LT.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'HCLTECH.NS', 'MARUTI.NS',
  'SUNPHARMA.NS', 'TITAN.NS', 'BAJFINANCE.NS', 'WIPRO.NS', 'ULTRACEMCO.NS',
  'ONGC.NS', 'NTPC.NS', 'TATAMOTORS.NS', 'POWERGRID.NS', 'M&M.NS',
  'JSWSTEEL.NS', 'TATASTEEL.NS', 'ADANIENT.NS', 'ADANIPORTS.NS', 'COALINDIA.NS',
  'BAJAJFINSV.NS', 'HDFCLIFE.NS', 'TECHM.NS', 'INDUSINDBK.NS', 'NESTLEIND.NS',
  'GRASIM.NS', 'CIPLA.NS', 'DRREDDY.NS', 'APOLLOHOSP.NS', 'DIVISLAB.NS',
  'EICHERMOT.NS', 'HEROMOTOCO.NS', 'TATACONSUM.NS', 'BPCL.NS', 'BRITANNIA.NS',
  'SBILIFE.NS', 'UPL.NS', 'BAJAJ-AUTO.NS', 'HINDALCO.NS', 'WIPRO.NS',
  'PIDILITIND.NS', 'DABUR.NS', 'GODREJCP.NS', 'MARICO.NS', 'COLPAL.NS',
  'BERGEPAINT.NS', 'HAVELLS.NS', 'AMBUJACEM.NS', 'ACC.NS', 'BANKBARODA.NS',
  'PNB.NS', 'CANBK.NS', 'IDFCFIRSTB.NS', 'FEDERALBNK.NS', 'BANDHANBNK.NS',
  'AUROPHARMA.NS', 'LUPIN.NS', 'BIOCON.NS', 'GLENMARK.NS', 'TORNTPHARM.NS',
  'MANAPPURAM.NS', 'MUTHOOTFIN.NS', 'LICHSGFIN.NS', 'CHOLAFIN.NS', 'PFC.NS',
  'RECLTD.NS', 'IRCTC.NS', 'ZOMATO.NS', 'NYKAA.NS', 'PAYTM.NS',
  'POLICYBZR.NS', 'DMART.NS', 'PIIND.NS', 'CLEAN.NS', 'LAURUSLABS.NS',
];

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
        '5y': { interval: '1mo', range: '5y' },
        '1d': { interval: '5m', range: '1d' },
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

          // Get closing prices from chart data (last entry may be null for current incomplete day)
          const quotes = result.indicators?.quote?.[0] || {};
          const rawCloses: number[] = quotes.close || [];
          const closes = rawCloses.filter((c: number) => c != null && c > 0);
          const sparkline = closes.slice(-5);

          // Previous close = last complete day's close from the chart data
          // NOT chartPreviousClose (which is the start of the range, not the actual previous day)
          const prevClose = closes.length >= 2 ? closes[closes.length - 1] : (closes[0] || meta.chartPreviousClose);
          const change = price - prevClose;
          const changePercent = prevClose ? (change / prevClose) * 100 : 0;

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

  async getStockFundamentals(req: Request, res: Response) {
    const { symbol } = req.params;
    const rawSymbol = symbol.toUpperCase();

    try {
      // Try with crumb authentication first
      const crumb = await getYahooCrumb();
      let result = null;

      if (crumb) {
        try {
          const response = await yahooFinanceV10.get(`/quoteSummary/${encodeURIComponent(rawSymbol)}`, {
            params: {
              modules: 'financialData,defaultKeyStatistics,summaryDetail,price',
              crumb,
            },
          });
          result = response.data?.quoteSummary?.result?.[0];
        } catch {
          // v10 failed, try fallback
        }
      }

      // Fallback: use chart endpoint meta data + defaultKeyStatistics from quote API
      if (!result) {
        try {
          const chartResponse = await yahooFinance.get(`/chart/${encodeURIComponent(rawSymbol)}`, {
            params: { interval: '1d', range: '1d' },
          });
          const chartResult = chartResponse.data?.chart?.result?.[0];
          if (chartResult) {
            const meta = chartResult.meta;
            // Extract what we can from the chart meta
            result = {
              financialData: {
                currentPrice: { raw: meta.regularMarketPrice },
                returnOnEquity: null,
                debtToEquity: null,
                revenueGrowth: null,
                earningsGrowth: null,
                currentRatio: null,
                quickRatio: null,
                operatingMargins: null,
                profitMargins: null,
                grossMargins: null,
                revenuePerShare: null,
                targetMeanPrice: null,
                recommendationKey: null,
                numberOfAnalystOpinions: null,
              },
              defaultKeyStatistics: {
                priceToBook: null,
                trailingEps: null,
                bookValue: null,
              },
              summaryDetail: {
                fiftyTwoWeekHigh: { raw: meta.fiftyTwoWeekHigh },
                fiftyTwoWeekLow: { raw: meta.fiftyTwoWeekLow },
                trailingPE: { raw: meta.peRatio || null },
                forwardPE: null,
                marketCap: { raw: meta.marketCap || null },
                dividendYield: { raw: meta.dividendYield || null },
              },
              price: {
                regularMarketPrice: { raw: meta.regularMarketPrice },
                marketCap: { raw: meta.marketCap || null },
                quoteType: null,
              },
            };
          }
        } catch {
          // chart also failed
        }
      }

      if (!result) {
        return res.status(404).json({ success: false, message: `Fundamentals for '${rawSymbol}' not found` });
      }

      const financialData = result.financialData || {};
      const stats = result.defaultKeyStatistics || {};
      const summary = result.summaryDetail || {};
      const priceData = result.price || {};

      const currentPrice = priceData.regularMarketPrice?.raw || financialData.currentPrice?.raw || 0;
      const fiftyTwoWeekHigh = summary.fiftyTwoWeekHigh?.raw || 0;
      const fiftyTwoWeekLow = summary.fiftyTwoWeekLow?.raw || 0;

      const distanceFromHigh = fiftyTwoWeekHigh > 0 ? ((fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh) * 100 : 0;
      const distanceFromLow = fiftyTwoWeekLow > 0 ? ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 : 0;

      res.json({
        success: true,
        data: {
          currentPrice,
          marketCap: summary.marketCap?.raw || priceData.marketCap?.raw || 0,
          fiftyTwoWeekHigh,
          fiftyTwoWeekLow,
          peRatio: summary.trailingPE?.raw || summary.peRatio?.raw || null,
          forwardPE: summary.forwardPE?.raw || null,
          pbRatio: stats.priceToBook?.raw || null,
          eps: stats.trailingEps?.raw || null,
          bookValue: stats.bookValue?.raw || null,
          roe: financialData.returnOnEquity?.raw || null,
          debtToEquity: financialData.debtToEquity?.raw || null,
          revenueGrowth: financialData.revenueGrowth?.raw || null,
          profitGrowth: financialData.earningsGrowth?.raw || null,
          dividendYield: summary.dividendYield?.raw || null,
          currentRatio: financialData.currentRatio?.raw || null,
          quickRatio: financialData.quickRatio?.raw || null,
          operatingMargins: financialData.operatingMargins?.raw || null,
          profitMargins: financialData.profitMargins?.raw || null,
          grossMargins: financialData.grossMargins?.raw || null,
          revenuePerShare: financialData.revenuePerShare?.raw || null,
          targetMeanPrice: financialData.targetMeanPrice?.raw || null,
          recommendationKey: financialData.recommendationKey || null,
          numberOfAnalystOpinions: financialData.numberOfAnalystOpinions?.raw || null,
          distanceFrom52WeekHigh: Math.round(distanceFromHigh * 100) / 100,
          distanceFrom52WeekLow: Math.round(distanceFromLow * 100) / 100,
          sector: priceData.quoteType || null,
        },
      });
    } catch (error) {
      logger.error({ err: error, symbol: rawSymbol }, 'Get stock fundamentals failed');
      res.status(500).json({ success: false, message: 'Failed to fetch stock fundamentals' });
    }
  },

  async getCryptoDetails(req: Request, res: Response) {
    const { id } = req.params;
    const query = id.toLowerCase();

    try {
      let coinId = query;

      // Search for coin ID if not direct
      try {
        const searchRes = await coingecko.get('/search', { params: { query } });
        const coin = searchRes.data?.coins?.[0];
        if (coin) coinId = coin.id;
      } catch {
        // use original query as ID
      }

      const response = await coingecko.get(`/coins/${encodeURIComponent(coinId)}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: true,
          community_data: false,
          developer_data: false,
        },
      });

      const coin = response.data;
      const marketData = coin.market_data || {};

      res.json({
        success: true,
        data: {
          id: coin.id,
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          image: coin.image?.large,
          currentPrice: marketData.current_price?.usd || 0,
          marketCap: marketData.market_cap?.usd || 0,
          marketCapRank: coin.market_cap_rank || null,
          totalVolume: marketData.total_volume?.usd || 0,
          change24h: marketData.price_change_percentage_24h || 0,
          change7d: marketData.price_change_percentage_7d || 0,
          change30d: marketData.price_change_percentage_30d || 0,
          change1y: marketData.price_change_percentage_1y || 0,
          ath: marketData.ath?.usd || 0,
          athDate: marketData.ath_date?.usd || null,
          atl: marketData.atl?.usd || 0,
          atlDate: marketData.atl_date?.usd || null,
          circulatingSupply: marketData.circulating_supply || 0,
          totalSupply: marketData.total_supply || 0,
          maxSupply: marketData.max_supply || 0,
          high24h: marketData.high_24h?.usd || 0,
          low24h: marketData.low_24h?.usd || 0,
        },
      });
    } catch (error) {
      logger.error({ err: error, id }, 'Get crypto details failed');
      res.status(500).json({ success: false, message: 'Failed to fetch crypto details' });
    }
  },

  async getScreener(req: Request, res: Response) {
    try {
      const {
        peMax, marketCapMin, marketCapMax,
        revenueGrowthMin, profitGrowthMin, roeMin,
        near52WeekLow, lowDebt,
        sortBy = 'marketCap', sortOrder = 'desc',
        page = '1', limit = '20',
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;

      // Batch fetch fundamentals for NIFTY stocks
      const fundamentals = await fetchBatchFundamentals(NIFTY_STOCKS);

      // Apply filters
      let filtered = fundamentals.filter((f) => {
        if (peMax && f.peRatio !== null && f.peRatio > parseFloat(peMax as string)) return false;
        if (marketCapMin && f.marketCap < parseFloat(marketCapMin as string)) return false;
        if (marketCapMax && f.marketCap > parseFloat(marketCapMax as string)) return false;
        if (revenueGrowthMin && (f.revenueGrowth === null || f.revenueGrowth < parseFloat(revenueGrowthMin as string))) return false;
        if (profitGrowthMin && (f.profitGrowth === null || f.profitGrowth < parseFloat(profitGrowthMin as string))) return false;
        if (roeMin && (f.roe === null || f.roe < parseFloat(roeMin as string))) return false;
        if (near52WeekLow === 'true' && f.distanceFrom52WeekLow > 15) return false;
        if (lowDebt === 'true' && (f.debtToEquity === null || f.debtToEquity > 0.5)) return false;
        return true;
      });

      // Sort
      const sortField = sortBy as string;
      const sortDir = sortOrder === 'asc' ? 1 : -1;
      filtered.sort((a: any, b: any) => {
        const aVal = a[sortField] ?? 0;
        const bVal = b[sortField] ?? 0;
        return (aVal - bVal) * sortDir;
      });

      // Paginate
      const total = filtered.length;
      const start = (pageNum - 1) * limitNum;
      const paged = filtered.slice(start, start + limitNum);

      res.json({
        success: true,
        data: {
          stocks: paged,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error(error, 'Screener failed');
      res.status(500).json({ success: false, message: 'Screener failed' });
    }
  },

  async getUndervalued(req: Request, res: Response) {
    try {
      const fundamentals = await fetchBatchFundamentals(NIFTY_STOCKS);

      // Score each stock
      const scored = fundamentals
        .filter((f) => f.peRatio !== null && f.peRatio > 0)
        .map((f) => {
          const peScore = Math.max(0, Math.min(25, (1 - f.peRatio! / 50) * 25));
          const growthScore = Math.max(0, Math.min(25, ((f.revenueGrowth || 0) + (f.profitGrowth || 0)) / 2 * 100));
          const debtScore = Math.max(0, Math.min(25, (1 - (f.debtToEquity || 0) / 3) * 25));
          const roeScore = Math.max(0, Math.min(25, (f.roe || 0) * 100));
          const lowScore = Math.max(0, Math.min(25, (1 - f.distanceFrom52WeekLow / 100) * 25));
          const totalScore = peScore + growthScore + debtScore + roeScore + lowScore;

          return {
            ...f,
            scores: {
              peScore: Math.round(peScore * 100) / 100,
              growthScore: Math.round(growthScore * 100) / 100,
              debtScore: Math.round(debtScore * 100) / 100,
              roeScore: Math.round(roeScore * 100) / 100,
              lowScore: Math.round(lowScore * 100) / 100,
              totalScore: Math.round(totalScore * 100) / 100,
            },
          };
        })
        .sort((a, b) => b.scores.totalScore - a.scores.totalScore)
        .slice(0, 20);

      res.json({ success: true, data: scored });
    } catch (error) {
      logger.error(error, 'Undervalued stocks failed');
      res.status(500).json({ success: false, message: 'Failed to compute undervalued stocks' });
    }
  },
};

// Helper: batch fetch fundamentals for multiple symbols
async function fetchBatchFundamentals(symbols: string[]): Promise<any[]> {
  const results: any[] = [];
  const batchSize = 5;
  const crumb = await getYahooCrumb();

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (symbol) => {
        try {
          let result = null;

          // Try v10 with crumb first
          if (crumb) {
            try {
              const response = await yahooFinanceV10.get(`/quoteSummary/${encodeURIComponent(symbol)}`, {
                params: {
                  modules: 'financialData,defaultKeyStatistics,summaryDetail,price',
                  crumb,
                },
                timeout: 10000,
              });
              result = response.data?.quoteSummary?.result?.[0];
            } catch {
              // fallback to chart
            }
          }

          // Fallback to chart endpoint
          if (!result) {
            try {
              const chartResponse = await yahooFinance.get(`/chart/${encodeURIComponent(symbol)}`, {
                params: { interval: '1d', range: '1d' },
                timeout: 10000,
              });
              const chartResult = chartResponse.data?.chart?.result?.[0];
              if (chartResult) {
                const meta = chartResult.meta;
                return {
                  symbol,
                  name: meta.shortName || meta.symbol || symbol,
                  currentPrice: meta.regularMarketPrice || 0,
                  marketCap: meta.marketCap || 0,
                  fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
                  fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
                  peRatio: meta.peRatio || null,
                  pbRatio: null,
                  eps: null,
                  bookValue: null,
                  roe: null,
                  debtToEquity: null,
                  revenueGrowth: null,
                  profitGrowth: null,
                  dividendYield: meta.dividendYield || null,
                  operatingMargins: null,
                  profitMargins: null,
                  distanceFrom52WeekHigh: meta.fiftyTwoWeekHigh > 0 ? Math.round(((meta.fiftyTwoWeekHigh - meta.regularMarketPrice) / meta.fiftyTwoWeekHigh) * 10000) / 100 : 0,
                  distanceFrom52WeekLow: meta.fiftyTwoWeekLow > 0 ? Math.round(((meta.regularMarketPrice - meta.fiftyTwoWeekLow) / meta.fiftyTwoWeekLow) * 10000) / 100 : 0,
                };
              }
            } catch {
              // chart also failed
            }
            return null;
          }

          const financialData = result.financialData || {};
          const stats = result.defaultKeyStatistics || {};
          const summary = result.summaryDetail || {};
          const priceData = result.price || {};

          const currentPrice = priceData.regularMarketPrice?.raw || financialData.currentPrice?.raw || 0;
          const fiftyTwoWeekHigh = summary.fiftyTwoWeekHigh?.raw || 0;
          const fiftyTwoWeekLow = summary.fiftyTwoWeekLow?.raw || 0;

          return {
            symbol,
            name: priceData.shortName || symbol,
            currentPrice,
            marketCap: summary.marketCap?.raw || priceData.marketCap?.raw || 0,
            fiftyTwoWeekHigh,
            fiftyTwoWeekLow,
            peRatio: summary.trailingPE?.raw || null,
            pbRatio: stats.priceToBook?.raw || null,
            eps: stats.trailingEps?.raw || null,
            bookValue: stats.bookValue?.raw || null,
            roe: financialData.returnOnEquity?.raw || null,
            debtToEquity: financialData.debtToEquity?.raw || null,
            revenueGrowth: financialData.revenueGrowth?.raw || null,
            profitGrowth: financialData.earningsGrowth?.raw || null,
            dividendYield: summary.dividendYield?.raw || null,
            operatingMargins: financialData.operatingMargins?.raw || null,
            profitMargins: financialData.profitMargins?.raw || null,
            distanceFrom52WeekHigh: fiftyTwoWeekHigh > 0 ? Math.round(((fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh) * 10000) / 100 : 0,
            distanceFrom52WeekLow: fiftyTwoWeekLow > 0 ? Math.round(((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 10000) / 100 : 0,
          };
        } catch {
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

export { fetchBatchFundamentals, NIFTY_STOCKS };
export default MarketService;

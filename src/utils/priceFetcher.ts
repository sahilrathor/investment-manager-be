import axios from 'axios';
import { envConfig } from '../config/envConfig';
import logger from './logger';

const finnhub = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: { token: envConfig.FINNHUB_API_KEY },
});

const coingecko = axios.create({
  baseURL: envConfig.COINGECKO_BASE_URL,
});

export async function fetchLivePrice(symbol: string, type: string): Promise<number | null> {
  try {
    if (type === 'stock' || type === 'mutual_fund') {
      if (!envConfig.FINNHUB_API_KEY) return null;
      const response = await finnhub.get('/quote', { params: { symbol } });
      return response.data?.c > 0 ? response.data.c : null;
    }

    if (type === 'crypto') {
      const response = await coingecko.get('/simple/price', {
        params: { ids: symbol.toLowerCase(), vs_currencies: 'usd' },
      });
      return response.data?.[symbol.toLowerCase()]?.usd ?? null;
    }
  } catch (error) {
    logger.warn({ symbol, type }, 'Failed to fetch live price');
  }
  return null;
}

export async function fetchLivePrices(
  assetList: { id: string; symbol: string; type: string; useLivePrice: boolean | null }[]
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  const liveAssets = assetList.filter((a) => a.useLivePrice);
  if (liveAssets.length === 0) return priceMap;

  const stocks = liveAssets.filter((a) => a.type === 'stock' || a.type === 'mutual_fund');
  const cryptos = liveAssets.filter((a) => a.type === 'crypto');

  // Fetch stock prices
  if (stocks.length > 0 && envConfig.FINNHUB_API_KEY) {
    for (const asset of stocks) {
      try {
        const response = await finnhub.get('/quote', { params: { symbol: asset.symbol } });
        if (response.data?.c > 0) {
          priceMap.set(asset.id, response.data.c);
        }
      } catch {
        logger.warn({ symbol: asset.symbol }, 'Failed to fetch stock price');
      }
    }
  }

  // Fetch crypto prices in batch
  if (cryptos.length > 0) {
    const cryptoIds = [...new Set(cryptos.map((a) => a.symbol.toLowerCase()))];
    try {
      const response = await coingecko.get('/simple/price', {
        params: { ids: cryptoIds.join(','), vs_currencies: 'usd' },
      });
      for (const asset of cryptos) {
        const price = response.data?.[asset.symbol.toLowerCase()]?.usd;
        if (price) {
          priceMap.set(asset.id, price);
        }
      }
    } catch {
      logger.warn('Failed to fetch crypto prices');
    }
  }

  return priceMap;
}

import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import MarketService from '../../services/market';

export class MarketController implements WebController {
  CONTEXT_PATH = '/api/market';

  ROUTES: WebRoute[] = [
    {
      url: '/stock/:symbol',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => MarketService.getStockPrice(req, res),
      authProvider,
    },
    {
      url: '/crypto/:id',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => MarketService.getCryptoPrice(req, res),
      authProvider,
    },
    {
      url: '/search',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => MarketService.search(req, res),
      authProvider,
    },
  ];
}

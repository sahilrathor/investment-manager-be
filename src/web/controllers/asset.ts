import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import AssetService from '../../services/asset';
import NewsService from '../../services/news';

export class AssetController implements WebController {
  CONTEXT_PATH = '/api';

  ROUTES: WebRoute[] = [
    {
      url: '/assets',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => AssetService.getAllForUser(req, res),
      authProvider,
    },
    {
      url: '/portfolios/:portfolioId/assets',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => AssetService.getAll(req, res),
      authProvider,
    },
    {
      url: '/portfolios/:portfolioId/assets',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => AssetService.create(req, res),
      authProvider,
    },
    // Specific routes must be before :id catch-all
    {
      url: '/assets/:id/detail',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => NewsService.getAssetDetail(req, res),
      authProvider,
    },
    {
      url: '/assets/:id/news',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => NewsService.getNews(req, res),
      authProvider,
    },
    {
      url: '/assets/:id/events',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => NewsService.getEvents(req, res),
      authProvider,
    },
    {
      url: '/assets/:id',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => AssetService.getById(req, res),
      authProvider,
    },
    {
      url: '/assets/:id',
      method: HttpMethods.PUT,
      service: (req: Request, res: Response) => AssetService.update(req, res),
      authProvider,
    },
    {
      url: '/assets/:id',
      method: HttpMethods.DELETE,
      service: (req: Request, res: Response) => AssetService.delete(req, res),
      authProvider,
    },
  ];
}

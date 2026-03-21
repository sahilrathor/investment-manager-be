import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import PortfolioService from '../../services/portfolio';

export class PortfolioController implements WebController {
  CONTEXT_PATH = '/api/portfolios';

  ROUTES: WebRoute[] = [
    {
      url: '/',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => PortfolioService.getAll(req, res),
      authProvider,
    },
    {
      url: '/:id',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => PortfolioService.getById(req, res),
      authProvider,
    },
    {
      url: '/',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => PortfolioService.create(req, res),
      authProvider,
    },
    {
      url: '/:id',
      method: HttpMethods.PUT,
      service: (req: Request, res: Response) => PortfolioService.update(req, res),
      authProvider,
    },
    {
      url: '/:id',
      method: HttpMethods.DELETE,
      service: (req: Request, res: Response) => PortfolioService.delete(req, res),
      authProvider,
    },
  ];
}

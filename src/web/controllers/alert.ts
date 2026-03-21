import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import AlertService from '../../services/alert';

export class AlertController implements WebController {
  CONTEXT_PATH = '/api/alerts';

  ROUTES: WebRoute[] = [
    {
      url: '/',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => AlertService.getAll(req, res),
      authProvider,
    },
    {
      url: '/',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => AlertService.create(req, res),
      authProvider,
    },
    {
      url: '/:id',
      method: HttpMethods.DELETE,
      service: (req: Request, res: Response) => AlertService.delete(req, res),
      authProvider,
    },
  ];
}

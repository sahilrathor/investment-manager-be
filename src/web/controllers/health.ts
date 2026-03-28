import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';

export class HealthController implements WebController {
  CONTEXT_PATH = '/api';

  ROUTES: WebRoute[] = [
    {
      url: '/health',
      method: HttpMethods.GET,
      service: (_req: Request, res: Response) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
      },
    },
  ];
}

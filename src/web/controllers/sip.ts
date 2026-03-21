import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import SipService from '../../services/sip';

export class SipController implements WebController {
  CONTEXT_PATH = '/api/sips';

  ROUTES: WebRoute[] = [
    {
      url: '/',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => SipService.getAll(req, res),
      authProvider,
    },
    {
      url: '/',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => SipService.create(req, res),
      authProvider,
    },
    {
      url: '/:id',
      method: HttpMethods.PUT,
      service: (req: Request, res: Response) => SipService.update(req, res),
      authProvider,
    },
    {
      url: '/:id',
      method: HttpMethods.DELETE,
      service: (req: Request, res: Response) => SipService.delete(req, res),
      authProvider,
    },
  ];
}

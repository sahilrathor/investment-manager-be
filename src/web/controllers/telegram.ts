import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import TelegramService from '../../services/telegram';

export class TelegramController implements WebController {
  CONTEXT_PATH = '/api/telegram';

  ROUTES: WebRoute[] = [
    {
      url: '/link',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => TelegramService.link(req, res),
      authProvider,
    },
    {
      url: '/unlink',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => TelegramService.unlink(req, res),
      authProvider,
    },
  ];
}

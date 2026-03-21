import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import AuthService from '../../services/auth';

export class AuthController implements WebController {
  CONTEXT_PATH = '/api/auth';

  ROUTES: WebRoute[] = [
    {
      url: '/register',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => AuthService.register(req, res),
    },
    {
      url: '/login',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => AuthService.login(req, res),
    },
    {
      url: '/refresh',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => AuthService.refresh(req, res),
    },
    {
      url: '/logout',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => AuthService.logout(req, res),
    },
    {
      url: '/me',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => AuthService.me(req, res),
      authProvider,
    },
  ];
}

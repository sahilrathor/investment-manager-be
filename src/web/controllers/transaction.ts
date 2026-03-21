import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import TransactionService from '../../services/transaction';

export class TransactionController implements WebController {
  CONTEXT_PATH = '/api';

  ROUTES: WebRoute[] = [
    {
      url: '/transactions',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => TransactionService.getAllForUser(req, res),
      authProvider,
    },
    {
      url: '/assets/:assetId/transactions',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => TransactionService.getAll(req, res),
      authProvider,
    },
    {
      url: '/assets/:assetId/transactions',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => TransactionService.create(req, res),
      authProvider,
    },
    {
      url: '/transactions/:id',
      method: HttpMethods.DELETE,
      service: (req: Request, res: Response) => TransactionService.delete(req, res),
      authProvider,
    },
  ];
}

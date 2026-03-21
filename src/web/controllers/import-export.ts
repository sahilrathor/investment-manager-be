import { Request, Response } from 'express';
import { WebController, WebRoute, HttpMethods } from '../../modules/express/types';
import { authProvider } from '../../middleware/auth';
import ImportExportService from '../../services/import-export';

export class ImportExportController implements WebController {
  CONTEXT_PATH = '/api';

  ROUTES: WebRoute[] = [
    {
      url: '/import/csv',
      method: HttpMethods.POST,
      service: (req: Request, res: Response) => ImportExportService.importCsv(req, res),
      authProvider,
    },
    {
      url: '/export/csv',
      method: HttpMethods.GET,
      service: (req: Request, res: Response) => ImportExportService.exportCsv(req, res),
      authProvider,
    },
  ];
}

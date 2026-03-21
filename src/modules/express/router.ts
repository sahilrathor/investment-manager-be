import { Router, Request, Response, NextFunction } from 'express';
import { WebController, WebRoute, HttpMethods } from './types';
import logger from '../../utils/logger';

export function registerRoutes(router: Router, controllers: WebController[]): void {
  controllers.forEach((controller) => {
    controller.ROUTES.forEach((route) => {
      const fullPath = controller.CONTEXT_PATH + route.url;

      const authLevelMiddleware = (req: Request, _res: Response, next: NextFunction) => {
        if (route.authLevel) {
          (req as any).authLevel = route.authLevel;
        }
        next();
      };

      const middlewares: any[] = [authLevelMiddleware];

      if (route.authProvider) {
        middlewares.push(route.authProvider);
      }

      const methodLower = route.method.toLowerCase() as Lowercase<HttpMethods>;

      if (typeof router[methodLower] === 'function') {
        (router as any)[methodLower](fullPath, ...middlewares, route.service);
        logger.info(`Registered: ${route.method} ${fullPath}`);
      }
    });
  });
}

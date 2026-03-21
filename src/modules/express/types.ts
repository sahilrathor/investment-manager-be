import { Request, Response, NextFunction } from 'express';

export enum HttpMethods {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export type RouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<any> | any;
export type AuthProvider = (req: Request, res: Response, next: NextFunction) => void;

export interface WebRoute {
  url: string;
  method: HttpMethods;
  service: RouteHandler;
  authProvider?: AuthProvider;
  authLevel?: string;
}

export interface WebController {
  CONTEXT_PATH: string;
  ROUTES: WebRoute[];
}

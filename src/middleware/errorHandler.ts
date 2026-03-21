import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction): void {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({ err, status }, message);

  res.status(status).json({
    success: false,
    message,
    code: err.code,
  });
}

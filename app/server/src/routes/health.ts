import { Router, Request, Response } from 'express';

/** Router for the health check endpoint. */
export const healthRouter = Router();

/** GET /health — Returns 200 with status 'ok'. No authentication required. */
healthRouter.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getCredentials } from '../services/secrets';

/**
 * Express middleware that validates the JWT session cookie on protected routes.
 * Extracts the token from the 'session' cookie, verifies it against the JWT secret
 * stored in Secrets Manager, and rejects requests with missing or invalid tokens.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.session;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const { jwtSecret } = await getCredentials();
    jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

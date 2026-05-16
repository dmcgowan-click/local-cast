import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getCredentials } from '../services/secrets';

/** Router handling authentication endpoints (login and logout). */
export const authRouter = Router();

const SESSION_EXPIRY_HOURS = 24;

/**
 * POST /login — Validates username and password against credentials stored in
 * Secrets Manager. On success, issues a signed JWT in an HttpOnly session cookie.
 */
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  try {
    const creds = await getCredentials();

    if (username !== creds.username || !await bcrypt.compare(password, creds.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ sub: username }, creds.jwtSecret, {
      expiresIn: `${SESSION_EXPIRY_HOURS}h`,
      algorithm: 'HS256',
    });

    res.cookie('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: SESSION_EXPIRY_HOURS * 60 * 60 * 1000,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /logout — Clears the session cookie to end the user's session. */
authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('session', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  });
  res.json({ ok: true });
});

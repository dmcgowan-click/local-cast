import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { browseMedia } from '../services/s3';
import { generateSignedUrl } from '../services/cloudfront';

/** Router handling media browsing and signed URL generation. All routes require authentication. */
export const mediaRouter = Router();

mediaRouter.use(authMiddleware);

/**
 * GET /browse — Lists folders and files under the given S3 prefix.
 * Filters to supported media formats and validates the prefix to prevent
 * access outside the Music/ and Video/ directories.
 */
mediaRouter.get('/browse', async (req: Request, res: Response): Promise<void> => {
  const prefix = (req.query.prefix as string) || '';

  try {
    const result = await browseMedia(prefix);
    res.json(result);
  } catch (err: any) {
    if (err.message?.includes('Access denied')) {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error('Browse error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /url — Generates a CloudFront signed URL for the requested S3 object key,
 * allowing the client to stream the media file directly.
 */
mediaRouter.get('/url', async (req: Request, res: Response): Promise<void> => {
  const key = req.query.key as string;
  if (!key) {
    res.status(400).json({ error: 'key parameter required' });
    return;
  }

  try {
    const url = await generateSignedUrl(key);
    res.json({ url });
  } catch (err) {
    console.error('Signed URL error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

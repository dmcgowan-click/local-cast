import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const client = new S3Client({});

const SUPPORTED_EXTENSIONS = ['.mp4', '.webm', '.mp3', '.flac', '.aac', '.ogg'];
const ALLOWED_PREFIXES = ['Music/', 'Video/'];

/** Response shape for the media browse endpoint. */
interface BrowseResult {
  folders: string[];
  files: { key: string; name: string; size: number; lastModified: string }[];
}

/** Returns true if the S3 object key ends with a supported media extension. */
function isSupportedFile(key: string): boolean {
  const lower = key.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Returns true if the prefix falls within the allowed top-level directories (Music/, Video/). */
function isAllowedPrefix(prefix: string): boolean {
  if (prefix === '') return true;
  return ALLOWED_PREFIXES.some((allowed) => prefix.startsWith(allowed));
}

/**
 * Lists folders and media files in the S3 media bucket under the given prefix.
 * Sanitises the prefix to prevent path traversal, restricts access to allowed
 * top-level directories, and filters results to supported file extensions.
 */
export async function browseMedia(prefix: string): Promise<BrowseResult> {
  const bucket = process.env.MEDIA_BUCKET;
  if (!bucket) throw new Error('MEDIA_BUCKET not set');

  // Validate prefix to prevent path traversal
  const decoded = decodeURIComponent(prefix);
  const normalised = decoded.replace(/\\/g, '/').replace(/\/\//g, '/');
  if (normalised.includes('..')) {
    throw new Error('Access denied: prefix outside allowed paths');
  }
  if (!isAllowedPrefix(normalised)) {
    // If no prefix, return the top-level allowed prefixes as folders
    if (normalised === '') {
      return { folders: ALLOWED_PREFIXES, files: [] };
    }
    throw new Error('Access denied: prefix outside allowed paths');
  }

  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalised,
      Delimiter: '/',
    }),
  );

  const folders = (result.CommonPrefixes || [])
    .map((cp) => cp.Prefix!)
    .filter(Boolean);

  const files = (result.Contents || [])
    .filter((obj) => obj.Key && isSupportedFile(obj.Key))
    .map((obj) => ({
      key: obj.Key!,
      name: obj.Key!.split('/').pop()!,
      size: obj.Size || 0,
      lastModified: obj.LastModified?.toISOString() || '',
    }));

  return { folders, files };
}

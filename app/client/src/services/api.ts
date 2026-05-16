/**
 * HTTP client for the Local Cast backend API. Provides typed wrappers
 * around authentication, media browsing, and signed URL endpoints.
 * All requests include a 15-second timeout and automatic redirect
 * to the login page on 401 responses.
 */
const API_TIMEOUT = 15_000;

/** Response shape returned by the media browse endpoint. */
interface BrowseResult {
  folders: string[];
  files: { key: string; name: string; size: number; lastModified: string }[];
}

/**
 * Generic fetch wrapper with timeout, credential forwarding, and
 * automatic 401 → login redirect.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal, credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

/** Authenticates the user and establishes a session cookie. */
export async function login(username: string, password: string): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

/** Ends the current session by clearing the session cookie. */
export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

/** Lists folders and media files under the given S3 prefix. */
export async function browse(prefix: string): Promise<BrowseResult> {
  const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
  return request<BrowseResult>(`/api/media/browse${params}`);
}

/** Requests a CloudFront signed URL for streaming the given media file. */
export async function getSignedUrl(key: string): Promise<string> {
  const data = await request<{ url: string }>(`/api/media/url?key=${encodeURIComponent(key)}`);
  return data.url;
}

/** Returns true if the user has a valid session by probing the browse endpoint. */
export async function checkSession(): Promise<boolean> {
  try {
    await browse('');
    return true;
  } catch {
    return false;
  }
}

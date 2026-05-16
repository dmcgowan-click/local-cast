const API_TIMEOUT = 15_000;

interface BrowseResult {
  folders: string[];
  files: { key: string; name: string; size: number; lastModified: string }[];
}

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

export async function login(username: string, password: string): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function browse(prefix: string): Promise<BrowseResult> {
  const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
  return request<BrowseResult>(`/api/media/browse${params}`);
}

export async function getSignedUrl(key: string): Promise<string> {
  const data = await request<{ url: string }>(`/api/media/url?key=${encodeURIComponent(key)}`);
  return data.url;
}

export async function checkSession(): Promise<boolean> {
  try {
    await browse('');
    return true;
  } catch {
    return false;
  }
}

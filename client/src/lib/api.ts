// client/src/lib/api.ts

// Get base path from Vite's import.meta.env.BASE_URL
const BASE_PATH = import.meta.env.BASE_URL || '/';

// Helper to construct full URL with base path
function getFullUrl(url: string): string {
  // If URL is already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Remove leading slash from url if present
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;

  // Ensure base path ends with slash
  const cleanBase = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;

  return `${cleanBase}${cleanUrl}`;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(getFullUrl(url), {
    method: "GET",
    credentials: "include", // send session cookie
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(getFullUrl(url), {
    method: "POST",
    credentials: "include", // send session cookie
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(getFullUrl(url), {
    method: "PUT",
    credentials: "include", // send session cookie
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(getFullUrl(url), {
    method: "DELETE",
    credentials: "include", // send session cookie
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}
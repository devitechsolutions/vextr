import { getApiUrl } from './api-config';

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(getApiUrl(url), {
    method: "GET",
    credentials: "include", // send session cookie
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(getApiUrl(url), {
    method: "POST",
    credentials: "include", // send session cookie
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(getApiUrl(url), {
    method: "PUT",
    credentials: "include", // send session cookie
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(getApiUrl(url), {
    method: "DELETE",
    credentials: "include", // send session cookie
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}
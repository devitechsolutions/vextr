import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getApiUrl } from './api-config';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  methodOrUrl: string,
  urlOrOptions?: string | RequestInit,
  bodyData?: any
): Promise<any> {
  let url: string;
  let options: RequestInit;

  // Support both calling patterns:
  // 1. apiRequest(url, options) - standard 2-param
  // 2. apiRequest(method, url, data) - convenience 3-param
  if (typeof urlOrOptions === "string") {
    // 3-param pattern: apiRequest("POST", "/api/endpoint", {data})
    url = getApiUrl(urlOrOptions);
    options = {
      method: methodOrUrl,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    };
  } else {
    // 2-param pattern: apiRequest("/api/endpoint", {method: "POST", body: ...})
    url = getApiUrl(methodOrUrl);
    options = urlOrOptions || {};
  }

  // Get token from localStorage for cross-domain auth
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  await throwIfResNotOk(res);

  // Don't try to parse JSON for empty responses (like DELETE 204)
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }

  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = getApiUrl(queryKey[0] as string);

    // Get token from localStorage for cross-domain auth
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

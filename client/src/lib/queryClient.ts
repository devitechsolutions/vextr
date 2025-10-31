import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
    url = getFullUrl(urlOrOptions);
    options = {
      method: methodOrUrl,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    };
  } else {
    // 2-param pattern: apiRequest("/api/endpoint", {method: "POST", body: ...})
    url = getFullUrl(methodOrUrl);
    options = urlOrOptions || {};
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
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
    const url = getFullUrl(queryKey[0] as string);
    const res = await fetch(url, {
      credentials: "include",
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
      queryFn: getQueryFn({ on401: "throw" }),
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

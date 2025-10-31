import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
    url = urlOrOptions;
    options = {
      method: methodOrUrl,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    };
  } else {
    // 2-param pattern: apiRequest("/api/endpoint", {method: "POST", body: ...})
    url = methodOrUrl;
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
    const res = await fetch(queryKey[0] as string, {
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

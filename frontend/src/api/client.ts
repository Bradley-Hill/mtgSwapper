export const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Prevents multiple simultaneous 401s from each triggering their own refresh call.
// The first 401 sets this to true and starts the refresh. Subsequent 401s wait for
// the same refresh promise to resolve before retrying.
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = fetch(`${API_BASE}/api/auth/refresh/`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => {
      if (!res.ok) {
        window.location.href = "/login";
        return false;
      }
      return true;
    })
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE}${path}`;

  const options: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  };

  let response = await fetch(url, options);

  if (response.status === 401) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      response = await fetch(url, options);
    } else {
      throw new ApiError(401, "Session expired");
    }
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body["detail"] === "string") {
        message = body["detail"];
      } else {
        const firstKey = Object.keys(body).find((k) => Array.isArray(body[k]));
        if (firstKey) {
          const errs = body[firstKey] as unknown[];
          if (typeof errs[0] === "string") message = errs[0];
        }
      }
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(response.status, message);
  }

  return response;
}

export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

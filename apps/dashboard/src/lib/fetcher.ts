import { ApiError } from "./api";

const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

/** SWR-compatible fetcher — attaches JWT and throws ApiError on non-2xx. */
export async function fetcher<T>(path: string): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("wlb_token") : null;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

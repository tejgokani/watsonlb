import { ApiError } from "./api";

const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("wlb_token") : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface AdminStats {
  users: {
    total: number;
    free: number;
    starter: number;
    pro: number;
    max: number;
    newToday: number;
  };
  projects: { total: number };
  backends: { total: number; active: number; circuitOpen: number };
  revenue: { weekTotal: number; allTime: number };
  alerts: { last24h: number };
  recentUsers: { id: string; email: string; plan: string; createdAt: string }[];
}

export interface AdminUser {
  id: string;
  email: string;
  plan: string;
  isAdmin: boolean;
  createdAt: string;
  projectCount: number;
  backendCount: number;
}

export interface AdminProject {
  id: string;
  name: string;
  proxySlug: string;
  shieldEnabled: boolean;
  createdAt: string;
  userId: string;
  ownerEmail: string;
  backendCount: number;
  activeBackends: number;
}

export const adminApi = {
  stats: () => adminFetch<AdminStats>("/ctrl/stats"),

  users: (page = 1, search = "") =>
    adminFetch<{ users: AdminUser[]; total: number; page: number; pages: number }>(
      `/ctrl/users?page=${page}&search=${encodeURIComponent(search)}`,
    ),

  updateUser: (id: string, data: { plan?: string; isAdmin?: boolean }) =>
    adminFetch<{ ok: boolean }>(`/ctrl/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteUser: (id: string) =>
    adminFetch<{ ok: boolean }>(`/ctrl/users/${id}`, { method: "DELETE" }),

  projects: (page = 1, userId?: string) =>
    adminFetch<{ projects: AdminProject[]; total: number; page: number; pages: number }>(
      `/ctrl/projects?page=${page}${userId ? `&userId=${userId}` : ""}`,
    ),

  deleteProject: (id: string) =>
    adminFetch<{ ok: boolean }>(`/ctrl/projects/${id}`, { method: "DELETE" }),
};

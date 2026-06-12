"use client";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("wlb_token");
}

export function setToken(token: string) {
  localStorage.setItem("wlb_token", token);
}

export function clearToken() {
  localStorage.removeItem("wlb_token");
}

export function isLoggedIn(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function getPayload(): { userId: string; email: string; plan: string; isAdmin?: boolean } | null {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]!));
  } catch {
    return null;
  }
}

export function isAdminLoggedIn(): boolean {
  if (!isLoggedIn()) return false;
  return getPayload()?.isAdmin === true;
}

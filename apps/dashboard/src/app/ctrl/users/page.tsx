"use client";
import { useEffect, useState, useCallback } from "react";
import { adminApi, type AdminUser } from "@/lib/adminApi";
import { getPayload } from "@/lib/auth";

const PLANS = ["free", "starter", "pro", "max"] as const;
const PLAN_COLOR: Record<string, string> = {
  free: "#64748b",
  starter: "#6366f1",
  pro: "#8b5cf6",
  max: "#a855f7",
};

export default function CtrlUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const myId = getPayload()?.userId;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.users(page, search);
      setUsers(res.users);
      setTotal(res.total);
      setPages(res.pages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  async function changePlan(id: string, plan: string) {
    setBusy(id);
    setActionError("");
    try {
      await adminApi.updateUser(id, { plan });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, plan } : u)));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleAdmin(id: string, isAdmin: boolean) {
    setBusy(id);
    setActionError("");
    try {
      await adminApi.updateUser(id, { isAdmin });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isAdmin } : u)));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This will remove all their projects and data.`)) return;
    setBusy(id);
    setActionError("");
    try {
      await adminApi.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setTotal((t) => t - 1);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            {total} total
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput); }}
          className="flex gap-2"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search email…"
            className="rounded-lg px-3 py-1.5 text-sm outline-none w-52"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: "#7c3aed", color: "#fff" }}
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ color: "var(--muted)" }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "#f87171", color: "#f87171" }}>
          {actionError}
        </div>
      )}

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
              {["Email", "Plan", "Projects", "Backends", "Admin", "Joined", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "#f87171" }}>
                  {error}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                  className={busy === u.id ? "opacity-50" : ""}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{u.email}</span>
                    {u.id === myId && (
                      <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      disabled={busy === u.id}
                      onChange={(e) => changePlan(u.id, e.target.value)}
                      className="rounded px-2 py-1 text-xs font-semibold outline-none cursor-pointer"
                      style={{
                        background: `${PLAN_COLOR[u.plan]}22`,
                        color: PLAN_COLOR[u.plan],
                        border: "none",
                      }}
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p} style={{ background: "var(--surface)", color: "var(--text)" }}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">{u.projectCount}</td>
                  <td className="px-4 py-3 text-center">{u.backendCount}</td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === u.id || u.id === myId}
                      onClick={() => toggleAdmin(u.id, !u.isAdmin)}
                      className="rounded px-2 py-1 text-xs font-semibold"
                      title={u.id === myId ? "Cannot change your own admin status" : undefined}
                      style={{
                        background: u.isAdmin ? "#7c3aed22" : "var(--bg)",
                        color: u.isAdmin ? "#a78bfa" : "var(--muted)",
                        border: "1px solid var(--border)",
                        opacity: u.id === myId ? 0.4 : 1,
                        cursor: u.id === myId ? "not-allowed" : "pointer",
                      }}
                    >
                      {u.isAdmin ? "Admin" : "User"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === u.id || u.id === myId}
                      onClick={() => deleteUser(u.id, u.email)}
                      className="text-xs px-2 py-1 rounded"
                      title={u.id === myId ? "Cannot delete your own account" : `Delete ${u.email}`}
                      style={{
                        color: u.id === myId ? "var(--muted)" : "#f87171",
                        opacity: u.id === myId ? 0.4 : 1,
                        cursor: u.id === myId ? "not-allowed" : "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            ←
          </button>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {page} / {pages}
          </span>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

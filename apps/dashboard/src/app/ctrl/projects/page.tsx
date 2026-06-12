"use client";
import { useEffect, useState, useCallback } from "react";
import { adminApi, type AdminProject } from "@/lib/adminApi";

export default function CtrlProjects() {
  const [projectList, setProjectList] = useState<AdminProject[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const proxyBase = process.env["NEXT_PUBLIC_PROXY_URL"] ?? "http://localhost:3001";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.projects(page);
      setProjectList(res.projects);
      setTotal(res.total);
      setPages(res.pages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function deleteProject(id: string, name: string) {
    if (!confirm(`Delete project "${name}"? This removes all its backends and health data.`)) return;
    setBusy(id);
    setActionError("");
    try {
      await adminApi.deleteProject(id);
      setProjectList((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => t - 1);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Projects</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
          {total} total across all users
        </p>
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
              {["Project", "Owner", "Proxy URL", "Backends", "Shield", "Created", ""].map((h) => (
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
            ) : projectList.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                  No projects
                </td>
              </tr>
            ) : (
              projectList.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                  className={busy === p.id ? "opacity-50" : ""}
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                    {p.ownerEmail}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs" style={{ color: "var(--muted)" }}>
                      /p/{p.proxySlug}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium">{p.activeBackends}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      /{p.backendCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.shieldEnabled ? (
                      <span className="text-xs font-semibold" style={{ color: "#6366f1" }}>On</span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>Off</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === p.id}
                      onClick={() => deleteProject(p.id, p.name)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: "#f87171" }}
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

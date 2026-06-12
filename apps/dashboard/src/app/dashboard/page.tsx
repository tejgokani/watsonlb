"use client";
import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { projects as projectsApi, type Project } from "@/lib/api";
import { isLoggedIn, getPayload, clearToken } from "@/lib/auth";
import { fetcher } from "@/lib/fetcher";
import { StatusBadge } from "@/components/StatusBadge";

export default function DashboardPage() {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/login");
  }, [router]);

  const payload = getPayload();

  // SWR: shows stale data instantly on revisit, refreshes in background every 15s
  const { data: projectList, isLoading, mutate } = useSWR<Project[]>(
    isLoggedIn() ? "/projects" : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );

  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      await projectsApi.create(newName.trim());
      setNewName("");
      await mutate(); // revalidate project list
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  const proxyBase = process.env["NEXT_PUBLIC_PROXY_URL"] ?? "http://localhost:3001";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">WatsonLB</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            {payload?.email} · <span className="uppercase text-xs font-semibold" style={{ color: "var(--accent)" }}>{payload?.plan}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/billing"
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--accent)" }}
          >
            Billing
          </Link>
          <button
            onClick={() => { clearToken(); router.push("/login"); }}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* New project */}
      <form onSubmit={createProject} className="mb-8 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name…"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {creating ? "Creating…" : "Create project"}
        </button>
      </form>
      {error && <p className="mb-4 text-sm" style={{ color: "var(--red)" }}>{error}</p>}

      {/* Project list */}
      {isLoading && !projectList ? (
        <p style={{ color: "var(--muted)" }} className="text-sm">Loading…</p>
      ) : !projectList || projectList.length === 0 ? (
        <div className="rounded-xl border py-16 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Create a project to get your proxy URL
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projectList.map((proj) => {
            const healthyCount = proj.backends.filter((b) => b.active && !b.circuitOpen).length;
            const totalCount = proj.backends.filter((b) => b.active).length;

            return (
              <Link
                key={proj.id}
                href={`/dashboard/${proj.id}`}
                className="block rounded-xl border p-4 transition-colors hover:border-indigo-500/50"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{proj.name}</p>
                    <code className="text-xs mt-1 block" style={{ color: "var(--muted)" }}>
                      {proxyBase}/p/{proj.proxySlug}
                    </code>
                  </div>
                  <StatusBadge
                    status={totalCount === 0 ? "unknown" : healthyCount === totalCount ? "up" : "down"}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                  <span>{totalCount} backend{totalCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{healthyCount}/{totalCount} healthy</span>
                  {proj.shieldEnabled && (
                    <>
                      <span>·</span>
                      <span style={{ color: "var(--accent)" }}>Shield on</span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

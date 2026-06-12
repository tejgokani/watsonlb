"use client";
import { use, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { projects as projectsApi, backendsApi, type Project, type HealthSummary } from "@/lib/api";
import { isLoggedIn, getPayload } from "@/lib/auth";
import { fetcher } from "@/lib/fetcher";
import { StatusBadge } from "@/components/StatusBadge";
import { UptimeSparkline } from "@/components/UptimeSparkline";

const PROVIDER_OPTIONS = ["render", "railway", "fly", "koyeb", "vercel", "glitch", "other"] as const;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [error, setError] = useState("");

  // Add backend form
  const [newUrl, setNewUrl] = useState("");
  const [newProvider, setNewProvider] = useState<string>("other");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Shield
  const [shieldToggling, setShieldToggling] = useState(false);

  const payload = getPayload();
  const proxyBase = process.env["NEXT_PUBLIC_PROXY_URL"] ?? "http://localhost:3001";

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/login");
  }, [router]);

  // SWR: instant stale data on revisit, revalidates in background every 20s
  const { data: project, mutate: mutateProject } = useSWR<Project>(
    isLoggedIn() ? `/projects/${id}` : null,
    fetcher,
    { refreshInterval: 20_000, revalidateOnFocus: true },
  );
  const { data: health, mutate: mutateHealth } = useSWR<HealthSummary>(
    isLoggedIn() ? `/projects/${id}/health?hours=24` : null,
    fetcher,
    { refreshInterval: 20_000 },
  );

  const loading = !project && !error;

  async function reload() {
    await Promise.all([mutateProject(), mutateHealth()]);
  }

  async function addBackend(e: FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await backendsApi.add(id, newUrl.trim(), newProvider);
      setNewUrl("");
      await reload();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add backend");
    } finally {
      setAdding(false);
    }
  }

  async function removeBackend(backendId: string) {
    if (!confirm("Remove this backend?")) return;
    await backendsApi.remove(id, backendId);
    await reload();
  }

  async function toggleShield() {
    if (!project) return;
    setShieldToggling(true);
    try {
      await projectsApi.updateShield(id, !project.shieldEnabled);
      await reload();
    } finally {
      setShieldToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--red)" }}>Project not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/dashboard" style={{ color: "var(--accent)" }}>Dashboard</Link>
        <span>/</span>
        <span>{project.name}</span>
      </div>

      {/* Project header */}
      <div className="mb-8 rounded-xl border p-6" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold">{project.name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <code className="text-xs rounded px-2 py-1" style={{ background: "var(--background)", color: "var(--accent)" }}>
                {proxyBase}/p/{project.proxySlug}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(`${proxyBase}/p/${project.proxySlug}`)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: "var(--background)", color: "var(--muted)", border: "1px solid var(--border)" }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Shield toggle */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">Shield</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {payload?.plan === "free"
                  ? "Upgrade to enable"
                  : project.shieldEnabled
                  ? "Active · ₹0.20/hr"
                  : "Off"}
              </p>
            </div>
            <button
              onClick={toggleShield}
              disabled={shieldToggling || payload?.plan === "free"}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40"
              style={{ background: project.shieldEnabled ? "var(--accent)" : "var(--border)" }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                style={{ transform: project.shieldEnabled ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm" style={{ color: "var(--red)" }}>{error}</p>}

      {/* Backends */}
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
        Backends
      </h2>

      <div className="space-y-3 mb-6">
        {project.backends.length === 0 ? (
          <div className="rounded-xl border py-10 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            No backends yet. Add one below.
          </div>
        ) : (
          project.backends.map((b) => {
            const h = health?.backends.find((hb) => hb.backendId === b.id);
            return (
              <div
                key={b.id}
                className="rounded-xl border p-4"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge
                        status={h?.currentStatus ?? "unknown"}
                        circuitOpen={b.circuitOpen}
                      />
                      {b.providerHint && (
                        <span className="text-xs rounded-full px-2 py-0.5 capitalize" style={{ background: "var(--background)", color: "var(--muted)" }}>
                          {b.providerHint}
                        </span>
                      )}
                      {h?.lastResponseMs && (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {h.lastResponseMs}ms
                        </span>
                      )}
                    </div>
                    <code className="text-xs mt-2 block truncate" style={{ color: "var(--text)" }}>
                      {b.url}
                    </code>
                  </div>
                  <button
                    onClick={() => removeBackend(b.id)}
                    className="text-xs px-2 py-1 rounded shrink-0"
                    style={{ color: "var(--red)", border: "1px solid #3f1111" }}
                  >
                    Remove
                  </button>
                </div>

                {/* Uptime row */}
                {h && (
                  <div className="mt-3 flex items-center gap-4 flex-wrap">
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      <span className="font-semibold" style={{ color: h.uptimePct > 99 ? "var(--green)" : "var(--yellow)" }}>
                        {h.uptimePct.toFixed(1)}%
                      </span>
                      {" "}uptime (24h)
                    </div>
                    {h.incidents.length > 0 && (
                      <div className="text-xs" style={{ color: "var(--red)" }}>
                        {h.incidents.length} incident{h.incidents.length !== 1 ? "s" : ""}
                        {h.longestOutageMinutes > 0 && `, longest ${h.longestOutageMinutes}m`}
                      </div>
                    )}
                    <UptimeSparkline timeline={h.timeline} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add backend form */}
      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3">Add backend</h3>
        <form onSubmit={addBackend} className="flex flex-wrap gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://myapp.render.com"
            type="url"
            required
            className="flex-1 min-w-48 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <select
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !newUrl.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        {addError && <p className="mt-2 text-sm" style={{ color: "var(--red)" }}>{addError}</p>}
      </div>

      {/* Plan hint */}
      <div className="mt-6 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <span className="uppercase font-semibold text-xs" style={{ color: "var(--accent)" }}>{payload?.plan}</span>
        {payload?.plan === "free" && " · Upgrade to Starter for daily health report emails · Pro for real-time alerts + Shield"}
        {payload?.plan === "starter" && " · Upgrade to Pro for real-time alerts and Shield always on"}
        {payload?.plan === "pro" && " — Real-time alerts and Shield are active"}
        {payload?.plan === "max" && " — All features active"}
      </div>
    </div>
  );
}

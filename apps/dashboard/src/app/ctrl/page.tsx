"use client";
import { useEffect, useState } from "react";
import { adminApi, type AdminStats } from "@/lib/adminApi";

function StatCard({
  label,
  value,
  sub,
  color = "#6366f1",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

const PLAN_COLOR: Record<string, string> = {
  free: "#64748b",
  starter: "#6366f1",
  pro: "#8b5cf6",
  max: "#a855f7",
};

export default function CtrlOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="p-8" style={{ color: "var(--muted)" }}>
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="p-8 text-sm" style={{ color: "#f87171" }}>
        {error}
      </div>
    );
  if (!stats) return null;

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-xl font-bold mb-6">Overview</h1>

      {/* Primary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Users"
          value={stats.users.total}
          sub={`+${stats.users.newToday} today`}
          color="#6366f1"
        />
        <StatCard label="Projects" value={stats.projects.total} color="#8b5cf6" />
        <StatCard
          label="Backends"
          value={stats.backends.active}
          sub={`${stats.backends.circuitOpen} circuit open`}
          color="#22c55e"
        />
        <StatCard
          label="Revenue (7d)"
          value={`₹${stats.revenue.weekTotal.toFixed(0)}`}
          color="#f59e0b"
        />
      </div>

      {/* Plan breakdown + alerts */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div
          className="rounded-xl border p-5 col-span-2 lg:col-span-2"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <p className="text-xs font-medium mb-4" style={{ color: "var(--muted)" }}>
            Users by plan
          </p>
          <div className="flex items-end gap-4">
            {(["free", "starter", "pro", "max"] as const).map((plan) => {
              const count = stats.users[plan];
              const pct = stats.users.total > 0 ? (count / stats.users.total) * 100 : 0;
              return (
                <div key={plan} className="flex-1 text-center">
                  <div className="relative h-20 flex items-end justify-center mb-2">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(4, pct)}%`,
                        background: PLAN_COLOR[plan],
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs capitalize" style={{ color: "var(--muted)" }}>
                    {plan}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <StatCard
          label="Alerts sent (24h)"
          value={stats.alerts.last24h}
          color="#f87171"
        />
      </div>

      {/* Recent signups */}
      <div
        className="rounded-xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm font-semibold">Recent signups</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Email", "Plan", "Joined"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-xs font-medium"
                  style={{ color: "var(--muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.recentUsers.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-5 py-3">{u.email}</td>
                <td className="px-5 py-3">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                    style={{ background: `${PLAN_COLOR[u.plan]}22`, color: PLAN_COLOR[u.plan] }}
                  >
                    {u.plan}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs" style={{ color: "var(--muted)" }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

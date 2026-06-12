"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { billingApi, type BillingSummary } from "@/lib/api";
import { isLoggedIn, getPayload } from "@/lib/auth";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    period: "forever",
    color: "#64748b",
    features: ["2 backends", "Load balancing + failover", "Dashboard access"],
    missing: ["Health reports", "Real-time alerts", "Shield"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "₹50",
    period: "/week",
    color: "#6366f1",
    features: ["2 backends", "Everything in Free", "Daily morning health email"],
    missing: ["Real-time alerts", "Shield included (add-on ₹0.20/hr)"],
    addon: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹75",
    period: "/week",
    color: "#8b5cf6",
    popular: true,
    features: [
      "4 backends",
      "Everything in Starter",
      "Real-time email alerts (<60s)",
      "Shield always on",
      "Health check every 60s",
    ],
    missing: [],
  },
  {
    id: "max",
    name: "Max",
    price: "₹100",
    period: "/week",
    color: "#a855f7",
    features: [
      "Unlimited backends",
      "Everything in Pro",
      "Database query routing",
      "Priority support",
    ],
    missing: [],
  },
];

export default function BillingPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const payload = getPayload();

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    billingApi.summary().then(setSummary).finally(() => setLoading(false));
  }, [router]);

  async function handleUpgrade(planId: string) {
    if (planId === "free") {
      if (!confirm("Downgrade to Free? You'll lose paid features immediately.")) return;
      setUpgrading("free");
      try {
        await billingApi.devUpgrade("free");
        setMessage("Downgraded to Free plan.");
        const updated = await billingApi.summary();
        setSummary(updated);
      } catch (e: unknown) {
        setMessage(e instanceof Error ? e.message : "Failed");
      } finally {
        setUpgrading(null);
      }
      return;
    }

    setUpgrading(planId);
    setMessage("");
    try {
      const res = await billingApi.subscribe(planId as "starter" | "pro" | "max");
      if (res.devMode) {
        setMessage(`✓ ${res.message}`);
        const updated = await billingApi.summary();
        setSummary(updated);
      } else if (res.paymentLink) {
        // Redirect to Razorpay payment page
        window.location.href = res.paymentLink;
      }
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  }

  const currentPlan = summary?.effectivePlan ?? payload?.plan ?? "free";
  const daysLeft = summary?.firstWeekEndsAt
    ? Math.max(0, Math.ceil((new Date(summary.firstWeekEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/dashboard" style={{ color: "var(--accent)" }}>Dashboard</Link>
        <span>/</span>
        <span>Billing</span>
      </div>

      <h1 className="text-xl font-bold mb-2">Plans & Billing</h1>

      {/* First week free banner */}
      {summary?.isFirstWeekFree && (
        <div className="mb-6 rounded-xl border px-4 py-3 text-sm font-medium" style={{ background: "#0f2a1a", borderColor: "#166534", color: "#4ade80" }}>
          🎉 First week free — all Pro features unlocked. {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining. No credit card required.
        </div>
      )}

      {/* Shield spend warning */}
      {summary?.suggestUpgrade && (
        <div className="mb-6 rounded-xl border px-4 py-3 text-sm" style={{ background: "#2a1a0a", borderColor: "#92400e", color: "#fbbf24" }}>
          Shield add-on has cost <strong>₹{summary.shieldSpendThisWeek.toFixed(2)}</strong> this week — approaching Pro price. Upgrade to Pro for Shield included.
        </div>
      )}

      {message && (
        <div className="mb-6 rounded-xl border px-4 py-3 text-sm" style={{ background: "#0f2a1a", borderColor: "#166534", color: "#4ade80" }}>
          {message}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : (
        <>
          {/* Plan cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isUpgrade = ["free","starter","pro","max"].indexOf(plan.id) > ["free","starter","pro","max"].indexOf(currentPlan);

              return (
                <div
                  key={plan.id}
                  className="rounded-xl border p-5 flex flex-col"
                  style={{
                    background: "var(--surface)",
                    borderColor: isCurrent ? plan.color : "var(--border)",
                    boxShadow: isCurrent ? `0 0 0 1px ${plan.color}` : "none",
                  }}
                >
                  {plan.popular && (
                    <span className="text-xs font-bold rounded-full px-2 py-0.5 mb-3 self-start" style={{ background: plan.color, color: "#fff" }}>
                      Most popular
                    </span>
                  )}
                  <p className="font-bold text-lg">{plan.name}</p>
                  <p className="mt-1 mb-4">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-sm" style={{ color: "var(--muted)" }}>{plan.period}</span>
                  </p>

                  <ul className="space-y-1.5 text-sm flex-1 mb-4">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span style={{ color: "#22c55e" }}>✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                    {plan.missing?.map((f) => (
                      <li key={f} className="flex items-start gap-2" style={{ color: "var(--muted)" }}>
                        <span>✗</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="text-center text-sm font-semibold py-2 rounded-lg" style={{ background: "var(--border)", color: "var(--muted)" }}>
                      Current plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={!!upgrading}
                      className="py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
                      style={{ background: isUpgrade ? plan.color : "var(--border)", color: isUpgrade ? "#fff" : "var(--muted)" }}
                    >
                      {upgrading === plan.id
                        ? "Processing…"
                        : isUpgrade
                        ? `Upgrade to ${plan.name}`
                        : `Downgrade to ${plan.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Last payment */}
          {summary?.lastPayment && (
            <div className="rounded-xl border p-4 text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <p className="font-semibold mb-1">Last payment</p>
              <p style={{ color: "var(--muted)" }}>
                ₹{summary.lastPayment.amount} · {summary.lastPayment.plan} plan ·{" "}
                {new Date(summary.lastPayment.createdAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* First week note */}
          {!summary?.isFirstWeekFree && (
            <p className="mt-4 text-xs text-center" style={{ color: "var(--muted)" }}>
              First week is free for all tiers. No credit card required to start. Payments via UPI, cards, and net banking.
            </p>
          )}
        </>
      )}
    </div>
  );
}

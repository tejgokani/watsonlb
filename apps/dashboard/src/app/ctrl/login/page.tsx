"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";
import { setToken, isAdminLoggedIn } from "@/lib/auth";
import { useEffect } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdminLoggedIn()) router.replace("/ctrl");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await auth.login(email, password);
      // decode to check isAdmin before storing
      const payload = JSON.parse(atob(token.split(".")[1]!));
      if (!payload.isAdmin) {
        setError("Access denied — not an admin account.");
        return;
      }
      setToken(token);
      router.push("/ctrl");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm px-4">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-lg font-bold">WatsonLB</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#7c3aed22", color: "#a78bfa" }}>
              Control Panel
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Admin access only</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border p-6 space-y-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--red, #f87171)" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "#7c3aed", color: "#fff" }}
          >
            {loading ? "Verifying…" : "Sign in to Control Panel"}
          </button>
        </form>
      </div>
    </div>
  );
}

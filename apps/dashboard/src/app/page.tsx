import Link from "next/link";

export default function LandingPage() {
  return (
    <div style={{ background: "#0a0a0f", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid #1e293b", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50, background: "rgba(10,10,15,0.85)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.01em", color: "#fff" }}>WatsonLB</span>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <a href="#features" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>Features</a>
            <a href="#pricing" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>Pricing</a>
            <Link href="/login" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>Login</Link>
            <Link
              href="/signup"
              style={{ background: "#6366f1", color: "#fff", fontSize: 14, fontWeight: 600, padding: "6px 16px", borderRadius: 8, textDecoration: "none" }}
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "6rem 1.5rem 5rem", textAlign: "center" }}>
        <div style={{
          display: "inline-block", marginBottom: "1.5rem", padding: "4px 14px",
          background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 999, fontSize: 13, color: "#a5b4fc"
        }}>
          Built for Indian developers
        </div>

        <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "1.5rem", color: "#fff" }}>
          Smart load balancer<br />
          <span style={{ color: "#6366f1" }}>for your backends</span>
        </h1>

        <p style={{ fontSize: "1.125rem", color: "#94a3b8", maxWidth: 560, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
          Route traffic across multiple backends with automatic failover, circuit breaking, and rate limiting. One proxy URL — all your servers stay online.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/signup"
            style={{ background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 15, padding: "12px 28px", borderRadius: 10, textDecoration: "none", display: "inline-block" }}
          >
            Get started free →
          </Link>
          <Link
            href="/login"
            style={{ background: "transparent", color: "#e2e8f0", fontWeight: 500, fontSize: 15, padding: "12px 28px", borderRadius: 10, textDecoration: "none", border: "1px solid #1e293b", display: "inline-block" }}
          >
            Sign in
          </Link>
        </div>

        {/* Stats */}
        <div style={{ marginTop: "4rem", display: "flex", justifyContent: "center", gap: "3rem", flexWrap: "wrap" }}>
          {[
            { label: "Uptime", value: "99.9%" },
            { label: "Avg latency added", value: "<2ms" },
            { label: "Backends per project", value: "Unlimited" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "5rem 1.5rem", borderTop: "1px solid #1e293b" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "2rem", fontWeight: 800, marginBottom: "0.75rem", color: "#fff", letterSpacing: "-0.02em" }}>
            Everything you need
          </h2>
          <p style={{ textAlign: "center", color: "#64748b", marginBottom: "3.5rem", fontSize: 15 }}>
            No DevOps degree required.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
            {[
              {
                icon: "⚡",
                title: "Automatic failover",
                desc: "When a backend goes down, WatsonLB instantly routes to the next healthy one. Your users notice nothing.",
              },
              {
                icon: "🔄",
                title: "Circuit breaker",
                desc: "Stop hammering a failing service. The circuit opens after configurable thresholds and resets automatically.",
              },
              {
                icon: "🛡️",
                title: "Request shield",
                desc: "Rate limit by IP, block bad user-agents, and only allow specific content types — all from your dashboard.",
              },
              {
                icon: "📊",
                title: "Morning digest",
                desc: "Get a WhatsApp or email summary every morning: uptime, top errors, backend health, latency trends.",
              },
              {
                icon: "💳",
                title: "Pay in INR",
                desc: "Razorpay-powered billing. No forex fees, no US credit card needed. UPI, net banking, and cards accepted.",
              },
              {
                icon: "🔐",
                title: "Google & GitHub OAuth",
                desc: "One-click sign-in. No passwords to remember. Your OAuth account is automatically linked to your existing profile.",
              },
            ].map((f) => (
              <div key={f.title} style={{
                background: "#0f172a", borderRadius: 12, padding: "1.5rem",
                border: "1px solid #1e293b", transition: "border-color 0.2s"
              }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>{f.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: "0.5rem", color: "#f1f5f9" }}>{f.title}</h3>
                <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: "5rem 1.5rem", borderTop: "1px solid #1e293b" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "2rem", fontWeight: 800, marginBottom: "0.75rem", color: "#fff", letterSpacing: "-0.02em" }}>
            Simple pricing
          </h2>
          <p style={{ textAlign: "center", color: "#64748b", marginBottom: "3.5rem", fontSize: 15 }}>
            First week free on every account — no card required.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
            {[
              {
                name: "Free",
                price: "₹0",
                period: "forever",
                highlight: false,
                features: ["1 project", "2 backends", "Basic round-robin", "Community support"],
              },
              {
                name: "Pro",
                price: "₹299",
                period: "per month",
                highlight: true,
                features: ["10 projects", "10 backends each", "Circuit breaker + shield", "Morning digest", "Priority support"],
              },
              {
                name: "Business",
                price: "₹999",
                period: "per month",
                highlight: false,
                features: ["Unlimited projects", "Unlimited backends", "All Pro features", "Custom slug", "SLA support"],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                style={{
                  background: plan.highlight ? "linear-gradient(135deg, #312e81, #1e1b4b)" : "#0f172a",
                  borderRadius: 14,
                  padding: "2rem",
                  border: plan.highlight ? "1px solid #4f46e5" : "1px solid #1e293b",
                  position: "relative",
                }}
              >
                {plan.highlight && (
                  <div style={{
                    position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                    background: "#6366f1", color: "#fff", fontSize: 11, fontWeight: 700,
                    padding: "3px 12px", borderRadius: 999, letterSpacing: "0.05em"
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", marginBottom: "0.5rem" }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "#fff" }}>{plan.price}</span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", marginBottom: "1.5rem" }}>{plan.period}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: 8 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ fontSize: 14, color: "#cbd5e1", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: "#6366f1", flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  style={{
                    display: "block", textAlign: "center", padding: "10px 0", borderRadius: 8,
                    background: plan.highlight ? "#6366f1" : "transparent",
                    border: plan.highlight ? "none" : "1px solid #334155",
                    color: plan.highlight ? "#fff" : "#94a3b8",
                    fontWeight: 600, fontSize: 14, textDecoration: "none"
                  }}
                >
                  {plan.name === "Free" ? "Start free" : "Get started"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "5rem 1.5rem", borderTop: "1px solid #1e293b", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "1rem", color: "#fff", letterSpacing: "-0.02em" }}>
            Start building in 2 minutes
          </h2>
          <p style={{ color: "#64748b", marginBottom: "2rem", fontSize: 15 }}>
            Sign up, add your backends, copy your proxy URL. That's it.
          </p>
          <Link
            href="/signup"
            style={{ background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 16, padding: "14px 36px", borderRadius: 10, textDecoration: "none", display: "inline-block" }}
          >
            Create free account →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #1e293b", padding: "2rem 1.5rem", textAlign: "center" }}>
        <p style={{ color: "#334155", fontSize: 13 }}>
          © 2025 WatsonLB · Made in India 🇮🇳
        </p>
      </footer>
    </div>
  );
}

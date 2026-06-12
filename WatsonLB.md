# WatsonLB

> A smart load balancer for developers who can't afford to pay five platforms to do one job.

---

## The Problem

First-time developers deploying their first production app face a frustrating reality. Free tiers on Railway, Render, and Fly.io are individually limited — apps spin down, databases cap out, and a single provider going down means your entire product goes down. The obvious solution is to spread across multiple providers, but then there's nothing tying them together intelligently. No failover. No health visibility. No unified entry point.

Existing load balancers (AWS ELB, Cloudflare LB, F5) are built for teams that already have infrastructure. They require domain transfers, DNS knowledge, and monthly minimums starting at $5–18. That's not a student deploying their first SaaS. That's not an indie hacker stitching together free tiers at 2am.

WatsonLB is the layer that sits on top of all of it — a smart proxy that treats your scattered free-tier backends as a single, resilient system.

---

## What WatsonLB Does

WatsonLB gives developers one URL that routes intelligently across multiple backend URLs on any hosting provider. You register your backends, get a proxy URL, and WatsonLB handles the rest — distributing traffic, detecting failures, retrying on healthy backends, and telling you every morning whether your app survived the night.

No DNS transfer required. No cloud account needed. Paste your backend URLs and go.

---

## Core Features

### Load Balancing
Round-robin and failover routing across registered backends. If one backend fails a health check, traffic is automatically rerouted to healthy ones. Supports backends on any provider — Render, Railway, Fly.io, Koyeb, Glitch, Vercel, or any public HTTPS URL.

### Health Monitoring
WatsonLB pings every registered backend on a configurable interval (default: every 5 minutes). Tracks uptime, response time, and failure streaks. All data visible in the dashboard.

### Morning Health Report (Email)
Every morning at 8am (user's timezone), WatsonLB sends a plain-language email summary:
- "Both backends healthy. No downtime in the last 24 hours."
- "Backend 2 (Railway) was unreachable for 40 minutes between 3:12am and 3:52am. Traffic was rerouted to Backend 1 automatically."

This is the core paid trigger for Starter-tier users. Most developers have no idea what happened to their app at 3am.

### Real-Time Alerts (Pro and Max)
Instant email notification within 60 seconds of a backend going down. Optional WhatsApp alert via WhatsApp Business API. Developers fix problems before users notice.

### Shield — Request Verifier
A middleware layer that runs on every request before forwarding to a backend:
- Validates request headers and origin
- Blocks malformed or obviously malicious requests
- Basic rate limiting to protect free-tier backends from spike traffic
- Logs all blocked requests with reason codes in the dashboard
- Circuit breaker: if a backend fails 3 consecutive requests, Shield stops routing to it and triggers an alert

Included in Pro and Max. Available as a pay-as-you-go add-on for Free and Starter users at ₹0.20/hour while active.

### Failsafe Mechanism
- Automatic retry on a different backend before returning an error to the user
- Custom fallback response (configurable maintenance page) if all backends are simultaneously down
- Circuit breaker prevents a struggling backend from receiving traffic while it recovers

### Database Query Routing (Max only)
Route database queries across multiple free-tier database providers. SELECT queries distributed round-robin across read replicas. INSERT/UPDATE/DELETE go to the designated primary. Supports connection strings from Neon, Supabase, Turso, and PlanetScale. No developer on the internet has productized this for the indie/student audience.

---

## Pricing

### Free
- 2 backends
- Load balancing and failover
- Dashboard access
- No health reports, no alerts, no Shield
- Free forever, no expiry, no credit card

### Starter — ₹50/week (~₹217/month)
- 2 backends
- Everything in Free
- Daily morning health report email
- Shield add-on available at ₹0.20/hour

### Pro — ₹75/week (~₹325/month)
- Up to 4 backends
- Everything in Starter
- Real-time alerts (email + WhatsApp)
- Shield included, always on
- Configurable health check interval (down to every 60 seconds)

### Max — ₹100/week (~₹433/month)
- 5+ backends, no upper limit
- Everything in Pro
- Database query routing
- Priority support

### Shield add-on (Free and Starter only)
₹0.20/hour while enabled. Automatically suggests upgrading to Pro when monthly Shield spend approaches Pro pricing. Hard daily cap configurable by user to prevent bill shock.

### First week
Free for all tiers regardless of backend count. No credit card required to start. Payment kicks in from week 2.

---

## Tech Stack

### Proxy Engine
**Fastify (Node.js)** — chosen over Express for raw throughput (3× faster on proxy workloads), native async support, and schema-based validation that pairs well with the request verifier middleware. Handles the core proxy, health check pings, Shield middleware, and retry logic.

### Backend Services
Same Fastify monorepo handles the user-facing API — auth, billing webhooks, dashboard data, alert triggers. Kept as a monorepo at launch to reduce infra complexity. Split into microservices only when load justifies it.

### Database
**Supabase (Postgres)** — stores user accounts, registered backends, health check logs, billing state, Shield event logs, and alert preferences. Free tier sufficient for launch. Row-level security for tenant isolation.

Schema overview:
```
users           → id, email, plan, timezone, created_at
projects        → id, user_id, proxy_url, name
backends        → id, project_id, url, provider_hint, active
health_logs     → id, backend_id, status, response_ms, checked_at
alerts          → id, project_id, type, channel, sent_at
shield_sessions → id, project_id, started_at, ended_at, requests_blocked
db_connections  → id, project_id, connection_string, role (primary/replica)
billing         → id, user_id, plan, week_start, amount, razorpay_ref
```

### Hosting
**Fly.io** — globally distributed edge nodes, Docker-based deploy, scales to zero on low traffic, $5–7/month at launch. Appropriate given WatsonLB's own pitch is multi-provider resilience — run WatsonLB itself on at least two Fly.io regions.

### Health Check Scheduler
**node-cron** running inside the same Fastify process at launch. Pings all active backends every 5 minutes, writes results to `health_logs`, triggers alerts if threshold crossed. Extracted to a dedicated worker process once user count grows.

### Email
**Resend.com** — 3,000 free emails/month, clean API, good deliverability. Used for morning health reports, real-time alerts, and billing receipts. React Email templates for consistent formatting.

### Payments
**Razorpay** — UPI, cards, net banking, all Indian payment methods. Weekly subscription via Razorpay's recurring billing. Webhook-driven plan activation and downgrade. Chosen specifically because the target audience is Indian developers.

### Alerts (WhatsApp)
**WhatsApp Business API via Meta** — ₹0.40–0.60 per message. Only triggered on real-time alert events (backend down), not health reports. Gated behind Pro and Max to keep costs predictable. Per-message cost factored into Pro/Max margin.

### Dashboard Frontend
**Next.js** deployed on Vercel free tier. Communicates with the Fastify API. Shows per-backend uptime, response times, Shield event log, and billing status.

---

## Architecture

```
User's App
    │
    ▼
WatsonLB Proxy URL  (e.g. https://proxy.watsonlb.dev/p/abc123)
    │
    ├── Shield Middleware (if enabled)
    │       ├── Header validation
    │       ├── Rate limiter
    │       └── Circuit breaker check
    │
    ├── Routing Engine
    │       ├── Round-robin selector
    │       ├── Health status filter (skip unhealthy backends)
    │       └── Retry handler (try next backend on failure)
    │
    ├── Backend 1 (Render)
    ├── Backend 2 (Railway)
    ├── Backend 3 (Fly.io)
    └── Backend N (any HTTPS URL)

Health Check Worker (node-cron, every 5 min)
    ├── Ping all active backends
    ├── Write to health_logs
    ├── Trigger real-time alert if backend down (Pro/Max)
    └── Aggregate daily report → email queue (Starter+)

Morning Report Job (node-cron, 8am per user timezone)
    └── Pull last 24h health_logs → format → Resend
```

---

## Go-To-Market

### Target User
Indian developers aged 18–26, building their first or second production project. Active on Twitter/X, Reddit (r/webdev, r/learnprogramming, r/developersIndia), and Discord communities. Already using Render or Railway. Aware of free-tier limitations. Not yet spending money on infrastructure.

### Launch Strategy

**Week 1–2: Build in public.** Post the idea on Twitter/X and r/developersIndia. "I'm building a load balancer for people who can't afford one. Here's the architecture." Document everything publicly. Collect waitlist emails.

**Week 3–4: Free tier launch.** Ship the free tier only. 2 backends, core load balancing, no health reports. Share proxy URL on every relevant subreddit and Discord. Let developers use it before asking for money.

**Month 2: Paid tier launch.** Activate Starter billing. Users already on the free tier who've been using it for weeks get a personal email — "You've had WatsonLB running for 18 days. Here's what happened to your backends while you slept. ₹50/week to get this report every morning."

**Ongoing: Community.** Start a Discord. Share uptime stats from anonymised user backends. Build the "first deploy" community that recommends WatsonLB to every new developer who asks about hosting.

### Acquisition Channels
- SEO: "free load balancer for Render Railway", "how to avoid single point of failure free hosting"
- Reddit: answer questions about free-tier hosting with genuine help, mention WatsonLB where appropriate
- Twitter/X: build-in-public content, uptime incident threads, relatable dev content
- Word of mouth: the free tier is the referral engine

---

## Competitive Moat

**Domain lock-in.** Once a developer's production URL points to WatsonLB, switching requires updating DNS or environment variables everywhere. Low churn by nature.

**Data moat.** WatsonLB sees uptime patterns across all free-tier providers. Over time, build a public "Free Tier Status Page" showing real aggregate reliability of Render, Railway, Fly.io etc. No one else has this data. It becomes a reason to visit the site and trust the product.

**Community moat.** First product to genuinely serve the "first production" audience in India with INR pricing and UPI support. Own that niche before anyone notices.

**Feature moat.** Database query routing across free-tier databases is a genuine first. No competitor — Cloudflare, AWS, or otherwise — targets this use case.

---

## Risks

**Cloudflare could build this.** They have Workers, Load Balancing, and D1. If they package it for indie developers for free, the load balancing core is commoditized. Counter: move fast, build community, own the INR/UPI/India niche, and the DB routing feature is not on their roadmap.

**Free-tier hosts can change behavior.** Render or Railway could change spin-down behavior, breaking health check assumptions. WatsonLB must stay protocol-level (pure HTTPS) and never depend on provider-specific behavior.

**WhatsApp API cost creep.** At scale, real-time WhatsApp alerts per backend-down event could become expensive. Cap alerts to max 3 per hour per project and batch events within a 60-second window before sending.

**Weekly billing friction.** Most payment infrastructure is monthly-first. Razorpay supports weekly recurring but it is less common. If weekly proves too much friction, migrate to monthly billing at ₹217/₹325/₹433 matching the weekly equivalents exactly.

**Single developer bus factor.** At launch, WatsonLB is one person. If the proxy goes down, every user's production URL goes down. Mitigate: deploy to minimum two Fly.io regions from day one, set up automated health checks on WatsonLB itself, and be transparent with users about infrastructure status via a public status page.

---

## Milestones

| Milestone | Target |
|---|---|
| Proxy engine + dashboard MVP | Week 3 |
| Free tier live, waitlist open | Week 4 |
| Health check worker + morning email | Week 6 |
| Razorpay billing integrated | Week 7 |
| Starter and Pro tiers live | Week 8 |
| Shield middleware shipped | Week 10 |
| Max tier + DB routing beta | Month 4 |
| 100 paying users | Month 6 |
| Public free-tier status page | Month 7 |

---

## Name

**WatsonLB** — Watson as in the assistant who keeps things running while you sleep. LB for load balancer. Memorable, slightly serious, slightly friendly. Domain: `watsonlb.dev`.

---

*Built for the developer who just wants their first app to stay alive.*

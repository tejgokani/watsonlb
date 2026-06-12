import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { config } from "../config.js";
import type { JWTPayload } from "@watsonlb/shared";

// In-memory state store — prevents CSRF, 10-min TTL
const oauthStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function generateState(): string {
  const state = nanoid(32);
  oauthStates.set(state, Date.now());
  return state;
}

function consumeState(state: string): boolean {
  const ts = oauthStates.get(state);
  if (!ts) return false;
  oauthStates.delete(state);
  return Date.now() - ts < STATE_TTL_MS;
}

function callbackUrl(provider: "google" | "github"): string {
  return `${config.PROXY_BASE_URL}/auth/${provider}/callback`;
}

async function findOrCreateOAuthUser(
  provider: "google" | "github",
  providerId: string,
  email: string,
  app: FastifyInstance,
): Promise<string> {
  const idField = provider === "google" ? users.googleId : users.githubId;

  // 1. Lookup by provider ID
  let user = await db.query.users.findFirst({ where: eq(idField, providerId) });

  // 2. Fall back to email — link existing account
  if (!user) {
    user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (user) {
      await db.update(users).set(
        provider === "google" ? { googleId: providerId } : { githubId: providerId },
      ).where(eq(users.id, user.id));
    }
  }

  // 3. Create new user
  if (!user) {
    const id = nanoid();
    await db.insert(users).values({
      id,
      email,
      passwordHash: null,
      timezone: "Asia/Kolkata",
      ...(provider === "google" ? { googleId: providerId } : { githubId: providerId }),
    });
    user = { id, email, plan: "free" as const, isAdmin: false, createdAt: new Date(), firstWeekFree: true, passwordHash: null, googleId: null, githubId: null, timezone: "Asia/Kolkata" };
  }

  if (!user) throw new Error("Unexpected: user is null after findOrCreate");

  return app.jwt.sign(
    { userId: user.id, email: user.email, plan: user.plan, isAdmin: user.isAdmin } satisfies JWTPayload,
    { expiresIn: "30d" },
  );
}

// ── Google ─────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// ── GitHub ─────────────────────────────────────────────────────────────────

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USERINFO_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

export async function oauthRoutes(app: FastifyInstance) {
  const hasGoogle = config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_ID !== "placeholder";
  const hasGithub = config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_ID !== "placeholder";

  // ── Google initiate ──────────────────────────────────────────────────────
  app.get("/auth/google", async (_req, reply) => {
    if (!hasGoogle) {
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=google_not_configured`);
    }
    const state = generateState();
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl("google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return reply.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  // ── Google callback ──────────────────────────────────────────────────────
  app.get("/auth/google/callback", async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error || !code) {
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=google_denied`);
    }
    if (!state || !consumeState(state)) {
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=invalid_state`);
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID!,
          client_secret: config.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackUrl("google"),
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokens.access_token) throw new Error("No access token");

      // Fetch user profile
      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await userRes.json() as { id: string; email: string };
      if (!profile.email) throw new Error("No email in profile");

      const jwt = await findOrCreateOAuthUser("google", profile.id, profile.email, app);
      return reply.redirect(`${config.DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(jwt)}`);
    } catch (err) {
      app.log.error(err, "Google OAuth error");
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=google_failed`);
    }
  });

  // ── GitHub initiate ──────────────────────────────────────────────────────
  app.get("/auth/github", async (_req, reply) => {
    if (!hasGithub) {
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=github_not_configured`);
    }
    const state = generateState();
    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID!,
      redirect_uri: callbackUrl("github"),
      scope: "user:email",
      state,
    });
    return reply.redirect(`${GITHUB_AUTH_URL}?${params}`);
  });

  // ── GitHub callback ──────────────────────────────────────────────────────
  app.get("/auth/github/callback", async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error || !code) {
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=github_denied`);
    }
    if (!state || !consumeState(state)) {
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=invalid_state`);
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          code,
          client_id: config.GITHUB_CLIENT_ID!,
          client_secret: config.GITHUB_CLIENT_SECRET!,
          redirect_uri: callbackUrl("github"),
        }),
      });
      const tokens = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokens.access_token) throw new Error("No access token");

      // Fetch user profile
      const [profileRes, emailsRes] = await Promise.all([
        fetch(GITHUB_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "WatsonLB" },
        }),
        fetch(GITHUB_EMAILS_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "WatsonLB" },
        }),
      ]);

      const profile = await profileRes.json() as { id: number; email?: string };
      const emails = await emailsRes.json() as { email: string; primary: boolean; verified: boolean }[];

      // Prefer primary verified email; fall back to profile email
      const email =
        emails.find((e) => e.primary && e.verified)?.email ??
        emails.find((e) => e.verified)?.email ??
        profile.email;

      if (!email) throw new Error("No verified email on GitHub account");

      const jwt = await findOrCreateOAuthUser("github", String(profile.id), email, app);
      return reply.redirect(`${config.DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(jwt)}`);
    } catch (err) {
      app.log.error(err, "GitHub OAuth error");
      return reply.redirect(`${config.DASHBOARD_URL}/login?error=github_failed`);
    }
  });
}

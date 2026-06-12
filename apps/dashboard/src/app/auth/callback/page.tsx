"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in is not set up yet.",
  github_not_configured: "GitHub sign-in is not set up yet.",
  google_denied: "Google sign-in was cancelled.",
  github_denied: "GitHub sign-in was cancelled.",
  google_failed: "Google sign-in failed. Please try again.",
  github_failed: "GitHub sign-in failed. Please try again.",
  invalid_state: "Authentication session expired. Please try again.",
};

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      setError(ERROR_MESSAGES[err] ?? "Sign-in failed. Please try again.");
      setTimeout(() => router.replace("/login"), 3000);
      return;
    }

    if (token) {
      setToken(token);
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router, params]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--background)" }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: "#f87171" }}>{error}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm" style={{ color: "var(--muted)" }}>Signing you in…</p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}

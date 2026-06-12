"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAdminLoggedIn, clearToken } from "@/lib/auth";

const NAV = [
  { href: "/ctrl", label: "Overview", icon: "◈" },
  { href: "/ctrl/users", label: "Users", icon: "◉" },
  { href: "/ctrl/projects", label: "Projects", icon: "◫" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/ctrl/login") return;
    if (!isAdminLoggedIn()) router.replace("/ctrl/login");
  }, [pathname, router]);

  if (pathname === "/ctrl/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Sidebar */}
      <aside
        className="w-52 shrink-0 flex flex-col border-r"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="font-bold text-sm">WatsonLB</p>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block"
            style={{ background: "#7c3aed22", color: "#a78bfa" }}
          >
            Control Panel
          </span>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon }) => {
            const active = href === "/ctrl" ? pathname === "/ctrl" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: active ? "#7c3aed22" : "transparent",
                  color: active ? "#a78bfa" : "var(--muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ color: "var(--muted)" }}
          >
            ← User Dashboard
          </Link>
          <button
            onClick={() => { clearToken(); router.push("/ctrl/login"); }}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ color: "var(--muted)" }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

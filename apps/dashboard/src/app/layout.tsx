import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatsonLB — Smart Load Balancer",
  description: "Keep your free-tier backends alive and resilient",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: "var(--background)", color: "var(--text)", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

"use client";

interface TimelinePoint {
  t: string;
  s: string;
  ms: number | null;
}

interface Props {
  timeline: TimelinePoint[];
  width?: number;
  height?: number;
}

export function UptimeSparkline({ timeline, width = 240, height = 32 }: Props) {
  if (timeline.length === 0) {
    return (
      <div className="flex items-center text-xs" style={{ color: "var(--muted)", width }}>
        No data yet
      </div>
    );
  }

  // Show last 96 points (8 hours at 5-min intervals)
  const pts = timeline.slice(0, 96).reverse();
  const barW = Math.floor(width / pts.length) - 1;

  return (
    <svg width={width} height={height} aria-label="Uptime sparkline">
      {pts.map((pt, i) => {
        const color = pt.s === "up" ? "#22c55e" : pt.s === "down" ? "#ef4444" : "#374151";
        const barHeight = pt.s === "up"
          ? Math.min(height, Math.max(4, pt.ms ? Math.round((pt.ms / 500) * height) : height / 2))
          : height;

        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={height - barHeight}
            width={barW}
            height={barHeight}
            rx={1}
            fill={color}
            opacity={0.85}
          >
            <title>{pt.s === "up" ? `${pt.ms ?? "?"}ms` : "Down"} — {new Date(pt.t).toLocaleTimeString()}</title>
          </rect>
        );
      })}
    </svg>
  );
}

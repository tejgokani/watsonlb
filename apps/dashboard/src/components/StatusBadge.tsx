interface Props {
  status: "up" | "down" | "unknown";
  circuitOpen?: boolean;
}

export function StatusBadge({ status, circuitOpen }: Props) {
  const effective = circuitOpen ? "down" : status;

  const styles: Record<string, { bg: string; color: string; label: string }> = {
    up:      { bg: "#052e16", color: "#22c55e", label: "Healthy" },
    down:    { bg: "#3f1111", color: "#ef4444", label: circuitOpen ? "Circuit open" : "Down" },
    unknown: { bg: "#1c1917", color: "#78716c", label: "Unknown" },
  };

  const s = styles[effective] ?? styles["unknown"]!;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: s.color, boxShadow: effective === "up" ? `0 0 6px ${s.color}` : "none" }}
      />
      {s.label}
    </span>
  );
}

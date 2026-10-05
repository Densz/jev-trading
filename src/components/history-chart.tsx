import type { AnalysisView } from "@/server/queries";
const color = { BUY: "var(--positive)", HOLD: "var(--neutral-signal)", SELL: "var(--negative)" };
export function HistoryChart({ analyses }: { analyses: AnalysisView[] }) {
  const points = [...analyses].reverse();
  if (!points.length)
    return (
      <p className="py-12 text-center text-xs text-muted-foreground">
        Your first saved analysis starts the history.
      </p>
    );
  const width = 760;
  const height = 215;
  const left = 40;
  const right = 730;
  const top = 18;
  const bottom = 174;
  const dates = points.map((p) => new Date(p.createdAt).getTime());
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const x = (i: number) =>
    max === min ? (left + right) / 2 : left + ((dates[i] - min) / (max - min)) * (right - left);
  const y = (value: number) => bottom - value * (bottom - top);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.confidence)}`).join(" ");
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Classification confidence over time. Each marker is labeled BUY, HOLD, or SELL in its tooltip; the full values appear in the history table."
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <text
              x={left - 9}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--muted-foreground)"
            >
              {tick * 100}%
            </text>
          </g>
        ))}
        <path d={line} stroke="var(--primary)" strokeWidth="2" fill="none" />
        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={x(i)}
              cy={y(p.confidence)}
              r="4.5"
              fill={color[p.decision]}
              stroke="var(--card)"
              strokeWidth="2"
            >
              <title>{`${new Date(p.createdAt).toISOString()} · ${p.decision} · ${Math.round(p.confidence * 100)}% confidence`}</title>
            </circle>
            {(i === 0 ||
              i === points.length - 1 ||
              (points.length > 5 && i === Math.floor(points.length / 2))) && (
              <text
                x={x(i)}
                y={bottom + 23}
                textAnchor={
                  i === 0 && max !== min
                    ? "start"
                    : i === points.length - 1 && max !== min
                      ? "end"
                      : "middle"
                }
                fontSize="9"
                fill="var(--muted-foreground)"
              >
                {new Date(p.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>Confidence in classification · UTC</span>
        <div className="flex gap-4">
          {(["BUY", "HOLD", "SELL"] as const).map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: color[d] }} />
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { truncateLabel } from "./index";

interface TruncatedTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  angle?: number;
  maxLen?: number;
  fontSize?: number;
  textAnchor?: "start" | "middle" | "end";
}

/**
 * 커스텀 Recharts XAxis/YAxis tick 컴포넌트.
 * 긴 텍스트를 말줄임 처리하고, hover 시 <title>로 원문을 보여줍니다.
 */
export function TruncatedTick({
  x = 0,
  y = 0,
  payload,
  angle = 0,
  maxLen = 10,
  fontSize = 11,
  textAnchor = "middle",
}: TruncatedTickProps) {
  const text = payload?.value ?? "";
  const truncated = truncateLabel(text, maxLen);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={angle ? 4 : 12}
        textAnchor={textAnchor}
        fill="hsl(var(--muted-foreground))"
        fontSize={fontSize}
        transform={angle ? `rotate(${angle})` : undefined}
      >
        <title>{text}</title>
        {truncated}
      </text>
    </g>
  );
}

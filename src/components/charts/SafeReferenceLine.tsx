"use client";

import { ReferenceLine } from "recharts";
import type { ComponentProps } from "react";

type ReferenceLineProps = ComponentProps<typeof ReferenceLine>;

/**
 * NaN/Infinity 안전한 ReferenceLine.
 * x 또는 y 값이 유한하지 않으면 렌더링하지 않아 차트 오류를 방지합니다.
 */
export function SafeReferenceLine(props: ReferenceLineProps) {
  const { x, y, ...rest } = props;

  // x, y 모두 undefined이면 렌더링 불가
  if (x === undefined && y === undefined) return null;

  // 숫자인 경우 isFinite 체크
  if (x !== undefined && typeof x === "number" && !isFinite(x)) return null;
  if (y !== undefined && typeof y === "number" && !isFinite(y)) return null;

  return <ReferenceLine x={x} y={y} {...rest} />;
}

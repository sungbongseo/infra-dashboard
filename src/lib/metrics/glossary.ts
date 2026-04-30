/**
 * Metrics Glossary — Single Source of Truth for all dashboard metric tooltips.
 *
 * Architecture:
 * - This file exposes the public types and the merged `GLOSSARY` object.
 * - Actual entries are split by category (glossary-overview.ts, glossary-profitability.ts, ...)
 *   so that dynamic imports can be used in the future to reduce initial bundle size.
 *
 * Usage:
 *   import { GLOSSARY, getMetricEntry } from "@/lib/metrics/glossary";
 *   const entry = getMetricEntry("price_increase_required");
 *
 * When adding a new metric, prefer to:
 *   1. Pick a stable snake_case id (e.g. "price_effect_4a", not "priceEffect").
 *   2. Add it to the matching category file (glossary-<category>.ts).
 *   3. The root GLOSSARY object merges automatically — no changes needed here.
 */

export type MetricCategory =
  | "overview"
  | "sales"
  | "profitability"
  | "receivables"
  | "orders"
  | "profiles";

/** 엑셀 보고서 번호 또는 계산 유형 출처 */
export type MetricSource =
  | "100" // 거래처별품목별손익
  | "200" // 품목별수익성분석(회계)
  | "300" // 조직별손익
  | "303" // 조직별거래처별손익
  | "304" // 본부거래처품목손익
  | "400" // 미수금aging
  | "500" // 원가
  | "501" // 품목별매출원가상세
  | "600" // 수주/판매
  | "700" // 수금/기타
  | "computed" // 파생 계산
  | "external"; // 외부 기준

export type MetricUnit = "currency" | "percent" | "number" | "days" | "ratio";

export type MetricTone = "info" | "warning" | "success" | "danger";

export interface MetricContextBranch {
  /** currentValue가 이 조건을 만족할 때 message를 추가 표시 */
  when: (v: number) => boolean;
  message: string;
  tone?: MetricTone;
}

export interface MetricEntry {
  /** snake_case 고유 id. MetricId 유니온의 멤버가 됨 */
  id: string;
  /** 한국어 지표명 (툴팁 제목) */
  name: string;
  category: MetricCategory;
  /** 테이블 헤더 등 짧은 라벨 */
  shortLabel?: string;
  unit?: MetricUnit;

  /**
   * 주 공식 — mono font 렌더. 줄바꿈 \n 허용, Σ·÷·× 등 수식 기호 허용.
   * beginner 레이어에는 노출되지 않음 (intermediate/expert에서만 표시).
   */
  formula: string;

  /**
   * Layer 1 (초보자) — 비유 1개 + 60자 이내 한 줄 요약.
   * 실생활 비유 권장 (커피·식당·빵집 등).
   * 수식 기호 금지, 영어 약어 금지.
   */
  beginner: string;

  /**
   * Layer 2 (중급) — 계산 해석 + 실무 판독 2~4줄.
   * 공식의 의미, 결과 부호의 해석, 임계값 등 포함.
   */
  intermediate: string;

  /**
   * Layer 3 (전문가) — 데이터 출처 + 가정 + 회계/통계 주의사항.
   */
  expert: string;

  /** 판정 가이드 — "≤5%: 흡수 | 5~10%: 협상 | >10%: 재설계" 형태 */
  benchmark?: string;

  /** 흔한 실수/오해 목록 */
  commonMistakes?: string[];

  /** 현재 값에 따라 자동 표시되는 맥락별 추가 문구 */
  contextBranches?: MetricContextBranch[];

  /** 관련 지표 id (cross-ref UI에서 링크로 렌더) */
  relatedIds?: string[];

  /** 데이터 출처 (엑셀 보고서 번호 등) */
  source?: MetricSource[];
  /** 출처 부연 설명 — "100보고서의 매출원가를 변동비로 가정" 등 */
  sourceNote?: string;
}

import { profitabilityMetrics } from "./glossary-profitability";
import { salesMetrics } from "./glossary-sales";
import { ordersMetrics } from "./glossary-orders";
import { portfolioMetrics } from "./glossary-portfolio";

/**
 * 전체 glossary. 카테고리 파일이 추가되면 이 객체에 spread로 병합.
 * Phase 2+에서 overview/receivables/profiles 파일이 생성되면 동일 패턴으로 확장.
 */
export const GLOSSARY = {
  ...profitabilityMetrics,
  ...salesMetrics,
  ...ordersMetrics,
  ...portfolioMetrics,  // BCG 매트릭스 13 엔트리 (Phase B-Improve-3)
} as const satisfies Record<string, MetricEntry>;

/** glossary 엔트리 키 유니온 — 타입 안전한 metricId 참조 */
export type MetricId = keyof typeof GLOSSARY;

/** 안전한 조회 (id 오타 감지) */
export function getMetricEntry(id: MetricId): MetricEntry {
  return GLOSSARY[id];
}

/** 옵셔널 조회 — 동적 id (Phase 4 자동 주입 시 fallback용) */
export function tryGetMetricEntry(id: string): MetricEntry | undefined {
  return (GLOSSARY as Record<string, MetricEntry>)[id];
}

/** 카테고리별 필터 — Glossary 페이지(Phase 3)에서 사용 */
export function listMetricsByCategory(category: MetricCategory): MetricEntry[] {
  return Object.values(GLOSSARY).filter((e) => e.category === category);
}

/** 맥락 분기 중 활성화되는 첫 번째 항목만 반환 (UI 단순화) */
export function resolveContextBranch(
  entry: MetricEntry,
  currentValue: number | undefined
): MetricContextBranch | undefined {
  if (currentValue === undefined || !entry.contextBranches) return undefined;
  return entry.contextBranches.find((b) => b.when(currentValue));
}

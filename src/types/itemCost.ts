import type { PlanActualDiff } from "./profitability";

/** 17개 독립 원가항목 (소계 제외) — 분석/합산에 사용 */
export const COST_CATEGORIES = [
  "원재료비", "부재료비", "상품매입", "노무비", "복리후생비",
  "소모품비", "수도광열비", "수선비", "연료비", "외주가공비",
  "운반비", "전력비", "지급수수료", "견본비",
  "제조고정노무비", "감가상각비", "기타경비",
] as const;
export type CostCategoryKey = typeof COST_CATEGORIES[number];

/** 소계 포함 19개 — 디스플레이 전용 (테이블 표시 등) */
export const COST_CATEGORIES_WITH_SUBTOTAL = [
  "원재료비", "부재료비", "상품매입", "노무비", "복리후생비",
  "소모품비", "수도광열비", "수선비", "연료비", "외주가공비",
  "운반비", "전력비", "지급수수료", "견본비",
  "제조변동비소계", "제조고정노무비", "감가상각비", "기타경비",
  "제조고정비소계",
] as const;
export type CostCategoryWithSubtotalKey = typeof COST_CATEGORIES_WITH_SUBTOTAL[number];

export const COST_BUCKETS = {
  재료비: ["원재료비", "부재료비"],
  상품매입비: ["상품매입"],
  인건비: ["노무비", "복리후생비", "제조고정노무비"],
  설비비: ["수도광열비", "전력비", "연료비", "감가상각비"],
  외주비: ["외주가공비"],
  물류비: ["운반비"],
  일반경비: ["소모품비", "수선비", "지급수수료", "견본비", "기타경비"],
} as const;
export type CostBucketKey = keyof typeof COST_BUCKETS;

export interface ItemCostDetailRecord {
  No: number;
  판매사업본부: string;
  영업조직팀: string;
  품목: string;
  매출수량: PlanActualDiff;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  // 18 cost categories
  원재료비: PlanActualDiff;
  부재료비: PlanActualDiff;
  상품매입: PlanActualDiff;
  노무비: PlanActualDiff;
  복리후생비: PlanActualDiff;
  소모품비: PlanActualDiff;
  수도광열비: PlanActualDiff;
  수선비: PlanActualDiff;
  연료비: PlanActualDiff;
  외주가공비: PlanActualDiff;
  운반비: PlanActualDiff;
  전력비: PlanActualDiff;
  지급수수료: PlanActualDiff;
  견본비: PlanActualDiff;
  제조변동비소계: PlanActualDiff;
  제조고정노무비: PlanActualDiff;
  감가상각비: PlanActualDiff;
  기타경비: PlanActualDiff;
  // Summary
  제조고정비소계: PlanActualDiff;
  매출총이익: PlanActualDiff;
  공헌이익: PlanActualDiff;
  공헌이익율: PlanActualDiff;
}

// ── NEW-1: 품목별 원가 차이 랭킹 ──
export interface ItemVarianceEntry {
  product: string;
  org: string;
  planCost: number;
  actualCost: number;
  variance: number;
  variancePct: number;
  marginDrift: number;
}

// ── NEW-2: 계획 달성율 4사분면 분석 ──
export interface PlanAchievementItem {
  product: string;
  org: string;
  salesAchievement: number;   // 매출 달성율 (%)
  profitAchievement: number;  // 공헌이익 달성율 (%)
  quadrant: 1 | 2 | 3 | 4;   // I=스타, II=효율, III=부진, IV=주의
  salesPlan: number;
  salesActual: number;
  profitPlan: number;
  profitActual: number;
}

// ── NEW-3: 품목별 단가 분석 ──
export interface UnitCostEntry {
  product: string;
  org: string;
  planUnitPrice: number;
  actualUnitPrice: number;
  planUnitCost: number;
  actualUnitCost: number;
  planUnitContrib: number;
  actualUnitContrib: number;
  priceDrift: number;
  costDrift: number;
  quantity: number;
}

// ── NEW-4: 원가 드라이버 ──
export interface CostDriverEntry {
  category: string;
  costShare: number;
  variancePct: number;
  impactScore: number;
  direction: "increase" | "decrease" | "neutral";
  plan: number;
  actual: number;
}

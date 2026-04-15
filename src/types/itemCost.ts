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
  month?: string; // YYYYMM
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

/** 200.품목별 수익성 분석(회계) — 품목 계층 + full P&L + 원가항목 */
export interface ItemProfitabilityRecord {
  판매사업부: string;
  영업조직팀: string;     // Excel 컬럼명: "영업조직(팀)"
  month?: string; // YYYYMM
  대분류: string;
  중분류: string;         // Excel: "중분류코드"
  소분류: string;         // Excel: "소분류코드"
  품목계정그룹: string;
  품목: string;           // e.g., "[CHMJ4229997] R-AA"
  기준단위: string;
  계정구분: string;       // P1-4: 제품/상품/원자재/부재료 (91%)
  // Revenue (실적 = actual, 계획 = plan)
  매출수량: number;
  매출액: number;
  매출단가: number;
  매출수량_계획?: number;
  매출액_계획?: number;
  // Cost
  표준매출원가: number;   // P1-4: 표준원가 기준선 (72%)
  실적매출원가: number;
  매출원가율: number;
  실적매출원가_계획?: number;
  // Profit
  매출총이익: number;
  매출총이익율: number;
  영업이익: number;
  직접판매운반비: number;
  판매관리비: number;
  영업이익율: number;
  매출총이익_계획?: number;
  영업이익_계획?: number;
  // 17 cost categories (실적 only, not PlanActualDiff)
  원재료비: number;
  부재료비: number;
  상품매입: number;
  노무비: number;
  복리후생비: number;
  소모품비: number;
  수도광열비: number;
  수선비: number;
  연료비: number;
  외주가공비: number;
  운반비: number;
  전력비: number;
  지급수수료: number;
  견본비: number;
  제조고정노무비: number;
  감가상각비: number;
  기타경비: number;
}

// ─── 표준원가 Book (공장별 품목 표준 단가표) ───
export interface StandardCostBookRecord {
  factory: string;          // 정규화: "양산" | "청산" | "울산" (파일명에서 추출)
  품목코드: string;          // 매칭 키, 예: "ASCJ1021056"
  품목명: string;
  품목계정그룹: string;      // 제품/상품/원재료/부재료/저장품/재공품
  기본단위: string;          // BAG/KG/CAN 등
  규격: string;
  표준원가: number;          // 원/단위
  유효시작: string;          // ISO YYYY-MM-DD
  유효종료: string;          // ISO YYYY-MM-DD (9999-12-31 = 무기한)
}

// ─── 실제 제조원가 (BOM 집계 후, 공장×품목 단위) ───
export interface ManufacturingCostRecord {
  factory: string;           // 정규화: "양산" | "청산" | "울산" | "용산"
  공장명원본: string;         // 예: "청산공장(옥천)"
  period: string;            // "2026-Q1" 고정
  생산품코드: string;
  생산품명: string;
  품목그룹: string;           // 제품/상품/재공품 등
  대분류: string;
  중분류: string;
  소분류: string;
  기준단위: string;
  생산입고수량: number;
  환산수량: number;
  // 합산된 14개 변동비
  원재료비: number;
  부재료비: number;
  상품매입: number;
  노무비: number;            // 제조 변동 노무비
  복리후생비: number;
  소모품비: number;
  수도광열비: number;
  수선비: number;
  연료비: number;
  외주가공비: number;
  운반비: number;
  전력비: number;
  지급수수료: number;
  견본비: number;
  // 합산된 3개 고정비
  고정노무비: number;
  감가상각비: number;
  기타경비: number;
  // 파생 필드
  totalVariableCost: number;  // 14개 변동비 합
  totalFixedCost: number;     // 3개 고정비 합
  actualUnitCost: number;     // (변동 + 고정) / 생산입고수량
  bomLineCount: number;       // 원본 BOM 행 수 (검증용)
}

// ─── 3-Way 비교 결과 (판매 vs 표준 vs 실제) ───
export interface ThreeWayComparisonRow {
  itemCode: string;
  itemName: string;
  factory: string;                       // 매출 발생 공장 (정규화)
  // 판매 (100 보고서 기간 합산)
  salesQty: number;
  salesAmount: number;
  avgSalesPrice: number;                 // salesAmount / salesQty
  // 표준원가
  standardCost: number | null;
  hasStandard: boolean;
  standardCostFactory: string | null;    // 표준원가 출처 공장 ("양산"/"청산"/fallback="*")
  // 실제 제조원가
  actualUnitCost: number | null;
  hasManufacturing: boolean;
  actualCostFactory: string | null;      // 제조원가 출처 공장
  // 3개 마진/변동률
  salesVsStdMarginPct: number | null;    // (판매 - 표준) / 판매 × 100
  salesVsActualMarginPct: number | null; // (판매 - 실제) / 판매 × 100
  stdVsActualVariancePct: number | null; // (실제 - 표준) / 표준 × 100
  // 재무 영향
  marginVarianceImpact: number;          // (실제 - 표준) × 판매수량 — 양수 = 손실, 음수 = 절감
  /** @deprecated salesImpact는 오해 소지가 있어 marginVarianceImpact로 변경됐습니다. 유지: 기존 UI 호환. */
  salesImpact: number;
  note: string;                          // 상태 라벨
}

// ─── 월별 판매단가 추세 ───
export interface MonthlyPriceTrend {
  month: string;              // YYYYMM
  itemCode: string;
  itemName: string;
  avgSalesPrice: number;
  salesQty: number;
  salesAmount: number;
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

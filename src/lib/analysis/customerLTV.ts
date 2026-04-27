/**
 * 거래처 LTV (Lifetime Value) 영향 모델 — 저가수주 의사결정에 거래처 평생 가치 반영.
 *
 * v2 WS5 (저가수주 상계 시뮬 Phase B 완성).
 *
 * @model
 *   저가수주 수용 시: 거래처 만족 ↑ → churn 확률 감소 → LTV 보전
 *   저가수주 거절 시: 거래처 불만 → churn 확률 증가 → LTV 손실
 *
 *   보전·손실 효과 = baseLTV × max(0, -priceChangePct/100) × (currentChurnRisk / 100)
 *   (수용/거절은 mirror image — 절댓값 동일, 부호 반대)
 *
 * @sources
 *   - clv.ts: 거래처별 LTV (calcClv)
 *   - churnPrediction.ts: 거래처별 이탈 점수 0-100 (predictChurn)
 *   - 100/매출리스트: 거래처 식별자 join 키
 */

import type { ClvResult } from "./clv";
import type { ChurnRiskCustomer } from "./churnPrediction";

// ─── Types ───────────────────────────────────────────────

export type LTVConfidence = "normal" | "low" | "insufficient";

export interface CustomerLTVImpact {
  customer: string;
  customerName: string;
  /** 거래처 평생 가치 (clv.ts 산출) */
  baseLTV: number;
  /** 이탈 점수 0-100 (churnPrediction.ts) */
  churnScore: number;
  /** "low"/"medium"/"high"/"critical" */
  riskLevel: ChurnRiskCustomer["riskLevel"] | null;
  /**
   * 수용 시 보전 효과 (양수). 거절 시 손실 효과 = -이 값
   * 의사결정자는 "이 LTV 보전 가치 vs 단기 이익 손실"을 비교
   */
  acceptImpact: number;
  rejectImpact: number;
  /** 사용된 churn 감소율 (수용 시) — UI 설명용 */
  churnReductionPct: number;
  confidence: LTVConfidence;
  notes: string[];
}

export interface CustomerLTVImpactInput {
  customer: string;
  priceChangePct: number;
  ltvMap: Map<string, ClvResult>;
  churnMap: Map<string, ChurnRiskCustomer>;
}

// ─── 상수 ────────────────────────────────────────────────

/** churn 감소율 클램핑 — 단가 인하 폭이 50% 넘어도 churn 감소는 50% 한계 */
export const MAX_CHURN_REDUCTION_PCT = 0.50;

/** churn 점수 정규화 분모 */
const CHURN_NORMALIZE = 100;

// ─── 메인 함수 ───────────────────────────────────────────

/**
 * 거래처별 저가수주 수용/거절 시 LTV 영향 계산.
 * @param input customer/priceChangePct/사전 산출된 LTV·Churn Map
 */
export function calcCustomerLTVImpact(input: CustomerLTVImpactInput): CustomerLTVImpact {
  const { customer, priceChangePct, ltvMap, churnMap } = input;

  const ltvEntry = ltvMap.get(customer);
  const churnEntry = churnMap.get(customer);

  const notes: string[] = [];
  const baseLTV = ltvEntry?.clv ?? 0;
  const customerName = ltvEntry?.customerName ?? churnEntry?.customerName ?? customer;
  const churnScore = churnEntry?.churnScore ?? 0;
  const riskLevel = churnEntry?.riskLevel ?? null;

  // 신뢰도 결정
  let confidence: LTVConfidence = "normal";
  if (!ltvEntry) {
    confidence = "insufficient";
    notes.push("LTV 데이터 없음");
  } else if (ltvEntry.confidence === "insufficient") {
    confidence = "insufficient";
    notes.push("LTV 데이터 기간 부족 (1년 미만)");
  } else if (ltvEntry.confidence === "low") {
    confidence = "low";
    notes.push("LTV 데이터 한계 (1-2년)");
  }
  if (!churnEntry) {
    confidence = confidence === "normal" ? "low" : confidence;
    notes.push("이탈 위험 추정 불가 (구매 이력 부재)");
  }

  // priceChangePct >= 0 (인상) → 수용 효과 0 (저가수주 가설 자체 미적용)
  // priceChangePct < 0 (인하)만 LTV 영향
  const reductionRaw = Math.max(0, -priceChangePct / 100);
  const churnReductionPct = Math.min(MAX_CHURN_REDUCTION_PCT, reductionRaw);
  if (reductionRaw > MAX_CHURN_REDUCTION_PCT) {
    notes.push(`인하 폭 50% 클램핑 적용 (입력: ${(reductionRaw * 100).toFixed(1)}%)`);
  }

  // 핵심 공식: 보전 효과 = baseLTV × churnReduction × normalizedChurn
  const acceptImpact = baseLTV > 0 && churnScore > 0
    ? baseLTV * churnReductionPct * (churnScore / CHURN_NORMALIZE)
    : 0;
  // mirror image, -0 회피
  const rejectImpact = acceptImpact === 0 ? 0 : -acceptImpact;

  return {
    customer, customerName, baseLTV, churnScore, riskLevel,
    acceptImpact, rejectImpact, churnReductionPct,
    confidence, notes,
  };
}

// ─── 보조 유틸: Map 빌더 ─────────────────────────────────

/**
 * `calcClv()` 결과에서 customer 키 Map 빌드. 호출 측 useMemo에서 일회 계산.
 */
export function buildLTVMap(clvResults: ClvResult[]): Map<string, ClvResult> {
  const m = new Map<string, ClvResult>();
  for (const r of clvResults) m.set(r.customer, r);
  return m;
}

/**
 * `predictChurn()` 결과에서 customer 키 Map 빌드.
 */
export function buildChurnMap(customers: ChurnRiskCustomer[]): Map<string, ChurnRiskCustomer> {
  const m = new Map<string, ChurnRiskCustomer>();
  for (const c of customers) m.set(c.customer, c);
  return m;
}

// ─── UI 헬퍼 ─────────────────────────────────────────────

/**
 * 신뢰도 한국어 라벨.
 */
export function ltvConfidenceLabel(c: LTVConfidence): string {
  switch (c) {
    case "normal": return "신뢰도 정상";
    case "low": return "신뢰도 낮음";
    case "insufficient": return "데이터 부족";
  }
}

/**
 * 위험 레벨 표기 (한국어).
 */
export function riskLevelLabel(r: ChurnRiskCustomer["riskLevel"] | null): string {
  if (!r) return "추정 불가";
  return { critical: "긴급", high: "높음", medium: "중간", low: "낮음" }[r];
}

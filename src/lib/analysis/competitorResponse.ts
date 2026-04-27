/**
 * 경쟁사 반응 게임이론 (Cournot 단순화).
 *
 * v2 WS6 (저가수주 상계 시뮬 Phase C 첫 번째).
 *
 * @model
 *   변수:
 *     P1 = 자사 새 판가
 *     P0 = 자사 기존 판가 (시장 평균 근사)
 *     R = 경쟁사 반응 강도 0~1
 *     M = 자사 시장 점유율 0~1
 *     PED = 가격 탄력성 (WS4 재사용)
 *
 *   시장 평균가:  Pmkt1 = R × P1 + (1-R) × P0
 *   시장 수요:    Qmkt1/Qmkt0 = (Pmkt1/P0)^PED
 *   점유율 보정:  M_new = M + (1-R) × |인하율| × η  (η=0.2)
 *   자사 수량:    내 수량 변화율 = (M_new × Qmkt1) / (M × Qmkt0)
 *
 * @design
 *   - WS4 priceElasticity 재사용 (applyPED, industryFallbackPED)
 *   - 3 프리셋: alone(0), partial(0.5), full(1.0) → 의사결정 anchor
 *   - 사용자 수동 점유율 입력 가능 (기본 0.30 — 인프라 B2B 추정)
 */

import { applyPED, industryFallbackPED } from "./priceElasticity";

// ─── Types ───────────────────────────────────────────────

export type CompetitorScenario = "alone" | "partial" | "full" | "custom";

export interface CompetitorScenarioPreset {
  id: CompetitorScenario;
  reactionPct: number;
  label: string;
  description: string;
}

export interface CompetitorResponseInput {
  /** 자사 기존 판가 */
  basePrice: number;
  /** 자사 새 판가 */
  newPrice: number;
  /** 자사 기존 수량 */
  baseQty: number;
  /** 경쟁사 반응 강도 0~1 */
  reactionPct: number;
  /** 자사 시장 점유율 0~1 (기본 0.30) */
  marketShare?: number;
  /** PED 계수 (WS4 결과 또는 폴백) */
  ped?: number;
  /** 점유율 반응 계수 η (기본 0.2) */
  shareSensitivity?: number;
}

export interface CompetitorResponseResult {
  reactionPct: number;
  marketShare: number;
  ped: number;
  /** 시장 평균가 (반응 후) */
  marketPrice: number;
  /** 시장 평균가 변동률 % */
  marketPricePct: number;
  /** 시장 수요 변동률 % */
  marketQtyPct: number;
  /** 자사 점유율 (보정 후) */
  newShare: number;
  /** 자사 새 수량 */
  newQty: number;
  /** 자사 수량 변동률 % */
  qtyChangePct: number;
  /** 자사 새 매출 */
  newRevenue: number;
  /** 자사 매출 변동률 % */
  revenueChangePct: number;
  notes: string[];
}

// ─── 상수 ────────────────────────────────────────────────

export const PRESETS: Record<Exclude<CompetitorScenario, "custom">, CompetitorScenarioPreset> = {
  alone:   { id: "alone",   reactionPct: 0.0, label: "단독 결정",  description: "경쟁사 무반응 가정" },
  partial: { id: "partial", reactionPct: 0.5, label: "50% 반응",   description: "경쟁사 절반이 가격 동반 인하" },
  full:    { id: "full",    reactionPct: 1.0, label: "100% 보복",  description: "전 경쟁사 동등 인하" },
};

export const DEFAULT_MARKET_SHARE = 0.30;
export const DEFAULT_SHARE_SENSITIVITY = 0.20;

// ─── 메인 함수 ───────────────────────────────────────────

export function calcCompetitorResponse(input: CompetitorResponseInput): CompetitorResponseResult {
  const notes: string[] = [];

  // 입력 정규화 + 클램핑
  const basePrice = Math.max(0, input.basePrice);
  const newPrice = Math.max(0, input.newPrice);
  const baseQty = Math.max(0, input.baseQty);
  const reactionPct = Math.max(0, Math.min(1, input.reactionPct));
  const marketShare = input.marketShare !== undefined
    ? Math.max(0, Math.min(1, input.marketShare))
    : DEFAULT_MARKET_SHARE;
  const ped = input.ped ?? industryFallbackPED("기타");
  if (input.ped === undefined) notes.push("PED 미지정 — 산업 폴백 -1.0 사용");
  const shareSensitivity = Math.max(0, input.shareSensitivity ?? DEFAULT_SHARE_SENSITIVITY);

  // 0/방어
  if (basePrice <= 0 || baseQty <= 0) {
    notes.push("기존 가격·수량 0 — 시뮬 불가");
    return {
      reactionPct, marketShare, ped,
      marketPrice: basePrice, marketPricePct: 0,
      marketQtyPct: 0,
      newShare: marketShare, newQty: baseQty,
      qtyChangePct: 0, newRevenue: newPrice * baseQty, revenueChangePct: 0,
      notes,
    };
  }

  // 1. 시장 평균가
  const marketPrice = reactionPct * newPrice + (1 - reactionPct) * basePrice;
  const marketPricePct = ((marketPrice / basePrice) - 1) * 100;

  // 2. 시장 수요 변화 (PED)
  const newMarketQty = applyPED(baseQty, marketPricePct, ped);  // baseQty를 시장 단위로 가정 (자사 점유율 기반 비례)
  const marketQtyPct = baseQty > 0 ? ((newMarketQty / baseQty) - 1) * 100 : 0;

  // 3. 자사 점유율 보정 — R=0이면 점유율 ↑, R=1이면 변화 없음
  const priceReductionPct = Math.max(0, ((basePrice - newPrice) / basePrice));  // 인하 비율
  const shareGain = (1 - reactionPct) * priceReductionPct * shareSensitivity;
  const newShare = Math.min(1, marketShare + shareGain);

  // 4. 자사 수량 = 시장 수요 × (자사 점유율 / 기존 점유율)
  const shareRatio = marketShare > 0 ? newShare / marketShare : 1;
  const newQty = newMarketQty * shareRatio;
  const qtyChangePct = baseQty > 0 ? ((newQty / baseQty) - 1) * 100 : 0;

  // 5. 매출
  const baseRevenue = basePrice * baseQty;
  const newRevenue = newPrice * newQty;
  const revenueChangePct = baseRevenue > 0 ? ((newRevenue / baseRevenue) - 1) * 100 : 0;

  if (reactionPct === 0) notes.push("단독 결정: 경쟁사 보복 없음 가정");
  else if (reactionPct === 1) notes.push("100% 보복: 시장 평균가 = 자사 새 판가");
  else notes.push(`경쟁사 반응 ${(reactionPct * 100).toFixed(0)}%`);

  return {
    reactionPct, marketShare, ped,
    marketPrice, marketPricePct,
    marketQtyPct,
    newShare, newQty,
    qtyChangePct, newRevenue, revenueChangePct,
    notes,
  };
}

// ─── 3 프리셋 일괄 계산 ──────────────────────────────────

export interface PresetComparison {
  alone: CompetitorResponseResult;
  partial: CompetitorResponseResult;
  full: CompetitorResponseResult;
}

/**
 * 3 시나리오 동시 계산 — UI 비교 표시용.
 */
export function calcAllPresets(
  baseInput: Omit<CompetitorResponseInput, "reactionPct">,
): PresetComparison {
  return {
    alone:   calcCompetitorResponse({ ...baseInput, reactionPct: PRESETS.alone.reactionPct }),
    partial: calcCompetitorResponse({ ...baseInput, reactionPct: PRESETS.partial.reactionPct }),
    full:    calcCompetitorResponse({ ...baseInput, reactionPct: PRESETS.full.reactionPct }),
  };
}

// ─── UI 헬퍼 ─────────────────────────────────────────────

export function presetLabel(scenario: CompetitorScenario): string {
  if (scenario === "custom") return "사용자 정의";
  return PRESETS[scenario].label;
}

export function reactionIntensityLabel(pct: number): string {
  if (pct <= 0.05) return "단독 결정";
  if (pct >= 0.95) return "100% 보복";
  if (pct >= 0.66) return "강한 반응";
  if (pct >= 0.33) return "중간 반응";
  return "약한 반응";
}

/**
 * 가격 탄력성 (Price Elasticity of Demand, PED) 모델.
 *
 * v2 WS4 (저가수주 상계 시뮬 Phase B).
 *
 * @model  log Q = α + β log P + ε   →  PED = β
 * @range  일반 -3 ~ 0 (판가↑ → 수량↓)
 * @fallback 품목 회귀 실패 → 대분류 평균 PED → 업계 벤치마크
 *
 * @datasources
 *   200 보고서 (ItemProfitabilityRecord) — 품목×월별 단가·수량 (14개월 실측)
 *   v2.1 실측: 880개 품목 중 273개 6M+ 관측, 23개 14M 완전 관측
 */

import type { ItemProfitabilityRecord } from "@/types/itemCost";

// ─── 타입 ────────────────────────────────────────────────

export interface PEDObservation {
  month: string;
  unitPrice: number;
  quantity: number;
}

export type PEDConfidence = "high" | "medium" | "low" | "insufficient";

export type PEDMethod = "direct" | "category_fallback" | "industry_fallback";

export interface PEDResult {
  itemCode: string;
  category?: string;           // 대분류 (폴백 추적)
  ped: number;                 // 탄력성 계수 (이상치 트림 후)
  pedRaw: number;              // 회귀 원값 (트림 전)
  wasTrimmed: boolean;         // 이상치 트림 발생
  r2: number;                  // 결정계수
  stderr: number;              // PED 표준오차 (MC 연동용)
  samples: number;             // 관측 개월 수
  confidence: PEDConfidence;
  method: PEDMethod;
  notes: string[];             // 진단 메시지
}

// ─── 상수 ────────────────────────────────────────────────

/** 이상 PED 트림 경계 */
export const PED_TRIM = { min: -5, max: 0 } as const;

/** 대분류별 업계 벤치마크 (인프라 B2B 제조업) — 폴백 3단계 */
export const INDUSTRY_BENCHMARK: Record<string, number> = {
  "아스팔트": -0.8,
  "방수시트": -0.8,
  "AP기타": -1.0,
  "부재료": -1.5,
  "상품": -1.5,
  "공사자재": -1.2,
  "기타": -1.0, // default
};

/** 신뢰도 판정 임계값 */
export const CONFIDENCE_THRESHOLDS = {
  samplesHigh: 12,
  samplesMedium: 6,
  samplesLow: 3,
  r2High: 0.5,
  r2Medium: 0.25,
} as const;

// ─── 회귀 엔진 ───────────────────────────────────────────

/**
 * OLS 로그-선형 회귀: log Q = α + β log P + ε
 * @returns { beta, alpha, r2, stderr } | null (샘플 부족·변동 0)
 */
export function olsLogLinear(
  observations: PEDObservation[],
): { beta: number; alpha: number; r2: number; stderr: number } | null {
  const clean = observations.filter(o => o.unitPrice > 0 && o.quantity > 0 && Number.isFinite(o.unitPrice) && Number.isFinite(o.quantity));
  const n = clean.length;
  if (n < 3) return null;

  const logP = clean.map(o => Math.log(o.unitPrice));
  const logQ = clean.map(o => Math.log(o.quantity));
  const meanP = logP.reduce((a, b) => a + b, 0) / n;
  const meanQ = logQ.reduce((a, b) => a + b, 0) / n;

  // β = Σ(Pi-P̄)(Qi-Q̄) / Σ(Pi-P̄)²
  let num = 0;
  let denP = 0;
  for (let i = 0; i < n; i++) {
    num += (logP[i] - meanP) * (logQ[i] - meanQ);
    denP += (logP[i] - meanP) ** 2;
  }
  if (denP < 1e-10) return null; // 판가 변동 0 → 회귀 불가

  const beta = num / denP;
  const alpha = meanQ - beta * meanP;

  // R²
  let ssr = 0; // Σ(Qi - Q̂i)²
  let sst = 0; // Σ(Qi - Q̄)²
  for (let i = 0; i < n; i++) {
    const predQ = alpha + beta * logP[i];
    ssr += (logQ[i] - predQ) ** 2;
    sst += (logQ[i] - meanQ) ** 2;
  }
  const r2 = sst > 1e-10 ? Math.max(0, 1 - ssr / sst) : 0;

  // β 표준오차: stderr(β) = sqrt(MSE / Σ(logP - meanP)²)
  const mse = n > 2 ? ssr / (n - 2) : ssr / Math.max(1, n);
  const stderr = Math.sqrt(Math.max(0, mse / denP));

  return { beta, alpha, r2, stderr };
}

// ─── 이상치 트림 ──────────────────────────────────────────

export function trimOutlierPED(ped: number): { trimmed: number; wasOutlier: boolean; reason: string } {
  if (!Number.isFinite(ped)) return { trimmed: PED_TRIM.max, wasOutlier: true, reason: "NaN/Infinity" };
  if (ped > PED_TRIM.max) return { trimmed: PED_TRIM.max, wasOutlier: true, reason: "역상관 (PED > 0)" };
  if (ped < PED_TRIM.min) return { trimmed: PED_TRIM.min, wasOutlier: true, reason: `극단 탄력성 (PED < ${PED_TRIM.min})` };
  return { trimmed: ped, wasOutlier: false, reason: "" };
}

// ─── 신뢰도 판정 ──────────────────────────────────────────

function decideConfidence(samples: number, r2: number): PEDConfidence {
  if (samples < CONFIDENCE_THRESHOLDS.samplesLow) return "insufficient";
  if (samples >= CONFIDENCE_THRESHOLDS.samplesHigh && r2 >= CONFIDENCE_THRESHOLDS.r2High) return "high";
  if (samples >= CONFIDENCE_THRESHOLDS.samplesMedium && r2 >= CONFIDENCE_THRESHOLDS.r2Medium) return "medium";
  return "low";
}

// ─── 업계 벤치마크 (대분류 기반) ──────────────────────────

export function industryFallbackPED(category: string): number {
  for (const key of Object.keys(INDUSTRY_BENCHMARK)) {
    if (category.includes(key)) return INDUSTRY_BENCHMARK[key];
  }
  return INDUSTRY_BENCHMARK["기타"];
}

// ─── 200 보고서에서 PED 관측 추출 ─────────────────────────

/**
 * 200 보고서에서 특정 품목의 월별 단가·수량 쌍 추출.
 * 보고서 필드: 매출단가_실적, 매출수량_실적, month
 */
export function extractItemObservations(
  records: ItemProfitabilityRecord[],
  itemCode: string,
): PEDObservation[] {
  const obs: PEDObservation[] = [];
  for (const r of records) {
    if (r.품목 !== itemCode) continue;
    const unitPrice = r.매출단가;
    const quantity = r.매출수량;
    if (typeof unitPrice !== "number" || typeof quantity !== "number") continue;
    obs.push({ month: r.month ?? "", unitPrice, quantity });
  }
  return obs;
}

// ─── 대분류 평균 PED (폴백 2단계) ─────────────────────────

export function categoryAveragePED(
  records: ItemProfitabilityRecord[],
  category: string,
): { ped: number; samples: number } | null {
  const categoryItems = Array.from(new Set(records.filter(r => r.대분류 === category).map(r => r.품목)));
  if (categoryItems.length === 0) return null;
  const peds: number[] = [];
  for (const item of categoryItems) {
    const obs = extractItemObservations(records, item);
    const reg = olsLogLinear(obs);
    if (reg && Number.isFinite(reg.beta)) {
      const { trimmed } = trimOutlierPED(reg.beta);
      peds.push(trimmed);
    }
  }
  if (peds.length < 2) return null;
  const mean = peds.reduce((a, b) => a + b, 0) / peds.length;
  return { ped: mean, samples: peds.length };
}

// ─── 메인 함수 ────────────────────────────────────────────

/**
 * 품목의 PED 추정 (3단계 폴백 체인).
 */
export function estimatePED(
  records: ItemProfitabilityRecord[],
  itemCode: string,
): PEDResult {
  const target = records.find(r => r.품목 === itemCode);
  const category = target?.대분류;

  const notes: string[] = [];
  const observations = extractItemObservations(records, itemCode);
  const samples = observations.filter(o => o.unitPrice > 0 && o.quantity > 0).length;

  // 1. 직접 회귀
  if (samples >= CONFIDENCE_THRESHOLDS.samplesLow) {
    const reg = olsLogLinear(observations);
    if (reg && Number.isFinite(reg.beta)) {
      const { trimmed, wasOutlier, reason } = trimOutlierPED(reg.beta);
      if (wasOutlier) notes.push(`이상 PED 트림: ${reason} (원값 ${reg.beta.toFixed(2)} → ${trimmed})`);
      const confidence = decideConfidence(samples, reg.r2);
      return {
        itemCode, category,
        ped: trimmed, pedRaw: reg.beta, wasTrimmed: wasOutlier,
        r2: reg.r2, stderr: reg.stderr, samples, confidence,
        method: "direct",
        notes,
      };
    }
    notes.push("직접 회귀 실패 — 단가 변동 부족");
  } else if (samples > 0) {
    notes.push(`샘플 부족: ${samples}개월 < 3개월`);
  }

  // 2. 대분류 폴백
  if (category) {
    const catResult = categoryAveragePED(records, category);
    if (catResult) {
      notes.push(`대분류 폴백: ${category} ${catResult.samples}개 품목 평균`);
      return {
        itemCode, category,
        ped: catResult.ped, pedRaw: catResult.ped, wasTrimmed: false,
        r2: 0, stderr: 0, samples: catResult.samples,
        confidence: "low",
        method: "category_fallback",
        notes,
      };
    }
  }

  // 3. 업계 벤치마크
  const industryPED = industryFallbackPED(category ?? "기타");
  notes.push(`업계 벤치마크 폴백: ${category ?? "기타"} → PED ${industryPED}`);
  return {
    itemCode, category,
    ped: industryPED, pedRaw: industryPED, wasTrimmed: false,
    r2: 0, stderr: 0, samples: 0,
    confidence: "insufficient",
    method: "industry_fallback",
    notes,
  };
}

// ─── PED로 수량 변환 ──────────────────────────────────────

/**
 * PED를 사용해 판가 변동 시 수량 변동 계산.
 * newQty / baseQty = (newPrice / basePrice) ^ PED
 */
export function applyPED(baseQty: number, priceChangePct: number, ped: number): number {
  if (baseQty <= 0) return 0;
  const priceRatio = 1 + priceChangePct / 100;
  if (priceRatio <= 0) return baseQty; // 극단 방어
  const volRatio = Math.pow(priceRatio, ped);
  return baseQty * volRatio;
}

/**
 * 사용자 친화 요약 라벨 생성.
 * 예: "PED = -1.23 (R²=0.68, n=14M, 방어적)"
 */
export function pedSummaryLabel(r: PEDResult): string {
  const confLabel: Record<PEDConfidence, string> = {
    high: "신뢰도 높음",
    medium: "신뢰도 중간",
    low: "신뢰도 낮음",
    insufficient: "샘플 부족",
  };
  const methodTag = r.method === "direct" ? "" : r.method === "category_fallback" ? " (대분류 추정)" : " (업계 벤치마크)";
  const r2Part = r.method === "direct" ? `R²=${r.r2.toFixed(2)}, ` : "";
  return `PED = ${r.ped.toFixed(2)} (${r2Part}n=${r.samples}M, ${confLabel[r.confidence]})${methodTag}`;
}

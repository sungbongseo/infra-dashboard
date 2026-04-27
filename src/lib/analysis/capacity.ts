/**
 * 공장 캐파 Step-up 경고 모듈.
 *
 * v2 WS2 (저가수주 상계 시뮬 Phase A).
 *
 * @background
 *   현재 `calcTotalViewSimulation`은 "고정비 총액 불변" 가정으로 추가 물량이
 *   언제나 공헌이익 순증으로 계산됩니다. 하지만 공장 캐파를 초과하면 신규 라인·
 *   교대·설비 증설로 고정비가 급증(Step-up)합니다. 이 은닉된 비용을 노출하여
 *   "+5,500 ROL 증산 판정 = 사실상 5억원 설비투자" 같은 경영진 함정을 방지.
 *
 * @datasources
 *   - 수불현황 (InventoryMovementRecord): 공장×품목×월 출고량
 *     → 과거 월별 max 출고량 × 110% = 자동 캐파 제안
 *   - 사용자 수동 입력: 위 자동값 overide, Step-up 고정비·입도 설정
 */

import type { InventoryMovementRecord } from "@/types/inventory";

/** 공장·품목 단위 캐파 설정 */
export interface CapacityConfig {
  /** 품목 식별자 (schemas의 `품목` 필드와 일치) */
  itemCode: string;
  /** 공장명 (수불현황 파일명에서 추출된 값) */
  factory?: string;
  /** 월 최대 생산량 (단위는 품목의 기준단위와 일치) */
  monthlyCapacity: number;
  /**
   * Step-up 고정비: 캐파 1단위 증설 시 월 고정비 증가분.
   * 예: "신규 라인 1개 추가하면 월 5,000만원 감가+인건비" → 50_000_000
   */
  stepUpFixedCost: number;
  /**
   * Step-up 입도: 신규 라인 1개가 추가로 생산 가능한 수량.
   * 예: "신규 라인 1개 = 월 1,000 ROL 추가" → 1000
   */
  stepUpGranularity: number;
}

export type BreachLevel = "ok" | "caution" | "warning" | "severe";

export interface CapacityAlert {
  /** 사용률 = (기존+추가) / capacity */
  usagePct: number;
  /** 등급 */
  breachLevel: BreachLevel;
  /** 캐파 초과 수량 */
  excessQty: number;
  /** 신규 설치 필요 라인 수 */
  newLinesNeeded: number;
  /** 신규 라인 총 고정비 (월 기준) */
  additionalFixedCost: number;
  /** 사람친화 메시지 */
  message: string;
}

/**
 * 수불현황 기반 품목별 월 최대 출고량 추출 + 캐파 자동 제안.
 * @param records 전체 수불현황 레코드
 * @param itemCode 품목 식별자 (품목)
 * @param bufferPct 캐파 제안 버퍼 (기본 10%)
 */
export function suggestItemCapacity(
  records: InventoryMovementRecord[],
  itemCode: string,
  bufferPct = 0.10,
): { monthlyMax: number; suggested: number; samples: number; factory?: string } | null {
  const filtered = records.filter(r => r.품목 === itemCode);
  if (filtered.length === 0) return null;
  const monthlyOut = new Map<string, number>();
  let representativeFactory: string | undefined;
  for (const r of filtered) {
    const m = r.month ?? "unknown";
    const prev = monthlyOut.get(m) ?? 0;
    monthlyOut.set(m, prev + (r.출고 ?? 0));
    if (!representativeFactory) representativeFactory = r.factory;
  }
  const values = Array.from(monthlyOut.values()).filter(v => v > 0);
  if (values.length === 0) return null;
  const monthlyMax = Math.max(...values);
  const suggested = Math.round(monthlyMax * (1 + bufferPct));
  return { monthlyMax, suggested, samples: values.length, factory: representativeFactory };
}

/** 공장 전체 월별 총 출고량 (품목 단위 혼재 주의 — 참고용) */
export function suggestFactoryCapacity(
  records: InventoryMovementRecord[],
  factory: string,
  bufferPct = 0.10,
): { monthlyMax: number; suggested: number; samples: number } | null {
  const filtered = records.filter(r => r.factory === factory);
  if (filtered.length === 0) return null;
  const monthlyOut = new Map<string, number>();
  for (const r of filtered) {
    const m = r.month ?? "unknown";
    monthlyOut.set(m, (monthlyOut.get(m) ?? 0) + (r.출고 ?? 0));
  }
  const values = Array.from(monthlyOut.values()).filter(v => v > 0);
  if (values.length === 0) return null;
  const monthlyMax = Math.max(...values);
  return {
    monthlyMax,
    suggested: Math.round(monthlyMax * (1 + bufferPct)),
    samples: values.length,
  };
}

/**
 * 캐파 초과 경고 계산.
 * @param baseQty 현재 월 생산량 (저가수주 전)
 * @param addedQty 저가수주 추가 물량
 * @param config 캐파 설정
 */
export function calcCapacityAlert(
  baseQty: number,
  addedQty: number,
  config: CapacityConfig,
): CapacityAlert {
  const totalQty = Math.max(0, baseQty) + Math.max(0, addedQty);
  const cap = Math.max(0, config.monthlyCapacity);
  const usagePct = cap > 0 ? totalQty / cap : 0;

  let breachLevel: BreachLevel;
  if (usagePct >= 1.0) breachLevel = "severe";
  else if (usagePct >= 0.9) breachLevel = "warning";
  else if (usagePct >= 0.8) breachLevel = "caution";
  else breachLevel = "ok";

  const excessQty = Math.max(0, totalQty - cap);
  const granularity = Math.max(1, config.stepUpGranularity);
  const newLinesNeeded = excessQty > 0 ? Math.ceil(excessQty / granularity) : 0;
  const additionalFixedCost = newLinesNeeded * Math.max(0, config.stepUpFixedCost);

  const pctStr = (usagePct * 100).toFixed(1);
  let message: string;
  switch (breachLevel) {
    case "severe":
      message = `🚨 캐파 초과 (${pctStr}%) — 신규 라인 ${newLinesNeeded}개 필요. 월 고정비 ${formatKRW(additionalFixedCost)} 추가 발생.`;
      break;
    case "warning":
      message = `⚠️ 캐파 ${pctStr}% 도달 — 10% 이상 증산 시 Step-up 임박.`;
      break;
    case "caution":
      message = `📊 캐파 ${pctStr}% 사용 — 여유 ${((1 - usagePct) * 100).toFixed(1)}% 이내.`;
      break;
    default:
      message = `✅ 캐파 ${pctStr}% 사용 — 여유 충분.`;
  }

  return { usagePct, breachLevel, excessQty, newLinesNeeded, additionalFixedCost, message };
}

function formatKRW(v: number): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억원`;
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${Math.round(v).toLocaleString()}원`;
}

/** 수불현황에서 특정 품목의 최근 월 생산량 (baseQty 자동 추정용) */
export function latestMonthlyOutput(
  records: InventoryMovementRecord[],
  itemCode: string,
): number {
  const filtered = records
    .filter(r => r.품목 === itemCode && (r.출고 ?? 0) > 0)
    .sort((a, b) => (b.month ?? "").localeCompare(a.month ?? ""));
  if (filtered.length === 0) return 0;
  const latestMonth = filtered[0].month;
  return filtered
    .filter(r => r.month === latestMonth)
    .reduce((s, r) => s + (r.출고 ?? 0), 0);
}

/**
 * Cross-Report Validation (100 ↔ 303 ↔ 304) — BCG v4 P3-1
 *
 * 동일 거래처/품목이 여러 보고서에서 다르게 집계되는 케이스 자동 식별.
 * 회계 데이터 무결성 자동 검증 — 차이율 > 5% 품목 highlight.
 *
 * 100 (거래처×품목 손익) — row-level 명세
 * 303 (조직×거래처 손익) — 거래처 단위 소계
 * 304 (본부×거래처×품목) — 거래처+품목 단위 소계
 *
 * Validation Pairs:
 * - 100 vs 304: 거래처+품목 단위 매출/이익 비교 (직접 매칭)
 * - 100 vs 303: 거래처 단위 매출/이익 비교 (집계 후 매칭)
 *
 * 8 원칙 적용:
 * - 원칙 1·3: 비교 불가 데이터 별도 카운트
 * - 원칙 2: 차이율 > 5% 자동 flag (수학상 정상이나 회계 이상)
 * - 원칙 4: edge case별 단위 테스트
 *
 * @phaseB v4 P3-1
 */

import type {
  CustomerItemDetailRecord,
  OrgCustomerProfitRecord,
  HqCustomerItemProfitRecord,
} from "@/types";
import { safeDivide } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

/** 비교 대상 보고서 쌍 */
export type ReportPair = "100_vs_304" | "100_vs_303";

export type DifferenceLevel = "match" | "minor" | "significant" | "critical";

export interface CrossValidationDiscrepancy {
  pair: ReportPair;
  /** 비교 키 (`거래처` 또는 `거래처|품목`) */
  key: string;
  customerCode: string;
  customerName: string;
  itemCode?: string;       // 100 vs 304만
  itemName?: string;
  /** 100 보고서 매출 합 */
  sales100: number;
  /** 303/304 보고서 매출 합 */
  salesOther: number;
  /** 차이 (절댓값) */
  salesDiff: number;
  /** 차이율 = |diff| / max(|sales100|, |salesOther|) (0~1) */
  salesDiffRate: number;
  profit100: number;
  profitOther: number;
  profitDiff: number;
  profitDiffRate: number;
  /** 차이율 분류 — minor (5%↓), significant (5~20%), critical (>20%) */
  level: DifferenceLevel;
  /** 100에만 존재 / 303-4에만 존재 / 양쪽 — 누락 식별 */
  presence: "both" | "only_100" | "only_other";
}

export interface CrossValidationResult {
  /** 100 vs 304 거래처+품목 단위 비교 */
  pair_100_vs_304: CrossValidationDiscrepancy[];
  /** 100 vs 303 거래처 단위 비교 */
  pair_100_vs_303: CrossValidationDiscrepancy[];
  /** 통계 요약 */
  summary: {
    /** 100 vs 304 매칭 가능 키 (양쪽 존재) 수 */
    matched_100_304: number;
    /** 100 vs 303 매칭 가능 키 수 */
    matched_100_303: number;
    /** 차이율 5% 초과 (significant + critical) 카운트 */
    significantDiffCount: number;
    /** 차이율 20% 초과 (critical) 카운트 */
    criticalDiffCount: number;
    /** 100에만 존재 (303/304 누락) 카운트 */
    onlyIn100Count: number;
    /** 303/304에만 존재 (100 누락) 카운트 */
    onlyInOtherCount: number;
  };
}

const MINOR_THRESHOLD = 0.05;     // 5%
const SIGNIFICANT_THRESHOLD = 0.20; // 20%

// ─── Public API ──────────────────────────────────────────

export function classifyDifferenceLevel(rate: number): DifferenceLevel {
  if (rate < MINOR_THRESHOLD) return "match";
  if (rate < SIGNIFICANT_THRESHOLD) return "minor";
  if (rate < 1.0) return "significant";
  return "critical";
}

/**
 * 차이율 계산 — |a - b| / max(|a|, |b|)
 * 두 값 모두 0이면 0 반환 (정확 일치).
 */
function calcDiffRate(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}

/**
 * 100 보고서를 거래처+품목 키로 집계
 */
function aggregate100ByCustomerItem(
  data: CustomerItemDetailRecord[],
): Map<string, { sales: number; profit: number; customerName: string; itemName: string }> {
  const map = new Map<string, { sales: number; profit: number; customerName: string; itemName: string }>();
  for (const r of data) {
    const cust = (r.매출거래처 || "").trim();
    const item = (r.품목 || "").trim();
    if (!cust || !item) continue;
    const key = `${cust}|${item}`;
    let agg = map.get(key);
    if (!agg) {
      agg = { sales: 0, profit: 0, customerName: r.매출거래처명 || cust, itemName: r.품목명 || item };
      map.set(key, agg);
    }
    agg.sales += r.매출액?.실적 || 0;
    agg.profit += r.영업이익?.실적 || 0;
  }
  return map;
}

/**
 * 100 보고서를 거래처 키로 집계
 */
function aggregate100ByCustomer(
  data: CustomerItemDetailRecord[],
): Map<string, { sales: number; profit: number; customerName: string }> {
  const map = new Map<string, { sales: number; profit: number; customerName: string }>();
  for (const r of data) {
    const cust = (r.매출거래처 || "").trim();
    if (!cust) continue;
    let agg = map.get(cust);
    if (!agg) {
      agg = { sales: 0, profit: 0, customerName: r.매출거래처명 || cust };
      map.set(cust, agg);
    }
    agg.sales += r.매출액?.실적 || 0;
    agg.profit += r.영업이익?.실적 || 0;
  }
  return map;
}

/**
 * 304 보고서를 거래처+품목 키로 집계
 */
function aggregate304(
  data: HqCustomerItemProfitRecord[],
): Map<string, { sales: number; profit: number; customerName: string; itemName: string }> {
  const map = new Map<string, { sales: number; profit: number; customerName: string; itemName: string }>();
  for (const r of data) {
    const cust = (r.매출거래처 || "").trim();
    const item = (r.품목 || "").trim();
    if (!cust || !item) continue;
    const key = `${cust}|${item}`;
    let agg = map.get(key);
    if (!agg) {
      agg = { sales: 0, profit: 0, customerName: r.매출거래처명 || cust, itemName: r.품목명 || item };
      map.set(key, agg);
    }
    agg.sales += r.매출액?.실적 || 0;
    agg.profit += r.영업이익?.실적 || 0;
  }
  return map;
}

/**
 * 303 보고서를 거래처 키로 집계
 */
function aggregate303(
  data: OrgCustomerProfitRecord[],
): Map<string, { sales: number; profit: number; customerName: string }> {
  const map = new Map<string, { sales: number; profit: number; customerName: string }>();
  for (const r of data) {
    const cust = (r.매출거래처 || "").trim();
    if (!cust) continue;
    let agg = map.get(cust);
    if (!agg) {
      agg = { sales: 0, profit: 0, customerName: r.매출거래처명 || cust };
      map.set(cust, agg);
    }
    agg.sales += r.매출액?.실적 || 0;
    agg.profit += r.영업이익?.실적 || 0;
  }
  return map;
}

/**
 * 메인 함수 — 100 vs 303/304 cross-validation
 *
 * @returns 차이 발견된 건만 (level !== "match") 반환 (정렬: salesDiffRate 내림차순)
 */
export function calcCrossReportValidation(
  data100: CustomerItemDetailRecord[],
  data303: OrgCustomerProfitRecord[] = [],
  data304: HqCustomerItemProfitRecord[] = [],
): CrossValidationResult {
  const map100Item = aggregate100ByCustomerItem(data100);
  const map100Cust = aggregate100ByCustomer(data100);
  const map304 = aggregate304(data304);
  const map303 = aggregate303(data303);

  const pair_100_vs_304: CrossValidationDiscrepancy[] = [];
  const pair_100_vs_303: CrossValidationDiscrepancy[] = [];

  let matched_100_304 = 0;
  let matched_100_303 = 0;
  let significantDiffCount = 0;
  let criticalDiffCount = 0;
  let onlyIn100Count = 0;
  let onlyInOtherCount = 0;

  // 100 vs 304 (거래처+품목 단위)
  const allKeys304 = new Set<string>();
  for (const k of Array.from(map100Item.keys())) allKeys304.add(k);
  for (const k of Array.from(map304.keys())) allKeys304.add(k);
  for (const key of Array.from(allKeys304)) {
    const a = map100Item.get(key);
    const b = map304.get(key);
    if (a && b) {
      matched_100_304++;
      const salesDiffRate = calcDiffRate(a.sales, b.sales);
      const profitDiffRate = calcDiffRate(a.profit, b.profit);
      const maxRate = Math.max(salesDiffRate, profitDiffRate);
      const level = classifyDifferenceLevel(maxRate);
      if (level !== "match") {
        if (level === "significant") significantDiffCount++;
        if (level === "critical") criticalDiffCount++;
        const [cust, item] = key.split("|");
        pair_100_vs_304.push({
          pair: "100_vs_304", key,
          customerCode: cust, customerName: a.customerName,
          itemCode: item, itemName: a.itemName,
          sales100: a.sales, salesOther: b.sales,
          salesDiff: a.sales - b.sales, salesDiffRate,
          profit100: a.profit, profitOther: b.profit,
          profitDiff: a.profit - b.profit, profitDiffRate,
          level, presence: "both",
        });
      }
    } else if (a && !b) {
      // 100에만 존재 (304 누락)
      if (a.sales > 0) {
        onlyIn100Count++;
        const [cust, item] = key.split("|");
        pair_100_vs_304.push({
          pair: "100_vs_304", key,
          customerCode: cust, customerName: a.customerName,
          itemCode: item, itemName: a.itemName,
          sales100: a.sales, salesOther: 0,
          salesDiff: a.sales, salesDiffRate: 1,
          profit100: a.profit, profitOther: 0,
          profitDiff: a.profit, profitDiffRate: 1,
          level: "critical", presence: "only_100",
        });
      }
    } else if (!a && b) {
      if (b.sales > 0) {
        onlyInOtherCount++;
        const [cust, item] = key.split("|");
        pair_100_vs_304.push({
          pair: "100_vs_304", key,
          customerCode: cust, customerName: b.customerName,
          itemCode: item, itemName: b.itemName,
          sales100: 0, salesOther: b.sales,
          salesDiff: -b.sales, salesDiffRate: 1,
          profit100: 0, profitOther: b.profit,
          profitDiff: -b.profit, profitDiffRate: 1,
          level: "critical", presence: "only_other",
        });
      }
    }
  }

  // 100 vs 303 (거래처 단위)
  const allKeys303 = new Set<string>();
  for (const k of Array.from(map100Cust.keys())) allKeys303.add(k);
  for (const k of Array.from(map303.keys())) allKeys303.add(k);
  for (const key of Array.from(allKeys303)) {
    const a = map100Cust.get(key);
    const b = map303.get(key);
    if (a && b) {
      matched_100_303++;
      const salesDiffRate = calcDiffRate(a.sales, b.sales);
      const profitDiffRate = calcDiffRate(a.profit, b.profit);
      const maxRate = Math.max(salesDiffRate, profitDiffRate);
      const level = classifyDifferenceLevel(maxRate);
      if (level !== "match") {
        if (level === "significant") significantDiffCount++;
        if (level === "critical") criticalDiffCount++;
        pair_100_vs_303.push({
          pair: "100_vs_303", key,
          customerCode: key, customerName: a.customerName,
          sales100: a.sales, salesOther: b.sales,
          salesDiff: a.sales - b.sales, salesDiffRate,
          profit100: a.profit, profitOther: b.profit,
          profitDiff: a.profit - b.profit, profitDiffRate,
          level, presence: "both",
        });
      }
    } else if (a && !b) {
      if (a.sales > 0) {
        onlyIn100Count++;
        pair_100_vs_303.push({
          pair: "100_vs_303", key,
          customerCode: key, customerName: a.customerName,
          sales100: a.sales, salesOther: 0,
          salesDiff: a.sales, salesDiffRate: 1,
          profit100: a.profit, profitOther: 0,
          profitDiff: a.profit, profitDiffRate: 1,
          level: "critical", presence: "only_100",
        });
      }
    } else if (!a && b) {
      if (b.sales > 0) {
        onlyInOtherCount++;
        pair_100_vs_303.push({
          pair: "100_vs_303", key,
          customerCode: key, customerName: b.customerName,
          sales100: 0, salesOther: b.sales,
          salesDiff: -b.sales, salesDiffRate: 1,
          profit100: 0, profitOther: b.profit,
          profitDiff: -b.profit, profitDiffRate: 1,
          level: "critical", presence: "only_other",
        });
      }
    }
  }

  // 차이율 내림차순 정렬
  pair_100_vs_304.sort((a, b) => b.salesDiffRate - a.salesDiffRate);
  pair_100_vs_303.sort((a, b) => b.salesDiffRate - a.salesDiffRate);

  return {
    pair_100_vs_304,
    pair_100_vs_303,
    summary: {
      matched_100_304,
      matched_100_303,
      significantDiffCount,
      criticalDiffCount,
      onlyIn100Count,
      onlyInOtherCount,
    },
  };
}

/**
 * UI 표시용 — DifferenceLevel 한국어 라벨 + 색상
 */
export function getDiffLevelLabel(level: DifferenceLevel): string {
  switch (level) {
    case "match": return "일치";
    case "minor": return "🟡 경미 (5~20%)";
    case "significant": return "🟠 유의 (20~100%)";
    case "critical": return "🔴 심각 (>100% 또는 누락)";
  }
}

void safeDivide; // 향후 확장 시 사용 예정

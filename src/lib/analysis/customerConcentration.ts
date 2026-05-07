/**
 * 거래처 집중도 분석 (Segment-level HHI) — BCG v4 P2-1
 *
 * 각 segment 내 거래처별 매출 집중도 측정:
 * - HHI = Σ(거래처 매출 비중)^2 × 10000
 * - Top 5 / Top 10 거래처 매출 비중
 * - US DOJ Horizontal Merger Guidelines:
 *   <1500: 분산 (unconcentrated)
 *   1500~2500: 적정 (moderately concentrated)
 *   >2500: 집중 (highly concentrated, 위험)
 *
 * 8 원칙 적용:
 * - 원칙 1·3: 0매출/음수 거래처 사전 제외 + counter
 * - 원칙 2: HHI > 2500 자동 경고 (수학상 정상이나 비즈니스 리스크)
 * - 원칙 4: edge case별 단위 테스트
 *
 * @phaseB v4 P2-1
 */

import type { CustomerItemDetailRecord } from "@/types";
import type { Segment } from "./productPortfolioMatrix";
import { classifySegmentType } from "./productPortfolioMatrix";
import { safeDivide } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

export type ConcentrationLevel = "dispersed" | "moderate" | "concentrated";

export interface CustomerConcentrationEntry {
  customerCode: string;
  customerName: string;
  sales: number;
  salesShare: number;       // segment 매출 대비 비중 (0-1)
  cumulativeShare: number;  // 누적 비중 (0-1)
  rank: number;             // 매출 순위 (1부터)
}

export interface SegmentConcentration {
  segment: Segment;
  totalCustomers: number;
  totalSales: number;
  /** HHI = Σ(share^2) × 10000 (0~10000). 0=완전분산 / 10000=독점 */
  hhi: number;
  level: ConcentrationLevel;
  top5Share: number;       // Top 5 거래처 매출 비중 (0-1)
  top10Share: number;      // Top 10
  /** Top 10 거래처 entries (UI 표시용) */
  topCustomers: CustomerConcentrationEntry[];
  /** 0 매출/음수 매출 거래처 카운트 (제외됨) */
  excludedCustomers: number;
}

export interface ConcentrationResult {
  segments: Record<Segment, SegmentConcentration>;
  /** 전체 4 segment 평균 HHI (단순 평균, 참고용) */
  avgHHI: number;
  /** 위험 segment 카운트 (HHI > 2500) */
  highRiskSegments: number;
}

const ALL_SEGMENTS: Segment[] = ["내수×제품", "내수×상품", "해외×제품", "해외×상품"];

// ─── Public API ──────────────────────────────────────────

/**
 * HHI 해석 — US DOJ Horizontal Merger Guidelines (2010)
 * <1500: dispersed (분산, 건전)
 * 1500~2500: moderate (적정)
 * >2500: concentrated (집중, 위험)
 */
export function classifyHHILevel(hhi: number): ConcentrationLevel {
  if (hhi > 2500) return "concentrated";
  if (hhi >= 1500) return "moderate";
  return "dispersed";
}

/**
 * 메인 함수 — 4 segment × 거래처 집중도 분석
 *
 * @param data 100 거래처×품목 손익 raw records
 * @returns 4 segment별 HHI + Top 거래처 + 전체 통계
 */
export function calcCustomerConcentration(
  data: CustomerItemDetailRecord[],
): ConcentrationResult {
  const segments = {} as Record<Segment, SegmentConcentration>;

  for (const segment of ALL_SEGMENTS) {
    const [segType, acct] = segment.split("×");
    // 해당 segment 행 필터
    const rows = data.filter((r) => {
      const a = (r.계정구분 || "").trim();
      const t = classifySegmentType(r.매출유형 || "");
      return a === acct && t === segType;
    });

    // 거래처별 매출 집계 (key=매출거래처, fallback=매출거래처명)
    const customerMap = new Map<string, { name: string; sales: number }>();
    let excludedCustomers = 0;
    for (const r of rows) {
      const code = (r.매출거래처 || "").trim();
      const name = (r.매출거래처명 || code).trim();
      const sales = r.매출액?.실적 || 0;
      if (!code) continue;
      let agg = customerMap.get(code);
      if (!agg) {
        agg = { name, sales: 0 };
        customerMap.set(code, agg);
      }
      agg.sales += sales;
    }

    // 0매출/음수 거래처 제외 (8 원칙 #1·#3)
    const validCustomers: { code: string; name: string; sales: number }[] = [];
    for (const [code, agg] of Array.from(customerMap.entries())) {
      if (agg.sales <= 0) {
        excludedCustomers++;
        continue;
      }
      validCustomers.push({ code, name: agg.name, sales: agg.sales });
    }

    if (validCustomers.length === 0) {
      segments[segment] = {
        segment,
        totalCustomers: 0,
        totalSales: 0,
        hhi: 0,
        level: "dispersed",
        top5Share: 0,
        top10Share: 0,
        topCustomers: [],
        excludedCustomers,
      };
      continue;
    }

    // 매출 내림차순 정렬
    validCustomers.sort((a, b) => b.sales - a.sales);
    const totalSales = validCustomers.reduce((s, c) => s + c.sales, 0);

    // HHI 계산 — share^2 합 × 10000
    let hhi = 0;
    let cumulativeSales = 0;
    let top5Sales = 0;
    let top10Sales = 0;
    const topCustomers: CustomerConcentrationEntry[] = [];

    for (let i = 0; i < validCustomers.length; i++) {
      const c = validCustomers[i];
      const share = safeDivide(c.sales, totalSales);
      hhi += share * share;
      cumulativeSales += c.sales;
      if (i < 5) top5Sales += c.sales;
      if (i < 10) top10Sales += c.sales;
      if (i < 10) {
        topCustomers.push({
          customerCode: c.code,
          customerName: c.name,
          sales: c.sales,
          salesShare: share,
          cumulativeShare: safeDivide(cumulativeSales, totalSales),
          rank: i + 1,
        });
      }
    }
    hhi *= 10000;

    segments[segment] = {
      segment,
      totalCustomers: validCustomers.length,
      totalSales,
      hhi,
      level: classifyHHILevel(hhi),
      top5Share: safeDivide(top5Sales, totalSales),
      top10Share: safeDivide(top10Sales, totalSales),
      topCustomers,
      excludedCustomers,
    };
  }

  // 전체 통계
  const hhiList = ALL_SEGMENTS.map((s) => segments[s].hhi).filter((h) => h > 0);
  const avgHHI = hhiList.length > 0 ? hhiList.reduce((s, h) => s + h, 0) / hhiList.length : 0;
  const highRiskSegments = ALL_SEGMENTS.filter((s) => segments[s].level === "concentrated").length;

  return { segments, avgHHI, highRiskSegments };
}

/**
 * UI 표시용 — HHI 한국어 해석 라벨
 */
export function getHHILevelLabel(level: ConcentrationLevel): string {
  switch (level) {
    case "dispersed": return "🟢 분산 (건전)";
    case "moderate": return "🟡 적정";
    case "concentrated": return "🔴 집중 (위험)";
  }
}

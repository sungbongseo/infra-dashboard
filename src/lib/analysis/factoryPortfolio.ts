/**
 * 공장별 포트폴리오 분석 — BCG v4 P3-2
 *
 * 100 보고서 공장 컬럼 활용 (지금까지 미활용).
 * 공장별 매출/영업이익/마진율 + segment 분포 비교.
 *
 * 8 원칙 적용:
 * - 원칙 1·3: 공장 빈값 → "(공장 미지정)" 별도 카운트
 * - 원칙 4: edge case별 단위 테스트
 * - 원칙 7: contextBranches — 공장간 마진율 격차 큼 (>10%p) 자동 경고
 *
 * @phaseB v4 P3-2
 */

import type { CustomerItemDetailRecord } from "@/types";
import type { Segment } from "./productPortfolioMatrix";
import { classifySegmentType } from "./productPortfolioMatrix";
import { safeDivide } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

export const UNKNOWN_FACTORY = "(공장 미지정)";

export interface FactoryStats {
  factory: string;
  itemCount: number;          // unique 품목 수
  customerCount: number;      // unique 거래처 수
  totalSales: number;
  totalProfit: number;
  weightedMarginRate: number; // = profit / sales × 100
  /** segment 분포 (4 segment 매출 비중) */
  segmentDist: Record<Segment, { sales: number; profit: number; salesShare: number }>;
  /** 가장 큰 segment (UI 강조용) */
  dominantSegment: Segment;
}

export interface FactoryPortfolioResult {
  factories: FactoryStats[];   // totalSales 내림차순
  /** 공장 빈값 행 카운트 */
  unknownFactoryCount: number;
  /** 공장간 가중 마진율 격차 (max - min) — 큰 격차는 운영 표준 격차 신호 */
  marginGap: number;
  /** 격차 큰 공장 쌍 (margin gap > 10%p 시 highlight) */
  hasSignificantGap: boolean;
}

const SEGMENT_GAP_THRESHOLD = 10; // %p

// ─── Public API ──────────────────────────────────────────

/**
 * 공장별 포트폴리오 분석.
 *
 * @param data 100 거래처×품목 손익 raw records
 * @returns 공장별 통계 + 마진 격차
 */
export function calcFactoryPortfolio(
  data: CustomerItemDetailRecord[],
): FactoryPortfolioResult {
  type Agg = {
    factory: string;
    items: Set<string>;
    customers: Set<string>;
    totalSales: number;
    totalProfit: number;
    segmentDist: Record<Segment, { sales: number; profit: number }>;
  };

  const map = new Map<string, Agg>();
  let unknownFactoryCount = 0;

  for (const r of data) {
    const acct = (r.계정구분 || "").trim();
    if (acct !== "제품" && acct !== "상품") continue;
    const segType = classifySegmentType(r.매출유형 || "");
    if (segType === "제외") continue;
    const sales = r.매출액?.실적 || 0;
    if (sales <= 0) continue;
    const profit = r.영업이익?.실적 || 0;
    const itemCode = (r.품목 || "").trim();
    const customer = (r.매출거래처 || "").trim();
    if (!itemCode || !customer) continue;

    const factoryRaw = (r.공장 || "").trim();
    const factory = factoryRaw || UNKNOWN_FACTORY;
    if (!factoryRaw) unknownFactoryCount++;
    const segment = `${segType}×${acct}` as Segment;

    let agg = map.get(factory);
    if (!agg) {
      agg = {
        factory,
        items: new Set(),
        customers: new Set(),
        totalSales: 0,
        totalProfit: 0,
        segmentDist: {
          "내수×제품": { sales: 0, profit: 0 },
          "내수×상품": { sales: 0, profit: 0 },
          "해외×제품": { sales: 0, profit: 0 },
          "해외×상품": { sales: 0, profit: 0 },
        },
      };
      map.set(factory, agg);
    }
    agg.items.add(itemCode);
    agg.customers.add(customer);
    agg.totalSales += sales;
    agg.totalProfit += profit;
    agg.segmentDist[segment].sales += sales;
    agg.segmentDist[segment].profit += profit;
  }

  const SEGMENT_PRIORITY: Segment[] = ["내수×제품", "내수×상품", "해외×제품", "해외×상품"];
  const factories: FactoryStats[] = Array.from(map.values()).map(agg => {
    // dominantSegment 산출 (sales 기준, tie 시 priority 우선)
    let dominantSegment: Segment = "내수×제품";
    let maxSales = -1;
    for (const s of SEGMENT_PRIORITY) {
      if (agg.segmentDist[s].sales > maxSales) {
        maxSales = agg.segmentDist[s].sales;
        dominantSegment = s;
      }
    }
    const segmentDist: FactoryStats["segmentDist"] = {} as any;
    for (const s of SEGMENT_PRIORITY) {
      segmentDist[s] = {
        sales: agg.segmentDist[s].sales,
        profit: agg.segmentDist[s].profit,
        salesShare: safeDivide(agg.segmentDist[s].sales, agg.totalSales),
      };
    }
    return {
      factory: agg.factory,
      itemCount: agg.items.size,
      customerCount: agg.customers.size,
      totalSales: agg.totalSales,
      totalProfit: agg.totalProfit,
      weightedMarginRate: safeDivide(agg.totalProfit, agg.totalSales) * 100,
      segmentDist,
      dominantSegment,
    };
  });

  factories.sort((a, b) => b.totalSales - a.totalSales);

  // 마진 격차
  const margins = factories.filter(f => f.factory !== UNKNOWN_FACTORY).map(f => f.weightedMarginRate);
  const marginGap = margins.length >= 2
    ? Math.max(...margins) - Math.min(...margins)
    : 0;
  const hasSignificantGap = marginGap > SEGMENT_GAP_THRESHOLD;

  return { factories, unknownFactoryCount, marginGap, hasSignificantGap };
}

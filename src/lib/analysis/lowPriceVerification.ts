/**
 * 저가수주×가동률 가설 검증 모듈
 *
 * 사업부 가설: "물량을 늘리면 고정비 분산으로 단위원가가 낮아지므로,
 * 저가수주해도 가동률이 오르면 전체 이익이 난다"
 *
 * 이 모듈은 4가지 분석으로 가설을 실증 검증한다:
 *   F1. 공헌이익 Red-Flag 스크리너 — 가설이 무조건 틀린 품목 식별
 *   F3. 가동률-단위원가 회귀분석 — "물량↑ → 원가↓" 관계 실증 검증
 *   F5. Capacity 제약 경고 — "가동률 상승"이 물리적으로 가능한지 체크
 *   F6. Cannibalization 경고 — 저가 수주가 기존 가격 체계를 무너뜨릴 리스크
 */
import type {
  CustomerItemDetailRecord,
  ItemProfitabilityRecord,
  ManufacturingCostRecord,
} from "@/types";
import type { CVPItem } from "./offsetEffect";
import { safeDivide } from "@/lib/utils";

// ═══════════════════════════════════════════════════
// F1: 공헌이익 Red-Flag 스크리너
// ═══════════════════════════════════════════════════

export type TrafficLight = "green" | "yellow" | "red";
export type TrendDirection = "improving" | "stable" | "deteriorating";

export interface ContributionRedFlag {
  item: string;
  itemName: string;
  customer?: string;
  customerName?: string;
  contributionMargin: number;
  contributionMarginRatio: number;
  revenue: number;
  quantity: number;
  trafficLight: TrafficLight;
  /** 월별 CM% 추이 (sparkline용) */
  monthlyTrend: Array<{ month: string; cmRatio: number }>;
  trendDirection: TrendDirection;
  /** CM% < 0인 연속 월 수 */
  consecutiveRedMonths: number;
  /** Red 품목의 매출 = 위험 매출 */
  revenueAtRisk: number;
}

export interface RedFlagSummary {
  totalItems: number;
  green: number;
  yellow: number;
  red: number;
  totalRevenueAtRisk: number;
  deterioratingCount: number;
  items: ContributionRedFlag[];
}

/** 14개 변동비 합산 (200 보고서 ItemProfitabilityRecord) */
function sumVariableCosts(r: ItemProfitabilityRecord): number {
  return (
    (r.원재료비 || 0) + (r.부재료비 || 0) + (r.상품매입 || 0) +
    (r.노무비 || 0) + (r.복리후생비 || 0) + (r.소모품비 || 0) +
    (r.수도광열비 || 0) + (r.수선비 || 0) + (r.연료비 || 0) +
    (r.외주가공비 || 0) + (r.운반비 || 0) + (r.전력비 || 0) +
    (r.지급수수료 || 0) + (r.견본비 || 0)
  );
}

/** 200 보고서에서 품목 코드 추출: "[ASCJ1021056] 아스콘" → "ASCJ1021056" */
function extractItemCode(raw: string): string {
  const m = raw.match(/^\[([^\]]+)\]/);
  return m ? m[1].trim() : raw.trim();
}

/** 200 보고서에서 품목명 추출: "[ASCJ1021056] 아스콘" → "아스콘" */
function extractItemName(raw: string): string {
  const m = raw.match(/^\[([^\]]+)\]\s*(.+)$/);
  return m ? m[2].trim() : raw.trim();
}

/**
 * 품목별 월별 CM% 트렌드 빌드 (200 보고서 월별 데이터)
 * @returns Map<품목코드, Array<{ month, cmRatio }>>
 */
function buildMonthlyTrendMap(
  rawItemProfitability: ItemProfitabilityRecord[]
): Map<string, Array<{ month: string; cmRatio: number }>> {
  // 품목×월 집계
  const agg = new Map<string, Map<string, { rev: number; vc: number }>>();
  for (const r of rawItemProfitability) {
    const month = (r as any).month || "";
    if (!month) continue;
    const code = extractItemCode((r.품목 || "").trim());
    if (!code) continue;
    const rev = r.매출액 || 0;
    const vc = sumVariableCosts(r);
    if (!agg.has(code)) agg.set(code, new Map());
    const monthMap = agg.get(code)!;
    const prev = monthMap.get(month);
    if (prev) {
      prev.rev += rev;
      prev.vc += vc;
    } else {
      monthMap.set(month, { rev, vc });
    }
  }
  // 월별 CM% 계산
  const result = new Map<string, Array<{ month: string; cmRatio: number }>>();
  for (const [code, monthMap] of Array.from(agg.entries())) {
    const trend = Array.from(monthMap.entries())
      .map(([month, { rev, vc }]) => ({
        month,
        cmRatio: rev > 0 ? ((rev - vc) / rev) * 100 : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    result.set(code, trend);
  }
  return result;
}

/** 최근 N개월 추세 판정 */
function detectTrendDirection(trend: Array<{ cmRatio: number }>, n = 3): TrendDirection {
  if (trend.length < 2) return "stable";
  const recent = trend.slice(-Math.min(n, trend.length));
  let ups = 0;
  let downs = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].cmRatio > recent[i - 1].cmRatio + 0.5) ups++;
    else if (recent[i].cmRatio < recent[i - 1].cmRatio - 0.5) downs++;
  }
  if (downs >= recent.length - 1) return "deteriorating";
  if (ups >= recent.length - 1) return "improving";
  return "stable";
}

/** CM% < 0 연속 월 수 (최신부터 역순) */
function countConsecutiveRedMonths(trend: Array<{ cmRatio: number }>): number {
  let count = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].cmRatio < 0) count++;
    else break;
  }
  return count;
}

/**
 * F1: 공헌이익 Red-Flag 스크리너
 *
 * CVPItem(100+200 기반, SGA 포함)에서 품목별 공헌이익률을 계산하고
 * 트래픽라이트(🟢🟡🔴)로 분류한다.
 *
 * @param cvpItems — calcCustomerItemCVP() 결과 (page.tsx에서 호이스팅)
 * @param rawItemProfitability — 200 보고서 월별 원본 (sparkline 트렌드)
 * @param thresholds — greenMin: CM% ≥ 이 값이면 Green (default 10), yellowMin: 이 값 이상이면 Yellow (default 0)
 */
export function calcContributionRedFlags(
  cvpItems: CVPItem[],
  rawItemProfitability: ItemProfitabilityRecord[],
  thresholds?: { greenMin?: number; yellowMin?: number }
): RedFlagSummary {
  const greenMin = thresholds?.greenMin ?? 10;
  const yellowMin = thresholds?.yellowMin ?? 0;

  // 월별 트렌드 맵 빌드
  const trendMap = buildMonthlyTrendMap(rawItemProfitability);

  // CVPItem을 품목 단위로 집계 (거래처 통합)
  const itemAgg = new Map<string, {
    item: string; itemName: string;
    totalCM: number; totalRevenue: number; totalQty: number;
  }>();
  for (const c of cvpItems) {
    const key = c.item;
    const prev = itemAgg.get(key);
    if (prev) {
      prev.totalCM += c.totalContributionMargin;
      prev.totalRevenue += c.revenue;
      prev.totalQty += c.quantity;
    } else {
      itemAgg.set(key, {
        item: c.item,
        itemName: c.itemName,
        totalCM: c.totalContributionMargin,
        totalRevenue: c.revenue,
        totalQty: c.quantity,
      });
    }
  }

  const items: ContributionRedFlag[] = [];
  for (const agg of Array.from(itemAgg.values())) {
    const cmRatio = safeDivide(agg.totalCM, agg.totalRevenue) * 100;
    const trafficLight: TrafficLight =
      cmRatio >= greenMin ? "green" :
      cmRatio >= yellowMin ? "yellow" : "red";

    // 품목 코드로 트렌드 매칭
    const code = extractItemCode(agg.item);
    const trend = trendMap.get(code) || [];
    const trendDirection = detectTrendDirection(trend);
    const consecutiveRedMonths = countConsecutiveRedMonths(trend);

    items.push({
      item: agg.item,
      itemName: agg.itemName,
      contributionMargin: agg.totalCM,
      contributionMarginRatio: cmRatio,
      revenue: agg.totalRevenue,
      quantity: agg.totalQty,
      trafficLight,
      monthlyTrend: trend,
      trendDirection,
      consecutiveRedMonths,
      revenueAtRisk: trafficLight === "red" ? agg.totalRevenue : 0,
    });
  }

  // 위험도 높은 순 정렬 (red → yellow → green, 매출 내림차순)
  const order: Record<TrafficLight, number> = { red: 0, yellow: 1, green: 2 };
  items.sort((a, b) => order[a.trafficLight] - order[b.trafficLight] || b.revenue - a.revenue);

  const green = items.filter(i => i.trafficLight === "green").length;
  const yellow = items.filter(i => i.trafficLight === "yellow").length;
  const red = items.filter(i => i.trafficLight === "red").length;

  return {
    totalItems: items.length,
    green,
    yellow,
    red,
    totalRevenueAtRisk: items.reduce((s, i) => s + i.revenueAtRisk, 0),
    deterioratingCount: items.filter(i => i.trendDirection === "deteriorating").length,
    items,
  };
}

// ═══════════════════════════════════════════════════
// F3: 가동률-단위원가 회귀분석 (쌍곡선 + 선형 듀얼)
// ═══════════════════════════════════════════════════

export interface RegressionResult {
  item: string;
  itemName: string;
  category: string;
  unit: string;
  dataPoints: Array<{ month: string; quantity: number; unitCost: number }>;
  pointCount: number;
  /** 선형 회귀: unitCost = intercept + slope × quantity */
  linear: { slope: number; intercept: number; rSquared: number };
  /** 쌍곡선 회귀: unitCost = a + b × (1/quantity) */
  hyperbolic: { a: number; b: number; rSquared: number };
  bestModel: "linear" | "hyperbolic";
  bestRSquared: number;
  isSignificant: boolean;
  hypothesisSupport: "support" | "partial" | "reject";
  /** 한국어 1줄 판정 */
  interpretation: string;
}

export interface RegressionSummary {
  totalItems: number;
  significantCount: number;
  supportCount: number;
  rejectCount: number;
  partialCount: number;
  avgBestRSquared: number;
  items: RegressionResult[];
}

/**
 * OLS 선형 회귀: Y = intercept + slope × X
 * @returns { slope, intercept, rSquared }
 */
function ols(xs: number[], ys: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² = 1 - SS_res / SS_tot
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, rSquared };
}

/**
 * F3: 가동률-단위원가 회귀분석
 *
 * 품목별 14개월 (실적수량, 단위당 총원가) 시계열로 회귀 분석.
 * 선형 + 쌍곡선 듀얼 모델을 동시에 적합하여 비교.
 *
 * @param rawItemProfitability — 200 보고서 월별 원본 (month 필드 보존)
 * @param options.minDataPoints — 최소 데이터 포인트 수 (default 3)
 * @param options.excludeRawMaterial — 원재료비 제외 (가격 효과 분리)
 * @param options.minQuantity — 최소 수량 필터 (default 10, 이상치 방지)
 */
export function calcVolumeUnitCostRegression(
  rawItemProfitability: ItemProfitabilityRecord[],
  options?: {
    minDataPoints?: number;
    excludeRawMaterial?: boolean;
    minQuantity?: number;
  }
): RegressionSummary {
  const minPts = options?.minDataPoints ?? 3;
  const excludeRM = options?.excludeRawMaterial ?? false;
  const minQty = options?.minQuantity ?? 10;

  // 품목×월 집계
  const agg = new Map<string, {
    name: string; category: string; unit: string;
    months: Map<string, { qty: number; cost: number }>;
  }>();

  for (const r of rawItemProfitability) {
    const month = (r as any).month || "";
    if (!month) continue;
    const code = extractItemCode((r.품목 || "").trim());
    if (!code) continue;
    const qty = r.매출수량 || 0;
    if (qty < minQty) continue; // 이상치 필터

    let cost = r.실적매출원가 || 0;
    if (excludeRM) {
      cost -= (r.원재료비 || 0) + (r.부재료비 || 0);
    }
    if (cost <= 0) continue;

    if (!agg.has(code)) {
      agg.set(code, {
        name: extractItemName((r.품목 || "").trim()),
        category: (r as any).대분류 || "",
        unit: (r as any).기준단위 || "",
        months: new Map(),
      });
    }
    const entry = agg.get(code)!;
    const prev = entry.months.get(month);
    if (prev) {
      prev.qty += qty;
      prev.cost += cost;
    } else {
      entry.months.set(month, { qty, cost });
    }
  }

  const items: RegressionResult[] = [];
  for (const [code, entry] of Array.from(agg.entries())) {
    const dataPoints: RegressionResult["dataPoints"] = [];
    for (const [month, { qty, cost }] of Array.from(entry.months.entries())) {
      if (qty > 0) {
        dataPoints.push({ month, quantity: qty, unitCost: cost / qty });
      }
    }
    dataPoints.sort((a, b) => a.month.localeCompare(b.month));

    if (dataPoints.length < minPts) continue;

    const quantities = dataPoints.map(d => d.quantity);
    const unitCosts = dataPoints.map(d => d.unitCost);
    const invQuantities = dataPoints.map(d => 1 / d.quantity);

    // 선형: unitCost = intercept + slope × quantity
    const linear = ols(quantities, unitCosts);
    // 쌍곡선: unitCost = a + b × (1/quantity) → OLS on (1/qty, unitCost)
    const hypRaw = ols(invQuantities, unitCosts);
    const hyperbolic = { a: hypRaw.intercept, b: hypRaw.slope, rSquared: hypRaw.rSquared };

    const bestModel = hyperbolic.rSquared >= linear.rSquared ? "hyperbolic" as const : "linear" as const;
    const bestRSquared = Math.max(hyperbolic.rSquared, linear.rSquared);

    // 판정: 올바른 방향인지 확인
    // 선형: slope < 0 → 수량↑ → 원가↓
    // 쌍곡선: b > 0 → 수량↑ → 1/수량↓ → 원가↓
    const linearCorrectDirection = linear.slope < 0;
    const hypCorrectDirection = hyperbolic.b > 0;
    const bestCorrectDirection = bestModel === "hyperbolic" ? hypCorrectDirection : linearCorrectDirection;

    let hypothesisSupport: RegressionResult["hypothesisSupport"];
    let interpretation: string;

    if (bestRSquared > 0.5 && bestCorrectDirection) {
      hypothesisSupport = "support";
      interpretation = `수량 증가 시 단위원가 감소 경향 확인 (R²=${bestRSquared.toFixed(2)}, ${bestModel === "hyperbolic" ? "쌍곡선" : "선형"} 모델)`;
    } else if (bestRSquared > 0.3 && bestCorrectDirection) {
      hypothesisSupport = "partial";
      interpretation = `약한 수량-원가 관계 (R²=${bestRSquared.toFixed(2)}). 추가 분석 필요`;
    } else {
      hypothesisSupport = "reject";
      if (!bestCorrectDirection) {
        interpretation = `수량-원가 관계 방향이 반대이거나 무관 → 사업부 주장 기각`;
      } else {
        interpretation = `설명력 부족 (R²=${bestRSquared.toFixed(2)}) → 사업부 주장 기각`;
      }
    }

    items.push({
      item: code,
      itemName: entry.name,
      category: entry.category,
      unit: entry.unit,
      dataPoints,
      pointCount: dataPoints.length,
      linear,
      hyperbolic,
      bestModel,
      bestRSquared,
      isSignificant: bestRSquared > 0.3 && dataPoints.length >= minPts,
      hypothesisSupport,
      interpretation,
    });
  }

  // R² 내림차순
  items.sort((a, b) => b.bestRSquared - a.bestRSquared);

  const supportCount = items.filter(i => i.hypothesisSupport === "support").length;
  const rejectCount = items.filter(i => i.hypothesisSupport === "reject").length;
  const partialCount = items.filter(i => i.hypothesisSupport === "partial").length;
  const significantCount = items.filter(i => i.isSignificant).length;
  const avgR2 = items.length > 0
    ? items.reduce((s, i) => s + i.bestRSquared, 0) / items.length
    : 0;

  return {
    totalItems: items.length,
    significantCount,
    supportCount,
    rejectCount,
    partialCount,
    avgBestRSquared: avgR2,
    items,
  };
}

// ═══════════════════════════════════════════════════
// F5: Capacity 제약 경고
// ═══════════════════════════════════════════════════

export type CapacityAlertLevel = "safe" | "caution" | "critical";
export type CapacityConfidence = "high" | "medium" | "low";

export interface CapacityEstimate {
  item: string;
  itemName: string;
  factory: string;
  /** Source A: 제조원가 BOM 기반 월평균 생산량 */
  mfgProductionQty?: number;
  /** Source B: 판매 실적 기반 최대 월 판매량 */
  maxMonthlySalesQty?: number;
  /** 최종 추정 월간 Capacity = max(A, B) × 1.15 */
  estimatedMonthlyCapacity: number;
  confidence: CapacityConfidence;
  /** 최근월 판매 수요 */
  currentDemand: number;
  utilizationPct: number;
  headroomQty: number;
  alertLevel: CapacityAlertLevel;
  /** 시뮬레이션 후 수요 (선택) */
  postSimDemand?: number;
  postSimUtilizationPct?: number;
}

export interface CapacitySummary {
  items: CapacityEstimate[];
  criticalCount: number;
  cautionCount: number;
  safeCount: number;
  avgUtilization: number;
}

/**
 * F5: Capacity 제약 경고
 *
 * 듀얼 소스 Capacity 추정:
 *   A. 제조원가 BOM 기반: 생산입고수량 / 3 (Q1 → 월평균)
 *   B. 판매 실적 기반: max(월별 매출수량)
 *   최종: max(A, B) × 1.15 (15% headroom)
 *
 * @param manufacturingCost — 제조원가 BOM 데이터
 * @param rawItemProfitability — 200 보고서 월별 (판매량 추이)
 * @param simulatedAdds — 시뮬레이션 추가 수량 (오프셋 탭 연동)
 */
export function calcCapacityUtilization(
  manufacturingCost: ManufacturingCostRecord[],
  rawItemProfitability: ItemProfitabilityRecord[],
  simulatedAdds?: Array<{ item: string; addedQty: number }>
): CapacitySummary {
  const HEADROOM = 1.15;

  // Source A: 제조원가 BOM → 품목×공장별 월평균 생산량
  const mfgMap = new Map<string, { factory: string; monthlyQty: number }>();
  for (const r of manufacturingCost) {
    const code = (r.생산품코드 || "").trim();
    if (!code || r.생산입고수량 <= 0) continue;
    // Q1 분기(3개월) → 월평균
    const monthlyQty = r.생산입고수량 / 3;
    const prev = mfgMap.get(code);
    if (!prev || monthlyQty > prev.monthlyQty) {
      mfgMap.set(code, { factory: r.factory, monthlyQty });
    }
  }

  // Source B: 200 보고서 → 품목별 월별 최대 판매량 + 최근월 수요
  const salesMap = new Map<string, {
    maxMonthlyQty: number;
    latestMonthQty: number;
    latestMonth: string;
    name: string;
  }>();
  for (const r of rawItemProfitability) {
    const month = (r as any).month || "";
    if (!month) continue;
    const code = extractItemCode((r.품목 || "").trim());
    if (!code) continue;
    const qty = r.매출수량 || 0;
    if (qty <= 0) continue;
    const prev = salesMap.get(code);
    if (!prev) {
      salesMap.set(code, {
        maxMonthlyQty: qty,
        latestMonthQty: qty,
        latestMonth: month,
        name: extractItemName((r.품목 || "").trim()),
      });
    } else {
      if (qty > prev.maxMonthlyQty) prev.maxMonthlyQty = qty;
      if (month > prev.latestMonth) {
        prev.latestMonthQty = qty;
        prev.latestMonth = month;
      }
    }
  }

  // 시뮬 추가 수량 맵
  const simMap = new Map<string, number>();
  if (simulatedAdds) {
    for (const s of simulatedAdds) {
      const code = extractItemCode(s.item);
      simMap.set(code, (simMap.get(code) || 0) + s.addedQty);
    }
  }

  // 두 소스 병합
  const allCodes = new Set([...Array.from(mfgMap.keys()), ...Array.from(salesMap.keys())]);
  const items: CapacityEstimate[] = [];

  for (const code of Array.from(allCodes)) {
    const mfg = mfgMap.get(code);
    const sales = salesMap.get(code);

    const mfgQty = mfg?.monthlyQty;
    const salesMaxQty = sales?.maxMonthlyQty;
    const currentDemand = sales?.latestMonthQty || 0;

    // Capacity 추정
    const baseCapacity = Math.max(mfgQty || 0, salesMaxQty || 0);
    if (baseCapacity <= 0) continue; // 데이터 없음

    const estimatedCapacity = baseCapacity * HEADROOM;
    const confidence: CapacityConfidence =
      mfgQty && salesMaxQty ? "high" :
      mfgQty || salesMaxQty ? "medium" : "low";

    const utilizationPct = safeDivide(currentDemand, estimatedCapacity) * 100;
    const headroomQty = Math.max(estimatedCapacity - currentDemand, 0);
    const alertLevel: CapacityAlertLevel =
      utilizationPct >= 90 ? "critical" :
      utilizationPct >= 70 ? "caution" : "safe";

    const entry: CapacityEstimate = {
      item: code,
      itemName: sales?.name || code,
      factory: mfg?.factory || "N/A",
      mfgProductionQty: mfgQty,
      maxMonthlySalesQty: salesMaxQty,
      estimatedMonthlyCapacity: estimatedCapacity,
      confidence,
      currentDemand,
      utilizationPct,
      headroomQty,
      alertLevel,
    };

    // 시뮬 연동
    const addedQty = simMap.get(code);
    if (addedQty !== undefined) {
      const postDemand = currentDemand + addedQty;
      entry.postSimDemand = postDemand;
      entry.postSimUtilizationPct = safeDivide(postDemand, estimatedCapacity) * 100;
    }

    items.push(entry);
  }

  // 가동률 내림차순
  items.sort((a, b) => b.utilizationPct - a.utilizationPct);

  const criticalCount = items.filter(i => i.alertLevel === "critical").length;
  const cautionCount = items.filter(i => i.alertLevel === "caution").length;
  const safeCount = items.filter(i => i.alertLevel === "safe").length;
  const avgUtilization = items.length > 0
    ? items.reduce((s, i) => s + i.utilizationPct, 0) / items.length
    : 0;

  return { items, criticalCount, cautionCount, safeCount, avgUtilization };
}

// ═══════════════════════════════════════════════════
// F6: Cannibalization (가격 잠식) 경고
// ═══════════════════════════════════════════════════

export type CannibAlertLevel = "none" | "watch" | "alert";

export interface CannibalizationRisk {
  item: string;
  itemName: string;
  customerCount: number;
  weightedAvgPrice: number;
  medianPrice: number;
  p25Price: number;
  p75Price: number;
  minPrice: number;
  maxPrice: number;
  /** 수량 가중 변동계수 (CV) */
  priceDispersionCV: number;
  alertLevel: CannibAlertLevel;
  lowPriceCustomers: Array<{
    customer: string;
    customerName: string;
    unitPrice: number;
    quantity: number;
    discountFromMedianPct: number;
  }>;
  /** 전 거래처가 최저가로 재협상 시 연간 매출 감소 추정 */
  worstCaseAnnualLoss: number;
}

export interface CannibalizationSummary {
  items: CannibalizationRisk[];
  alertCount: number;
  watchCount: number;
  totalWorstCaseLoss: number;
}

/** 배열의 P-th 백분위수 (정렬된 배열) */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * F6: Cannibalization 경고
 *
 * 동일 품목의 거래처별 매출 단가 분포를 분석하여
 * 가격 잠식 위험을 정량화한다.
 *
 * @param customerItemDetail — 100 보고서 (거래처×품목별 데이터)
 * @param minCustomerCount — 최소 거래처 수 (default 3, 통계 유의성)
 */
export function calcCannibalizationRisk(
  customerItemDetail: CustomerItemDetailRecord[],
  minCustomerCount = 3
): CannibalizationSummary {
  // 품목별 거래처 단가 집계
  const itemCusts = new Map<string, Map<string, {
    customerName: string;
    revenue: number;
    quantity: number;
  }>>();

  for (const r of customerItemDetail) {
    const item = (r.품목 || "").trim();
    const customer = (r.매출거래처 || "").trim();
    if (!item || !customer) continue;
    const qty = r.매출수량?.실적 || 0;
    if (qty <= 0) continue; // 반품/환입 제외
    const rev = r.매출액?.실적 || 0;

    if (!itemCusts.has(item)) itemCusts.set(item, new Map());
    const custMap = itemCusts.get(item)!;
    const prev = custMap.get(customer);
    if (prev) {
      prev.revenue += rev;
      prev.quantity += qty;
    } else {
      custMap.set(customer, {
        customerName: r.매출거래처명 || customer,
        revenue: rev,
        quantity: qty,
      });
    }
  }

  const items: CannibalizationRisk[] = [];

  for (const [item, custMap] of Array.from(itemCusts.entries())) {
    if (custMap.size < minCustomerCount) continue;

    const customers = Array.from(custMap.entries())
      .map(([cust, data]) => ({
        customer: cust,
        customerName: data.customerName,
        unitPrice: safeDivide(data.revenue, data.quantity),
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .filter(c => c.unitPrice > 0);

    if (customers.length < minCustomerCount) continue;

    const prices = customers.map(c => c.unitPrice);
    const sortedPrices = [...prices].sort((a, b) => a - b);

    const medianPrice = percentile(sortedPrices, 50);
    const p25 = percentile(sortedPrices, 25);
    const p75 = percentile(sortedPrices, 75);

    // 수량 가중 평균 + 수량 가중 CV
    const totalQty = customers.reduce((s, c) => s + c.quantity, 0);
    const weightedAvgPrice = totalQty > 0
      ? customers.reduce((s, c) => s + c.unitPrice * c.quantity, 0) / totalQty
      : 0;
    const weightedVariance = totalQty > 0
      ? customers.reduce((s, c) => s + c.quantity * (c.unitPrice - weightedAvgPrice) ** 2, 0) / totalQty
      : 0;
    const weightedStd = Math.sqrt(weightedVariance);
    const weightedCV = weightedAvgPrice > 0 ? (weightedStd / weightedAvgPrice) * 100 : 0;

    const alertLevel: CannibAlertLevel =
      weightedCV > 30 ? "alert" :
      weightedCV > 15 ? "watch" : "none";

    // 저가 거래처: P25 미만
    const lowPriceCustomers = customers
      .filter(c => c.unitPrice < p25)
      .map(c => ({
        customer: c.customer,
        customerName: c.customerName,
        unitPrice: c.unitPrice,
        quantity: c.quantity,
        discountFromMedianPct: medianPrice > 0 ? ((medianPrice - c.unitPrice) / medianPrice) * 100 : 0,
      }))
      .sort((a, b) => a.unitPrice - b.unitPrice);

    // 최악 시나리오: 모든 거래처가 최저가로 재협상
    const minPrice = sortedPrices[0] || 0;
    const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0);
    const worstCaseRevenue = minPrice * totalQty;
    const worstCaseAnnualLoss = Math.max(totalRevenue - worstCaseRevenue, 0);

    const itemName = item; // 100 보고서에서 품목명은 별도 매핑 필요 시 확장

    items.push({
      item,
      itemName,
      customerCount: customers.length,
      weightedAvgPrice,
      medianPrice,
      p25Price: p25,
      p75Price: p75,
      minPrice,
      maxPrice: sortedPrices[sortedPrices.length - 1] || 0,
      priceDispersionCV: weightedCV,
      alertLevel,
      lowPriceCustomers,
      worstCaseAnnualLoss,
    });
  }

  // 위험도 내림차순
  items.sort((a, b) => b.priceDispersionCV - a.priceDispersionCV);

  return {
    items,
    alertCount: items.filter(i => i.alertLevel === "alert").length,
    watchCount: items.filter(i => i.alertLevel === "watch").length,
    totalWorstCaseLoss: items.reduce((s, i) => s + i.worstCaseAnnualLoss, 0),
  };
}

// ═══════════════════════════════════════════════════
// 종합 판정: 4가지 분석 결과 통합
// ═══════════════════════════════════════════════════

export type OverallVerdict = "valid" | "partial" | "invalid";

export interface HypothesisVerdictSummary {
  overall: OverallVerdict;
  overallLabel: string;
  /** CEO 보고용 1문장 */
  ceoSummary: string;
  details: {
    f1: { verdict: TrafficLight; label: string; redCount: number };
    f3: { verdict: TrafficLight; label: string; supportPct: number };
    f5: { verdict: TrafficLight; label: string; criticalCount: number };
    f6: { verdict: TrafficLight; label: string; alertCount: number };
  };
}

/**
 * 4가지 분석 결과를 통합하여 종합 판정을 내린다.
 */
export function calcOverallVerdict(
  redFlag: RedFlagSummary,
  regression: RegressionSummary,
  capacity: CapacitySummary,
  cannibalization: CannibalizationSummary
): HypothesisVerdictSummary {
  // F1: Red 비율
  const redRatio = redFlag.totalItems > 0 ? redFlag.red / redFlag.totalItems : 0;
  const f1Verdict: TrafficLight = redRatio > 0.3 ? "red" : redRatio > 0.1 ? "yellow" : "green";
  const f1Label = `${redFlag.red}개 품목 공헌이익 음수 (${(redRatio * 100).toFixed(0)}%)`;

  // F3: Support 비율
  const supportPct = regression.totalItems > 0
    ? ((regression.supportCount + regression.partialCount * 0.5) / regression.totalItems) * 100
    : 0;
  const f3Verdict: TrafficLight = supportPct >= 50 ? "green" : supportPct >= 25 ? "yellow" : "red";
  const f3Label = `${regression.supportCount}/${regression.totalItems} 품목 지지 (평균 R²=${regression.avgBestRSquared.toFixed(2)})`;

  // F5: Critical 여부
  const f5Verdict: TrafficLight = capacity.criticalCount > 0 ? "red" : capacity.cautionCount > 0 ? "yellow" : "green";
  const f5Label = capacity.criticalCount > 0
    ? `${capacity.criticalCount}건 Capacity 초과`
    : `평균 가동률 ${capacity.avgUtilization.toFixed(0)}%`;

  // F6: Alert 여부
  const f6Verdict: TrafficLight = cannibalization.alertCount > 0 ? "red" : cannibalization.watchCount > 0 ? "yellow" : "green";
  const f6Label = cannibalization.alertCount > 0
    ? `${cannibalization.alertCount}건 가격 잠식 위험`
    : "가격 체계 안정";

  // 종합: red 수에 따라 판정
  const verdicts = [f1Verdict, f3Verdict, f5Verdict, f6Verdict];
  const redCount = verdicts.filter(v => v === "red").length;
  const overall: OverallVerdict =
    redCount >= 3 ? "invalid" :
    redCount >= 1 ? "partial" : "valid";

  const overallLabel =
    overall === "invalid" ? "가설 기각: 저가수주 확대 시 손실 확대 위험"
    : overall === "partial" ? "가설 부분 유효: 일부 품목만 이익 기여 가능"
    : "가설 유효: 물량 확대 시 고정비 분산 효과 확인";

  // CEO 보고용 요약
  const greenItems = redFlag.green;
  const ceoSummary =
    overall === "invalid"
      ? `분석 대상 ${redFlag.totalItems}개 품목 중 ${redFlag.red}개가 공헌이익 음수로 팔수록 손해. 저가수주 확대는 이익을 악화시킵니다.`
      : overall === "partial"
        ? `${redFlag.totalItems}개 품목 중 ${greenItems}개는 이익 기여 가능하나, ${redFlag.red}개는 공헌이익 음수로 제외 필요. 품목별 선별적 접근 권장.`
        : `대부분의 품목(${greenItems}/${redFlag.totalItems})에서 물량 증가 시 고정비 분산 효과 확인. 단, Capacity 제약 ${capacity.criticalCount}건 주의.`;

  return {
    overall,
    overallLabel,
    ceoSummary,
    details: {
      f1: { verdict: f1Verdict, label: f1Label, redCount: redFlag.red },
      f3: { verdict: f3Verdict, label: f3Label, supportPct },
      f5: { verdict: f5Verdict, label: f5Label, criticalCount: capacity.criticalCount },
      f6: { verdict: f6Verdict, label: f6Label, alertCount: cannibalization.alertCount },
    },
  };
}

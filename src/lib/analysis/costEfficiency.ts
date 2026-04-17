/**
 * 공장 효율성 & 표준원가 정확도 분석
 *
 *  - 공장 간 동일 품목 효율성 매트릭스
 *  - 표준원가 정확도 KPI (변동률 분포 통계)
 *  - 저효율 라인 자동 탐지
 */
import type {
  StandardCostBookRecord,
  ManufacturingCostRecord,
  ThreeWayComparisonRow,
} from "@/types";
import { safeDivide } from "@/lib/utils";

// ─── 공장 간 동일 품목 효율성 매트릭스 ──────────────────

export interface FactoryEfficiencyRow {
  itemCode: string;
  itemName: string;
  /** 공장별 실제 단가 (양산/청산/울산/용산) */
  costByFactory: Record<string, number | null>;
  /** 공장별 표준 단가 */
  stdCostByFactory: Record<string, number | null>;
  /** 공장별 생산량 */
  qtyByFactory: Record<string, number>;
  /** 최저 단가 공장 */
  cheapestFactory: string | null;
  cheapestCost: number | null;
  /** 최고 단가 공장 */
  mostExpensiveFactory: string | null;
  mostExpensiveCost: number | null;
  /** 공장 간 단가 차이 (%) — (max - min) / min × 100 */
  spreadPct: number | null;
  /** 이 품목이 여러 공장에서 생산되는지 */
  multiFactoryProduced: boolean;
}

/**
 * 동일 품목코드가 여러 공장에서 생산될 때 공장별 원가 비교.
 * 공장 라인 통합·이전 의사결정의 핵심 근거.
 */
export function calcFactoryEfficiencyMatrix(
  manufacturingCost: ManufacturingCostRecord[],
  standardCostBook: StandardCostBookRecord[]
): FactoryEfficiencyRow[] {
  const byItem = new Map<string, {
    itemName: string;
    costs: Record<string, number | null>;
    qtys: Record<string, number>;
  }>();
  for (const r of manufacturingCost) {
    const code = r.생산품코드;
    if (!code || r.actualUnitCost <= 0) continue;
    const entry = byItem.get(code) || { itemName: r.생산품명, costs: {}, qtys: {} };
    entry.costs[r.factory] = r.actualUnitCost;
    entry.qtys[r.factory] = r.생산입고수량;
    if (!entry.itemName) entry.itemName = r.생산품명;
    byItem.set(code, entry);
  }

  const stdByItemFactory = new Map<string, Map<string, number>>();
  for (const s of standardCostBook) {
    if (s.품목계정그룹 !== "제품" && s.품목계정그룹 !== "상품") continue;
    const m = stdByItemFactory.get(s.품목코드) || new Map<string, number>();
    m.set(s.factory, s.표준원가);
    stdByItemFactory.set(s.품목코드, m);
  }

  const result: FactoryEfficiencyRow[] = [];
  for (const [code, entry] of Array.from(byItem.entries())) {
    const factories = Object.keys(entry.costs);
    const stdMap = stdByItemFactory.get(code);
    const stdCostByFactory: Record<string, number | null> = {};
    if (stdMap) {
      for (const [f, v] of Array.from(stdMap.entries())) stdCostByFactory[f] = v;
    }

    const costEntries = factories
      .map((f) => ({ f, cost: entry.costs[f] }))
      .filter((e): e is { f: string; cost: number } => e.cost !== null && e.cost > 0);
    if (costEntries.length === 0) continue;
    costEntries.sort((a, b) => a.cost - b.cost);
    const cheapest = costEntries[0];
    const mostExpensive = costEntries[costEntries.length - 1];
    const spreadPct = cheapest.cost > 0
      ? ((mostExpensive.cost - cheapest.cost) / cheapest.cost) * 100
      : null;

    result.push({
      itemCode: code,
      itemName: entry.itemName,
      costByFactory: entry.costs,
      stdCostByFactory,
      qtyByFactory: entry.qtys,
      cheapestFactory: cheapest.f,
      cheapestCost: cheapest.cost,
      mostExpensiveFactory: mostExpensive.f,
      mostExpensiveCost: mostExpensive.cost,
      spreadPct,
      multiFactoryProduced: factories.length > 1,
    });
  }

  return result.sort((a, b) => {
    if (a.multiFactoryProduced !== b.multiFactoryProduced) {
      return a.multiFactoryProduced ? -1 : 1;
    }
    return (b.spreadPct ?? 0) - (a.spreadPct ?? 0);
  });
}

// ─── 표준원가 정확도 KPI ────────────────────────────────

export interface StandardCostAccuracyKPI {
  sampleSize: number;               // 유효 비교 건수 (3-Way matched)
  /** 절대 변동률 평균 (매출액 가중) — 0에 가까울수록 표준 정확 */
  weightedAbsVariancePct: number;
  /** 절대 변동률 중위수 (매출액 가중) */
  medianAbsVariancePct: number;
  /** 절대 변동률 p90 (매출액 가중 가장 큰 편차 상위 10%) */
  p90AbsVariancePct: number;
  /** 양수 변동률 비중 (표준보다 비싸게 만든 품목 비율) */
  overStandardRatio: number;
  /** 벤치마크 ±5% 내 품목 비중 (매출액 가중) */
  within5PctRatio: number;
  /** 벤치마크 ±10% 내 품목 비중 */
  within10PctRatio: number;
  /** 등급 */
  grade: "A" | "B" | "C" | "D";
  /** 진단 메시지 */
  diagnosis: string;
}

/**
 * 원가 회계 표준원가 정확도 벤치마크:
 * - ±5% 이내: 70%+ → A등급 (표준 개정 불필요)
 * - ±10% 이내: 70%+ → B등급 (부분 개정 검토)
 * - ±20% 이내: 70%+ → C등급 (조속 개정 필요)
 * - 그 이상: D등급 (전면 재산정)
 */
export function calcStandardCostAccuracyKPI(
  rows: ThreeWayComparisonRow[]
): StandardCostAccuracyKPI {
  const matched = rows.filter((r) =>
    r.hasStandard && r.hasManufacturing &&
    r.stdVsActualVariancePct !== null && r.salesAmount > 0
  );
  if (matched.length === 0) {
    return {
      sampleSize: 0,
      weightedAbsVariancePct: 0,
      medianAbsVariancePct: 0,
      p90AbsVariancePct: 0,
      overStandardRatio: 0,
      within5PctRatio: 0,
      within10PctRatio: 0,
      grade: "D",
      diagnosis: "3-Way 매칭 샘플 부족 — 정확도 평가 불가",
    };
  }

  const totalSales = matched.reduce((s, r) => s + r.salesAmount, 0);

  // 가중 평균 절대 변동률
  const weightedAbsSum = matched.reduce((s, r) =>
    s + Math.abs(r.stdVsActualVariancePct!) * r.salesAmount, 0);
  const weightedAbsVariancePct = safeDivide(weightedAbsSum, totalSales);

  // 가중 중위수: 매출액을 가중치로 정렬 후 누적 50%인 값
  const sortedByAbs = matched
    .map((r) => ({ abs: Math.abs(r.stdVsActualVariancePct!), w: r.salesAmount }))
    .sort((a, b) => a.abs - b.abs);
  let cumWeight = 0;
  let median: number | null = null;
  let p90: number | null = null;
  for (const e of sortedByAbs) {
    cumWeight += e.w;
    if (median === null && cumWeight >= totalSales * 0.5) median = e.abs;
    if (p90 === null && cumWeight >= totalSales * 0.9) { p90 = e.abs; break; }
  }
  if (p90 === null) p90 = sortedByAbs[sortedByAbs.length - 1]?.abs ?? 0;

  // 양수 비중 (매출액 가중)
  const overSalesSum = matched
    .filter((r) => r.stdVsActualVariancePct! > 0)
    .reduce((s, r) => s + r.salesAmount, 0);
  const overStandardRatio = safeDivide(overSalesSum, totalSales);

  // 범위별 비중 (매출액 가중)
  const within5Sum = matched
    .filter((r) => Math.abs(r.stdVsActualVariancePct!) <= 5)
    .reduce((s, r) => s + r.salesAmount, 0);
  const within10Sum = matched
    .filter((r) => Math.abs(r.stdVsActualVariancePct!) <= 10)
    .reduce((s, r) => s + r.salesAmount, 0);
  const within5PctRatio = safeDivide(within5Sum, totalSales);
  const within10PctRatio = safeDivide(within10Sum, totalSales);

  // 등급 판정
  let grade: "A" | "B" | "C" | "D";
  let diagnosis: string;
  if (within5PctRatio >= 0.7) {
    grade = "A";
    diagnosis = "우수 — 표준원가가 실제와 일치 (매출의 70% 이상이 ±5% 내)";
  } else if (within10PctRatio >= 0.7) {
    grade = "B";
    diagnosis = "양호 — ±10% 내 70% 이상. 일부 품목 표준 개정 검토";
  } else if (weightedAbsVariancePct <= 20) {
    grade = "C";
    diagnosis = "주의 — 편차 상당함. 분기별 표준 개정 권고";
  } else {
    grade = "D";
    diagnosis = "부진 — 표준이 실제를 반영하지 못함. 전면 재산정 필요";
  }

  return {
    sampleSize: matched.length,
    weightedAbsVariancePct,
    medianAbsVariancePct: median ?? 0,
    p90AbsVariancePct: p90 ?? 0,
    overStandardRatio,
    within5PctRatio,
    within10PctRatio,
    grade,
    diagnosis,
  };
}

// ─── 공장별 표준원가 커버리지 ──────────────────────────

export interface FactoryStandardCostCoverage {
  factory: string;
  manufacturedItems: number;      // 제조원가 데이터 보유 품목 수
  standardRegistered: number;     // 그중 표준원가 등록 품목 수
  coveragePct: number;            // standardRegistered / manufacturedItems × 100
  missingItems: Array<{ code: string; name: string }>;  // 표준원가 미등록 샘플
  status: "complete" | "partial" | "missing";
}

/**
 * 공장별 "제조는 되지만 표준원가가 없는" 품목 커버리지.
 * 울산공장처럼 표준원가 파일 자체가 누락된 경우를 명시적으로 노출.
 */
export function calcFactoryStandardCostCoverage(
  manufacturingCost: ManufacturingCostRecord[],
  standardCostBook: StandardCostBookRecord[]
): FactoryStandardCostCoverage[] {
  const stdByFactoryCode = new Set<string>();
  for (const s of standardCostBook) {
    if (s.품목계정그룹 !== "제품" && s.품목계정그룹 !== "상품") continue;
    stdByFactoryCode.add(`${s.factory}||${s.품목코드}`);
  }

  const byFactory = new Map<string, { items: Map<string, string>; registered: number }>();
  for (const m of manufacturingCost) {
    const entry = byFactory.get(m.factory) || { items: new Map<string, string>(), registered: 0 };
    if (!entry.items.has(m.생산품코드)) {
      entry.items.set(m.생산품코드, m.생산품명);
      if (stdByFactoryCode.has(`${m.factory}||${m.생산품코드}`)) entry.registered += 1;
    }
    byFactory.set(m.factory, entry);
  }

  const result: FactoryStandardCostCoverage[] = [];
  for (const [factory, v] of Array.from(byFactory.entries())) {
    const manufacturedItems = v.items.size;
    const coveragePct = manufacturedItems > 0 ? (v.registered / manufacturedItems) * 100 : 0;
    const missing: Array<{ code: string; name: string }> = [];
    for (const [code, name] of Array.from(v.items.entries())) {
      if (!stdByFactoryCode.has(`${factory}||${code}`)) {
        missing.push({ code, name });
        if (missing.length >= 10) break;
      }
    }
    result.push({
      factory,
      manufacturedItems,
      standardRegistered: v.registered,
      coveragePct,
      missingItems: missing,
      status: coveragePct >= 95 ? "complete" : coveragePct > 0 ? "partial" : "missing",
    });
  }
  return result.sort((a, b) => b.manufacturedItems - a.manufacturedItems);
}

// ─── 저효율 라인 자동 탐지 ──────────────────────────────

export interface InefficiencyAlert {
  itemCode: string;
  itemName: string;
  alertType: "factory_spread" | "overstandard" | "understandard";
  severity: "critical" | "high" | "medium";
  message: string;
  cheapestOption?: { factory: string; unitCost: number };
  currentLocation?: { factory: string; unitCost: number };
  /** 연간 절감 가능액 추정 (cheapest 단가 × 현재 생산량 차이) */
  estimatedAnnualSavings?: number;
}

/**
 * 공장 간 단가 차이 ≥ 10%인 품목 → 이전·통합 검토 대상
 * 또는 표준 대비 실제 ≥ 20% 초과 → 원가 관리 경보
 */
export function detectInefficiencies(
  efficiency: FactoryEfficiencyRow[],
  threeWay: ThreeWayComparisonRow[],
  options: { factorySpreadThreshold?: number; overstandardThreshold?: number } = {}
): InefficiencyAlert[] {
  const { factorySpreadThreshold = 10, overstandardThreshold = 20 } = options;
  const alerts: InefficiencyAlert[] = [];

  // 공장 간 스프레드 ≥ threshold
  for (const e of efficiency) {
    if (!e.multiFactoryProduced || e.spreadPct === null) continue;
    if (e.spreadPct < factorySpreadThreshold) continue;

    // 연간 절감 가능액: (현 최고 단가 - 최저 단가) × 최고 단가 공장 생산량 × 4 (1Q → 연간)
    const savings = e.mostExpensiveCost && e.cheapestCost && e.mostExpensiveFactory
      ? (e.mostExpensiveCost - e.cheapestCost) * (e.qtyByFactory[e.mostExpensiveFactory] || 0) * 4
      : 0;

    alerts.push({
      itemCode: e.itemCode,
      itemName: e.itemName,
      alertType: "factory_spread",
      severity: e.spreadPct >= 30 ? "critical" : e.spreadPct >= 15 ? "high" : "medium",
      message: `${e.mostExpensiveFactory} 공장 단가가 ${e.cheapestFactory}보다 ${e.spreadPct.toFixed(1)}% 비쌈 (${Math.round(e.mostExpensiveCost!).toLocaleString()} vs ${Math.round(e.cheapestCost!).toLocaleString()})`,
      cheapestOption: { factory: e.cheapestFactory!, unitCost: e.cheapestCost! },
      currentLocation: { factory: e.mostExpensiveFactory!, unitCost: e.mostExpensiveCost! },
      estimatedAnnualSavings: savings,
    });
  }

  // 표준 대비 실제 ≥ threshold (원가 관리 경보)
  for (const r of threeWay) {
    if (!r.hasStandard || !r.hasManufacturing || r.stdVsActualVariancePct === null) continue;
    if (Math.abs(r.stdVsActualVariancePct) < overstandardThreshold) continue;
    alerts.push({
      itemCode: r.itemCode,
      itemName: r.itemName,
      alertType: r.stdVsActualVariancePct > 0 ? "overstandard" : "understandard",
      severity: Math.abs(r.stdVsActualVariancePct) >= 50 ? "critical" :
                Math.abs(r.stdVsActualVariancePct) >= 30 ? "high" : "medium",
      message: r.stdVsActualVariancePct > 0
        ? `${r.factory} ${r.itemName}: 실제 단가가 표준보다 ${r.stdVsActualVariancePct.toFixed(1)}% 높음 → 원가 관리 점검 필요`
        : `${r.factory} ${r.itemName}: 실제 단가가 표준보다 ${(-r.stdVsActualVariancePct).toFixed(1)}% 낮음 → 표준 하향 조정 검토`,
      currentLocation: { factory: r.factory, unitCost: r.actualUnitCost! },
      estimatedAnnualSavings: r.actualUnitCost !== null && r.standardCost !== null
        ? Math.abs(r.actualUnitCost - r.standardCost) * r.salesQty * 4
        : 0,
    });
  }

  const severityRank = { critical: 0, high: 1, medium: 2 };
  return alerts.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    return (b.estimatedAnnualSavings ?? 0) - (a.estimatedAnnualSavings ?? 0);
  });
}

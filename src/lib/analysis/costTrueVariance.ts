/**
 * 3-Way 원가 비교 분석 — 판매단가 vs 표준원가 vs 실제 제조원가
 *
 * 데이터 소스:
 *  - 100 (customerItemDetail): 월별 매출 (품목명 한글)
 *  - 200 (itemProfitability): 품목명↔코드 매핑 매개 테이블
 *  - 표준원가 Book: 공장별 품목코드 표준 단가 (스냅샷)
 *  - 제조원가 (BOM 집계 후): 공장×품목코드 실제 단위원가 (2026-Q1)
 *
 * 기본 비교 기간: 2026-Q1 (202601 ~ 202603)
 */
import type {
  CustomerItemDetailRecord,
  ItemProfitabilityRecord,
  StandardCostBookRecord,
  ManufacturingCostRecord,
  ThreeWayComparisonRow,
  MonthlyPriceTrend,
} from "@/types";
import { safeDivide } from "@/lib/utils";

// ─── 유틸 ───────────────────────────────────────────────

/**
 * 품목명→품목코드 매핑 빌드.
 *
 * 소스 우선순위:
 *  1) 200 보고서 (itemProfitability) — "[코드] 이름" 형식 파싱
 *  2) 표준원가 book — 품목명 → 품목코드 직접 매핑
 *  3) 제조원가 — 생산품명 → 생산품코드 직접 매핑
 *
 * 실제 200 보고서 필드가 "[코드] 이름" 형식이 아닌 경우가 많아(한글명만),
 * 표준원가/제조원가 book에 더 의존해야 함.
 *
 * 주의: 한 이름에 여러 코드 가능 → 첫 매칭 우선.
 */
export function buildItemCodeMap(
  itemProfitability: ItemProfitabilityRecord[],
  standardCostBook: StandardCostBookRecord[] = [],
  manufacturingCost: ManufacturingCostRecord[] = []
): Map<string, string> {
  const nameToCode = new Map<string, string>();

  // 1. 200 보고서 (대괄호 형식만 추출)
  for (const r of itemProfitability) {
    const raw = (r.품목 || "").trim();
    if (!raw) continue;
    const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      const code = match[1].trim();
      const name = match[2].trim();
      if (name && !nameToCode.has(name)) nameToCode.set(name, code);
    }
  }

  // 2. 표준원가 book — 제품만 매핑 (원재료/부재료는 판매 안 함)
  for (const r of standardCostBook) {
    const name = (r.품목명 || "").trim();
    const code = (r.품목코드 || "").trim();
    if (name && code && !nameToCode.has(name)) {
      nameToCode.set(name, code);
    }
  }

  // 3. 제조원가 — 생산품명 기반
  for (const r of manufacturingCost) {
    const name = (r.생산품명 || "").trim();
    const code = (r.생산품코드 || "").trim();
    if (name && code && !nameToCode.has(name)) {
      nameToCode.set(name, code);
    }
  }

  return nameToCode;
}

/**
 * 표준원가 book 조회: (factory, itemCode) → 표준원가
 * 공장이 매칭되지 않으면 다른 공장의 값을 fallback으로 사용.
 */
function buildStandardCostLookup(
  book: StandardCostBookRecord[]
): Map<string, StandardCostBookRecord> {
  const map = new Map<string, StandardCostBookRecord>();
  for (const r of book) {
    const key = `${r.factory}||${r.품목코드}`;
    map.set(key, r);
    // Fallback: 코드만 (공장 불명 시)
    const codeOnly = `*||${r.품목코드}`;
    if (!map.has(codeOnly)) map.set(codeOnly, r);
  }
  return map;
}

function buildManufacturingLookup(
  data: ManufacturingCostRecord[]
): Map<string, ManufacturingCostRecord> {
  const map = new Map<string, ManufacturingCostRecord>();
  for (const r of data) {
    const key = `${r.factory}||${r.생산품코드}`;
    map.set(key, r);
    const codeOnly = `*||${r.생산품코드}`;
    if (!map.has(codeOnly)) map.set(codeOnly, r);
  }
  return map;
}

// ─── 핵심 3-Way 계산 ────────────────────────────────────

export interface ThreeWayInput {
  customerItemDetail: CustomerItemDetailRecord[];
  itemProfitability: ItemProfitabilityRecord[];
  standardCostBook: StandardCostBookRecord[];
  manufacturingCost: ManufacturingCostRecord[];
  periodStart?: string; // "YYYYMM", 기본 "202601"
  periodEnd?: string;   // "YYYYMM", 기본 "202603"
}

export interface ThreeWayResult {
  rows: ThreeWayComparisonRow[];
  trend: MonthlyPriceTrend[];
  warnings: string[];
  coverage: {
    totalSalesItems: number;
    threeWayMatched: number;     // 판매+표준+실제 모두 있음
    twoWayMatched: number;       // 판매+실제만 (표준 없음)
    salesOnly: number;           // 판매만 (제조 없음, 상품/외주 추정)
    mappingFailed: number;       // 품목명→코드 매핑 실패
  };
}

export function calcThreeWayComparison(input: ThreeWayInput): ThreeWayResult {
  const {
    customerItemDetail,
    itemProfitability,
    standardCostBook,
    manufacturingCost,
    periodStart = "202601",
    periodEnd = "202603",
  } = input;

  const warnings: string[] = [];
  const itemCodeMap = buildItemCodeMap(itemProfitability, standardCostBook, manufacturingCost);
  const stdLookup = buildStandardCostLookup(standardCostBook);
  const mfgLookup = buildManufacturingLookup(manufacturingCost);

  // 1. 100 보고서 기간 필터 + 품목별 집계
  interface SalesAgg {
    itemName: string;
    itemCode: string | null;
    factory: string;
    salesQty: number;
    salesAmount: number;
    months: Map<string, { qty: number; amount: number }>;
  }
  const salesByItem = new Map<string, SalesAgg>();
  let mappingFailedCount = 0;

  for (const r of customerItemDetail) {
    const month = (r.매출연월 || "").trim();
    if (!month || month < periodStart || month > periodEnd) continue;
    const itemName = (r.품목 || "").trim();
    if (!itemName) continue;
    const qty = r.매출수량?.실적 || 0;
    const amount = r.매출액?.실적 || 0;
    if (qty === 0 && amount === 0) continue;

    // 품목명 → 코드 매핑
    const itemCode = itemCodeMap.get(itemName) || null;
    const factory = (r as any).공장 || "unknown";

    // 집계 키: 품목명 기준 (코드 매핑 실패 시도 포함)
    const aggKey = itemCode ? `${itemCode}||${factory}` : `__name__||${itemName}`;
    let agg = salesByItem.get(aggKey);
    if (!agg) {
      agg = {
        itemName,
        itemCode,
        factory: String(factory),
        salesQty: 0,
        salesAmount: 0,
        months: new Map(),
      };
      salesByItem.set(aggKey, agg);
      if (!itemCode) mappingFailedCount++;
    }
    agg.salesQty += qty;
    agg.salesAmount += amount;
    const prevMonth = agg.months.get(month) || { qty: 0, amount: 0 };
    prevMonth.qty += qty;
    prevMonth.amount += amount;
    agg.months.set(month, prevMonth);
  }

  // 2. 각 품목에 대해 표준원가/제조원가 룩업 + 3-Way 행 생성
  const rows: ThreeWayComparisonRow[] = [];
  const trend: MonthlyPriceTrend[] = [];
  let threeWay = 0, twoWay = 0, salesOnly = 0;

  for (const agg of Array.from(salesByItem.values())) {
    if (agg.salesQty === 0) continue;
    const avgSalesPrice = safeDivide(agg.salesAmount, agg.salesQty);

    // 표준원가 룩업 (공장 우선 → 코드만)
    const stdKey = agg.itemCode ? `${agg.factory}||${agg.itemCode}` : null;
    const stdFallbackKey = agg.itemCode ? `*||${agg.itemCode}` : null;
    const stdRec = stdKey ? (stdLookup.get(stdKey) || (stdFallbackKey ? stdLookup.get(stdFallbackKey) : undefined)) : undefined;
    const standardCost = stdRec?.표준원가 ?? null;

    // 제조원가 룩업
    const mfgKey = agg.itemCode ? `${agg.factory}||${agg.itemCode}` : null;
    const mfgFallbackKey = agg.itemCode ? `*||${agg.itemCode}` : null;
    const mfgRec = mfgKey ? (mfgLookup.get(mfgKey) || (mfgFallbackKey ? mfgLookup.get(mfgFallbackKey) : undefined)) : undefined;
    const actualUnitCost = mfgRec?.actualUnitCost ?? null;

    const hasStandard = standardCost !== null;
    const hasManufacturing = actualUnitCost !== null;

    // 3개 변동률 계산
    const salesVsStdMarginPct = hasStandard && avgSalesPrice > 0
      ? ((avgSalesPrice - standardCost!) / avgSalesPrice) * 100
      : null;
    const salesVsActualMarginPct = hasManufacturing && avgSalesPrice > 0
      ? ((avgSalesPrice - actualUnitCost!) / avgSalesPrice) * 100
      : null;
    const stdVsActualVariancePct = hasStandard && hasManufacturing && standardCost! > 0
      ? ((actualUnitCost! - standardCost!) / standardCost!) * 100
      : null;

    const salesImpact = hasStandard && hasManufacturing
      ? (actualUnitCost! - standardCost!) * agg.salesQty
      : 0;

    // 커버리지 카운트
    if (hasStandard && hasManufacturing) threeWay++;
    else if (hasManufacturing) twoWay++;
    else salesOnly++;

    // note
    let note = "";
    if (!agg.itemCode) note = "품목 매핑 실패";
    else if (!hasStandard && !hasManufacturing) note = "상품/외주 매입 추정";
    else if (!hasStandard) note = "표준 미등록";
    else if (!hasManufacturing) note = "제조원가 없음";

    rows.push({
      itemCode: agg.itemCode || `(unmapped:${agg.itemName.slice(0, 30)})`,
      itemName: agg.itemName,
      factory: agg.factory,
      salesQty: agg.salesQty,
      salesAmount: agg.salesAmount,
      avgSalesPrice,
      standardCost,
      hasStandard,
      actualUnitCost,
      hasManufacturing,
      salesVsStdMarginPct,
      salesVsActualMarginPct,
      stdVsActualVariancePct,
      salesImpact,
      note,
    });

    // 월별 추세 (판매만 기록)
    Array.from(agg.months.entries()).forEach(([month, m]) => {
      trend.push({
        month,
        itemCode: agg.itemCode || agg.itemName,
        itemName: agg.itemName,
        avgSalesPrice: safeDivide(m.amount, m.qty),
        salesQty: m.qty,
        salesAmount: m.amount,
      });
    });
  }

  if (mappingFailedCount > 0) {
    warnings.push(`품목 매핑 실패: ${mappingFailedCount}건 (200 보고서에 없는 품목명)`);
  }

  const coverage = {
    totalSalesItems: rows.length,
    threeWayMatched: threeWay,
    twoWayMatched: twoWay,
    salesOnly: salesOnly,
    mappingFailed: mappingFailedCount,
  };

  return { rows, trend, warnings, coverage };
}

// ─── 공장별 평균 변동률 ──────────────────────────────────

export interface FactoryVarianceRecord {
  factory: string;
  itemCount: number;
  avgVariancePct: number | null;   // 표준-실제 평균
  totalSalesImpact: number;
  hasStandardCoverage: boolean;    // 표준원가 book 있음 여부
}

export function calcFactoryVariance(rows: ThreeWayComparisonRow[]): FactoryVarianceRecord[] {
  const byFactory = new Map<string, { variancePcts: number[]; salesImpact: number; count: number; hasStd: boolean }>();
  for (const r of rows) {
    const key = r.factory || "unknown";
    const entry = byFactory.get(key) || { variancePcts: [], salesImpact: 0, count: 0, hasStd: false };
    if (r.stdVsActualVariancePct !== null) {
      entry.variancePcts.push(r.stdVsActualVariancePct);
      entry.hasStd = true;
    }
    entry.salesImpact += r.salesImpact;
    entry.count += 1;
    byFactory.set(key, entry);
  }
  return Array.from(byFactory.entries()).map(([factory, v]) => ({
    factory,
    itemCount: v.count,
    avgVariancePct: v.variancePcts.length > 0
      ? v.variancePcts.reduce((s, x) => s + x, 0) / v.variancePcts.length
      : null,
    totalSalesImpact: v.salesImpact,
    hasStandardCoverage: v.hasStd,
  })).sort((a, b) => Math.abs(b.totalSalesImpact) - Math.abs(a.totalSalesImpact));
}

// ─── 원가 요인 분해 (14 변동비 비율) ──────────────────────

export interface CostDriverEntry {
  itemCode: string;
  itemName: string;
  factory: string;
  totalCost: number;
  원재료비Pct: number;
  부재료비Pct: number;
  노무비Pct: number;
  외주가공비Pct: number;
  고정비Pct: number;
  기타Pct: number;
  dominantDriver: string;  // 최대 요인
}

export function calcCostDriverBreakdown(
  manufacturingCost: ManufacturingCostRecord[],
  top = 10
): CostDriverEntry[] {
  const entries: CostDriverEntry[] = manufacturingCost.map((r) => {
    const total = r.totalVariableCost + r.totalFixedCost;
    const pct = (n: number) => safeDivide(n, total) * 100;
    const 원재료 = pct(r.원재료비);
    const 부재료 = pct(r.부재료비);
    const 노무비V = pct(r.노무비);
    const 외주 = pct(r.외주가공비);
    const 고정 = pct(r.totalFixedCost);
    const 기타 = 100 - 원재료 - 부재료 - 노무비V - 외주 - 고정;
    const drivers = [
      { name: "원재료비", v: 원재료 },
      { name: "부재료비", v: 부재료 },
      { name: "노무비(변동)", v: 노무비V },
      { name: "외주가공비", v: 외주 },
      { name: "고정비", v: 고정 },
      { name: "기타", v: 기타 },
    ];
    drivers.sort((a, b) => b.v - a.v);
    return {
      itemCode: r.생산품코드,
      itemName: r.생산품명,
      factory: r.factory,
      totalCost: total,
      원재료비Pct: 원재료,
      부재료비Pct: 부재료,
      노무비Pct: 노무비V,
      외주가공비Pct: 외주,
      고정비Pct: 고정,
      기타Pct: 기타,
      dominantDriver: drivers[0].name,
    };
  });
  return entries
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, top);
}

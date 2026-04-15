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
 * 품목명 정규화 — Fuzzy matching을 위한 키 생성.
 *
 * 100 보고서(매출)와 표준원가/제조원가의 품목명 표기 차이를 흡수:
 *  - 전후 공백 제거
 *  - 괄호 접미사 제거 ("AP-5 (상품)" → "AP-5")
 *  - 연속 공백을 단일 공백으로
 *  - 슬래시 앞뒤 공백 통일 ("경유/bulk" ↔ "경유 / bulk")
 *  - 소문자화 (대소문자 차이 흡수)
 */
export function normalizeItemName(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/\([^)]*\)/g, " ")   // 괄호+내용 제거
    .replace(/\s*\/\s*/g, "/")    // 슬래시 주변 공백 제거
    .replace(/\s+/g, " ")         // 연속 공백 → 단일
    .trim()
    .toLowerCase();
}

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
  // Fuzzy 매칭용: 정규화된 이름 → 코드 (fallback 조회에서만 사용)
  const normToCode = new Map<string, string>();

  const addMapping = (rawName: string, code: string) => {
    if (!rawName || !code) return;
    const n = rawName.trim();
    if (n && !nameToCode.has(n)) nameToCode.set(n, code);
    const norm = normalizeItemName(rawName);
    if (norm && !normToCode.has(norm)) normToCode.set(norm, code);
  };

  // 1. 200 보고서 (대괄호 형식만 추출)
  for (const r of itemProfitability) {
    const raw = (r.품목 || "").trim();
    if (!raw) continue;
    const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) addMapping(match[2], match[1].trim());
  }

  // 2. 표준원가 book — 제품/상품만 매핑
  for (const r of standardCostBook) {
    const 계정 = (r.품목계정그룹 || "").trim();
    if (계정 !== "제품" && 계정 !== "상품") continue;
    addMapping(r.품목명 || "", r.품목코드 || "");
  }

  // 3. 제조원가 — 생산품명 기반
  for (const r of manufacturingCost) addMapping(r.생산품명 || "", r.생산품코드 || "");

  // fallback 통합: 원본 매핑에 없지만 정규화 매핑으로 해결되는 엔트리 병합
  for (const [norm, code] of Array.from(normToCode.entries())) {
    if (!nameToCode.has(norm)) nameToCode.set(norm, code);
  }
  return nameToCode;
}

/**
 * 품목명으로 코드 조회 — 원본 → 정규화 2단계 매칭.
 */
export function lookupItemCode(
  itemCodeMap: Map<string, string>,
  rawName: string
): string | null {
  const n = (rawName || "").trim();
  if (!n) return null;
  const direct = itemCodeMap.get(n);
  if (direct) return direct;
  const norm = normalizeItemName(rawName);
  return itemCodeMap.get(norm) || null;
}

/**
 * 표준원가 book 조회 구조.
 * byFactory: (factory, itemCode) → 단일 레코드 (공장 직접 매칭)
 * byCodeAll: itemCode → 그 코드의 모든 공장 레코드 배열 (fallback 전략에서 평균 계산)
 * 제품/상품만 인덱싱 (원재료·부재료는 판매 대상 아님).
 */
interface StandardCostLookup {
  byFactory: Map<string, StandardCostBookRecord>;
  byCodeAll: Map<string, StandardCostBookRecord[]>;
}

function buildStandardCostLookup(book: StandardCostBookRecord[]): StandardCostLookup {
  const byFactory = new Map<string, StandardCostBookRecord>();
  const byCodeAll = new Map<string, StandardCostBookRecord[]>();
  for (const r of book) {
    const 계정 = (r.품목계정그룹 || "").trim();
    if (계정 !== "제품" && 계정 !== "상품") continue;
    byFactory.set(`${r.factory}||${r.품목코드}`, r);
    const arr = byCodeAll.get(r.품목코드) || [];
    arr.push(r);
    byCodeAll.set(r.품목코드, arr);
  }
  return { byFactory, byCodeAll };
}

export type FallbackStrategy = "first" | "average";

/**
 * 표준원가 조회 — 매출 공장 직접 매칭 실패 시 fallback 전략 적용.
 *  - "first": 첫 매칭 공장의 값 (기존 동작, 빠르지만 부정확)
 *  - "average": 모든 공장의 평균 (공장 간 표준원가 차이 반영, 권장 기본값)
 */
function resolveStandardCost(
  lookup: StandardCostLookup,
  factory: string,
  itemCode: string,
  strategy: FallbackStrategy
): { cost: number; sourceFactory: string } | null {
  const direct = lookup.byFactory.get(`${factory}||${itemCode}`);
  if (direct) return { cost: direct.표준원가, sourceFactory: factory };
  const all = lookup.byCodeAll.get(itemCode);
  if (!all || all.length === 0) return null;
  if (strategy === "first") return { cost: all[0].표준원가, sourceFactory: all[0].factory };
  // average: 모든 공장 표준원가 산술평균 + 출처를 "평균(N개)" 라벨
  const avg = all.reduce((s, r) => s + r.표준원가, 0) / all.length;
  const sources = Array.from(new Set(all.map((r) => r.factory))).sort();
  return { cost: avg, sourceFactory: sources.length > 1 ? `평균(${sources.join("+")})` : sources[0] };
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
  /**
   * 공장 직접 매칭 실패 시 표준원가 선택 전략.
   *  - "average" (권장/기본): 해당 품목의 모든 공장 표준원가 평균
   *  - "first": 첫 매칭 공장 값 (이전 동작, 빠르지만 공장 간 차이 반영 불가)
   */
  fallbackStrategy?: FallbackStrategy;
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
    fallbackStrategy = "average",
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

    const itemCode = lookupItemCode(itemCodeMap, itemName);
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

    const stdResolved = agg.itemCode
      ? resolveStandardCost(stdLookup, agg.factory, agg.itemCode, fallbackStrategy)
      : null;
    const standardCost = stdResolved?.cost ?? null;
    const standardCostFactory = stdResolved?.sourceFactory ?? null;

    // 제조원가 룩업 (공장 직접 매칭 → 코드 fallback)
    const mfgDirect = agg.itemCode ? mfgLookup.get(`${agg.factory}||${agg.itemCode}`) : undefined;
    const mfgFallback = !mfgDirect && agg.itemCode
      ? mfgLookup.get(`*||${agg.itemCode}`)
      : undefined;
    const mfgRec = mfgDirect || mfgFallback;
    const actualUnitCost = mfgRec?.actualUnitCost ?? null;
    const actualCostFactory = mfgRec
      ? (mfgDirect ? agg.factory : (mfgRec.factory || "*"))
      : null;

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

    const marginVarianceImpact = hasStandard && hasManufacturing
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
      standardCostFactory,
      actualUnitCost,
      hasManufacturing,
      actualCostFactory,
      salesVsStdMarginPct,
      salesVsActualMarginPct,
      stdVsActualVariancePct,
      marginVarianceImpact,
      salesImpact: marginVarianceImpact, // backward compat (deprecated)
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
  avgVariancePct: number | null;       // 매출액 가중평균 변동률 (%)
  simpleAvgVariancePct: number | null; // 단순 산술평균 (참고용)
  totalMarginVarianceImpact: number;   // 표준 대비 초과 원가 누적
  totalSalesAmount: number;            // 가중치 검증용
  hasStandardCoverage: boolean;        // 표준원가 book 커버리지
  /** @deprecated totalMarginVarianceImpact로 대체 */
  totalSalesImpact: number;
}

/**
 * 공장별 평균 변동률 — 매출액 가중평균 사용.
 *
 * 금융/원가 회계 원칙: 비율 평균은 항상 가중평균이어야 함.
 * 단순 평균은 100건 매출 1건의 50% 변동과 1건 매출 1건의 1% 변동을 동일 가중.
 * → 매출액을 가중치로 사용하여 재무 영향도가 큰 품목을 반영.
 */
export function calcFactoryVariance(rows: ThreeWayComparisonRow[]): FactoryVarianceRecord[] {
  const byFactory = new Map<string, {
    weightedSum: number;       // Σ(variancePct × salesAmount)
    salesWeight: number;       // Σ(salesAmount) — 유효 변동률을 가진 행만
    simpleSum: number;
    simpleCount: number;
    impactSum: number;
    totalSales: number;
    count: number;
    hasStd: boolean;
  }>();
  for (const r of rows) {
    const key = r.factory || "unknown";
    const entry = byFactory.get(key) || {
      weightedSum: 0, salesWeight: 0, simpleSum: 0, simpleCount: 0,
      impactSum: 0, totalSales: 0, count: 0, hasStd: false,
    };
    if (r.stdVsActualVariancePct !== null && r.salesAmount > 0) {
      entry.weightedSum += r.stdVsActualVariancePct * r.salesAmount;
      entry.salesWeight += r.salesAmount;
      entry.simpleSum += r.stdVsActualVariancePct;
      entry.simpleCount += 1;
      entry.hasStd = true;
    }
    entry.impactSum += r.marginVarianceImpact;
    entry.totalSales += r.salesAmount;
    entry.count += 1;
    byFactory.set(key, entry);
  }
  return Array.from(byFactory.entries()).map(([factory, v]) => ({
    factory,
    itemCount: v.count,
    avgVariancePct: v.salesWeight > 0 ? v.weightedSum / v.salesWeight : null,
    simpleAvgVariancePct: v.simpleCount > 0 ? v.simpleSum / v.simpleCount : null,
    totalMarginVarianceImpact: v.impactSum,
    totalSalesAmount: v.totalSales,
    hasStandardCoverage: v.hasStd,
    totalSalesImpact: v.impactSum, // backward compat (deprecated)
  })).sort((a, b) => Math.abs(b.totalMarginVarianceImpact) - Math.abs(a.totalMarginVarianceImpact));
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

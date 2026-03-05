/**
 * 품목군 포트폴리오 분석 — 스마트 분류 탐지 + 교차 차원 분석
 * ProductGroupTab 전용. customerItemDetail(100) 데이터 기반.
 */
import type { CustomerItemDetailRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

export type ClassificationField = "품목군" | "중분류코드" | "제품군";

export interface ClassificationOption {
  field: ClassificationField;
  label: string;
  uniqueCount: number;
  fillRate: number;
}

export interface ClassificationResult {
  best: ClassificationOption;
  all: ClassificationOption[];
}

export interface GroupPortfolioEntry {
  group: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  operatingMargin: number;
  count: number;
  customerCount: number;
  productCount: number;
  salesShare: number;
}

export interface GroupFactoryCell {
  group: string;
  factory: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  count: number;
}

export interface ConcentrationMetrics {
  hhi: number;
  top3Share: number;
  top5Share: number;
  interpretation: string;
  groupCount: number;
}

export interface GroupTrendEntry {
  month: string;
  [groupName: string]: string | number;
}

// ─── 1. Smart Classification Detection ───────────────────────

function evalField(
  data: CustomerItemDetailRecord[],
  field: ClassificationField,
  label: string,
): ClassificationOption {
  let filled = 0;
  const vals = new Set<string>();
  for (const r of data) {
    const v = (r[field] || "").trim();
    if (v && v !== "미분류") {
      filled++;
      vals.add(v);
    }
  }
  return {
    field,
    label,
    uniqueCount: vals.size,
    fillRate: data.length > 0 ? filled / data.length : 0,
  };
}

export function detectBestClassification(
  data: CustomerItemDetailRecord[],
): ClassificationResult {
  const options: ClassificationOption[] = [
    evalField(data, "품목군", "품목군"),
    evalField(data, "중분류코드", "중분류코드"),
    evalField(data, "제품군", "제품군"),
  ];

  // 고유값 ≥ 3 AND 채움률 ≥ 20% 조건 충족하는 첫 번째 선택
  const best =
    options.find((o) => o.uniqueCount >= 3 && o.fillRate >= 0.2) || options[0];

  return { best, all: options };
}

// ─── 2. Group Portfolio ──────────────────────────────────────

export function calcGroupPortfolio(
  data: CustomerItemDetailRecord[],
  field: ClassificationField,
): GroupPortfolioEntry[] {
  if (data.length === 0) return [];

  const map = new Map<
    string,
    {
      sales: number;
      grossProfit: number;
      operatingProfit: number;
      count: number;
      customers: Set<string>;
      products: Set<string>;
    }
  >();

  for (const r of data) {
    const group = (r[field] || "미분류").trim() || "미분류";
    let entry = map.get(group);
    if (!entry) {
      entry = {
        sales: 0,
        grossProfit: 0,
        operatingProfit: 0,
        count: 0,
        customers: new Set(),
        products: new Set(),
      };
      map.set(group, entry);
    }
    entry.sales += r.매출액.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;
    entry.count += 1;
    if (r.매출거래처) entry.customers.add(r.매출거래처);
    if (r.품목) entry.products.add(r.품목);
  }

  const totalSales = Array.from(map.values()).reduce(
    (s, v) => s + v.sales,
    0,
  );

  return Array.from(map.entries())
    .filter(([, v]) => v.sales !== 0)
    .map(([group, v]) => ({
      group,
      sales: v.sales,
      grossProfit: v.grossProfit,
      grossMargin: safePct(v.grossProfit, v.sales),
      operatingProfit: v.operatingProfit,
      operatingMargin: safePct(v.operatingProfit, v.sales),
      count: v.count,
      customerCount: v.customers.size,
      productCount: v.products.size,
      salesShare: safePct(v.sales, totalSales),
    }))
    .sort((a, b) => b.sales - a.sales);
}

// ─── 3. Group × Factory Matrix ───────────────────────────────

export function calcGroupFactoryMatrix(
  data: CustomerItemDetailRecord[],
  field: ClassificationField,
  topN = 10,
): { cells: GroupFactoryCell[]; groups: string[]; factories: string[] } {
  if (data.length === 0) return { cells: [], groups: [], factories: [] };

  // 상위 N개 그룹 결정
  const groupSales = new Map<string, number>();
  const factorySet = new Set<string>();
  for (const r of data) {
    const g = (r[field] || "미분류").trim() || "미분류";
    const f = (r.공장 || "미분류").trim() || "미분류";
    groupSales.set(g, (groupSales.get(g) || 0) + r.매출액.실적);
    factorySet.add(f);
  }

  const topGroups = Array.from(groupSales.entries())
    .filter(([, s]) => s !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([g]) => g);
  const topSet = new Set(topGroups);
  const factories = Array.from(factorySet).filter((f) => f !== "미분류");

  // 교차 집계
  const key = (g: string, f: string) => `${g}||${f}`;
  const cellMap = new Map<
    string,
    { sales: number; grossProfit: number; count: number }
  >();

  for (const r of data) {
    const g = (r[field] || "미분류").trim() || "미분류";
    const f = (r.공장 || "미분류").trim() || "미분류";
    if (!topSet.has(g) || f === "미분류") continue;
    const k = key(g, f);
    let entry = cellMap.get(k);
    if (!entry) {
      entry = { sales: 0, grossProfit: 0, count: 0 };
      cellMap.set(k, entry);
    }
    entry.sales += r.매출액.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.count += 1;
  }

  const cells: GroupFactoryCell[] = [];
  for (const g of topGroups) {
    for (const f of factories) {
      const entry = cellMap.get(key(g, f));
      cells.push({
        group: g,
        factory: f,
        sales: entry?.sales || 0,
        grossProfit: entry?.grossProfit || 0,
        grossMargin: entry ? safePct(entry.grossProfit, entry.sales) : 0,
        count: entry?.count || 0,
      });
    }
  }

  return { cells, groups: topGroups, factories };
}

// ─── 4. Concentration Metrics ────────────────────────────────

export function calcGroupConcentration(
  portfolio: GroupPortfolioEntry[],
): ConcentrationMetrics {
  if (portfolio.length === 0) {
    return {
      hhi: 0,
      top3Share: 0,
      top5Share: 0,
      interpretation: "데이터 없음",
      groupCount: 0,
    };
  }

  const totalSales = portfolio.reduce((s, p) => s + p.sales, 0);
  if (totalSales === 0) {
    return {
      hhi: 0,
      top3Share: 0,
      top5Share: 0,
      interpretation: "매출 없음",
      groupCount: portfolio.length,
    };
  }

  // HHI: 각 그룹 매출 비중의 제곱합 (× 10000)
  let hhi = 0;
  for (const p of portfolio) {
    const share = p.sales / totalSales;
    hhi += share * share * 10000;
  }

  const sorted = [...portfolio].sort((a, b) => b.sales - a.sales);
  const top3Sales = sorted.slice(0, 3).reduce((s, p) => s + p.sales, 0);
  const top5Sales = sorted.slice(0, 5).reduce((s, p) => s + p.sales, 0);

  const top3Share = safePct(top3Sales, totalSales);
  const top5Share = safePct(top5Sales, totalSales);

  let interpretation: string;
  if (hhi > 2500) interpretation = "높은 집중 (소수 품목군 의존)";
  else if (hhi > 1500) interpretation = "보통 집중";
  else interpretation = "분산 (다각화 양호)";

  return {
    hhi: Math.round(hhi),
    top3Share,
    top5Share,
    interpretation,
    groupCount: portfolio.length,
  };
}

// ─── 5. Group Trend ──────────────────────────────────────────

export function calcGroupTrend(
  data: CustomerItemDetailRecord[],
  field: ClassificationField,
  topN = 5,
): { trendData: GroupTrendEntry[]; groupNames: string[] } {
  if (data.length === 0) return { trendData: [], groupNames: [] };

  // 상위 N개 그룹 결정
  const groupSales = new Map<string, number>();
  for (const r of data) {
    const g = (r[field] || "미분류").trim() || "미분류";
    groupSales.set(g, (groupSales.get(g) || 0) + r.매출액.실적);
  }
  const topGroups = Array.from(groupSales.entries())
    .filter(([, s]) => s !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([g]) => g);
  const topSet = new Set(topGroups);

  // 월별 집계
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of data) {
    const month = extractMonth(r.매출연월);
    if (!month) continue;
    const g = (r[field] || "미분류").trim() || "미분류";
    let entry = monthMap.get(month);
    if (!entry) {
      entry = {};
      monthMap.set(month, entry);
    }
    const label = topSet.has(g) ? g : "기타";
    entry[label] = (entry[label] || 0) + r.매출액.실적;
  }

  const groupNames = [...topGroups];
  if (
    Array.from(monthMap.values()).some((m) => (m["기타"] || 0) !== 0)
  ) {
    groupNames.push("기타");
  }

  const trendData: GroupTrendEntry[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => {
      const entry: GroupTrendEntry = { month };
      for (const g of groupNames) {
        entry[g] = vals[g] || 0;
      }
      return entry;
    });

  return { trendData, groupNames };
}

// ─── Helpers ─────────────────────────────────────────────────

function safePct(numerator: number, denominator: number): number {
  if (denominator === 0 || !isFinite(numerator / denominator)) return 0;
  return (numerator / denominator) * 100;
}

/**
 * itemHierarchy.ts — 적응형 품목 계층 드릴다운 + 원가 워터폴 + 수익성 매트릭스
 *
 * 200.품목별 수익성 분석(회계) 데이터가 있으면 full P&L 포함,
 * 없으면 salesList 기반 매출 데이터만 사용.
 */
import type { SalesRecord, ItemProfitabilityRecord, InventoryMovementRecord } from "@/types";
import { COST_BUCKETS, type CostBucketKey } from "@/types/itemCost";

// ─── Interfaces ────────────────────────────────────────────

export type ItemHierarchyLevel = "대분류" | "중분류" | "소분류" | "품목";

export interface ItemHierarchyNode {
  name: string;
  code?: string;
  level: ItemHierarchyLevel;
  sales: number;
  quantity: number;
  count: number;
  share: number;
  grossProfit?: number;
  grossMargin?: number;
  operatingProfit?: number;
  operatingMargin?: number;
  costRatio?: number;
  children?: ItemHierarchyNode[];
}

export interface LevelCoverage {
  level: ItemHierarchyLevel;
  totalRows: number;
  filledRows: number;
  fillRate: number;
  uniqueValues: number;
  active: boolean;
}

export interface ItemHierarchyResult {
  root: ItemHierarchyNode;
  totalSales: number;
  totalItems: number;
  activeLevels: ItemHierarchyLevel[];
  coverage: LevelCoverage[];
  hasFullPL: boolean;
}

export interface DrillDownStep {
  level: ItemHierarchyLevel;
  name: string;
}

export interface CostWaterfallEntry {
  name: string;
  value: number;
  cumulative: number;
  type: "revenue" | "cost" | "subtotal" | "profit";
}

export interface ProfitMatrixItem {
  name: string;
  category: string;
  sales: number;
  grossMargin: number;
  quadrant: "star" | "cashcow" | "question" | "dog";
}

// ─── Level Coverage ────────────────────────────────────────

const LEVELS: ItemHierarchyLevel[] = ["대분류", "중분류", "소분류", "품목"];

function calcCoverage(
  rows: Array<Record<string, any>>,
  levelField: string,
): LevelCoverage & { level: ItemHierarchyLevel } {
  const total = rows.length;
  const filled = rows.filter(r => {
    const v = String(r[levelField] || "").trim();
    return v !== "" && v !== "(미분류)";
  }).length;
  const unique = new Set(rows.map(r => String(r[levelField] || "").trim()).filter(Boolean)).size;
  const fillRate = total > 0 ? (filled / total) * 100 : 0;
  return {
    level: levelField as ItemHierarchyLevel,
    totalRows: total,
    filledRows: filled,
    fillRate,
    uniqueValues: unique,
    active: fillRate > 10 || levelField === "품목",
  };
}

export function analyzeLevelCoverage(
  data: Array<Record<string, any>>,
): LevelCoverage[] {
  return LEVELS.map(level => calcCoverage(data, level));
}

// ─── Hierarchy Builder ─────────────────────────────────────

interface GenericRow {
  대분류: string;
  중분류: string;
  소분류: string;
  품목: string;
  sales: number;
  quantity: number;
  grossProfit?: number;
  operatingProfit?: number;
  costRatio?: number;
  실적매출원가?: number;
}

function toGenericRows(
  itemProfitData: ItemProfitabilityRecord[] | null,
  salesData: SalesRecord[] | null,
): { rows: GenericRow[]; hasFullPL: boolean } {
  if (itemProfitData && itemProfitData.length > 0) {
    return {
      rows: itemProfitData.map(r => ({
        대분류: r.대분류 || "(미분류)",
        중분류: r.중분류 || "(미분류)",
        소분류: r.소분류 || "(미분류)",
        품목: r.품목 || "(미분류)",
        sales: r.매출액,
        quantity: r.매출수량,
        grossProfit: r.매출총이익,
        operatingProfit: r.영업이익,
        costRatio: r.매출원가율,
        실적매출원가: r.실적매출원가,
      })),
      hasFullPL: true,
    };
  }
  if (salesData && salesData.length > 0) {
    return {
      rows: salesData.map(r => ({
        대분류: r.대분류 || "(미분류)",
        중분류: r.중분류 || "(미분류)",
        소분류: r.소분류 || "(미분류)",
        품목: r.품목명 || r.품목 || "(미분류)",
        sales: r.장부금액,
        quantity: r.수량,
      })),
      hasFullPL: false,
    };
  }
  return { rows: [], hasFullPL: false };
}

function buildNode(
  name: string,
  level: ItemHierarchyLevel,
  rows: GenericRow[],
  parentTotal: number,
  hasFullPL: boolean,
): ItemHierarchyNode {
  const sales = rows.reduce((s, r) => s + r.sales, 0);
  const quantity = rows.reduce((s, r) => s + r.quantity, 0);
  const share = parentTotal !== 0 ? (sales / parentTotal) * 100 : 0;

  const node: ItemHierarchyNode = {
    name,
    level,
    sales,
    quantity,
    count: rows.length,
    share: isFinite(share) ? share : 0,
  };

  if (hasFullPL) {
    const gp = rows.reduce((s, r) => s + (r.grossProfit ?? 0), 0);
    const op = rows.reduce((s, r) => s + (r.operatingProfit ?? 0), 0);
    node.grossProfit = gp;
    node.grossMargin = sales !== 0 ? (gp / sales) * 100 : 0;
    node.operatingProfit = op;
    node.operatingMargin = sales !== 0 ? (op / sales) * 100 : 0;
    const totalCost = rows.reduce((s, r) => s + (r.실적매출원가 ?? 0), 0);
    node.costRatio = sales !== 0 ? (totalCost / sales) * 100 : 0;
  }

  return node;
}

export function calcItemHierarchy(
  itemProfitData: ItemProfitabilityRecord[] | null | undefined,
  salesData: SalesRecord[] | null | undefined,
): ItemHierarchyResult {
  const { rows, hasFullPL } = toGenericRows(
    itemProfitData ?? null,
    salesData ?? null,
  );

  if (rows.length === 0) {
    return {
      root: { name: "전체", level: "대분류", sales: 0, quantity: 0, count: 0, share: 100 },
      totalSales: 0,
      totalItems: 0,
      activeLevels: [],
      coverage: [],
      hasFullPL: false,
    };
  }

  const coverage = analyzeLevelCoverage(rows);
  const activeLevels = coverage.filter(c => c.active).map(c => c.level);

  const totalSales = rows.reduce((s, r) => s + r.sales, 0);

  // Build nested tree using active levels only
  const root: ItemHierarchyNode = {
    name: "전체",
    level: "대분류",
    sales: totalSales,
    quantity: rows.reduce((s, r) => s + r.quantity, 0),
    count: rows.length,
    share: 100,
    children: [],
  };

  if (hasFullPL) {
    root.grossProfit = rows.reduce((s, r) => s + (r.grossProfit ?? 0), 0);
    root.grossMargin = totalSales !== 0 ? (root.grossProfit / totalSales) * 100 : 0;
    root.operatingProfit = rows.reduce((s, r) => s + (r.operatingProfit ?? 0), 0);
    root.operatingMargin = totalSales !== 0 ? (root.operatingProfit / totalSales) * 100 : 0;
  }

  // Build grouped children at top active level
  const topLevel = activeLevels[0] || "품목";
  const groupMap = new Map<string, GenericRow[]>();
  for (const row of rows) {
    const key = row[topLevel] || "(미분류)";
    const arr = groupMap.get(key);
    if (arr) arr.push(row);
    else groupMap.set(key, [row]);
  }

  root.children = Array.from(groupMap.entries())
    .map(([key, groupRows]) => {
      const node = buildNode(key, topLevel, groupRows, totalSales, hasFullPL);
      // Build sub-levels recursively
      node.children = buildSubLevels(groupRows, activeLevels, 1, node.sales, hasFullPL);
      return node;
    })
    .sort((a, b) => b.sales - a.sales);

  return {
    root,
    totalSales,
    totalItems: new Set(rows.map(r => r.품목)).size,
    activeLevels,
    coverage,
    hasFullPL,
  };
}

function buildSubLevels(
  rows: GenericRow[],
  activeLevels: ItemHierarchyLevel[],
  levelIdx: number,
  parentSales: number,
  hasFullPL: boolean,
): ItemHierarchyNode[] | undefined {
  if (levelIdx >= activeLevels.length) return undefined;

  const level = activeLevels[levelIdx];
  const groupMap = new Map<string, GenericRow[]>();
  for (const row of rows) {
    const key = row[level] || "(미분류)";
    const arr = groupMap.get(key);
    if (arr) arr.push(row);
    else groupMap.set(key, [row]);
  }

  return Array.from(groupMap.entries())
    .map(([key, groupRows]) => {
      const node = buildNode(key, level, groupRows, parentSales, hasFullPL);
      node.children = buildSubLevels(groupRows, activeLevels, levelIdx + 1, node.sales, hasFullPL);
      if (level === "품목" && groupRows.length > 0) {
        // Extract item code from "[CODE] Name" pattern
        const match = key.match(/^\[([^\]]+)\]/);
        if (match) node.code = match[1];
      }
      return node;
    })
    .sort((a, b) => b.sales - a.sales);
}

// ─── DrillDown Navigation ──────────────────────────────────

export function getNodesAtPath(
  root: ItemHierarchyNode,
  drillPath: DrillDownStep[],
): ItemHierarchyNode[] {
  let current = root;

  for (const step of drillPath) {
    const child = current.children?.find(c => c.name === step.name);
    if (!child || !child.children || child.children.length === 0) {
      // Path invalid → return current level children
      return current.children ?? [];
    }
    current = child;
  }

  return current.children ?? [];
}

// ─── Cost Waterfall ────────────────────────────────────────

export function calcCostWaterfall(
  data: ItemProfitabilityRecord[],
  drillPath: DrillDownStep[],
): CostWaterfallEntry[] {
  if (!data || data.length === 0) return [];

  // Filter data based on drill path
  let filtered = data;
  for (const step of drillPath) {
    filtered = filtered.filter(r => {
      const val = String(r[step.level as keyof ItemProfitabilityRecord] || "");
      return val === step.name;
    });
  }

  if (filtered.length === 0) return [];

  const totalSales = filtered.reduce((s, r) => s + r.매출액, 0);
  if (totalSales === 0) return [];

  const entries: CostWaterfallEntry[] = [];
  let cumulative = totalSales;

  // 매출액
  entries.push({
    name: "매출액",
    value: totalSales,
    cumulative,
    type: "revenue",
  });

  // Cost buckets (7 groups from COST_BUCKETS)
  const bucketKeys = Object.keys(COST_BUCKETS) as CostBucketKey[];
  for (const bucket of bucketKeys) {
    const categories = COST_BUCKETS[bucket];
    let bucketTotal = 0;
    for (const cat of categories) {
      bucketTotal += filtered.reduce((s, r) => s + (r[cat as keyof ItemProfitabilityRecord] as number || 0), 0);
    }
    if (bucketTotal !== 0) {
      cumulative -= bucketTotal;
      entries.push({
        name: bucket,
        value: -bucketTotal,
        cumulative,
        type: "cost",
      });
    }
  }

  // 매출총이익
  const grossProfit = filtered.reduce((s, r) => s + r.매출총이익, 0);
  entries.push({
    name: "매출총이익",
    value: grossProfit,
    cumulative: grossProfit,
    type: "subtotal",
  });

  // 판매관리비 + 직접판매운반비
  const sgna = filtered.reduce((s, r) => s + r.판매관리비 + r.직접판매운반비, 0);
  if (sgna !== 0) {
    entries.push({
      name: "판관비",
      value: -sgna,
      cumulative: grossProfit - sgna,
      type: "cost",
    });
  }

  // 영업이익
  const operatingProfit = filtered.reduce((s, r) => s + r.영업이익, 0);
  entries.push({
    name: "영업이익",
    value: operatingProfit,
    cumulative: operatingProfit,
    type: "profit",
  });

  return entries;
}

// ─── Profit Matrix ─────────────────────────────────────────

export function calcProfitMatrix(
  data: ItemProfitabilityRecord[],
): ProfitMatrixItem[] {
  if (!data || data.length === 0) return [];

  // Group by item, filter out zero-sales
  const itemMap = new Map<string, { sales: number; gp: number; category: string }>();
  for (const r of data) {
    if (r.매출액 === 0) continue;
    const key = r.품목;
    const existing = itemMap.get(key);
    if (existing) {
      existing.sales += r.매출액;
      existing.gp += r.매출총이익;
    } else {
      itemMap.set(key, { sales: r.매출액, gp: r.매출총이익, category: r.대분류 || "(미분류)" });
    }
  }

  const items = Array.from(itemMap.entries())
    .filter(([, v]) => v.sales > 0)
    .map(([name, v]) => ({
      name,
      category: v.category,
      sales: v.sales,
      grossMargin: v.sales !== 0 ? (v.gp / v.sales) * 100 : 0,
    }));

  if (items.length === 0) return [];

  // Median for quadrant classification
  const salesArr = items.map(i => i.sales).sort((a, b) => a - b);
  const marginArr = items.map(i => i.grossMargin).sort((a, b) => a - b);
  const medianSales = salesArr[Math.floor(salesArr.length / 2)];
  const medianMargin = marginArr[Math.floor(marginArr.length / 2)];

  return items.map(item => ({
    ...item,
    quadrant: classifyQuadrant(item.sales, item.grossMargin, medianSales, medianMargin),
  }));
}

function classifyQuadrant(
  sales: number,
  margin: number,
  medianSales: number,
  medianMargin: number,
): ProfitMatrixItem["quadrant"] {
  const highSales = sales >= medianSales;
  const highMargin = margin >= medianMargin;
  if (highSales && highMargin) return "star";
  if (highSales && !highMargin) return "cashcow";
  if (!highSales && highMargin) return "question";
  return "dog";
}

// ─── Inventory Overlay ──────────────────────────────────────

export interface ItemInventoryInfo {
  ending: number;    // 기말 수량
  turnover: number;  // 재고회전율 = 출고수량 / 평균재고수량
  단위: string;
}

/**
 * 전 공장 품목별 재고 합산 → Map<품목코드, ItemInventoryInfo>
 * 회전율 = 출고수량 / ((기초수량 + 기말수량) / 2)
 */
export function buildItemInventoryMap(
  inventoryData: Map<string, InventoryMovementRecord[]>
): Map<string, ItemInventoryInfo> {
  const itemMap = new Map<string, { opening: number; closing: number; issued: number; 단위: string }>();

  for (const [, records] of Array.from(inventoryData.entries())) {
    for (const r of records) {
      const code = (r.품목 || "").trim();
      if (!code) continue;
      const entry = itemMap.get(code) || { opening: 0, closing: 0, issued: 0, 단위: r.단위 };
      entry.opening += (r.기초 ?? 0);
      entry.closing += (r.기말 ?? 0);
      entry.issued += (r.출고 ?? 0);
      itemMap.set(code, entry);
    }
  }

  const result = new Map<string, ItemInventoryInfo>();
  for (const [code, data] of Array.from(itemMap.entries())) {
    const avgInv = (data.opening + data.closing) / 2;
    const turnover = avgInv > 0 ? data.issued / avgInv : 0;
    result.set(code, {
      ending: data.closing,
      turnover: isFinite(turnover) ? Math.round(turnover * 100) / 100 : 0,
      단위: data.단위,
    });
  }

  return result;
}

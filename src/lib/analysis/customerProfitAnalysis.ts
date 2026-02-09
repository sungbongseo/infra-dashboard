import type { OrgCustomerProfitRecord } from "@/types";

// ── Interfaces ──────────────────────────────────────────────

export interface CustomerHierarchyNode {
  name: string;
  value: number; // 매출액.실적
  grossProfit: number; // 매출총이익.실적
  operatingProfit: number; // 영업이익.실적
  grossMargin: number; // %
  opMargin: number; // %
  children?: CustomerHierarchyNode[];
}

export interface CustomerConcentration {
  hhi: number; // Herfindahl-Hirschman Index (0~10000)
  top5Share: number; // Top 5 거래처 매출 비중 %
  top10Share: number; // Top 10 거래처 매출 비중 %
  totalCustomers: number;
  interpretation: string; // "높은 집중도" | "보통 집중도" | "낮은 집중도"
}

export interface CustomerRanking {
  name: string; // 매출거래처명
  code: string; // 매출거래처
  org: string; // 영업조직팀
  category: string; // 거래처대분류
  sales: number;
  grossProfit: number;
  operatingProfit: number;
  grossMargin: number;
  opMargin: number;
  planAchievement: number; // 매출액.실적/매출액.계획 * 100
}

export interface CustomerSegmentSummary {
  segment: string; // 거래처대분류
  customerCount: number;
  totalSales: number;
  totalGrossProfit: number;
  totalOperatingProfit: number;
  avgGrossMargin: number;
  avgOpMargin: number;
  salesShare: number; // % of total sales
}

// ── Hierarchy ───────────────────────────────────────────────

interface AggBucket {
  sales: number;
  grossProfit: number;
  operatingProfit: number;
}

function calcMargins(b: AggBucket): { grossMargin: number; opMargin: number } {
  return {
    grossMargin: b.sales !== 0 ? (b.grossProfit / b.sales) * 100 : 0,
    opMargin: b.sales !== 0 ? (b.operatingProfit / b.sales) * 100 : 0,
  };
}

/**
 * 거래처 계층 트리 구축
 * 거래처대분류 → 거래처중분류 → 거래처소분류 → 매출거래처명
 * 각 노드에 매출액/매출총이익/영업이익 집계 및 마진 계산
 */
export function calcCustomerHierarchy(
  data: OrgCustomerProfitRecord[]
): CustomerHierarchyNode {
  // level-1: 거래처대분류
  const l1Map = new Map<
    string,
    Map<
      string, // 거래처중분류
      Map<
        string, // 거래처소분류
        Map<string, AggBucket> // 매출거래처명
      >
    >
  >();

  for (const r of data) {
    const k1 = r.거래처대분류 || "(미분류)";
    const k2 = r.거래처중분류 || "(미분류)";
    const k3 = r.거래처소분류 || "(미분류)";
    const k4 = r.매출거래처명 || "(미분류)";

    if (!l1Map.has(k1)) l1Map.set(k1, new Map());
    const l2Map = l1Map.get(k1)!;

    if (!l2Map.has(k2)) l2Map.set(k2, new Map());
    const l3Map = l2Map.get(k2)!;

    if (!l3Map.has(k3)) l3Map.set(k3, new Map());
    const leafMap = l3Map.get(k3)!;

    const bucket = leafMap.get(k4) || {
      sales: 0,
      grossProfit: 0,
      operatingProfit: 0,
    };
    bucket.sales += r.매출액.실적;
    bucket.grossProfit += r.매출총이익.실적;
    bucket.operatingProfit += r.영업이익.실적;
    leafMap.set(k4, bucket);
  }

  // Build tree bottom-up
  const rootBucket: AggBucket = { sales: 0, grossProfit: 0, operatingProfit: 0 };
  const l1Children: CustomerHierarchyNode[] = [];

  Array.from(l1Map.entries()).forEach(([k1, l2Map]) => {
    const l1Bucket: AggBucket = { sales: 0, grossProfit: 0, operatingProfit: 0 };
    const l2Children: CustomerHierarchyNode[] = [];

    Array.from(l2Map.entries()).forEach(([k2, l3Map]) => {
      const l2Bucket: AggBucket = { sales: 0, grossProfit: 0, operatingProfit: 0 };
      const l3Children: CustomerHierarchyNode[] = [];

      Array.from(l3Map.entries()).forEach(([k3, leafMap]) => {
        const l3Bucket: AggBucket = { sales: 0, grossProfit: 0, operatingProfit: 0 };
        const leafChildren: CustomerHierarchyNode[] = [];

        Array.from(leafMap.entries()).forEach(([k4, bucket]) => {
          l3Bucket.sales += bucket.sales;
          l3Bucket.grossProfit += bucket.grossProfit;
          l3Bucket.operatingProfit += bucket.operatingProfit;

          const margins = calcMargins(bucket);
          leafChildren.push({
            name: k4,
            value: bucket.sales,
            grossProfit: bucket.grossProfit,
            operatingProfit: bucket.operatingProfit,
            grossMargin: margins.grossMargin,
            opMargin: margins.opMargin,
          });
        });

        l2Bucket.sales += l3Bucket.sales;
        l2Bucket.grossProfit += l3Bucket.grossProfit;
        l2Bucket.operatingProfit += l3Bucket.operatingProfit;

        const margins = calcMargins(l3Bucket);
        l3Children.push({
          name: k3,
          value: l3Bucket.sales,
          grossProfit: l3Bucket.grossProfit,
          operatingProfit: l3Bucket.operatingProfit,
          grossMargin: margins.grossMargin,
          opMargin: margins.opMargin,
          children: leafChildren.length > 0 ? leafChildren : undefined,
        });
      });

      l1Bucket.sales += l2Bucket.sales;
      l1Bucket.grossProfit += l2Bucket.grossProfit;
      l1Bucket.operatingProfit += l2Bucket.operatingProfit;

      const margins = calcMargins(l2Bucket);
      l2Children.push({
        name: k2,
        value: l2Bucket.sales,
        grossProfit: l2Bucket.grossProfit,
        operatingProfit: l2Bucket.operatingProfit,
        grossMargin: margins.grossMargin,
        opMargin: margins.opMargin,
        children: l3Children.length > 0 ? l3Children : undefined,
      });
    });

    rootBucket.sales += l1Bucket.sales;
    rootBucket.grossProfit += l1Bucket.grossProfit;
    rootBucket.operatingProfit += l1Bucket.operatingProfit;

    const margins = calcMargins(l1Bucket);
    l1Children.push({
      name: k1,
      value: l1Bucket.sales,
      grossProfit: l1Bucket.grossProfit,
      operatingProfit: l1Bucket.operatingProfit,
      grossMargin: margins.grossMargin,
      opMargin: margins.opMargin,
      children: l2Children.length > 0 ? l2Children : undefined,
    });
  });

  const rootMargins = calcMargins(rootBucket);
  return {
    name: "전체",
    value: rootBucket.sales,
    grossProfit: rootBucket.grossProfit,
    operatingProfit: rootBucket.operatingProfit,
    grossMargin: rootMargins.grossMargin,
    opMargin: rootMargins.opMargin,
    children: l1Children.length > 0 ? l1Children : undefined,
  };
}

// ── Concentration ───────────────────────────────────────────

/**
 * 거래처 집중도 분석 (HHI, Top N 비중)
 * 매출거래처 기준으로 그룹핑하여 매출 점유율 산출
 */
export function calcCustomerConcentration(
  data: OrgCustomerProfitRecord[]
): CustomerConcentration {
  const salesByCustomer = new Map<string, number>();

  for (const r of data) {
    const key = r.매출거래처;
    if (!key) continue;
    salesByCustomer.set(key, (salesByCustomer.get(key) || 0) + r.매출액.실적);
  }

  const totalSales = Array.from(salesByCustomer.values()).reduce(
    (sum, v) => sum + v,
    0
  );
  const totalCustomers = salesByCustomer.size;

  if (totalSales === 0 || totalCustomers === 0) {
    return {
      hhi: 0,
      top5Share: 0,
      top10Share: 0,
      totalCustomers,
      interpretation: "낮은 집중도",
    };
  }

  // Sort descending by sales for Top N calculation
  const sorted = Array.from(salesByCustomer.values()).sort((a, b) => b - a);

  // HHI = Σ(share_i^2) * 10000
  let hhi = 0;
  for (const sales of sorted) {
    const share = sales / totalSales;
    hhi += share * share;
  }
  hhi *= 10000;

  const top5Sales = sorted.slice(0, 5).reduce((sum, v) => sum + v, 0);
  const top10Sales = sorted.slice(0, 10).reduce((sum, v) => sum + v, 0);

  const top5Share = (top5Sales / totalSales) * 100;
  const top10Share = (top10Sales / totalSales) * 100;

  let interpretation: string;
  if (hhi > 2500) {
    interpretation = "높은 집중도";
  } else if (hhi >= 1500) {
    interpretation = "보통 집중도";
  } else {
    interpretation = "낮은 집중도";
  }

  return { hhi, top5Share, top10Share, totalCustomers, interpretation };
}

// ── Ranking ─────────────────────────────────────────────────

/**
 * 거래처 랭킹
 * 매출거래처 기준으로 그룹핑(조직 간 합산)하고 정렬 기준에 따라 순위 반환
 */
export function calcCustomerRanking(
  data: OrgCustomerProfitRecord[],
  sortBy: "sales" | "grossProfit" | "operatingProfit" = "sales"
): CustomerRanking[] {
  const map = new Map<
    string,
    {
      name: string;
      org: string;
      category: string;
      sales: number;
      grossProfit: number;
      operatingProfit: number;
      planSales: number;
    }
  >();

  for (const r of data) {
    const code = r.매출거래처;
    if (!code) continue;

    const entry = map.get(code) || {
      name: r.매출거래처명 || code,
      org: r.영업조직팀 || "",
      category: r.거래처대분류 || "",
      sales: 0,
      grossProfit: 0,
      operatingProfit: 0,
      planSales: 0,
    };

    entry.sales += r.매출액.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;
    entry.planSales += r.매출액.계획;

    // Keep the first non-empty org/category encountered
    if (!entry.org && r.영업조직팀) entry.org = r.영업조직팀;
    if (!entry.category && r.거래처대분류) entry.category = r.거래처대분류;

    map.set(code, entry);
  }

  const results: CustomerRanking[] = Array.from(map.entries()).map(
    ([code, v]) => ({
      name: v.name,
      code,
      org: v.org,
      category: v.category,
      sales: v.sales,
      grossProfit: v.grossProfit,
      operatingProfit: v.operatingProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
      opMargin: v.sales !== 0 ? (v.operatingProfit / v.sales) * 100 : 0,
      planAchievement: v.planSales !== 0 ? (v.sales / v.planSales) * 100 : 0,
    })
  );

  results.sort((a, b) => b[sortBy] - a[sortBy]);

  return results;
}

// ── Segments ────────────────────────────────────────────────

/**
 * 거래처 세그먼트(대분류) 요약
 * 거래처대분류 기준으로 그룹핑하여 재무 지표 집계
 */
export function calcCustomerSegments(
  data: OrgCustomerProfitRecord[]
): CustomerSegmentSummary[] {
  const map = new Map<
    string,
    {
      customers: Set<string>;
      totalSales: number;
      totalGrossProfit: number;
      totalOperatingProfit: number;
    }
  >();

  for (const r of data) {
    const segment = r.거래처대분류 || "(미분류)";
    const entry = map.get(segment) || {
      customers: new Set<string>(),
      totalSales: 0,
      totalGrossProfit: 0,
      totalOperatingProfit: 0,
    };

    if (r.매출거래처) entry.customers.add(r.매출거래처);
    entry.totalSales += r.매출액.실적;
    entry.totalGrossProfit += r.매출총이익.실적;
    entry.totalOperatingProfit += r.영업이익.실적;

    map.set(segment, entry);
  }

  const grandTotalSales = Array.from(map.values()).reduce(
    (sum, v) => sum + v.totalSales,
    0
  );

  return Array.from(map.entries())
    .map(([segment, v]) => ({
      segment,
      customerCount: v.customers.size,
      totalSales: v.totalSales,
      totalGrossProfit: v.totalGrossProfit,
      totalOperatingProfit: v.totalOperatingProfit,
      avgGrossMargin:
        v.totalSales !== 0 ? (v.totalGrossProfit / v.totalSales) * 100 : 0,
      avgOpMargin:
        v.totalSales !== 0
          ? (v.totalOperatingProfit / v.totalSales) * 100
          : 0,
      salesShare:
        grandTotalSales !== 0 ? (v.totalSales / grandTotalSales) * 100 : 0,
    }))
    .sort((a, b) => b.totalSales - a.totalSales);
}

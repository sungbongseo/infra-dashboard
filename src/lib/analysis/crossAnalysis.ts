/**
 * 크로스 분석 모듈 — 거래처 360° 뷰 + 조직 스코어카드
 */
import type {
  SalesRecord,
  CollectionRecord,
  OrderRecord,
  ReceivableAgingRecord,
  OrgCustomerProfitRecord,
  OrgProfitRecord,
} from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Customer 360° ──────────────────────────────────────

export interface Customer360 {
  customerName: string;
  totalSales: number;
  salesCount: number;
  avgDealSize: number;
  salesTrend: { month: string; amount: number }[];
  totalCollections: number;
  collectionRate: number;
  totalOrders: number;
  orderCount: number;
  totalReceivable: number;
  agingBuckets: { label: string; amount: number }[];
  grossProfit?: number;
  gpRate?: number;
  operatingProfit?: number;
  opRate?: number;
}

export function calcCustomer360(
  customerName: string,
  salesList: SalesRecord[],
  collectionList: CollectionRecord[],
  orderList: OrderRecord[],
  agingRecords: ReceivableAgingRecord[],
  orgCustProfit?: OrgCustomerProfitRecord[]
): Customer360 {
  // 매출 (SalesRecord.매출처명, 장부금액)
  const custSales = salesList.filter((s) => s.매출처명 === customerName);
  const totalSales = custSales.reduce((sum, s) => sum + (Number(s.장부금액) || 0), 0);
  const salesCount = custSales.length;
  const avgDealSize = salesCount > 0 ? totalSales / salesCount : 0;

  // 월별 매출 추이
  const monthMap = new Map<string, number>();
  for (const s of custSales) {
    const m = extractMonth(s.매출일);
    if (m) monthMap.set(m, (monthMap.get(m) || 0) + (Number(s.장부금액) || 0));
  }
  const salesTrend = Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 수금 (CollectionRecord.거래처명, 수금액)
  const custCollections = collectionList.filter((c) => c.거래처명 === customerName);
  const totalCollections = custCollections.reduce((sum, c) => sum + (Number(c.수금액) || 0), 0);
  const collectionRate = totalSales > 0 ? (totalCollections / totalSales) * 100 : 0;

  // 수주 (OrderRecord.판매처명, 장부금액)
  const custOrders = orderList.filter((o) => o.판매처명 === customerName);
  const totalOrders = custOrders.reduce((sum, o) => sum + (Number(o.장부금액) || 0), 0);
  const orderCount = custOrders.length;

  // 미수금 aging (ReceivableAgingRecord.판매처명, 합계.장부금액)
  const custAging = agingRecords.filter((a) => a.판매처명 === customerName);
  const totalReceivable = custAging.reduce((sum, a) => sum + (Number(a.합계?.장부금액) || 0), 0);

  // aging 구간별 잔액
  const bucketDefs: { label: string; field: keyof ReceivableAgingRecord }[] = [
    { label: "1개월", field: "month1" },
    { label: "2개월", field: "month2" },
    { label: "3개월", field: "month3" },
    { label: "4개월", field: "month4" },
    { label: "5개월", field: "month5" },
    { label: "6개월", field: "month6" },
    { label: "6개월초과", field: "overdue" },
  ];
  const agingBuckets = bucketDefs.map(({ label, field }) => {
    const amount = custAging.reduce((sum, a) => {
      const bucket = a[field];
      return sum + (typeof bucket === "object" && bucket !== null ? (Number((bucket as any).장부금액) || 0) : 0);
    }, 0);
    return { label, amount };
  }).filter((b) => b.amount > 0);

  // 수익성 (303 OrgCustomerProfitRecord.매출거래처명)
  let grossProfit: number | undefined;
  let gpRate: number | undefined;
  let operatingProfit: number | undefined;
  let opRate: number | undefined;
  if (orgCustProfit && orgCustProfit.length > 0) {
    const custProfit = orgCustProfit.filter((p) => p.매출거래처명 === customerName);
    if (custProfit.length > 0) {
      // PlanActualDiff: { 계획, 실적, 차이 } → use 실적
      const sales = custProfit.reduce((s, p) => s + (Number(p.매출액?.실적) || 0), 0);
      grossProfit = custProfit.reduce((s, p) => s + (Number(p.매출총이익?.실적) || 0), 0);
      operatingProfit = custProfit.reduce((s, p) => s + (Number(p.영업이익?.실적) || 0), 0);
      gpRate = sales > 0 ? (grossProfit / sales) * 100 : 0;
      opRate = sales > 0 ? (operatingProfit / sales) * 100 : 0;
    }
  }

  return {
    customerName,
    totalSales,
    salesCount,
    avgDealSize,
    salesTrend,
    totalCollections,
    collectionRate: isFinite(collectionRate) ? collectionRate : 0,
    totalOrders,
    orderCount,
    totalReceivable,
    agingBuckets,
    grossProfit,
    gpRate,
    operatingProfit,
    opRate,
  };
}

// ─── Organization Scorecard ──────────────────────────────

export interface OrgScorecard {
  orgName: string;
  salesAmount: number;
  profitability: number;
  collectionEfficiency: number;
  customerDiversity: number;
  overallScore: number;
}

export function calcOrgScorecards(
  orgProfit: OrgProfitRecord[],
  salesList: SalesRecord[],
  collectionList: CollectionRecord[]
): OrgScorecard[] {
  const orgMap = new Map<string, { sales: number; opProfit: number; collections: number }>();

  for (const op of orgProfit) {
    const org = op.영업조직팀 || "";
    if (!org) continue;
    if (!orgMap.has(org)) orgMap.set(org, { sales: 0, opProfit: 0, collections: 0 });
    const entry = orgMap.get(org)!;
    entry.sales += Number(op.매출액) || 0;
    entry.opProfit += Number(op.영업이익) || 0;
  }

  // 수금 데이터 매칭
  for (const c of collectionList) {
    const org = c.영업조직 || "";
    if (!org) continue;
    for (const [key, entry] of Array.from(orgMap.entries())) {
      if (key.includes(org) || org.includes(key)) {
        entry.collections += Number(c.수금액) || 0;
        break;
      }
    }
  }

  const scorecards: OrgScorecard[] = [];

  for (const [orgName, data] of Array.from(orgMap.entries())) {
    if (data.sales === 0) continue;

    const profitability = (data.opProfit / data.sales) * 100;
    const collectionEfficiency = data.sales > 0 ? (data.collections / data.sales) * 100 : 0;

    // HHI 기반 고객 다각화
    const custSales = new Map<string, number>();
    for (const s of salesList) {
      const sOrg = s.영업조직 || "";
      if (orgName.includes(sOrg) || sOrg.includes(orgName)) {
        const cust = s.매출처명 || "";
        custSales.set(cust, (custSales.get(cust) || 0) + (Number(s.장부금액) || 0));
      }
    }
    const totalCustSales = Array.from(custSales.values()).reduce((s, v) => s + v, 0);
    let hhi = 0;
    if (totalCustSales > 0) {
      for (const v of Array.from(custSales.values())) {
        const share = v / totalCustSales;
        hhi += share * share;
      }
    }
    const customerDiversity = (1 - hhi) * 100;

    // 가중 점수 (영업이익률 30%, 수금효율 25%, 고객다각화 20%, 규모 25%)
    const normProfit = Math.max(0, Math.min(100, profitability * 5 + 50));
    const normCollection = Math.min(100, collectionEfficiency);
    const normDiversity = customerDiversity;
    const normScale = 50;
    const overallScore = normProfit * 0.3 + normCollection * 0.25 + normDiversity * 0.2 + normScale * 0.25;

    scorecards.push({
      orgName,
      salesAmount: data.sales,
      profitability: isFinite(profitability) ? profitability : 0,
      collectionEfficiency: isFinite(collectionEfficiency) ? collectionEfficiency : 0,
      customerDiversity: isFinite(customerDiversity) ? customerDiversity : 0,
      overallScore: isFinite(overallScore) ? overallScore : 0,
    });
  }

  return scorecards.sort((a, b) => b.overallScore - a.overallScore);
}

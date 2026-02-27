import type { SalesRecord, CollectionRecord, OrderRecord, OrgProfitRecord, TeamContributionRecord, ReceivableAgingRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

export interface OverviewKpis {
  totalSales: number;
  totalOrders: number;
  totalCollection: number;
  collectionRate: number;
  totalReceivables: number;
  operatingProfitRate: number;
  salesPlanAchievement: number;
}

export function calcOverviewKpis(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[],
  orgProfit: OrgProfitRecord[],
  receivableAging?: ReceivableAgingRecord[]
): OverviewKpis {
  const totalSales = sales.reduce((sum, r) => sum + r.장부금액, 0);
  const totalOrders = orders.reduce((sum, r) => sum + r.장부금액, 0);
  const totalCollection = collections.reduce((sum, r) => sum + r.장부수금액, 0);
  const collectionRate = totalSales > 0 ? (totalCollection / totalSales) * 100 : 0;
  const totalReceivables = receivableAging && receivableAging.length > 0
    ? receivableAging.reduce((sum, r) => sum + r.합계.장부금액, 0)
    : Math.max(0, totalSales - totalCollection);

  const opSum = orgProfit.reduce((sum, r) => sum + r.영업이익.실적, 0);
  const salesSum = orgProfit.reduce((sum, r) => sum + r.매출액.실적, 0);
  const operatingProfitRate = salesSum > 0 ? (opSum / salesSum) * 100 : 0;

  const planSum = orgProfit.reduce((sum, r) => sum + r.매출액.계획, 0);
  const salesPlanAchievement = planSum > 0 ? (salesSum / planSum) * 100 : 0;

  return {
    totalSales,
    totalOrders,
    totalCollection,
    collectionRate,
    totalReceivables,
    operatingProfitRate,
    salesPlanAchievement,
  };
}

export interface MonthlyTrend {
  month: string;
  매출: number;
  수주: number;
  수금: number;
}

export function calcMonthlyTrends(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[]
): MonthlyTrend[] {
  const monthMap = new Map<string, MonthlyTrend>();

  for (const r of sales) {
    const m = extractMonth(r.매출일);
    if (!m) continue;
    const entry = monthMap.get(m) || { month: m, 매출: 0, 수주: 0, 수금: 0 };
    entry.매출 += r.장부금액;
    monthMap.set(m, entry);
  }

  for (const r of orders) {
    const m = extractMonth(r.수주일);
    if (!m) continue;
    const entry = monthMap.get(m) || { month: m, 매출: 0, 수주: 0, 수금: 0 };
    entry.수주 += r.장부금액;
    monthMap.set(m, entry);
  }

  for (const r of collections) {
    const m = extractMonth(r.수금일);
    if (!m) continue;
    const entry = monthMap.get(m) || { month: m, 매출: 0, 수주: 0, 수금: 0 };
    entry.수금 += r.장부수금액;
    monthMap.set(m, entry);
  }

  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface OrgRanking {
  org: string;
  sales: number;
}

export function calcOrgRanking(sales: SalesRecord[]): OrgRanking[] {
  const orgMap = new Map<string, number>();
  for (const r of sales) {
    const org = r.영업조직;
    if (!org) continue;
    orgMap.set(org, (orgMap.get(org) || 0) + r.장부금액);
  }
  return Array.from(orgMap.entries())
    .map(([org, sales]) => ({ org, sales }))
    .sort((a, b) => b.sales - a.sales);
}

export function calcTopCustomers(sales: SalesRecord[], topN = 10) {
  const custMap = new Map<string, { name: string; amount: number }>();
  for (const r of sales) {
    const key = r.매출처;
    if (!key) continue;
    const entry = custMap.get(key) || { name: r.매출처명, amount: 0 };
    entry.amount += r.장부금액;
    custMap.set(key, entry);
  }
  return Array.from(custMap.entries())
    .map(([code, { name, amount }]) => ({ code, name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topN);
}

export function calcItemSales(sales: SalesRecord[]) {
  const itemMap = new Map<string, { name: string; amount: number; category: string }>();
  for (const r of sales) {
    const key = r.대분류 || r.품목;
    if (!key) continue;
    const entry = itemMap.get(key) || { name: key, amount: 0, category: r.대분류 };
    entry.amount += r.장부금액;
    itemMap.set(key, entry);
  }
  return Array.from(itemMap.values())
    .sort((a, b) => b.amount - a.amount);
}

export function calcSalesByType(sales: SalesRecord[]) {
  const domestic = sales.filter(r => {
    const currency = (r.거래통화 || "KRW").trim().toUpperCase();
    return r.수주유형 !== "수출" && currency === "KRW";
  }).reduce((s, r) => s + r.장부금액, 0);
  const exported = sales.filter(r => {
    const currency = (r.거래통화 || "KRW").trim().toUpperCase();
    return r.수주유형 === "수출" || currency !== "KRW";
  }).reduce((s, r) => s + r.장부금액, 0);
  return { domestic, exported };
}

// ─── 비용 구조 음수 매출 경고 (E1) ──────────────────────────────────

/**
 * 매출액이 음수인 행(반품/환불/대변전표) 수를 반환.
 * 비용구조 분석에서 이 행들은 제외되므로, UI에서 경고 표시용으로 사용.
 */
export function countNegativeSalesRows(teamContribData: TeamContributionRecord[]): number {
  return teamContribData.filter((r) => r.매출액.실적 < 0).length;
}

// ─── 수금율 선수금 분리 표시 (E3) ───────────────────────────────────

export interface CollectionRateDetail {
  totalCollectionRate: number;   // 총 수금율 (선수금 포함)
  netCollectionRate: number;     // 순수 수금율 (선수금 제외)
  totalCollection: number;
  prepaymentAmount: number;
  netCollection: number;
  totalSales: number;
}

/**
 * 수금율을 선수금 포함/제외 기준으로 분리 계산.
 * - totalCollectionRate: 장부수금액 / 장부매출액 × 100 (선수금 포함)
 * - netCollectionRate: (장부수금액 - 장부선수금액) / 장부매출액 × 100 (선수금 제외)
 */
export function calcCollectionRateDetail(
  sales: SalesRecord[],
  collections: CollectionRecord[]
): CollectionRateDetail {
  const totalSales = sales.reduce((sum, r) => sum + r.장부금액, 0);
  const totalCollection = collections.reduce((sum, r) => sum + r.장부수금액, 0);
  const prepaymentAmount = collections.reduce((sum, r) => sum + r.장부선수금액, 0);
  const netCollection = totalCollection - prepaymentAmount;

  return {
    totalCollectionRate: totalSales > 0 ? (totalCollection / totalSales) * 100 : 0,
    netCollectionRate: totalSales > 0 ? (netCollection / totalSales) * 100 : 0,
    totalCollection,
    prepaymentAmount,
    netCollection,
    totalSales,
  };
}

// ─── 비용 구조 프로파일링 ───────────────────────────────────────────

export interface CostStructureRow {
  id: string;
  org: string;
  매출액: number;
  원재료비: number;
  상품매입: number;
  외주가공비: number;
  운반비: number;
  지급수수료: number;
  노무비: number;
  기타변동비: number;
  고정비: number;
  원재료비율: number;
  상품매입비율: number;
  외주비율: number;
  매출원가율: number;
}

export function calcCostStructure(teamContribData: TeamContributionRecord[]): CostStructureRow[] {
  return teamContribData
    .filter((r) => r.매출액.실적 !== 0)
    .map((r) => {
      const sales = Math.abs(r.매출액.실적);
      // Math.abs 제거: 환불/역분개 시 음수 비용이 자연스럽게 차감됨
      const 원재료비 = r.제조변동_원재료비.실적 + r.제조변동_부재료비.실적;
      const 상품매입 = r.변동_상품매입.실적;
      const 외주가공비 = r.판관변동_외주가공비.실적 + r.제조변동_외주가공비.실적;
      const 운반비 = r.판관변동_운반비.실적 + r.제조변동_운반비.실적;
      const 지급수수료 = r.판관변동_지급수수료.실적 + r.제조변동_지급수수료.실적;
      const 노무비 =
        r.판관변동_노무비.실적 +
        r.판관고정_노무비.실적 +
        r.제조변동_노무비.실적;
      // 판관고정_노무비는 노무비에 포함되므로 고정비에서 제외 (이중집계 방지)
      const 고정비 =
        r.판관고정_감가상각비.실적 +
        r.판관고정_기타경비.실적;
      const 기타변동비 =
        r.판관변동_복리후생비.실적 +
        r.판관변동_소모품비.실적 +
        r.판관변동_수도광열비.실적 +
        r.판관변동_수선비.실적 +
        r.판관변동_견본비.실적 +
        r.제조변동_복리후생비.실적 +
        r.제조변동_소모품비.실적 +
        r.제조변동_수도광열비.실적 +
        r.제조변동_수선비.실적 +
        r.제조변동_연료비.실적 +
        r.제조변동_전력비.실적 +
        r.제조변동_견본비.실적;

      const 원재료비율 = sales > 0 ? (원재료비 / sales) * 100 : 0;
      const 상품매입비율 = sales > 0 ? (상품매입 / sales) * 100 : 0;
      const 외주비율 = sales > 0 ? (외주가공비 / sales) * 100 : 0;

      return {
        id: r.영업담당사번,
        org: r.영업조직팀,
        매출액: r.매출액.실적,
        원재료비,
        상품매입,
        외주가공비,
        운반비,
        지급수수료,
        노무비,
        기타변동비,
        고정비,
        원재료비율,
        상품매입비율,
        외주비율,
        매출원가율: sales > 0 ? ((원재료비 + 상품매입 + 외주가공비 + 운반비 + 지급수수료 + 노무비 + 기타변동비 + 고정비) / sales) * 100 : 0,
      };
    });
}

// ─── 조직별 비율 지표 (레이더 차트용) ──────────────────────────────

export interface OrgRatioMetric {
  org: string;
  매출원가율: number;
  매출총이익율: number;
  판관비율: number;
  영업이익율: number;
  공헌이익율: number;
}

export function calcOrgRatioMetrics(orgProfitData: OrgProfitRecord[]): OrgRatioMetric[] {
  return orgProfitData
    .filter((r) => r.영업조직팀 && r.매출액.실적 !== 0)
    .map((r) => ({
      org: r.영업조직팀,
      매출원가율: r.매출원가율.실적,
      매출총이익율: r.매출총이익율.실적,
      판관비율: r.판관비율.실적,
      영업이익율: r.영업이익율.실적,
      공헌이익율: r.공헌이익율.실적,
    }));
}

// ─── 계획 대비 실적 히트맵 ──────────────────────────────────────────

export interface HeatmapMetric {
  name: string;
  plan: number;
  actual: number;
  achievementRate: number;
  gap: number;
  isCostItem: boolean;
}

export interface PlanVsActualHeatmapRow {
  org: string;
  metrics: HeatmapMetric[];
}

export function calcPlanVsActualHeatmap(orgProfitData: OrgProfitRecord[]): PlanVsActualHeatmapRow[] {
  const metricKeys: { key: keyof OrgProfitRecord; label: string; isCostItem: boolean }[] = [
    { key: "매출액", label: "매출액", isCostItem: false },
    { key: "실적매출원가", label: "매출원가", isCostItem: true },
    { key: "매출총이익", label: "매출총이익", isCostItem: false },
    { key: "판매관리비", label: "판관비", isCostItem: true },
    { key: "영업이익", label: "영업이익", isCostItem: false },
    { key: "공헌이익", label: "공헌이익", isCostItem: false },
  ];

  return orgProfitData
    .filter((r) => r.영업조직팀 && r.매출액.실적 !== 0)
    .map((r) => ({
      org: r.영업조직팀,
      metrics: metricKeys.map(({ key, label, isCostItem }) => {
        const field = r[key] as { 계획: number; 실적: number; 차이: number };
        const plan = field.계획;
        const actual = field.실적;
        const achievementRate = plan !== 0 ? (actual / plan) * 100 : actual > 0 ? 9999 : 0;
        return {
          name: label,
          plan,
          actual,
          achievementRate,
          gap: actual - plan,
          isCostItem,
        };
      }),
    }));
}

// ─── 고급 KPI 함수 ──────────────────────────────────────────────────

// Forecast accuracy: 100 - |실적 - 계획| / |계획| * 100
// Clamped to 0-100
export function calcForecastAccuracy(orgProfit: OrgProfitRecord[]): number {
  if (orgProfit.length === 0) return 0;
  const totalPlan = orgProfit.reduce((s, r) => s + r.매출액.계획, 0);
  const totalActual = orgProfit.reduce((s, r) => s + r.매출액.실적, 0);
  if (totalPlan === 0) return 0;
  const accuracy = 100 - Math.abs((totalActual - totalPlan) / totalPlan) * 100;
  return Math.max(0, Math.min(accuracy, 100));
}

// Collection efficiency: Collections / (Opening Receivables + Sales) × 100
export function calcCollectionEfficiency(
  totalSales: number,
  totalCollections: number,
  totalReceivables: number
): number {
  const potential = totalReceivables + totalSales;
  if (potential <= 0) return 0;
  return (totalCollections / potential) * 100;
}

// Operating leverage: weighted actual margin / weighted plan margin × 100
export function calcOperatingLeverage(orgProfit: OrgProfitRecord[]): number {
  if (orgProfit.length === 0) return 0;
  const totalActualSales = orgProfit.reduce((s, r) => s + r.매출액.실적, 0);
  const totalPlanSales = orgProfit.reduce((s, r) => s + r.매출액.계획, 0);
  const totalActualProfit = orgProfit.reduce((s, r) => s + r.영업이익.실적, 0);
  const totalPlanProfit = orgProfit.reduce((s, r) => s + r.영업이익.계획, 0);
  const actualMargin = totalActualSales > 0 ? (totalActualProfit / totalActualSales) * 100 : 0;
  const planMargin = totalPlanSales > 0 ? (totalPlanProfit / totalPlanSales) * 100 : 0;
  if (planMargin === 0) return 0;
  return (actualMargin / planMargin) * 100;
}

// Contribution margin rate
export function calcContributionMarginRate(orgProfit: OrgProfitRecord[]): number {
  if (orgProfit.length === 0) return 0;
  const totalSales = orgProfit.reduce((s, r) => s + r.매출액.실적, 0);
  const totalContrib = orgProfit.reduce((s, r) => s + r.공헌이익.실적, 0);
  if (totalSales === 0) return 0;
  return (totalContrib / totalSales) * 100;
}

// Gross profit margin
export function calcGrossProfitMargin(orgProfit: OrgProfitRecord[]): number {
  if (orgProfit.length === 0) return 0;
  const totalSales = orgProfit.reduce((s, r) => s + r.매출액.실적, 0);
  const totalGross = orgProfit.reduce((s, r) => s + r.매출총이익.실적, 0);
  if (totalSales === 0) return 0;
  return (totalGross / totalSales) * 100;
}

// ─── Monthly Cost Profiles ───────────────────────────────────

export interface MonthlyCostProfile {
  month: string;
  매출원가율: number;
  원재료비율: number;
  상품매입비율: number;
  외주비율: number;
  isSynthetic?: boolean; // true = salesWeight 기반 합성 데이터 (teamContrib 비율 배분)
  판관비율: number;
}

/**
 * 월별 원가 구조 프로파일
 * 매출 데이터의 월 정보 + teamContribution의 비율로 추정
 * teamContribution은 월별이 아니므로 sales의 월별 비중으로 배분
 */
export function calcMonthlyCostProfiles(
  sales: SalesRecord[],
  teamContrib: TeamContributionRecord[]
): MonthlyCostProfile[] {
  if (sales.length === 0 || teamContrib.length === 0) return [];

  // 전체 비율 계산 (teamContrib는 기간 합계)
  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalRawMaterial = 0;
  let totalProductPurchase = 0;
  let totalOutsourcing = 0;
  let totalSGA = 0;

  for (const tc of teamContrib) {
    totalRevenue += tc.매출액.실적;
    totalCOGS += tc.실적매출원가.실적;
    totalRawMaterial += tc.제조변동_원재료비.실적 + tc.제조변동_부재료비.실적;
    totalProductPurchase += tc.변동_상품매입.실적;
    totalOutsourcing += tc.판관변동_외주가공비.실적 + tc.제조변동_외주가공비.실적;
    totalSGA += tc.판매관리비.실적;
  }

  if (totalRevenue <= 0) return [];

  const baseCogsRatio = (totalCOGS / totalRevenue) * 100;
  const baseRawRatio = totalCOGS > 0 ? (totalRawMaterial / totalCOGS) * 100 : 0;
  const basePurchaseRatio = totalCOGS > 0 ? (totalProductPurchase / totalCOGS) * 100 : 0;
  const baseOutsourcingRatio = totalCOGS > 0 ? (totalOutsourcing / totalCOGS) * 100 : 0;
  const baseSgaRatio = (totalSGA / totalRevenue) * 100;

  // 월별 매출 집계
  const salesByMonth = new Map<string, number>();
  for (const s of sales) {
    const month = extractMonth(s.매출일);
    if (!month) continue;
    salesByMonth.set(month, (salesByMonth.get(month) || 0) + s.장부금액);
  }

  // 월별 비율: 전체 비율에 약간의 변동을 반영 (매출 비중 기준)
  const months = Array.from(salesByMonth.keys()).sort();
  const totalSales = Array.from(salesByMonth.values()).reduce((s, v) => s + v, 0);

  return months.map((month) => {
    const monthlySales = salesByMonth.get(month) || 0;
    const salesWeight = totalSales > 0 ? monthlySales / (totalSales / months.length) : 1;

    // 매출 비중이 높은 달일수록 원가율이 약간 변동하는 근사치
    const varianceFactor = Math.min(Math.max(salesWeight, 0.85), 1.15);

    return {
      month,
      매출원가율: Math.round(baseCogsRatio * varianceFactor * 10) / 10,
      원재료비율: Math.round(baseRawRatio * varianceFactor * 10) / 10,
      상품매입비율: Math.round(basePurchaseRatio * varianceFactor * 10) / 10,
      외주비율: Math.round(baseOutsourcingRatio * varianceFactor * 10) / 10,
      판관비율: Math.round(baseSgaRatio * (2 - varianceFactor) * 10) / 10,
      isSynthetic: true,
    };
  });
}

export interface CostChangeAlert {
  metric: string;
  metricLabel: string;
  previousMonth: string;
  currentMonth: string;
  previousRatio: number;
  currentRatio: number;
  change: number;
  severity: "low" | "medium" | "high";
}

/**
 * 월간 원가 변동 감지
 * 연속 2개월 간 원가 비율 변화가 임계값을 초과하면 알림
 */
export function detectCostChanges(
  profiles: MonthlyCostProfile[],
  threshold: number = 3
): CostChangeAlert[] {
  if (profiles.length < 2) return [];

  const alerts: CostChangeAlert[] = [];
  const metrics: { key: keyof MonthlyCostProfile; label: string }[] = [
    { key: "매출원가율", label: "매출원가율" },
    { key: "원재료비율", label: "원재료비율" },
    { key: "상품매입비율", label: "상품매입비율" },
    { key: "외주비율", label: "외주비율" },
    { key: "판관비율", label: "판관비율" },
  ];

  for (let i = 1; i < profiles.length; i++) {
    const prev = profiles[i - 1];
    const curr = profiles[i];

    for (const m of metrics) {
      const prevVal = prev[m.key] as number;
      const currVal = curr[m.key] as number;
      const change = currVal - prevVal;

      if (Math.abs(change) >= threshold) {
        alerts.push({
          metric: m.key as string,
          metricLabel: m.label,
          previousMonth: prev.month,
          currentMonth: curr.month,
          previousRatio: prevVal,
          currentRatio: currVal,
          change: Math.round(change * 10) / 10,
          severity: Math.abs(change) >= threshold * 2 ? "high" : "medium",
        });
      }
    }
  }

  return alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

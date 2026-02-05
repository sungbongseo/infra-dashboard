import type { SalesRecord, CollectionRecord, OrderRecord, OrgProfitRecord, TeamContributionRecord } from "@/types";

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
  orgProfit: OrgProfitRecord[]
): OverviewKpis {
  const totalSales = sales.reduce((sum, r) => sum + r.장부금액, 0);
  const totalOrders = orders.reduce((sum, r) => sum + r.장부금액, 0);
  const totalCollection = collections.reduce((sum, r) => sum + r.장부수금액, 0);
  const collectionRate = totalSales > 0 ? (totalCollection / totalSales) * 100 : 0;
  const totalReceivables = totalSales - totalCollection;

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

function extractMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = String(dateStr);
  // Handle various date formats: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, Excel serial
  if (d.includes("-")) return d.substring(0, 7);
  if (d.includes("/")) {
    const parts = d.split("/");
    return `${parts[0]}-${parts[1].padStart(2, "0")}`;
  }
  if (d.length === 8) return `${d.substring(0, 4)}-${d.substring(4, 6)}`;
  // Excel serial number
  const serial = Number(d);
  if (!isNaN(serial) && serial > 40000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return "";
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
  const domestic = sales.filter(r => r.수주유형 !== "수출" && r.거래통화 === "KRW").reduce((s, r) => s + r.장부금액, 0);
  const exported = sales.filter(r => r.수주유형 === "수출" || r.거래통화 !== "KRW").reduce((s, r) => s + r.장부금액, 0);
  return { domestic, exported };
}

// ─── 비용 구조 프로파일링 ───────────────────────────────────────────

export type CostProfileType = "자체생산형" | "구매직납형" | "외주의존형" | "혼합형";

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
  profileType: CostProfileType;
}

function classifyCostProfile(원재료비율: number, 상품매입비율: number, 외주비율: number): CostProfileType {
  if (원재료비율 >= 30) return "자체생산형";
  if (상품매입비율 >= 30) return "구매직납형";
  if (외주비율 >= 20) return "외주의존형";
  return "혼합형";
}

export function calcCostStructure(teamContribData: TeamContributionRecord[]): CostStructureRow[] {
  return teamContribData
    .filter((r) => r.매출액.실적 !== 0)
    .map((r) => {
      const sales = Math.abs(r.매출액.실적);
      const 원재료비 = Math.abs(r.제조변동_원재료비.실적) + Math.abs(r.제조변동_부재료비.실적);
      const 상품매입 = Math.abs(r.변동_상품매입.실적);
      const 외주가공비 = Math.abs(r.판관변동_외주가공비.실적) + Math.abs(r.제조변동_외주가공비.실적);
      const 운반비 = Math.abs(r.판관변동_운반비.실적) + Math.abs(r.제조변동_운반비.실적);
      const 지급수수료 = Math.abs(r.판관변동_지급수수료.실적) + Math.abs(r.제조변동_지급수수료.실적);
      const 노무비 =
        Math.abs(r.판관변동_노무비.실적) +
        Math.abs(r.판관고정_노무비.실적) +
        Math.abs(r.제조변동_노무비.실적);
      const 고정비 =
        Math.abs(r.판관고정_노무비.실적) +
        Math.abs(r.판관고정_감가상각비.실적) +
        Math.abs(r.판관고정_기타경비.실적);
      const 기타변동비 =
        Math.abs(r.판관변동_복리후생비.실적) +
        Math.abs(r.판관변동_소모품비.실적) +
        Math.abs(r.판관변동_수도광열비.실적) +
        Math.abs(r.판관변동_수선비.실적) +
        Math.abs(r.판관변동_견본비.실적) +
        Math.abs(r.제조변동_복리후생비.실적) +
        Math.abs(r.제조변동_소모품비.실적) +
        Math.abs(r.제조변동_수도광열비.실적) +
        Math.abs(r.제조변동_수선비.실적) +
        Math.abs(r.제조변동_연료비.실적) +
        Math.abs(r.제조변동_전력비.실적) +
        Math.abs(r.제조변동_견본비.실적);

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
        profileType: classifyCostProfile(원재료비율, 상품매입비율, 외주비율),
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
}

export interface PlanVsActualHeatmapRow {
  org: string;
  metrics: HeatmapMetric[];
}

export function calcPlanVsActualHeatmap(orgProfitData: OrgProfitRecord[]): PlanVsActualHeatmapRow[] {
  const metricKeys: { key: keyof OrgProfitRecord; label: string }[] = [
    { key: "매출액", label: "매출액" },
    { key: "실적매출원가", label: "매출원가" },
    { key: "매출총이익", label: "매출총이익" },
    { key: "판매관리비", label: "판관비" },
    { key: "영업이익", label: "영업이익" },
    { key: "공헌이익", label: "공헌이익" },
  ];

  return orgProfitData
    .filter((r) => r.영업조직팀 && r.매출액.실적 !== 0)
    .map((r) => ({
      org: r.영업조직팀,
      metrics: metricKeys.map(({ key, label }) => {
        const field = r[key] as { 계획: number; 실적: number; 차이: number };
        const plan = field.계획;
        const actual = field.실적;
        const achievementRate = plan !== 0 ? (actual / plan) * 100 : actual > 0 ? 999 : 0;
        return {
          name: label,
          plan,
          actual,
          achievementRate,
          gap: actual - plan,
        };
      }),
    }));
}

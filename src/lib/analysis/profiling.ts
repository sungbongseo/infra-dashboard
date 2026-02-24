import type {
  SalesRecord,
  OrderRecord,
  CollectionRecord,
  TeamContributionRecord,
  PerformanceScore,
  ReceivableAgingRecord,
  CustomerItemDetailRecord,
} from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── HHI (Herfindahl-Hirschman Index) 거래처 집중도 ────────────────────────

export interface CustomerHHI {
  hhi: number; // 0~1 사이 값, 1에 가까울수록 집중
  topCustomerShare: number; // 최대 거래처 매출 비중
  customerCount: number;
  customers: Array<{ name: string; amount: number; share: number }>;
  riskLevel: "high" | "medium" | "low";
}

/**
 * 담당자별 거래처 집중도(HHI) 계산
 * HHI = SUM(share_i^2), 각 share_i = 거래처_i 매출 / 담당자 총매출
 * HHI > 0.25 → high(과점), 0.15~0.25 → medium(적정 집중), < 0.15 → low(분산)
 */
export function calcCustomerHHI(
  salesData: SalesRecord[],
  personField: string = "영업담당자"
): Map<string, CustomerHHI> {
  // 담당자별 → 거래처별 매출 집계
  const personCustomerMap = new Map<
    string,
    Map<string, { name: string; amount: number }>
  >();

  for (const r of salesData) {
    const personKey = (r as any)[personField];
    if (!personKey) continue;

    let customerMap = personCustomerMap.get(personKey);
    if (!customerMap) {
      customerMap = new Map();
      personCustomerMap.set(personKey, customerMap);
    }

    const custKey = r.매출처 || "기타";
    const custEntry = customerMap.get(custKey) || {
      name: (r as any).매출처명 || custKey,
      amount: 0,
    };
    custEntry.amount += r.장부금액;
    customerMap.set(custKey, custEntry);
  }

  const result = new Map<string, CustomerHHI>();

  for (const [personId, customerMap] of Array.from(
    personCustomerMap.entries()
  )) {
    const totalAmount = Array.from(customerMap.values()).reduce(
      (sum, c) => sum + c.amount,
      0
    );
    if (totalAmount === 0) {
      result.set(personId, {
        hhi: 0,
        topCustomerShare: 0,
        customerCount: customerMap.size,
        customers: [],
        riskLevel: "low",
      });
      continue;
    }

    const customers = Array.from(customerMap.entries())
      .map(([, c]) => ({
        name: c.name,
        amount: c.amount,
        share: c.amount / totalAmount,
      }))
      .sort((a, b) => b.amount - a.amount);

    const hhi = customers.reduce((sum, c) => sum + c.share * c.share, 0);
    const topCustomerShare = customers.length > 0 ? customers[0].share : 0;

    let riskLevel: "high" | "medium" | "low";
    if (hhi > 0.25) riskLevel = "high";
    else if (hhi > 0.15) riskLevel = "medium";
    else riskLevel = "low";

    result.set(personId, {
      hhi,
      topCustomerShare,
      customerCount: customerMap.size,
      customers,
      riskLevel,
    });
  }

  return result;
}

// ─── 미수금 리스크 점수 ────────────────────────────────────────────────────

/**
 * 담당자별 미수금 건전성 점수 계산 (5번째 축)
 * 점수 = (1 - 장기연체비율) * maxScore
 * 장기연체비율 = (3개월 이상 미수금) / 총미수금
 * 미수금이 없는 담당자는 만점
 */
export function calcReceivableRiskScore(
  agingRecords: ReceivableAgingRecord[],
  maxScore: number = 20
): Map<string, number> {
  // 담당자별 미수금 집계
  const personAging = new Map<
    string,
    { total: number; longOverdue: number }
  >();

  for (const r of agingRecords) {
    const key = r.담당자;
    if (!key) continue;

    const entry = personAging.get(key) || { total: 0, longOverdue: 0 };
    const total = r.합계.장부금액;
    // 3개월 이상: month3 + month4 + month5 + month6 + overdue
    const longOverdue =
      r.month3.장부금액 +
      r.month4.장부금액 +
      r.month5.장부금액 +
      r.month6.장부금액 +
      r.overdue.장부금액;

    entry.total += total;
    entry.longOverdue += longOverdue;
    personAging.set(key, entry);
  }

  const result = new Map<string, number>();

  for (const [personId, entry] of Array.from(personAging.entries())) {
    if (entry.total === 0) {
      result.set(personId, maxScore); // 미수금 없으면 만점
      continue;
    }
    const longOverdueRatio = entry.longOverdue / entry.total;
    const score = (1 - longOverdueRatio) * maxScore;
    result.set(personId, Math.max(0, Math.min(maxScore, score)));
  }

  return result;
}

// ─── 프로파일 결과 인터페이스 ──────────────────────────────────────────────

export interface SalesRepProfile {
  id: string;
  name: string;
  org: string;
  score: PerformanceScore;
  salesAmount: number;
  orderAmount: number;
  collectionAmount: number;
  contributionMarginRate: number;
  customerCount: number;
  itemCount: number;
  // HHI 관련 필드
  hhi: number;
  hhiRiskLevel: "high" | "medium" | "low";
  topCustomerShare: number;
  topCustomers: Array<{ name: string; amount: number; share: number }>;
}

// ─── 성과 점수 계산 (4축/5축 지원) ─────────────────────────────────────────

/**
 * 영업사원 성과 프로파일 계산
 * agingRecords가 제공되면 5축(각 20점), 미제공 시 4축(각 25점) 방식 유지
 */
export interface PerformanceScoresResult {
  profiles: SalesRepProfile[];
  idToName: Map<string, string>;
  nameToId: Map<string, string>;
}

export interface ProfilingWeights {
  sales?: number;      // default 20
  profit?: number;     // default 20
  collection?: number; // default 20
  growth?: number;     // default 20 (order score)
  diversity?: number;  // default 20 (receivable health score)
}

/** 가중치를 합계 totalMax로 정규화합니다. */
function normalizeWeights(
  weights: ProfilingWeights | undefined,
  totalMax: number
): { sales: number; profit: number; collection: number; growth: number; diversity: number } {
  const raw = {
    sales: weights?.sales ?? (totalMax / 5),
    profit: weights?.profit ?? (totalMax / 5),
    collection: weights?.collection ?? (totalMax / 5),
    growth: weights?.growth ?? (totalMax / 5),
    diversity: weights?.diversity ?? (totalMax / 5),
  };
  const sum = raw.sales + raw.profit + raw.collection + raw.growth + raw.diversity;
  if (sum <= 0) {
    const eq = totalMax / 5;
    return { sales: eq, profit: eq, collection: eq, growth: eq, diversity: eq };
  }
  const factor = totalMax / sum;
  return {
    sales: raw.sales * factor,
    profit: raw.profit * factor,
    collection: raw.collection * factor,
    growth: raw.growth * factor,
    diversity: raw.diversity * factor,
  };
}

export function calcPerformanceScores(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[],
  teamContrib: TeamContributionRecord[],
  agingRecords?: ReceivableAgingRecord[],
  weights?: ProfilingWeights
): PerformanceScoresResult {
  const is5Axis = agingRecords && agingRecords.length > 0;
  const totalMax = 100;
  // 5축 모드: 5개 가중치 정규화 / 4축 모드: diversity=0, 나머지 4개로 정규화
  const w = normalizeWeights(
    is5Axis ? weights : { ...weights, diversity: 0 },
    totalMax
  );

  // Group sales by person
  const personSales = new Map<
    string,
    {
      name: string;
      org: string;
      amount: number;
      customers: Set<string>;
      items: Set<string>;
    }
  >();
  for (const r of sales) {
    const key = r.영업담당자;
    if (!key) continue;
    const entry = personSales.get(key) || {
      name: r.영업담당자명,
      org: r.영업조직,
      amount: 0,
      customers: new Set(),
      items: new Set(),
    };
    entry.amount += r.장부금액;
    if (r.매출처) entry.customers.add(r.매출처);
    if (r.품목) entry.items.add(r.품목);
    personSales.set(key, entry);
  }

  // Group orders by person
  const personOrders = new Map<string, number>();
  for (const r of orders) {
    const key = r.영업담당자;
    if (!key) continue;
    personOrders.set(key, (personOrders.get(key) || 0) + r.장부금액);
  }

  // ──── 사번↔이름 매핑 구축 (매출+수주 데이터 기반) ────────────────
  const idToName = new Map<string, string>();
  const nameToId = new Map<string, string>();
  for (const r of sales) {
    if (r.영업담당자 && r.영업담당자명) {
      // M-2: 동명이인 충돌 감지
      const existing = nameToId.get(r.영업담당자명);
      if (existing && existing !== r.영업담당자) {
        console.warn(`[프로파일] 동명이인 감지: "${r.영업담당자명}" → 기존 사번 ${existing}, 신규 사번 ${r.영업담당자}`);
      }
      idToName.set(r.영업담당자, r.영업담당자명);
      if (!nameToId.has(r.영업담당자명)) nameToId.set(r.영업담당자명, r.영업담당자);
    }
  }
  for (const r of orders) {
    if (r.영업담당자 && r.영업담당자명) {
      const existing = nameToId.get(r.영업담당자명);
      if (existing && existing !== r.영업담당자) {
        console.warn(`[프로파일] 동명이인 감지: "${r.영업담당자명}" → 기존 사번 ${existing}, 신규 사번 ${r.영업담당자}`);
      }
      if (!idToName.has(r.영업담당자)) idToName.set(r.영업담당자, r.영업담당자명);
      if (!nameToId.has(r.영업담당자명)) nameToId.set(r.영업담당자명, r.영업담당자);
    }
  }

  // Group collections by person (이름 키 → 사번 키로 변환)
  const personCollections = new Map<string, number>();
  for (const r of collections) {
    const key = r.담당자;
    if (!key) continue;
    const id = nameToId.get(key) || key; // 이름→사번 변환, fallback=원래 키
    personCollections.set(
      id,
      (personCollections.get(id) || 0) + r.장부수금액
    );
  }

  // Contribution margin from teamContrib (이름 키 → 사번 키로 변환)
  const personContrib = new Map<string, { rate: number }>();
  for (const r of teamContrib) {
    const key = r.영업담당사번; // 필드명은 사번이지만 실제값은 이름
    if (!key) continue;
    const id = nameToId.get(key) || key;
    personContrib.set(id, {
      rate: r.공헌이익율?.실적 || 0,
    });
  }

  // Receivable risk scores (5축 모드, 이름 키 → 사번 키로 변환)
  const rawReceivableScores = is5Axis
    ? calcReceivableRiskScore(agingRecords, w.diversity)
    : new Map<string, number>();
  const receivableScores = new Map<string, number>();
  for (const [key, score] of Array.from(rawReceivableScores.entries())) {
    const id = nameToId.get(key) || key;
    receivableScores.set(id, score);
  }

  // HHI 계산
  const hhiMap = calcCustomerHHI(sales);

  // Collect all person IDs (사번 기반으로만 — 중복 프로파일 방지)
  const allPersons = new Set([
    ...Array.from(personSales.keys()),
    ...Array.from(personOrders.keys()),
    ...Array.from(personCollections.keys()),
  ]);

  // Calculate max values for scoring (reduce pattern to avoid stack overflow on large datasets)
  const maxSales = Array.from(personSales.values()).reduce((max, v) => Math.max(max, v.amount), 1);
  const maxOrders = Array.from(personOrders.values()).reduce((max, v) => Math.max(max, v), 1);
  const maxContribRate = Array.from(personContrib.values()).reduce((max, v) => Math.max(max, v.rate), 1);

  const profiles: SalesRepProfile[] = [];

  for (const id of Array.from(allPersons)) {
    const sData = personSales.get(id);
    const salesAmt = sData?.amount || 0;
    const orderAmt = personOrders.get(id) || 0;
    const collectAmt = personCollections.get(id) || 0;
    const contribRate = personContrib.get(id)?.rate || 0;

    const salesScore = (salesAmt / maxSales) * w.sales;
    const orderScore = (orderAmt / maxOrders) * w.growth;
    const profitScore =
      maxContribRate > 0 ? (contribRate / maxContribRate) * w.profit : 0;
    const collectionRate = salesAmt > 0 ? collectAmt / salesAmt : 0;
    const collectionScore = Math.min(collectionRate, 1) * w.collection;

    // 5축: 미수금 건전성 점수 / 4축: 0
    const receivableScore = is5Axis
      ? receivableScores.get(id) ?? w.diversity // 미수금 데이터 없는 담당자는 만점
      : 0;

    const totalScore =
      salesScore +
      orderScore +
      profitScore +
      collectionScore +
      (is5Axis ? receivableScore : 0);

    // HHI 데이터
    const hhiData = hhiMap.get(id);

    profiles.push({
      id,
      name: sData?.name || id,
      org: sData?.org || "",
      score: {
        salesScore,
        orderScore,
        profitScore,
        collectionScore,
        receivableScore,
        totalScore,
        rank: 0,
        percentile: 0,
      },
      salesAmount: salesAmt,
      orderAmount: orderAmt,
      collectionAmount: collectAmt,
      contributionMarginRate: contribRate,
      customerCount: sData?.customers.size || 0,
      itemCount: sData?.items.size || 0,
      hhi: hhiData?.hhi || 0,
      hhiRiskLevel: hhiData?.riskLevel || "low",
      topCustomerShare: hhiData?.topCustomerShare || 0,
      topCustomers: hhiData?.customers.slice(0, 5) || [],
    });
  }

  // Rank
  profiles.sort((a, b) => b.score.totalScore - a.score.totalScore);
  profiles.forEach((p, i) => {
    p.score.rank = i + 1;
    p.score.percentile =
      ((profiles.length - i) / profiles.length) * 100;
  });

  return { profiles, idToName, nameToId };
}

// ─── Tab 3: 비용 효율 분석 ──────────────────────────────────────────────────

export interface CostEfficiency {
  personId: string;
  org: string;
  salesAmount: number;
  // 변동비 항목별 비율 (매출 대비 %)
  rawMaterialRate: number;      // 원재료비율
  purchaseRate: number;         // 상품매입비율
  outsourcingRate: number;      // 외주가공비율
  variableCostRate: number;     // 판관변동비율 합계
  mfgVariableCostRate: number;  // 제조변동비율 합계
  fixedCostRate: number;        // 판관고정비율 합계
  contributionMarginRate: number;
  operatingMarginRate: number;
}

/**
 * 담당자별 비용 효율 분석
 * teamContribution의 41개 비용 항목 중 주요 항목을 매출 대비 비율로 계산
 */
export function calcCostEfficiency(
  teamContrib: TeamContributionRecord[],
  nameToId?: Map<string, string>
): CostEfficiency[] {
  return teamContrib
    .filter((r) => r.매출액?.실적 > 0)
    .map((r) => {
      const sales = r.매출액.실적;
      const safeRate = (val: number) => (sales > 0 ? (val / sales) * 100 : 0);

      // 판관변동비 합계
      const sgaVariable =
        (r.판관변동_노무비?.실적 || 0) +
        (r.판관변동_복리후생비?.실적 || 0) +
        (r.판관변동_소모품비?.실적 || 0) +
        (r.판관변동_수도광열비?.실적 || 0) +
        (r.판관변동_수선비?.실적 || 0) +
        (r.판관변동_외주가공비?.실적 || 0) +
        (r.판관변동_운반비?.실적 || 0) +
        (r.판관변동_지급수수료?.실적 || 0) +
        (r.판관변동_견본비?.실적 || 0) +
        (r.판관변동_직접판매운반비?.실적 || 0);

      // 판관고정비 합계
      const sgaFixed =
        (r.판관고정_노무비?.실적 || 0) +
        (r.판관고정_감가상각비?.실적 || 0) +
        (r.판관고정_기타경비?.실적 || 0);

      // 제조변동비 주요 항목
      const mfgVariable =
        (r.제조변동_원재료비?.실적 || 0) +
        (r.제조변동_부재료비?.실적 || 0) +
        (r.변동_상품매입?.실적 || 0) +
        (r.제조변동_노무비?.실적 || 0) +
        (r.제조변동_복리후생비?.실적 || 0) +
        (r.제조변동_소모품비?.실적 || 0) +
        (r.제조변동_수도광열비?.실적 || 0) +
        (r.제조변동_수선비?.실적 || 0) +
        (r.제조변동_연료비?.실적 || 0) +
        (r.제조변동_외주가공비?.실적 || 0) +
        (r.제조변동_운반비?.실적 || 0) +
        (r.제조변동_전력비?.실적 || 0) +
        (r.제조변동_견본비?.실적 || 0) +
        (r.제조변동_지급수수료?.실적 || 0);

      return {
        personId: nameToId?.get(r.영업담당사번) || r.영업담당사번,
        org: r.영업조직팀,
        salesAmount: sales,
        rawMaterialRate: safeRate(r.제조변동_원재료비?.실적 || 0),
        purchaseRate: safeRate(r.변동_상품매입?.실적 || 0),
        outsourcingRate: safeRate(r.제조변동_외주가공비?.실적 || 0),
        variableCostRate: safeRate(sgaVariable),
        mfgVariableCostRate: safeRate(mfgVariable),
        fixedCostRate: safeRate(sgaFixed),
        contributionMarginRate: r.공헌이익율?.실적 || 0,
        operatingMarginRate: r.영업이익율?.실적 || 0,
      };
    });
}

// ─── Tab 4: 실적 트렌드 분석 ────────────────────────────────────────────────

export interface MonthlyTrendPoint {
  month: string;
  sales: number;
  orders: number;
  collections: number;
}

export interface RepTrend {
  personId: string;
  name: string;
  monthlyData: MonthlyTrendPoint[];
  avgMonthlySales: number;
  avgMonthlyOrders: number;
  avgMonthlyCollections: number;
  salesMoM: number; // 최근 MoM 성장률 %
  momentum: "accelerating" | "stable" | "decelerating";
}

/**
 * 담당자별 월별 매출/수주/수금 트렌드 계산
 */
export function calcRepTrend(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[],
  personId: string,
  idToName?: Map<string, string>
): RepTrend | null {
  const personSales = sales.filter((r) => r.영업담당자 === personId);
  const personOrders = orders.filter((r) => r.영업담당자 === personId);
  const personName = idToName?.get(personId);
  const personCollections = collections.filter(
    (r) => r.담당자 === personId || (personName != null && r.담당자 === personName)
  );

  if (personSales.length === 0 && personOrders.length === 0) return null;

  // 월별 집계
  const monthMap = new Map<string, { sales: number; orders: number; collections: number }>();

  for (const r of personSales) {
    const m = extractMonth(r.매출일);
    if (!m) continue;
    const entry = monthMap.get(m) || { sales: 0, orders: 0, collections: 0 };
    entry.sales += r.장부금액;
    monthMap.set(m, entry);
  }
  for (const r of personOrders) {
    const m = extractMonth(r.수주일);
    if (!m) continue;
    const entry = monthMap.get(m) || { sales: 0, orders: 0, collections: 0 };
    entry.orders += r.장부금액;
    monthMap.set(m, entry);
  }
  for (const r of personCollections) {
    const m = extractMonth(r.수금일);
    if (!m) continue;
    const entry = monthMap.get(m) || { sales: 0, orders: 0, collections: 0 };
    entry.collections += r.장부수금액;
    monthMap.set(m, entry);
  }

  const monthlyData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  if (monthlyData.length === 0) return null;

  const totalSales = monthlyData.reduce((s, d) => s + d.sales, 0);
  const totalOrders = monthlyData.reduce((s, d) => s + d.orders, 0);
  const totalCollections = monthlyData.reduce((s, d) => s + d.collections, 0);
  const n = monthlyData.length;

  // MoM 성장률 (최근 2개월 비교)
  let salesMoM = 0;
  if (n >= 2) {
    const last = monthlyData[n - 1].sales;
    const prev = monthlyData[n - 2].sales;
    salesMoM = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  }

  // 모멘텀: 최근 3개월 이동평균 추세
  let momentum: "accelerating" | "stable" | "decelerating" = "stable";
  if (n >= 3) {
    const last3 = monthlyData.slice(-3).map((d) => d.sales);
    const trend = last3[2] - last3[0];
    const avgSales = totalSales / n;
    if (avgSales > 0) {
      const trendRate = trend / avgSales;
      if (trendRate > 0.1) momentum = "accelerating";
      else if (trendRate < -0.1) momentum = "decelerating";
    }
  }

  const name = personSales[0]?.영업담당자명 || personId;

  return {
    personId,
    name,
    monthlyData,
    avgMonthlySales: totalSales / n,
    avgMonthlyOrders: totalOrders / n,
    avgMonthlyCollections: totalCollections / n,
    salesMoM,
    momentum,
  };
}

// ─── Tab 5: 제품 포트폴리오 분석 ────────────────────────────────────────────

export interface ProductPortfolioItem {
  product: string;
  productName: string;
  productGroup: string;
  salesAmount: number;
  grossProfit: number;
  grossMarginRate: number;
  sharePercent: number;
}

export interface RepProductPortfolio {
  personId: string;
  productMix: ProductPortfolioItem[];
  topProducts: ProductPortfolioItem[];
  productConcentrationHHI: number;
  avgMarginByProduct: number;
  totalProducts: number;
  totalProductGroups: number;
}

/**
 * 담당자별 제품 포트폴리오 분석
 * customerItemDetail의 영업담당사번으로 필터링
 */
export function calcRepProductPortfolio(
  customerItemDetail: CustomerItemDetailRecord[],
  personId: string,
  idToName?: Map<string, string>
): RepProductPortfolio | null {
  const personName = idToName?.get(personId);
  const personData = customerItemDetail.filter(
    (r) => r.영업담당사번 === personId || (personName != null && r.영업담당사번 === personName)
  );
  if (personData.length === 0) return null;

  // 품목별 집계
  const productMap = new Map<
    string,
    { name: string; group: string; sales: number; grossProfit: number }
  >();

  for (const r of personData) {
    const key = r.품목 || "기타";
    const entry = productMap.get(key) || {
      name: r.품목명 || key,
      group: r.제품군 || "기타",
      sales: 0,
      grossProfit: 0,
    };
    entry.sales += r.매출액?.실적 || 0;
    entry.grossProfit += r.매출총이익?.실적 || 0;
    productMap.set(key, entry);
  }

  const totalSales = Array.from(productMap.values()).reduce(
    (sum, p) => sum + p.sales,
    0
  );

  const productMix: ProductPortfolioItem[] = Array.from(productMap.entries())
    .map(([product, data]) => ({
      product,
      productName: data.name,
      productGroup: data.group,
      salesAmount: data.sales,
      grossProfit: data.grossProfit,
      grossMarginRate: data.sales > 0 ? (data.grossProfit / data.sales) * 100 : 0,
      sharePercent: totalSales > 0 ? (data.sales / totalSales) * 100 : 0,
    }))
    .sort((a, b) => b.salesAmount - a.salesAmount);

  // HHI (품목 집중도)
  const productHHI = productMix.reduce((sum, p) => {
    const share = totalSales > 0 ? p.salesAmount / totalSales : 0;
    return sum + share * share;
  }, 0);

  // 가중평균 마진
  const totalGP = productMix.reduce((s, p) => s + p.grossProfit, 0);
  const avgMargin = totalSales > 0 ? (totalGP / totalSales) * 100 : 0;

  // 제품군 수
  const productGroups = new Set(productMix.map((p) => p.productGroup));

  return {
    personId,
    productMix,
    topProducts: productMix.slice(0, 10),
    productConcentrationHHI: productHHI,
    avgMarginByProduct: avgMargin,
    totalProducts: productMix.length,
    totalProductGroups: productGroups.size,
  };
}

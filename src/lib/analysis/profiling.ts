import type {
  SalesRecord,
  OrderRecord,
  CollectionRecord,
  TeamContributionRecord,
  PerformanceScore,
  ReceivableAgingRecord,
} from "@/types";

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
export function calcPerformanceScores(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[],
  teamContrib: TeamContributionRecord[],
  agingRecords?: ReceivableAgingRecord[]
): SalesRepProfile[] {
  const is5Axis = agingRecords && agingRecords.length > 0;
  const axisMax = is5Axis ? 20 : 25;

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

  // Group collections by person
  const personCollections = new Map<string, number>();
  for (const r of collections) {
    const key = r.담당자;
    if (!key) continue;
    personCollections.set(
      key,
      (personCollections.get(key) || 0) + r.장부수금액
    );
  }

  // Contribution margin from teamContrib
  const personContrib = new Map<string, { rate: number }>();
  for (const r of teamContrib) {
    personContrib.set(r.영업담당사번, {
      rate: r.공헌이익율?.실적 || 0,
    });
  }

  // Receivable risk scores (5축 모드)
  const receivableScores = is5Axis
    ? calcReceivableRiskScore(agingRecords, axisMax)
    : new Map<string, number>();

  // HHI 계산
  const hhiMap = calcCustomerHHI(sales);

  // Collect all person IDs
  const allPersons = new Set([
    ...Array.from(personSales.keys()),
    ...Array.from(personOrders.keys()),
    ...Array.from(personCollections.keys()),
  ]);

  // Calculate max values for scoring
  const maxSales = Math.max(
    ...Array.from(personSales.values()).map((v) => v.amount),
    1
  );
  const maxOrders = Math.max(...Array.from(personOrders.values()), 1);
  const maxContribRate = Math.max(
    ...Array.from(personContrib.values()).map((v) => v.rate),
    1
  );

  const profiles: SalesRepProfile[] = [];

  for (const id of Array.from(allPersons)) {
    const sData = personSales.get(id);
    const salesAmt = sData?.amount || 0;
    const orderAmt = personOrders.get(id) || 0;
    const collectAmt = personCollections.get(id) || 0;
    const contribRate = personContrib.get(id)?.rate || 0;

    const salesScore = (salesAmt / maxSales) * axisMax;
    const orderScore = (orderAmt / maxOrders) * axisMax;
    const profitScore =
      maxContribRate > 0 ? (contribRate / maxContribRate) * axisMax : 0;
    const collectionRate = salesAmt > 0 ? collectAmt / salesAmt : 0;
    const collectionScore = Math.min(collectionRate, 1) * axisMax;

    // 5축: 미수금 건전성 점수 / 4축: 0
    const receivableScore = is5Axis
      ? receivableScores.get(id) ?? axisMax // 미수금 데이터 없는 담당자는 만점
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

  return profiles;
}

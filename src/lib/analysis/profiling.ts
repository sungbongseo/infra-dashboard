import type {
  SalesRecord,
  OrderRecord,
  CollectionRecord,
  TeamContributionRecord,
  PerformanceScore,
} from "@/types";

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
}

export function calcPerformanceScores(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[],
  teamContrib: TeamContributionRecord[]
): SalesRepProfile[] {
  // Group sales by person
  const personSales = new Map<string, { name: string; org: string; amount: number; customers: Set<string>; items: Set<string> }>();
  for (const r of sales) {
    const key = r.영업담당자;
    if (!key) continue;
    const entry = personSales.get(key) || { name: r.영업담당자명, org: r.영업조직, amount: 0, customers: new Set(), items: new Set() };
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
    personCollections.set(key, (personCollections.get(key) || 0) + r.장부수금액);
  }

  // Contribution margin from teamContrib
  const personContrib = new Map<string, { rate: number }>();
  for (const r of teamContrib) {
    personContrib.set(r.영업담당사번, { rate: r.공헌이익율?.실적 || 0 });
  }

  // Collect all person IDs
  const allPersons = new Set([...Array.from(personSales.keys()), ...Array.from(personOrders.keys()), ...Array.from(personCollections.keys())]);

  // Calculate max values for scoring
  const maxSales = Math.max(...Array.from(personSales.values()).map(v => v.amount), 1);
  const maxOrders = Math.max(...Array.from(personOrders.values()), 1);
  const maxContribRate = Math.max(...Array.from(personContrib.values()).map(v => v.rate), 1);

  const profiles: SalesRepProfile[] = [];

  for (const id of Array.from(allPersons)) {
    const sData = personSales.get(id);
    const salesAmt = sData?.amount || 0;
    const orderAmt = personOrders.get(id) || 0;
    const collectAmt = personCollections.get(id) || 0;
    const contribRate = personContrib.get(id)?.rate || 0;

    const salesScore = (salesAmt / maxSales) * 25;
    const orderScore = (orderAmt / maxOrders) * 25;
    const profitScore = maxContribRate > 0 ? (contribRate / maxContribRate) * 25 : 0;
    const collectionRate = salesAmt > 0 ? collectAmt / salesAmt : 0;
    const collectionScore = Math.min(collectionRate, 1) * 25;
    const totalScore = salesScore + orderScore + profitScore + collectionScore;

    profiles.push({
      id,
      name: sData?.name || id,
      org: sData?.org || "",
      score: { salesScore, orderScore, profitScore, collectionScore, totalScore, rank: 0, percentile: 0 },
      salesAmount: salesAmt,
      orderAmount: orderAmt,
      collectionAmount: collectAmt,
      contributionMarginRate: contribRate,
      customerCount: sData?.customers.size || 0,
      itemCount: sData?.items.size || 0,
    });
  }

  // Rank
  profiles.sort((a, b) => b.score.totalScore - a.score.totalScore);
  profiles.forEach((p, i) => {
    p.score.rank = i + 1;
    p.score.percentile = ((profiles.length - i) / profiles.length) * 100;
  });

  return profiles;
}

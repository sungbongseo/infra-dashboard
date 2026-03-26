import { CollectionRecord } from "@/types/sales";
import { extractMonth, safeDivide } from "@/lib/utils";

// 선수금 총괄
export interface PrepaymentSummary {
  totalPrepayment: number;
  totalBookPrepayment: number;
  prepaymentToSalesRatio: number;
  orgCount: number;
}

export function calcPrepaymentSummary(
  collections: CollectionRecord[],
  totalSales: number
): PrepaymentSummary {
  let totalPrepayment = 0;
  let totalBookPrepayment = 0;
  const orgs = new Set<string>();

  for (const row of collections) {
    totalPrepayment += row.선수금액 || 0;
    totalBookPrepayment += row.장부선수금액 || 0;
    const org = (row.영업조직 || "").trim();
    if (org) {
      orgs.add(org);
    }
  }

  return {
    totalPrepayment,
    totalBookPrepayment,
    prepaymentToSalesRatio:
      safeDivide(totalPrepayment, totalSales) * 100,
    orgCount: orgs.size,
  };
}

// 조직별 선수금 현황
export interface OrgPrepayment {
  org: string;
  prepayment: number;
  bookPrepayment: number;
  collectionCount: number;
}

export function calcOrgPrepayments(
  collections: CollectionRecord[]
): OrgPrepayment[] {
  const map = new Map<
    string,
    { prepayment: number; bookPrepayment: number; count: number }
  >();

  for (const row of collections) {
    const org = (row.영업조직 || "미분류").trim() || "미분류";
    const prepayment = row.선수금액 || 0;
    const bookPrepayment = row.장부선수금액 || 0;

    const existing = map.get(org);
    if (existing) {
      existing.prepayment += prepayment;
      existing.bookPrepayment += bookPrepayment;
      existing.count += 1;
    } else {
      map.set(org, {
        prepayment,
        bookPrepayment,
        count: 1,
      });
    }
  }

  const results: OrgPrepayment[] = Array.from(map.entries()).map(
    ([org, data]) => ({
      org,
      prepayment: data.prepayment,
      bookPrepayment: data.bookPrepayment,
      collectionCount: data.count,
    })
  );

  results.sort((a, b) => b.prepayment - a.prepayment);
  return results;
}

// 월별 선수금 추이
export interface MonthlyPrepayment {
  month: string;
  prepayment: number;
  bookPrepayment: number;
}

export function calcMonthlyPrepayments(
  collections: CollectionRecord[]
): MonthlyPrepayment[] {
  const map = new Map<string, { prepayment: number; bookPrepayment: number }>();

  for (const row of collections) {
    const month = extractMonth(row.수금일 || "");
    if (!month) continue;
    const prepayment = row.선수금액 || 0;
    const bookPrepayment = row.장부선수금액 || 0;

    const existing = map.get(month);
    if (existing) {
      existing.prepayment += prepayment;
      existing.bookPrepayment += bookPrepayment;
    } else {
      map.set(month, { prepayment, bookPrepayment });
    }
  }

  // Sort by month ascending for trend display
  const months = Array.from(map.keys()).sort();
  const results: MonthlyPrepayment[] = months.map((month) => {
    const data = map.get(month)!;
    return {
      month,
      prepayment: data.prepayment,
      bookPrepayment: data.bookPrepayment,
    };
  });

  return results;
}

// 선수금 상위 거래처
export interface PrepaymentCustomer {
  customer: string;
  org: string;
  amount: number;
  share: number;
}

export function calcPrepaymentCustomers(
  collections: CollectionRecord[]
): PrepaymentCustomer[] {
  const map = new Map<string, { org: string; amount: number }>();
  let total = 0;

  for (const row of collections) {
    const amt = row.선수금액 || 0;
    if (amt <= 0) continue;
    total += amt;
    const customer = (row.거래처명 || "").trim() || "미분류";
    const org = (row.영업조직 || "").trim() || "미분류";
    const entry = map.get(customer);
    if (entry) {
      entry.amount += amt;
    } else {
      map.set(customer, { org, amount: amt });
    }
  }

  return Array.from(map.entries())
    .map(([customer, data]) => ({
      customer,
      org: data.org,
      amount: data.amount,
      share: total > 0 ? safeDivide(data.amount, total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

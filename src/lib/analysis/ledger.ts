import type { CustomerLedgerRecord } from "@/types";

export interface AccountSummary {
  accountCode: string;
  accountName: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  transactionCount: number;
}

export interface ProjectSummary {
  projectName: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  customerCount: number;
}

export interface CustomerBalance {
  customer: string;
  customerName: string;
  debit: number;
  credit: number;
  balance: number;
  lastDate: string;
}

/**
 * 계정코드/계정명별 차변/대변 집계
 * 계정코드+계정명을 키로 그룹핑
 */
export function calcAccountSummary(data: CustomerLedgerRecord[]): AccountSummary[] {
  const map = new Map<string, AccountSummary>();

  for (const r of data) {
    const key = `${r.계정코드}::${r.계정명}`;
    const entry = map.get(key);
    if (entry) {
      entry.totalDebit += r.차변;
      entry.totalCredit += r.대변;
      entry.balance += r.차변 - r.대변;
      entry.transactionCount += 1;
    } else {
      map.set(key, {
        accountCode: r.계정코드,
        accountName: r.계정명,
        totalDebit: r.차변,
        totalCredit: r.대변,
        balance: r.차변 - r.대변,
        transactionCount: 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

/**
 * 프로젝트명별 차변/대변 집계 및 고유 거래처 수
 */
export function calcProjectSummary(data: CustomerLedgerRecord[]): ProjectSummary[] {
  const map = new Map<string, { totalDebit: number; totalCredit: number; customers: Set<string> }>();

  for (const r of data) {
    const project = r.프로젝트명 || "(미지정)";
    const entry = map.get(project);
    if (entry) {
      entry.totalDebit += r.차변;
      entry.totalCredit += r.대변;
      entry.customers.add(r.거래처);
    } else {
      map.set(project, {
        totalDebit: r.차변,
        totalCredit: r.대변,
        customers: new Set([r.거래처]),
      });
    }
  }

  return Array.from(map.entries())
    .map(([projectName, data]) => ({
      projectName,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
      balance: data.totalDebit - data.totalCredit,
      customerCount: data.customers.size,
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

/**
 * 거래처별 잔액 집계 및 최근 회계일
 */
export function calcCustomerBalances(data: CustomerLedgerRecord[]): CustomerBalance[] {
  const map = new Map<string, { customerName: string; debit: number; credit: number; lastDate: string }>();

  for (const r of data) {
    const key = r.거래처;
    const entry = map.get(key);
    if (entry) {
      entry.debit += r.차변;
      entry.credit += r.대변;
      // 최근 회계일 갱신 (문자열 비교)
      if (r.회계일 && r.회계일 > entry.lastDate) {
        entry.lastDate = r.회계일;
      }
    } else {
      map.set(key, {
        customerName: r.거래처명,
        debit: r.차변,
        credit: r.대변,
        lastDate: r.회계일 || "",
      });
    }
  }

  return Array.from(map.entries())
    .map(([customer, data]) => ({
      customer,
      customerName: data.customerName,
      debit: data.debit,
      credit: data.credit,
      balance: data.debit - data.credit,
      lastDate: data.lastDate,
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

/**
 * 판관비 세부 드릴다운 분석 (SGA Breakdown Analysis)
 *
 * 303 조직별 거래처별 손익의 판관비 세부 13개 항목을 분석합니다.
 * - 항목별 비중 분석
 * - 조직별 판관비 구조 비교
 * - 거래처별 판관비 부담 분석
 */
import type { OrgCustomerProfitRecord, PlanActualDiff } from "@/types";

// ── Types ──────────────────────────────────────────────────

export interface SgaItemEntry {
  item: string;
  category: "변동" | "고정";
  plan: number;
  actual: number;
  variance: number;
  varianceRate: number; // (실적-계획)/|계획| * 100
  share: number; // 전체 판관비 중 비중
}

export interface OrgSgaProfile {
  org: string;
  totalSga: number;
  sales: number;
  sgaRate: number; // 판관비/매출 비율
  variableSga: number;
  fixedSga: number;
  variableRatio: number; // 변동비 비중
  topItem: string; // 최대 항목명
  topItemAmount: number;
}

export interface CustomerSgaBurden {
  customer: string;
  org: string;
  sales: number;
  sga: number;
  sgaRate: number;
  operatingProfit: number;
  opMargin: number;
  topSgaItem: string;
  topSgaAmount: number;
}

// ── SGA Cost Item Keys ──────────────────────────────────────

const SGA_ITEMS: { key: keyof OrgCustomerProfitRecord; label: string; category: "변동" | "고정" }[] = [
  { key: "판관변동_노무비", label: "노무비(변동)", category: "변동" },
  { key: "판관변동_복리후생비", label: "복리후생비(변동)", category: "변동" },
  { key: "판관변동_소모품비", label: "소모품비(변동)", category: "변동" },
  { key: "판관변동_수도광열비", label: "수도광열비(변동)", category: "변동" },
  { key: "판관변동_수선비", label: "수선비(변동)", category: "변동" },
  { key: "판관변동_외주가공비", label: "외주가공비(변동)", category: "변동" },
  { key: "판관변동_운반비", label: "운반비(변동)", category: "변동" },
  { key: "판관변동_직접판매운반비", label: "직접판매운반비(변동)", category: "변동" },
  { key: "판관변동_지급수수료", label: "지급수수료(변동)", category: "변동" },
  { key: "판관변동_견본비", label: "견본비(변동)", category: "변동" },
  { key: "판관고정_노무비", label: "노무비(고정)", category: "고정" },
  { key: "판관고정_감가상각비", label: "감가상각비(고정)", category: "고정" },
  { key: "판관고정_기타경비", label: "기타경비(고정)", category: "고정" },
];

function getPad(r: OrgCustomerProfitRecord, key: keyof OrgCustomerProfitRecord): PlanActualDiff {
  const v = r[key];
  if (v && typeof v === "object" && "실적" in v) return v as PlanActualDiff;
  return { 계획: 0, 실적: 0, 차이: 0 };
}

function hasSgaData(data: OrgCustomerProfitRecord[]): boolean {
  return data.some((r) =>
    SGA_ITEMS.some((item) => {
      const v = getPad(r, item.key);
      return v.실적 !== 0 || v.계획 !== 0;
    })
  );
}

// ── 1. 판관비 항목별 분석 ──────────────────────────────

export function calcSgaBreakdown(data: OrgCustomerProfitRecord[]): SgaItemEntry[] {
  if (!hasSgaData(data)) return [];

  const totals = SGA_ITEMS.map((item) => {
    let plan = 0;
    let actual = 0;
    for (const r of data) {
      const pad = getPad(r, item.key);
      plan += pad.계획;
      actual += pad.실적;
    }
    return { ...item, plan, actual };
  });

  const totalActual = totals.reduce((s, t) => s + Math.abs(t.actual), 0);

  return totals
    .map((t) => ({
      item: t.label,
      category: t.category,
      plan: t.plan,
      actual: t.actual,
      variance: t.actual - t.plan,
      varianceRate: t.plan !== 0 ? ((t.actual - t.plan) / Math.abs(t.plan)) * 100 : 0,
      share: totalActual > 0 ? (Math.abs(t.actual) / totalActual) * 100 : 0,
    }))
    .filter((t) => t.actual !== 0 || t.plan !== 0)
    .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));
}

// ── 2. 조직별 판관비 구조 ──────────────────────────────

export function calcOrgSgaProfile(data: OrgCustomerProfitRecord[]): OrgSgaProfile[] {
  if (!hasSgaData(data)) return [];

  const map = new Map<string, {
    sales: number;
    totalSga: number;
    variableSga: number;
    fixedSga: number;
    itemAmounts: Map<string, number>;
  }>();

  for (const r of data) {
    const org = r.영업조직팀 || "미분류";
    const entry = map.get(org) || {
      sales: 0,
      totalSga: 0,
      variableSga: 0,
      fixedSga: 0,
      itemAmounts: new Map(),
    };
    entry.sales += r.매출액.실적;

    for (const item of SGA_ITEMS) {
      const val = getPad(r, item.key).실적;
      entry.totalSga += val;
      if (item.category === "변동") entry.variableSga += val;
      else entry.fixedSga += val;
      entry.itemAmounts.set(item.label, (entry.itemAmounts.get(item.label) || 0) + val);
    }
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, e]) => {
      let topItem = "";
      let topAmount = 0;
      for (const [item, amt] of Array.from(e.itemAmounts.entries())) {
        if (Math.abs(amt) > Math.abs(topAmount)) {
          topItem = item;
          topAmount = amt;
        }
      }
      return {
        org,
        totalSga: e.totalSga,
        sales: e.sales,
        sgaRate: e.sales !== 0 ? (e.totalSga / e.sales) * 100 : 0,
        variableSga: e.variableSga,
        fixedSga: e.fixedSga,
        variableRatio: e.totalSga !== 0 ? (e.variableSga / e.totalSga) * 100 : 0,
        topItem,
        topItemAmount: topAmount,
      };
    })
    .sort((a, b) => Math.abs(b.totalSga) - Math.abs(a.totalSga));
}

// ── 3. 거래처별 판관비 부담 Top 20 ──────────────────────

export function calcCustomerSgaBurden(data: OrgCustomerProfitRecord[]): CustomerSgaBurden[] {
  if (!hasSgaData(data)) return [];

  const map = new Map<string, {
    org: string;
    sales: number;
    sga: number;
    operatingProfit: number;
    itemAmounts: Map<string, number>;
  }>();

  for (const r of data) {
    const customer = r.매출거래처명 || r.매출거래처;
    if (!customer) continue;
    const entry = map.get(customer) || {
      org: r.영업조직팀 || "",
      sales: 0,
      sga: 0,
      operatingProfit: 0,
      itemAmounts: new Map(),
    };
    entry.sales += r.매출액.실적;
    entry.operatingProfit += r.영업이익.실적;

    for (const item of SGA_ITEMS) {
      const val = getPad(r, item.key).실적;
      entry.sga += val;
      entry.itemAmounts.set(item.label, (entry.itemAmounts.get(item.label) || 0) + val);
    }
    map.set(customer, entry);
  }

  return Array.from(map.entries())
    .map(([customer, e]) => {
      let topItem = "";
      let topAmount = 0;
      for (const [item, amt] of Array.from(e.itemAmounts.entries())) {
        if (Math.abs(amt) > Math.abs(topAmount)) {
          topItem = item;
          topAmount = amt;
        }
      }
      return {
        customer,
        org: e.org,
        sales: e.sales,
        sga: e.sga,
        sgaRate: e.sales !== 0 ? (e.sga / e.sales) * 100 : 0,
        operatingProfit: e.operatingProfit,
        opMargin: e.sales !== 0 ? (e.operatingProfit / e.sales) * 100 : 0,
        topSgaItem: topItem,
        topSgaAmount: topAmount,
      };
    })
    .sort((a, b) => Math.abs(b.sga) - Math.abs(a.sga))
    .slice(0, 20);
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { OrgProfitRecord, PlanActualDiff, CustomerItemDetailRecord, OrgCustomerProfitRecord } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, compact = false): string {
  if (!isFinite(value)) return "-";
  if (compact) {
    if (Math.abs(value) >= 1e8) {
      return `${(value / 1e8).toFixed(1)}억`;
    }
    if (Math.abs(value) >= 1e4) {
      return `${(value / 1e4).toFixed(0)}만`;
    }
  }
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

export function formatPercent(value: number, decimals = 1): string {
  if (!isFinite(value)) return "-";
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function calcChangeRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function getChangeColor(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export function getChangeArrow(value: number): string {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "—";
}

export const CHART_COLORS = [
  "hsl(221.2, 83.2%, 53.3%)",
  "hsl(142.1, 76.2%, 36.3%)",
  "hsl(262.1, 83.3%, 57.8%)",
  "hsl(24.6, 95%, 53.1%)",
  "hsl(346.8, 77.2%, 49.8%)",
  "hsl(188.7, 94.5%, 42.7%)",
  "hsl(43.3, 96.4%, 56.3%)",
];

export const RISK_COLORS = {
  low: "hsl(142.1, 76.2%, 36.3%)",
  medium: "hsl(38, 92%, 50%)",
  high: "hsl(0, 84.2%, 60.2%)",
};

/** Recharts 공통 tooltip 스타일 */
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    backgroundColor: "hsl(var(--card))",
    color: "hsl(var(--card-foreground))",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    fontSize: 12,
  },
  labelStyle: { fontWeight: 600 },
};

// Date utilities
export function extractMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = String(dateStr).trim();
  if (d.includes("-")) return d.substring(0, 7);
  if (d.includes("/")) {
    const parts = d.split("/");
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}`;
    }
    return "";
  }
  if (d.length === 8 && /^\d{8}$/.test(d)) return `${d.substring(0, 4)}-${d.substring(4, 6)}`;
  // YYYYMM 6-digit format
  if (d.length === 6 && /^\d{6}$/.test(d)) return `${d.substring(0, 4)}-${d.substring(4, 6)}`;
  // Excel serial number
  const serial = Number(d);
  if (!isNaN(serial) && serial > 40000 && serial < 100000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  return "";
}

// Org filter helpers
export function filterByOrg<T extends Record<string, any>>(
  data: T[],
  orgNames: Set<string>,
  field: string = "영업조직"
): T[] {
  if (orgNames.size === 0) return data;
  return data.filter(row => orgNames.has(String(row[field] || "").trim()));
}

/** orgProfit 계층 소계 행 제거 - 영업조직팀이 판매사업본부/판매사업부와 동일한 소계 행 제외 */
export function filterOrgProfitLeafOnly<T extends Record<string, any>>(data: T[]): T[] {
  return data.filter(r => {
    const team = String(r.영업조직팀 || "").trim();
    const hq = String(r.판매사업본부 || "").trim();
    const div = String(r.판매사업부 || "").trim();
    if (!team) return false;
    if (hq && team === hq) return false;   // 사업본부 소계 제외
    if (div && team === div) return false;  // 사업부 소계 제외
    return true;
  });
}

// Date range filter helper
// dateRange: { from: "YYYY-MM", to: "YYYY-MM" }
// dateField: the field name in the record that contains the date (e.g. "매출일", "수금일", "수주일")
export function filterByDateRange<T extends Record<string, any>>(
  data: T[],
  dateRange: { from: string; to: string } | null,
  dateField: string
): T[] {
  if (!dateRange || !dateRange.from || !dateRange.to) return data;
  const from = dateRange.from; // "YYYY-MM"
  const to = dateRange.to;     // "YYYY-MM"
  return data.filter(row => {
    const month = extractMonth(String(row[dateField] || ""));
    if (!month) return false;
    return month >= from && month <= to;
  });
}

// ─── OrgProfit 동일 조직 합산 ──────────────────────────────────────

/** PlanActualDiff 두 값 합산 */
function addPAD(a: PlanActualDiff, b: PlanActualDiff): PlanActualDiff {
  return {
    계획: a.계획 + b.계획,
    실적: a.실적 + b.실적,
    차이: a.차이 + b.차이,
  };
}

/** 비율 PlanActualDiff 재계산 (분자/분모 기반) */
function calcRatioPAD(numerator: PlanActualDiff, denominator: PlanActualDiff): PlanActualDiff {
  const 계획 = denominator.계획 !== 0 ? (numerator.계획 / denominator.계획) * 100 : 0;
  const 실적 = denominator.실적 !== 0 ? (numerator.실적 / denominator.실적) * 100 : 0;
  return { 계획, 실적, 차이: 실적 - 계획 };
}

/**
 * 동일 영업조직팀 이름의 OrgProfitRecord를 합산합니다.
 * SAP 대체/반제 전표로 인해 같은 조직이 여러 행으로 분리되는 문제를 해결합니다.
 * - 금액 필드(매출액, 매출원가, 매출총이익 등): 단순 합산
 * - 비율 필드(매출원가율, 매출총이익율 등): 합산된 금액 기반 재계산
 */
export function aggregateOrgProfit(data: OrgProfitRecord[]): OrgProfitRecord[] {
  if (data.length === 0) return data;

  const map = new Map<string, OrgProfitRecord>();

  for (const row of data) {
    const key = row.영업조직팀;
    const existing = map.get(key);

    if (!existing) {
      // 첫 번째 행: 깊은 복사하여 저장
      map.set(key, {
        No: row.No,
        판매사업본부: row.판매사업본부,
        판매사업부: row.판매사업부,
        영업조직팀: row.영업조직팀,
        매출액: { ...row.매출액 },
        실적매출원가: { ...row.실적매출원가 },
        매출총이익: { ...row.매출총이익 },
        판관변동_직접판매운반비: { ...row.판관변동_직접판매운반비 },
        판관변동_운반비: { ...row.판관변동_운반비 },
        판매관리비: { ...row.판매관리비 },
        영업이익: { ...row.영업이익 },
        공헌이익: { ...row.공헌이익 },
        // 비율은 나중에 재계산하므로 임시값
        매출원가율: { ...row.매출원가율 },
        매출총이익율: { ...row.매출총이익율 },
        판관비율: { ...row.판관비율 },
        영업이익율: { ...row.영업이익율 },
        공헌이익율: { ...row.공헌이익율 },
      });
    } else {
      // 같은 영업조직팀 행 합산
      existing.매출액 = addPAD(existing.매출액, row.매출액);
      existing.실적매출원가 = addPAD(existing.실적매출원가, row.실적매출원가);
      existing.매출총이익 = addPAD(existing.매출총이익, row.매출총이익);
      existing.판관변동_직접판매운반비 = addPAD(existing.판관변동_직접판매운반비, row.판관변동_직접판매운반비);
      existing.판관변동_운반비 = addPAD(existing.판관변동_운반비, row.판관변동_운반비);
      existing.판매관리비 = addPAD(existing.판매관리비, row.판매관리비);
      existing.영업이익 = addPAD(existing.영업이익, row.영업이익);
      existing.공헌이익 = addPAD(existing.공헌이익, row.공헌이익);
    }
  }

  // 비율 필드 재계산
  const results = Array.from(map.values());
  for (const r of results) {
    r.매출원가율 = calcRatioPAD(r.실적매출원가, r.매출액);
    r.매출총이익율 = calcRatioPAD(r.매출총이익, r.매출액);
    r.판관비율 = calcRatioPAD(r.판매관리비, r.매출액);
    r.영업이익율 = calcRatioPAD(r.영업이익, r.매출액);
    r.공헌이익율 = calcRatioPAD(r.공헌이익, r.매출액);
  }

  return results;
}

// ─── CustomerItemDetail → OrgCustomerProfit 거래처 단위 집계 ────────

const zeroPAD = (): PlanActualDiff => ({ 계획: 0, 실적: 0, 차이: 0 });

/**
 * CustomerItemDetailRecord[]를 거래처 단위로 집계하여
 * OrgCustomerProfitRecord[] 호환 형태로 변환합니다.
 * 기간 필터된 customerItemDetail 데이터를 거래처 손익 탭에 사용할 수 있습니다.
 */
export function aggregateToCustomerLevel(
  data: CustomerItemDetailRecord[],
): OrgCustomerProfitRecord[] {
  if (data.length === 0) return [];

  const map = new Map<string, OrgCustomerProfitRecord>();

  for (const row of data) {
    const key = `${row.영업조직팀}||${row.매출거래처}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        No: map.size + 1,
        영업조직팀: row.영업조직팀,
        거래처대분류: row.거래처대분류,
        거래처중분류: row.거래처중분류,
        거래처소분류: row.거래처소분류,
        매출거래처: row.매출거래처,
        매출거래처명: row.매출거래처명,
        매출액: { ...row.매출액 },
        실적매출원가: { ...row.실적매출원가 },
        매출총이익: { ...row.매출총이익 },
        판매관리비: { ...row.판매관리비 },
        영업이익: { ...row.영업이익 },
        매출총이익율: zeroPAD(),
        영업이익율: zeroPAD(),
      });
    } else {
      existing.매출액 = addPAD(existing.매출액, row.매출액);
      existing.실적매출원가 = addPAD(existing.실적매출원가, row.실적매출원가);
      existing.매출총이익 = addPAD(existing.매출총이익, row.매출총이익);
      existing.판매관리비 = addPAD(existing.판매관리비, row.판매관리비);
      existing.영업이익 = addPAD(existing.영업이익, row.영업이익);
    }
  }

  const results = Array.from(map.values());
  for (const r of results) {
    r.매출총이익율 = calcRatioPAD(r.매출총이익, r.매출액);
    r.영업이익율 = calcRatioPAD(r.영업이익, r.매출액);
  }

  return results;
}

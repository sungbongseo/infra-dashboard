import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { OrgProfitRecord, PlanActualDiff, CustomerItemDetailRecord, OrgCustomerProfitRecord, TeamContributionRecord, ProfitabilityAnalysisRecord, HqCustomerItemProfitRecord } from "@/types";
import type { ItemProfitabilityRecord, ItemCostDetailRecord } from "@/types/itemCost";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFixed(value: number, decimals = 1, fallback = "-"): string {
  return isFinite(value) ? value.toFixed(decimals) : fallback;
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
  if (!isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || !isFinite(numerator) || !isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return isFinite(result) ? result : fallback;
}

export function calcChangeRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
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

/** DSO/CCC 등급별 색상 — DsoTab, CccTab 등에서 공용 */
export const DSO_COLORS: Record<string, string> = {
  excellent: "hsl(142, 76%, 36%)",
  good: "hsl(188, 94%, 42%)",
  fair: "hsl(38, 92%, 50%)",
  poor: "hsl(0, 84%, 60%)",
};

/** HHI 해석 등급: <1500 비집중, 1500~2500 중간, >2500 고집중 */
export function interpretHHI(hhi: number): { label: string; color: string; description: string } {
  if (hhi < 1500) return { label: "비집중", color: DSO_COLORS.excellent, description: "거래처 분산이 양호하여 특정 거래처 의존 리스크가 낮습니다." };
  if (hhi <= 2500) return { label: "중간 집중", color: DSO_COLORS.fair, description: "일부 거래처에 매출이 집중되어 있습니다. 거래처 다변화를 검토하세요." };
  return { label: "고집중", color: DSO_COLORS.poor, description: "소수 거래처에 매출이 과도하게 집중되어 있습니다. 거래처 이탈 시 매출 급감 리스크가 높습니다." };
}

/** Recharts 공통 tooltip 스타일 */
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    backgroundColor: "hsl(var(--card))",
    color: "hsl(var(--card-foreground))",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    fontSize: 12,
    zIndex: 50,
  },
  labelStyle: { fontWeight: 600 },
  cursor: { fill: "hsl(var(--muted))", fillOpacity: 0.3 },
};

// Date utilities
export function extractMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = String(dateStr).trim();
  if (d.includes("-")) return d.substring(0, 7);
  if (d.includes(".")) {
    const parts = d.split(".");
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}`;
    }
  }
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
  if (!isNaN(serial) && serial > 30000 && serial < 100000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

/**
 * orgProfit 계층 소계 행 제거.
 * - 영업조직팀이 판매사업본부/판매사업부와 동일한 소계 행 제외
 * - "합계"/"소계" 문자열을 포함하는 행 명시적 제외
 * - 영업조직팀이 빈 문자열인 행 제외
 */
export function filterOrgProfitLeafOnly<T extends Record<string, any>>(data: T[]): T[] {
  return data.filter(r => {
    const team = String(r.영업조직팀 || "").trim();
    const hq = String(r.판매사업본부 || "").trim();
    const div = String(r.판매사업부 || "").trim();
    if (!team) return false;
    if (team.includes("합계") || team.includes("소계")) return false; // 명시적 합계/소계 행 제외
    if (hq && team === hq) return false;   // 사업본부 소계 제외
    if (div && team === div) return false;  // 사업부 소계 제외
    return true;
  });
}

/**
 * 날짜 범위 필터. dateRange가 null이면 전체 반환.
 * dateField 값을 extractMonth()로 파싱하여 YYYY-MM 비교.
 * 주의: extractMonth()로 파싱할 수 없는 행은 결과에서 제외됨.
 * @param dateRange { from: "YYYY-MM", to: "YYYY-MM" } 또는 null
 * @param dateField 날짜가 담긴 필드명 (e.g. "매출일", "수금일", "수주일", "매출연월")
 */
export function filterByDateRange<T extends Record<string, any>>(
  data: T[],
  dateRange: { from: string; to: string } | null,
  dateField: string
): T[] {
  if (!dateRange || !dateRange.from || !dateRange.to) return data;
  const from = dateRange.from; // "YYYY-MM"
  const to = dateRange.to;     // "YYYY-MM"
  let parseFailCount = 0;
  const result = data.filter(row => {
    const month = extractMonth(String(row[dateField] || ""));
    if (!month) { parseFailCount++; return false; }
    return month >= from && month <= to;
  });
  if (parseFailCount > 0) {
    console.warn(`[filterByDateRange] 날짜 파싱 실패로 ${parseFailCount}건 제외 (필드: ${dateField})`);
  }
  return result;
}

// ─── 월별 필터 ─────────────────────────────────────────────────────

/**
 * month 필드 기반 날짜 필터. dateRange가 null이면 전체 반환.
 * P&L 타입(orgProfit, teamContribution 등)은 날짜 컬럼이 없고
 * 월별 시트 파싱 시 주입된 month(YYYYMM) 필드로 필터링.
 * month 필드가 없는 행(하위호환)은 통과시킴.
 */
export function filterByMonth<T extends Record<string, any>>(
  data: T[],
  dateRange: { from: string; to: string } | null,
): T[] {
  if (!dateRange || !dateRange.from || !dateRange.to) return data;
  const from = dateRange.from.replace("-", ""); // "2025-01" → "202501"
  const to = dateRange.to.replace("-", "");
  return data.filter(row => {
    const m = row.month;
    if (!m) return true; // 하위호환: month 없으면 통과
    return m >= from && m <= to;
  });
}

// ─── OrgProfit 동일 조직 합산 ──────────────────────────────────────

/** PlanActualDiff 두 값 합산 */
export function addPAD(a: PlanActualDiff, b: PlanActualDiff): PlanActualDiff {
  return {
    계획: a.계획 + b.계획,
    실적: a.실적 + b.실적,
    차이: a.차이 + b.차이,
  };
}

/** 비율 PlanActualDiff 재계산 (분자/분모 기반) */
export function calcRatioPAD(numerator: PlanActualDiff, denominator: PlanActualDiff): PlanActualDiff {
  const raw계획 = denominator.계획 !== 0 ? (numerator.계획 / denominator.계획) * 100 : 0;
  const raw실적 = denominator.실적 !== 0 ? (numerator.실적 / denominator.실적) * 100 : 0;
  const 계획 = isFinite(raw계획) ? raw계획 : 0;
  const 실적 = isFinite(raw실적) ? raw실적 : 0;
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
    // 빈 조직명 스킵 (병합 셀 fill-down 실패 시 발생 가능)
    const key = row.영업조직팀?.trim();
    if (!key) continue;

    const existing = map.get(key);

    if (!existing) {
      // 첫 번째 행: 깊은 복사하여 저장
      map.set(key, {
        No: row.No,
        판매사업본부: row.판매사업본부,
        판매사업부: row.판매사업부,
        영업조직팀: row.영업조직팀,
        ...(row.month ? { month: row.month } : {}),
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
    // 빈 조직명 또는 빈 거래처 스킵 (병합 셀 fill-down 실패 시 발생 가능)
    const org = row.영업조직팀?.trim();
    const customer = row.매출거래처?.trim();
    if (!org || !customer) continue;

    const key = `${org}||${customer}`;
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
        판관변동_직접판매운반비: { ...row.판관변동_직접판매운반비 },
      });
    } else {
      existing.매출액 = addPAD(existing.매출액, row.매출액);
      existing.실적매출원가 = addPAD(existing.실적매출원가, row.실적매출원가);
      existing.매출총이익 = addPAD(existing.매출총이익, row.매출총이익);
      existing.판매관리비 = addPAD(existing.판매관리비, row.판매관리비);
      existing.영업이익 = addPAD(existing.영업이익, row.영업이익);
      existing.판관변동_직접판매운반비 = addPAD(existing.판관변동_직접판매운반비!, row.판관변동_직접판매운반비);
    }
  }

  const results = Array.from(map.values());
  for (const r of results) {
    r.매출총이익율 = calcRatioPAD(r.매출총이익, r.매출액);
    r.영업이익율 = calcRatioPAD(r.영업이익, r.매출액);
  }

  return results;
}

const TC_PAD_ZERO: PlanActualDiff = { 계획: 0, 실적: 0, 차이: 0 };

/** 동일 (사번, 조직) 키의 TeamContributionRecord를 합산. 월별 시트 concat 중복 해소. */
export function aggregateTeamContribution(data: TeamContributionRecord[]): TeamContributionRecord[] {
  const map = new Map<string, TeamContributionRecord>();

  for (const r of data) {
    const key = `${r.영업담당사번}||${r.영업조직팀}`;
    const e = map.get(key);
    if (!e) {
      // 첫 행: 복사 (month 필드 제거하여 합산 결과임을 표시)
      map.set(key, { ...r, month: undefined });
      continue;
    }
    // 금액 필드 합산 (비율 필드는 나중에 재계산)
    e.매출액 = addPAD(e.매출액, r.매출액);
    e.실적매출원가 = addPAD(e.실적매출원가, r.실적매출원가);
    e.매출총이익 = addPAD(e.매출총이익, r.매출총이익);
    e.판관변동_직접판매운반비 = addPAD(e.판관변동_직접판매운반비, r.판관변동_직접판매운반비);
    e.판매관리비 = addPAD(e.판매관리비, r.판매관리비);
    e.영업이익 = addPAD(e.영업이익, r.영업이익);
    // 판관변동 9개
    e.판관변동_노무비 = addPAD(e.판관변동_노무비, r.판관변동_노무비);
    e.판관변동_복리후생비 = addPAD(e.판관변동_복리후생비, r.판관변동_복리후생비);
    e.판관변동_소모품비 = addPAD(e.판관변동_소모품비, r.판관변동_소모품비);
    e.판관변동_수도광열비 = addPAD(e.판관변동_수도광열비, r.판관변동_수도광열비);
    e.판관변동_수선비 = addPAD(e.판관변동_수선비, r.판관변동_수선비);
    e.판관변동_외주가공비 = addPAD(e.판관변동_외주가공비, r.판관변동_외주가공비);
    e.판관변동_운반비 = addPAD(e.판관변동_운반비, r.판관변동_운반비);
    e.판관변동_지급수수료 = addPAD(e.판관변동_지급수수료, r.판관변동_지급수수료);
    e.판관변동_견본비 = addPAD(e.판관변동_견본비, r.판관변동_견본비);
    // 판관고정 3개
    e.판관고정_노무비 = addPAD(e.판관고정_노무비, r.판관고정_노무비);
    e.판관고정_감가상각비 = addPAD(e.판관고정_감가상각비, r.판관고정_감가상각비);
    e.판관고정_기타경비 = addPAD(e.판관고정_기타경비, r.판관고정_기타경비);
    // 제조변동 14개
    e.제조변동_원재료비 = addPAD(e.제조변동_원재료비, r.제조변동_원재료비);
    e.제조변동_부재료비 = addPAD(e.제조변동_부재료비, r.제조변동_부재료비);
    e.변동_상품매입 = addPAD(e.변동_상품매입, r.변동_상품매입);
    e.제조변동_노무비 = addPAD(e.제조변동_노무비, r.제조변동_노무비);
    e.제조변동_복리후생비 = addPAD(e.제조변동_복리후생비, r.제조변동_복리후생비);
    e.제조변동_소모품비 = addPAD(e.제조변동_소모품비, r.제조변동_소모품비);
    e.제조변동_수도광열비 = addPAD(e.제조변동_수도광열비, r.제조변동_수도광열비);
    e.제조변동_수선비 = addPAD(e.제조변동_수선비, r.제조변동_수선비);
    e.제조변동_연료비 = addPAD(e.제조변동_연료비, r.제조변동_연료비);
    e.제조변동_외주가공비 = addPAD(e.제조변동_외주가공비, r.제조변동_외주가공비);
    e.제조변동_운반비 = addPAD(e.제조변동_운반비, r.제조변동_운반비);
    e.제조변동_전력비 = addPAD(e.제조변동_전력비, r.제조변동_전력비);
    e.제조변동_견본비 = addPAD(e.제조변동_견본비, r.제조변동_견본비);
    e.제조변동_지급수수료 = addPAD(e.제조변동_지급수수료, r.제조변동_지급수수료);
    // 합계
    e.변동비합계 = addPAD(e.변동비합계, r.변동비합계);
    e.공헌이익 = addPAD(e.공헌이익, r.공헌이익);
  }

  // 비율 필드 재계산
  const results = Array.from(map.values());
  for (const r of results) {
    r.매출총이익율 = calcRatioPAD(r.매출총이익, r.매출액);
    r.영업이익율 = calcRatioPAD(r.영업이익, r.매출액);
    r.공헌이익율 = calcRatioPAD(r.공헌이익, r.매출액);
  }
  return results;
}

// ─── 월별 시트 Concat 파일 타입별 합산 함수 ───────────────────────────

const PAD_ZERO: PlanActualDiff = { 계획: 0, 실적: 0, 차이: 0 };
function safeAddPAD(a: PlanActualDiff | undefined, b: PlanActualDiff | undefined): PlanActualDiff {
  return addPAD(a ?? PAD_ZERO, b ?? PAD_ZERO);
}

/** 901 수익성분석: 동일 (조직, 사번, 거래처, 품목) 키로 합산 */
export function aggregateProfitabilityAnalysis(data: ProfitabilityAnalysisRecord[]): ProfitabilityAnalysisRecord[] {
  const map = new Map<string, ProfitabilityAnalysisRecord>();
  for (const r of data) {
    const key = `${r.영업조직팀}||${r.영업담당사번}||${r.매출거래처}||${r.품목}`;
    const e = map.get(key);
    if (!e) { map.set(key, { ...r, month: undefined }); continue; }
    e.제품내수매출 = addPAD(e.제품내수매출, r.제품내수매출);
    e.제품수출매출 = addPAD(e.제품수출매출, r.제품수출매출);
    e.매출수량 = addPAD(e.매출수량, r.매출수량);
    e.환산수량 = addPAD(e.환산수량, r.환산수량);
    e.매출액 = addPAD(e.매출액, r.매출액);
    e.실적매출원가 = addPAD(e.실적매출원가, r.실적매출원가);
    e.차이매출원가 = safeAddPAD(e.차이매출원가, r.차이매출원가);
    e.매출총이익 = addPAD(e.매출총이익, r.매출총이익);
    e.판매관리비 = addPAD(e.판매관리비, r.판매관리비);
    e.판관변동_직접판매운반비 = addPAD(e.판관변동_직접판매운반비, r.판관변동_직접판매운반비);
    e.영업이익 = addPAD(e.영업이익, r.영업이익);
  }
  return Array.from(map.values());
}

/** 200 품목별 수익성: 동일 (조직, 품목) 키로 number 필드 합산, 비율 재계산 */
export function aggregateItemProfitability(data: ItemProfitabilityRecord[]): ItemProfitabilityRecord[] {
  const map = new Map<string, ItemProfitabilityRecord>();
  const numFields = [
    "매출수량", "매출액", "표준매출원가", "실적매출원가", "매출총이익", "영업이익",
    "직접판매운반비", "판매관리비",
    "원재료비", "부재료비", "상품매입", "노무비", "복리후생비", "소모품비",
    "수도광열비", "수선비", "연료비", "외주가공비", "운반비", "전력비",
    "지급수수료", "견본비", "제조고정노무비", "감가상각비", "기타경비",
  ] as const;
  const planFields = ["매출수량_계획", "매출액_계획", "실적매출원가_계획", "매출총이익_계획", "영업이익_계획"] as const;

  for (const r of data) {
    const key = `${r.영업조직팀}||${r.품목}`;
    const e = map.get(key);
    if (!e) { map.set(key, { ...r, month: undefined }); continue; }
    for (const f of numFields) (e as any)[f] += (r as any)[f] || 0;
    for (const f of planFields) (e as any)[f] = ((e as any)[f] || 0) + ((r as any)[f] || 0);
  }
  // 비율 재계산
  for (const e of Array.from(map.values())) {
    const sales = e.매출액 || 1;
    e.매출단가 = e.매출수량 > 0 ? e.매출액 / e.매출수량 : 0;
    e.매출원가율 = Math.abs(sales) > 0 ? (e.실적매출원가 / Math.abs(sales)) * 100 : 0;
    e.매출총이익율 = Math.abs(sales) > 0 ? (e.매출총이익 / Math.abs(sales)) * 100 : 0;
    e.영업이익율 = Math.abs(sales) > 0 ? (e.영업이익 / Math.abs(sales)) * 100 : 0;
  }
  return Array.from(map.values());
}

/** 303 조직별 거래처별 손익: 동일 (조직, 거래처) 키로 합산, 비율 재계산 */
export function aggregateOrgCustomerProfit(data: OrgCustomerProfitRecord[]): OrgCustomerProfitRecord[] {
  const map = new Map<string, OrgCustomerProfitRecord>();
  const sgaFields = [
    "판관변동_노무비", "판관변동_복리후생비", "판관변동_소모품비", "판관변동_수도광열비",
    "판관변동_수선비", "판관변동_외주가공비", "판관변동_운반비", "판관변동_직접판매운반비",
    "판관변동_지급수수료", "판관변동_견본비", "판관고정_노무비", "판관고정_감가상각비", "판관고정_기타경비",
  ] as const;

  for (const r of data) {
    const key = `${r.영업조직팀}||${r.매출거래처}`;
    const e = map.get(key);
    if (!e) { map.set(key, { ...r, month: undefined }); continue; }
    e.매출액 = addPAD(e.매출액, r.매출액);
    e.실적매출원가 = addPAD(e.실적매출원가, r.실적매출원가);
    e.매출총이익 = addPAD(e.매출총이익, r.매출총이익);
    e.판매관리비 = addPAD(e.판매관리비, r.판매관리비);
    e.영업이익 = addPAD(e.영업이익, r.영업이익);
    for (const f of sgaFields) (e as any)[f] = safeAddPAD((e as any)[f], (r as any)[f]);
  }
  for (const e of Array.from(map.values())) {
    e.매출총이익율 = calcRatioPAD(e.매출총이익, e.매출액);
    e.영업이익율 = calcRatioPAD(e.영업이익, e.매출액);
  }
  return Array.from(map.values());
}

/** 304 거래처 품목 손익: 동일 (조직, 거래처, 품목) 키로 합산, 비율 재계산 */
export function aggregateHqCustomerItemProfit(data: HqCustomerItemProfitRecord[]): HqCustomerItemProfitRecord[] {
  const map = new Map<string, HqCustomerItemProfitRecord>();
  for (const r of data) {
    const key = `${r.영업조직팀}||${r.매출거래처}||${r.품목}`;
    const e = map.get(key);
    if (!e) { map.set(key, { ...r, month: undefined }); continue; }
    e.매출수량 = addPAD(e.매출수량, r.매출수량);
    e.매출액 = addPAD(e.매출액, r.매출액);
    e.실적매출원가 = addPAD(e.실적매출원가, r.실적매출원가);
    e.매출총이익 = addPAD(e.매출총이익, r.매출총이익);
    e.판매관리비 = addPAD(e.판매관리비, r.판매관리비);
    e.영업이익 = addPAD(e.영업이익, r.영업이익);
  }
  for (const e of Array.from(map.values())) {
    e.매출총이익율 = calcRatioPAD(e.매출총이익, e.매출액);
    e.영업이익율 = calcRatioPAD(e.영업이익, e.매출액);
  }
  return Array.from(map.values());
}

/** 501 품목별 매출원가 상세: 동일 (조직, 품목) 키로 합산, 비율 재계산 */
export function aggregateItemCostDetail(data: ItemCostDetailRecord[]): ItemCostDetailRecord[] {
  const map = new Map<string, ItemCostDetailRecord>();
  const costFields = [
    "원재료비", "부재료비", "상품매입", "노무비", "복리후생비", "소모품비",
    "수도광열비", "수선비", "연료비", "외주가공비", "운반비", "전력비",
    "지급수수료", "견본비", "제조변동비소계", "제조고정노무비", "감가상각비",
    "기타경비", "제조고정비소계",
  ] as const;

  for (const r of data) {
    const key = `${r.영업조직팀}||${r.품목}`;
    const e = map.get(key);
    if (!e) { map.set(key, { ...r, month: undefined }); continue; }
    e.매출수량 = addPAD(e.매출수량, r.매출수량);
    e.매출액 = addPAD(e.매출액, r.매출액);
    e.실적매출원가 = addPAD(e.실적매출원가, r.실적매출원가);
    e.매출총이익 = addPAD(e.매출총이익, r.매출총이익);
    e.공헌이익 = addPAD(e.공헌이익, r.공헌이익);
    for (const f of costFields) (e as any)[f] = addPAD((e as any)[f], (r as any)[f]);
  }
  for (const e of Array.from(map.values())) {
    e.공헌이익율 = calcRatioPAD(e.공헌이익, e.매출액);
  }
  return Array.from(map.values());
}

/** 100 거래처별 품목별 손익: 동일 (조직, 사번, 거래처, 품목) 키로 합산, 비율 재계산 */
export function aggregateCustomerItemDetail(data: CustomerItemDetailRecord[]): CustomerItemDetailRecord[] {
  const map = new Map<string, CustomerItemDetailRecord>();
  for (const r of data) {
    const key = `${r.영업조직팀}||${r.영업담당사번}||${r.매출거래처}||${r.품목}`;
    const e = map.get(key);
    if (!e) { map.set(key, { ...r, month: undefined }); continue; }
    e.제품내수매출 = addPAD(e.제품내수매출, r.제품내수매출);
    e.제품수출매출 = addPAD(e.제품수출매출, r.제품수출매출);
    e.매출수량 = addPAD(e.매출수량, r.매출수량);
    e.환산수량 = addPAD(e.환산수량, r.환산수량);
    e.매출액 = addPAD(e.매출액, r.매출액);
    e.실적매출원가 = addPAD(e.실적매출원가, r.실적매출원가);
    e.상품매입 = addPAD(e.상품매입, r.상품매입);
    e.매출총이익 = addPAD(e.매출총이익, r.매출총이익);
    e.판매관리비 = addPAD(e.판매관리비, r.판매관리비);
    e.판관변동_직접판매운반비 = addPAD(e.판관변동_직접판매운반비, r.판관변동_직접판매운반비);
    e.영업이익 = addPAD(e.영업이익, r.영업이익);
  }
  // 비율 재계산 (CustomerItemDetailRecord에 매출총이익율, 영업이익율이 있을 경우)
  const results = Array.from(map.values());
  for (const r of results) {
    const rec = r as any;
    if (rec.매출총이익율) rec.매출총이익율 = calcRatioPAD(r.매출총이익, r.매출액);
    if (rec.영업이익율) rec.영업이익율 = calcRatioPAD(r.영업이익, r.매출액);
  }
  return results;
}

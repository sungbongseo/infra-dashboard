import type {
  OrgProfitRecord,
  ReceivableAgingRecord,
  SalesRecord,
} from "@/types";

export interface ProfitRiskData {
  name: string;
  profitMargin: number;
  riskScore: number; // 0-100
  riskGrade: "low" | "medium" | "high";
  sales: number;
  receivables: number;
  quadrant: "star" | "cash_cow" | "problem_child" | "dog";
}

export interface QuadrantSummary {
  name: string;
  koreanName: string;
  count: number;
  totalSales: number;
  recommendation: string;
}

const MARGIN_BENCHMARK = 5; // 영업이익율 기준선 (%)
const RISK_BENCHMARK = 40; // 리스크 점수 기준선

/**
 * 사분면 결정 로직:
 * star: 고수익 + 저리스크 (우하단)
 * cash_cow: 저수익 + 저리스크 (좌하단)
 * problem_child: 고수익 + 고리스크 (우상단)
 * dog: 저수익 + 고리스크 (좌상단)
 */
function classifyQuadrant(
  profitMargin: number,
  riskScore: number
): ProfitRiskData["quadrant"] {
  const highProfit = profitMargin >= MARGIN_BENCHMARK;
  const highRisk = riskScore >= RISK_BENCHMARK;

  if (highProfit && !highRisk) return "star";
  if (!highProfit && !highRisk) return "cash_cow";
  if (highProfit && highRisk) return "problem_child";
  return "dog";
}

function classifyRiskGrade(riskScore: number): ProfitRiskData["riskGrade"] {
  if (riskScore >= 60) return "high";
  if (riskScore >= 30) return "medium";
  return "low";
}

/**
 * 조직별 리스크 점수 계산
 * 미수금 장기화 비중(month3~overdue)을 기반으로 0-100 점수 산출
 *
 * 리스크 점수 = (3개월(90일) 이상 장기미수금 / 총 미수금) * 100
 * 미수금이 0이면 리스크 0
 */
function calcOrgRiskScores(
  receivableAging: ReceivableAgingRecord[]
): Map<string, { riskScore: number; receivables: number }> {
  // 조직별 미수금 집계
  const orgMap = new Map<
    string,
    { total: number; longTerm: number }
  >();

  for (const r of receivableAging) {
    const org = r.영업조직;
    if (!org) continue;

    const entry = orgMap.get(org) || { total: 0, longTerm: 0 };

    const total = r.합계.장부금액;
    // SAP FI-AR 표준: month3(90일) 이상 장기 미수금
    const longTerm =
      r.month3.장부금액 +
      r.month4.장부금액 +
      r.month5.장부금액 +
      r.month6.장부금액 +
      r.overdue.장부금액;

    entry.total += total;
    entry.longTerm += longTerm;

    orgMap.set(org, entry);
  }

  const result = new Map<string, { riskScore: number; receivables: number }>();
  Array.from(orgMap.entries()).forEach(([org, v]) => {
    const riskScore = v.total > 0 ? (v.longTerm / v.total) * 100 : 0;
    result.set(org, {
      riskScore: Math.min(Math.max(riskScore, 0), 100),
      receivables: v.total,
    });
  });

  return result;
}

/**
 * 조직별 매출 합계 (SalesRecord 기반)
 */
function calcOrgSales(sales: SalesRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of sales) {
    const org = r.영업조직;
    if (!org) continue;
    map.set(org, (map.get(org) || 0) + r.장부금액);
  }
  return map;
}

/**
 * 수익성 x 리스크 크로스 분석
 *
 * orgProfit: 조직별 영업이익율 (영업조직팀 필드)
 * receivableAging: 미수금 에이징 데이터 (영업조직 필드)
 * sales: 매출 데이터 (영업조직 필드)
 *
 * 조직명 매칭: orgProfit의 영업조직팀과 receivableAging/sales의 영업조직은
 * 동일한 조직을 가리키지만 필드명이 다를 수 있으므로 이름 기반 매칭
 */
/**
 * Map에서 정확히 일치하는 키를 먼저 찾고,
 * 없으면 키가 name을 포함하거나 name이 키를 포함하는 경우를 찾는다.
 * (예: "건자재팀" ↔ "건자재" 매칭)
 */
function fuzzyGet<T>(map: Map<string, T>, name: string): T | undefined {
  const exact = map.get(name);
  if (exact !== undefined) return exact;
  const entries = Array.from(map.entries());
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    if (key.includes(name) || name.includes(key)) return val;
  }
  return undefined;
}

export function calcProfitRiskMatrix(
  orgProfit: OrgProfitRecord[],
  receivableAging: ReceivableAgingRecord[],
  sales: SalesRecord[]
): ProfitRiskData[] {
  const riskScores = calcOrgRiskScores(receivableAging);
  const orgSalesMap = calcOrgSales(sales);

  return orgProfit
    .filter((r) => r.영업조직팀 && r.매출액.실적 !== 0)
    .map((r) => {
      const name = r.영업조직팀;
      const profitMargin = r.영업이익율.실적;

      // 조직명으로 리스크/매출 데이터 매칭 (fuzzy: "영업조직팀" ↔ "영업조직" 유사매칭)
      const riskData = fuzzyGet(riskScores, name);
      const salesTotal = fuzzyGet(orgSalesMap, name);

      const riskScore = riskData?.riskScore ?? 0;
      const receivables = riskData?.receivables ?? 0;
      const salesAmount = salesTotal ?? r.매출액.실적;

      return {
        name,
        profitMargin,
        riskScore,
        riskGrade: classifyRiskGrade(riskScore),
        sales: salesAmount,
        receivables,
        quadrant: classifyQuadrant(profitMargin, riskScore),
      };
    });
}

/**
 * 사분면별 요약 통계
 */
export function calcQuadrantSummary(data: ProfitRiskData[]): QuadrantSummary[] {
  const quadrants: Array<{
    key: ProfitRiskData["quadrant"];
    koreanName: string;
    recommendation: string;
  }> = [
    {
      key: "star",
      koreanName: "스타",
      recommendation: "핵심 조직으로 투자 확대 및 성과 유지",
    },
    {
      key: "cash_cow",
      koreanName: "안정형",
      recommendation: "수익성 개선을 위한 원가 절감 및 고부가가치 전환",
    },
    {
      key: "problem_child",
      koreanName: "주의 필요",
      recommendation: "미수금 관리 강화 및 여신 한도 재검토",
    },
    {
      key: "dog",
      koreanName: "위험",
      recommendation: "수익성 개선과 미수금 회수 동시 추진 필요",
    },
  ];

  return quadrants.map(({ key, koreanName, recommendation }) => {
    const items = data.filter((d) => d.quadrant === key);
    return {
      name: key,
      koreanName,
      count: items.length,
      totalSales: items.reduce((sum, d) => sum + d.sales, 0),
      recommendation,
    };
  });
}

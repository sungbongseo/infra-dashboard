import type { ProfitabilityAnalysisRecord } from "@/types";

/**
 * 계획 달성 분석 (Plan Achievement Analysis)
 *
 * 3-way variance (가격/수량/믹스)를 대체하는 금액 기반 계획 달성 분석.
 * SAP 901 데이터는 매출수량.계획이 대부분 0이어서 수량 기반 분산분해가 무의미.
 * 대신 금액 기반으로 조직별/거래처별 계획 대비 달성율과 마진율 변동을 분석.
 */

// ── Plan Achievement Summary ────────────────────────────────────

export interface PlanAchievementSummary {
  totalSalesPlan: number;
  totalSalesActual: number;
  salesAchievement: number; // %
  salesGap: number; // 실적 - 계획
  totalGPPlan: number;
  totalGPActual: number;
  gpAchievement: number;
  totalOPPlan: number;
  totalOPActual: number;
  opAchievement: number;
  plannedGPRate: number; // 계획 매출총이익율
  actualGPRate: number; // 실적 매출총이익율
  marginDrift: number; // 이익율 변동 (pp)
  plannedOPRate: number;
  actualOPRate: number;
  opMarginDrift: number;
}

export function calcPlanAchievementSummary(
  data: ProfitabilityAnalysisRecord[]
): PlanAchievementSummary {
  let salesPlan = 0,
    salesActual = 0,
    gpPlan = 0,
    gpActual = 0,
    opPlan = 0,
    opActual = 0;

  for (const r of data) {
    salesPlan += r.매출액.계획;
    salesActual += r.매출액.실적;
    gpPlan += r.매출총이익.계획;
    gpActual += r.매출총이익.실적;
    opPlan += r.영업이익.계획;
    opActual += r.영업이익.실적;
  }

  const plannedGPRate = salesPlan !== 0 ? (gpPlan / salesPlan) * 100 : 0;
  const actualGPRate = salesActual !== 0 ? (gpActual / salesActual) * 100 : 0;
  const plannedOPRate = salesPlan !== 0 ? (opPlan / salesPlan) * 100 : 0;
  const actualOPRate = salesActual !== 0 ? (opActual / salesActual) * 100 : 0;

  return {
    totalSalesPlan: salesPlan,
    totalSalesActual: salesActual,
    salesAchievement: salesPlan !== 0 ? (salesActual / salesPlan) * 100 : 0,
    salesGap: salesActual - salesPlan,
    totalGPPlan: gpPlan,
    totalGPActual: gpActual,
    gpAchievement: gpPlan !== 0 ? (gpActual / gpPlan) * 100 : 0,
    totalOPPlan: opPlan,
    totalOPActual: opActual,
    opAchievement: opPlan !== 0 ? (opActual / opPlan) * 100 : 0,
    plannedGPRate,
    actualGPRate,
    marginDrift: actualGPRate - plannedGPRate,
    plannedOPRate,
    actualOPRate,
    opMarginDrift: actualOPRate - plannedOPRate,
  };
}

// ── Org-level Achievement ────────────────────────────────────

export interface OrgAchievement {
  org: string;
  salesPlan: number;
  salesActual: number;
  salesAchievement: number;
  salesGap: number;
  gpPlan: number;
  gpActual: number;
  gpAchievement: number;
  plannedGPRate: number;
  actualGPRate: number;
  marginDrift: number;
  opPlan: number;
  opActual: number;
  opAchievement: number;
}

export function calcOrgAchievement(
  data: ProfitabilityAnalysisRecord[]
): OrgAchievement[] {
  const map = new Map<
    string,
    {
      salesPlan: number;
      salesActual: number;
      gpPlan: number;
      gpActual: number;
      opPlan: number;
      opActual: number;
    }
  >();

  for (const r of data) {
    const org = r.영업조직팀 || "(미분류)";
    const entry = map.get(org) || {
      salesPlan: 0,
      salesActual: 0,
      gpPlan: 0,
      gpActual: 0,
      opPlan: 0,
      opActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpPlan += r.매출총이익.계획;
    entry.gpActual += r.매출총이익.실적;
    entry.opPlan += r.영업이익.계획;
    entry.opActual += r.영업이익.실적;
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, v]) => {
      const plannedGPRate =
        v.salesPlan !== 0 ? (v.gpPlan / v.salesPlan) * 100 : 0;
      const actualGPRate =
        v.salesActual !== 0 ? (v.gpActual / v.salesActual) * 100 : 0;
      return {
        org,
        salesPlan: v.salesPlan,
        salesActual: v.salesActual,
        salesAchievement:
          v.salesPlan !== 0 ? (v.salesActual / v.salesPlan) * 100 : 0,
        salesGap: v.salesActual - v.salesPlan,
        gpPlan: v.gpPlan,
        gpActual: v.gpActual,
        gpAchievement:
          v.gpPlan !== 0 ? (v.gpActual / v.gpPlan) * 100 : 0,
        plannedGPRate,
        actualGPRate,
        marginDrift: actualGPRate - plannedGPRate,
        opPlan: v.opPlan,
        opActual: v.opActual,
        opAchievement:
          v.opPlan !== 0 ? (v.opActual / v.opPlan) * 100 : 0,
      };
    })
    .sort((a, b) => b.salesActual - a.salesActual);
}

// ── Top Contributors / Detractors by Customer ────────────────

export interface CustomerContributor {
  customer: string; // 매출거래처
  salesPlan: number;
  salesActual: number;
  salesGap: number;
  gpActual: number;
  gpMargin: number;
  opActual: number;
  opMargin: number;
}

/**
 * 거래처별 계획 대비 매출 차이(gap)를 산출하고
 * 상위 기여(positive gap) / 하위 악화(negative gap) 순으로 정렬.
 * topN: 반환 건수 (양/음 각각)
 */
export function calcTopContributors(
  data: ProfitabilityAnalysisRecord[],
  topN: number = 10
): { top: CustomerContributor[]; bottom: CustomerContributor[] } {
  const map = new Map<
    string,
    {
      salesPlan: number;
      salesActual: number;
      gpActual: number;
      opActual: number;
    }
  >();

  for (const r of data) {
    const customer = r.매출거래처 || "(미분류)";
    const entry = map.get(customer) || {
      salesPlan: 0,
      salesActual: 0,
      gpActual: 0,
      opActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpActual += r.매출총이익.실적;
    entry.opActual += r.영업이익.실적;
    map.set(customer, entry);
  }

  const all: CustomerContributor[] = Array.from(map.entries()).map(
    ([customer, v]) => ({
      customer,
      salesPlan: v.salesPlan,
      salesActual: v.salesActual,
      salesGap: v.salesActual - v.salesPlan,
      gpActual: v.gpActual,
      gpMargin:
        v.salesActual !== 0 ? (v.gpActual / v.salesActual) * 100 : 0,
      opActual: v.opActual,
      opMargin:
        v.salesActual !== 0 ? (v.opActual / v.salesActual) * 100 : 0,
    })
  );

  // Top: 양의 차이 → 기여 거래처 (내림차순)
  const top = all
    .filter((c) => c.salesGap > 0)
    .sort((a, b) => b.salesGap - a.salesGap)
    .slice(0, topN);

  // Bottom: 음의 차이 → 악화 거래처 (오름차순)
  const bottom = all
    .filter((c) => c.salesGap < 0)
    .sort((a, b) => a.salesGap - b.salesGap)
    .slice(0, topN);

  return { top, bottom };
}

// ── Margin Drift Analysis by Customer ────────────────────────

export interface MarginDriftItem {
  customer: string;
  salesActual: number;
  plannedGPRate: number;
  actualGPRate: number;
  marginDrift: number; // actualGPRate - plannedGPRate (pp)
  driftImpact: number; // salesActual * marginDrift / 100 (추정 이익 영향액)
}

/**
 * 거래처별 계획 대비 매출총이익율 변동 분석.
 * marginDrift > 0: 이익율 개선 / < 0: 이익율 악화.
 * driftImpact: 매출 × 이익율변동 → 금액으로 환산한 영향.
 * topN: 악화/개선 각각 상위 N건 반환.
 *
 * C2 fix: 계획=0인 거래처는 비교 근거가 없으므로 제외.
 * C3 fix: 악화/개선을 분리하여 반환.
 */
export interface MarginDriftResult {
  worsened: MarginDriftItem[];     // drift < 0, driftImpact 오름차순 (가장 악화 먼저)
  improved: MarginDriftItem[];     // drift > 0, driftImpact 내림차순 (가장 개선 먼저)
  totalWorsenedImpact: number;
  totalImprovedImpact: number;
  netImpact: number;
}

export function calcMarginDrift(
  data: ProfitabilityAnalysisRecord[],
  topN: number = 15
): MarginDriftResult {
  const map = new Map<
    string,
    {
      salesPlan: number;
      salesActual: number;
      gpPlan: number;
      gpActual: number;
    }
  >();

  for (const r of data) {
    const customer = r.매출거래처 || "(미분류)";
    const entry = map.get(customer) || {
      salesPlan: 0,
      salesActual: 0,
      gpPlan: 0,
      gpActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpPlan += r.매출총이익.계획;
    entry.gpActual += r.매출총이익.실적;
    map.set(customer, entry);
  }

  const items: MarginDriftItem[] = Array.from(map.entries())
    // C2: 계획=0 or 실적=0인 거래처 제외 (비교 근거 없음)
    .filter(([, v]) => v.salesActual !== 0 && v.salesPlan !== 0)
    .map(([customer, v]) => {
      const plannedGPRate = (v.gpPlan / v.salesPlan) * 100;
      const actualGPRate = (v.gpActual / v.salesActual) * 100;
      const marginDrift = actualGPRate - plannedGPRate;
      return {
        customer,
        salesActual: v.salesActual,
        plannedGPRate,
        actualGPRate,
        marginDrift,
        driftImpact: (v.salesActual * marginDrift) / 100,
      };
    });

  // C3: 악화/개선 분리
  const worsened = items
    .filter((item) => item.marginDrift < 0)
    .sort((a, b) => a.driftImpact - b.driftImpact) // 가장 큰 손실 먼저
    .slice(0, topN);

  const improved = items
    .filter((item) => item.marginDrift > 0)
    .sort((a, b) => b.driftImpact - a.driftImpact) // 가장 큰 개선 먼저
    .slice(0, topN);

  const totalWorsenedImpact = worsened.reduce((s, it) => s + it.driftImpact, 0);
  const totalImprovedImpact = improved.reduce((s, it) => s + it.driftImpact, 0);

  return {
    worsened,
    improved,
    totalWorsenedImpact,
    totalImprovedImpact,
    netImpact: totalWorsenedImpact + totalImprovedImpact,
  };
}

// ── Plan Data Quality Check ────────────────────────────────────

export interface PlanDataQuality {
  totalRecords: number;
  recordsWithSalesPlan: number;
  salesPlanCoverage: number;       // %
  hasMeaningfulPlan: boolean;      // coverage >= 30%
  planQualityLevel: "good" | "partial" | "poor" | "none";
}

/**
 * 계획 데이터 품질 진단 (C1, F3 해결).
 * 계획값≠0인 레코드 비율을 산출하여 4단계 품질 레벨 판정.
 */
export function checkPlanDataQuality(
  data: ProfitabilityAnalysisRecord[]
): PlanDataQuality {
  const totalRecords = data.length;
  const recordsWithSalesPlan = data.filter((r) => r.매출액.계획 !== 0).length;
  const salesPlanCoverage =
    totalRecords > 0 ? (recordsWithSalesPlan / totalRecords) * 100 : 0;

  let planQualityLevel: PlanDataQuality["planQualityLevel"];
  if (recordsWithSalesPlan === 0) planQualityLevel = "none";
  else if (salesPlanCoverage < 30) planQualityLevel = "poor";
  else if (salesPlanCoverage < 70) planQualityLevel = "partial";
  else planQualityLevel = "good";

  return {
    totalRecords,
    recordsWithSalesPlan,
    salesPlanCoverage,
    hasMeaningfulPlan: salesPlanCoverage >= 30,
    planQualityLevel,
  };
}

// ── Org Gap Contribution ────────────────────────────────────

export interface OrgGapContribution {
  org: string;
  salesGap: number;    // actual - plan
  gpGap: number;
  opGap: number;
  salesPlan: number;
  salesActual: number;
}

/**
 * 조직별 갭 기여도 (F2 해결).
 * 어떤 조직이 전체 미달/초과에 기여했는지를 금액으로 산출.
 */
export function calcOrgGapContribution(
  data: ProfitabilityAnalysisRecord[]
): OrgGapContribution[] {
  const map = new Map<
    string,
    { salesPlan: number; salesActual: number; gpPlan: number; gpActual: number; opPlan: number; opActual: number }
  >();

  for (const r of data) {
    const org = r.영업조직팀 || "(미분류)";
    const entry = map.get(org) || {
      salesPlan: 0, salesActual: 0,
      gpPlan: 0, gpActual: 0,
      opPlan: 0, opActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpPlan += r.매출총이익.계획;
    entry.gpActual += r.매출총이익.실적;
    entry.opPlan += r.영업이익.계획;
    entry.opActual += r.영업이익.실적;
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, v]) => ({
      org,
      salesGap: v.salesActual - v.salesPlan,
      gpGap: v.gpActual - v.gpPlan,
      opGap: v.opActual - v.opPlan,
      salesPlan: v.salesPlan,
      salesActual: v.salesActual,
    }))
    .sort((a, b) => b.salesGap - a.salesGap);
}

// ── Plan Insight Generator ────────────────────────────────────

/**
 * 자동 인사이트 텍스트 생성 (F6 해결).
 * 계획 데이터 품질, 달성율, 조직별 현황을 분석하여 핵심 진단 메시지 생성.
 */
export function generatePlanInsight(
  summary: PlanAchievementSummary,
  orgData: OrgAchievement[],
  quality: PlanDataQuality
): string {
  const parts: string[] = [];

  // 데이터 품질 경고
  if (quality.planQualityLevel === "none") {
    return "계획 데이터가 전혀 입력되어 있지 않아 달성율 분석이 불가합니다. SAP에서 계획 데이터를 포함한 보고서를 다시 추출해주세요.";
  }
  if (quality.planQualityLevel === "poor") {
    parts.push(
      `전체 ${quality.totalRecords}건 중 ${quality.recordsWithSalesPlan}건(${quality.salesPlanCoverage.toFixed(0)}%)에만 계획값이 존재하여 분석 신뢰성이 제한됩니다.`
    );
  }

  // 매출 vs 이익 달성율 비교 → 원가율 변동 진단
  if (summary.salesAchievement > 0 && summary.gpAchievement > 0) {
    const salesAch = summary.salesAchievement;
    const gpAch = summary.gpAchievement;

    if (salesAch >= 100 && gpAch >= 100) {
      parts.push(
        `매출 ${salesAch.toFixed(0)}%, 매출총이익 ${gpAch.toFixed(0)}% 달성으로 전체적으로 양호합니다.`
      );
    } else if (salesAch >= 100 && gpAch < 100) {
      parts.push(
        `매출은 ${salesAch.toFixed(0)}% 달성했으나 매출총이익이 ${gpAch.toFixed(0)}%에 그쳐, 원가율 상승 또는 저마진 판매 비중 증가가 의심됩니다.`
      );
    } else if (salesAch < 100 && gpAch >= salesAch) {
      parts.push(
        `매출은 ${salesAch.toFixed(0)}%로 미달이나 이익율은 개선되어(GP 달성 ${gpAch.toFixed(0)}%), 고마진 거래 중심의 선별 영업이 이루어지고 있습니다.`
      );
    } else {
      parts.push(
        `매출 ${salesAch.toFixed(0)}%, 매출총이익 ${gpAch.toFixed(0)}%로 모두 미달입니다. 영업량 확대와 원가 관리가 동시에 필요합니다.`
      );
    }
  }

  // 조직별 관리 포인트
  const achieved = orgData.filter((o) => o.salesAchievement >= 100);
  const missed = orgData.filter((o) => o.salesAchievement < 100 && o.salesPlan > 0);
  if (orgData.length > 0) {
    if (missed.length === 0) {
      parts.push("모든 조직이 매출 계획을 달성하여 균형 잡힌 실적을 보이고 있습니다.");
    } else if (achieved.length === 0) {
      parts.push("전 조직이 매출 계획 미달로, 전사적 영업 전략 재검토가 필요합니다.");
    } else {
      const worstOrg = missed.sort((a, b) => a.salesAchievement - b.salesAchievement)[0];
      parts.push(
        `${achieved.length}개 조직 달성, ${missed.length}개 조직 미달. 가장 저조한 "${worstOrg.org}"(${worstOrg.salesAchievement.toFixed(0)}%)에 대한 집중 관리가 필요합니다.`
      );
    }
  }

  return parts.join(" ");
}

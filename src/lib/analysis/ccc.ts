import type { DSOMetric } from "./dso";
import type { TeamContributionRecord } from "@/types";

export type CCCClassification = "excellent" | "good" | "fair" | "poor";

export interface CCCMetric {
  org: string;
  dso: number;
  dpo: number;
  ccc: number;
  classification: CCCClassification;
  recommendation: string;
}

export interface CCCAnalysis {
  avgCCC: number;
  avgDSO: number;
  avgDPO: number;
  metrics: CCCMetric[];
}

/**
 * CCC 등급 분류
 * < 0: excellent (우수) - 매입 결제 전에 매출 회수 완료
 * 0~30: good (양호)
 * 30~60: fair (보통)
 * > 60: poor (주의) - 현금 회전이 매우 느림
 */
function classifyCCC(ccc: number): CCCClassification {
  if (ccc < 0) return "excellent";
  if (ccc <= 30) return "good";
  if (ccc <= 60) return "fair";
  return "poor";
}

/**
 * 등급별 한국어 추천 메시지
 */
function getRecommendation(classification: CCCClassification, ccc: number, dso: number, dpo: number): string {
  switch (classification) {
    case "excellent":
      return "현금 회전이 매우 우수합니다. 매입 결제 전에 매출 회수가 이루어지고 있어 운전자본 관리가 효율적입니다.";
    case "good":
      return `현금 회전이 양호합니다. DSO(${dso}일) 단축을 통해 추가 개선이 가능합니다. 조기 수금 인센티브 도입을 검토해 보세요.`;
    case "fair":
      return `현금 회전 개선이 필요합니다. DSO(${dso}일)가 높아 매출채권 회수 속도를 높이고, 매입 결제조건(DPO ${dpo}일) 연장을 협의해 보세요.`;
    case "poor":
      return `현금 회전이 매우 느립니다. DSO(${dso}일) 대폭 단축이 시급합니다. 연체 거래처 집중 관리, 결제조건 재협상, 팩토링 활용을 권장합니다.`;
  }
}

/**
 * DPO (Days Payable Outstanding) 추정
 * TeamContribution 데이터에서 실적매출원가(COGS) 기반으로 추정
 * DPO = (총 매입채무 추정 / 월평균 매출원가) x 30
 *
 * 직접적인 매입채무 데이터가 없으므로 매출원가 대비 매출총이익 비율로 추정:
 * - 매출원가 대비 일반적으로 30일 결제 조건을 가정
 * - 매출원가율이 높을수록 DPO가 중요 → 매출원가율 기반 가중치 적용
 *
 * 실제로는 매입채무 데이터가 없어 매출원가 기준 업종 평균(약 30~45일)을 기반으로 추정
 */
export function estimateDPO(teamContrib: TeamContributionRecord[]): number {
  if (teamContrib.length === 0) return 0;

  // 전체 매출액과 매출원가 합산
  let totalRevenue = 0;
  let totalCOGS = 0;

  for (const tc of teamContrib) {
    totalRevenue += tc.매출액.실적;
    totalCOGS += tc.실적매출원가.실적;
  }

  // 매출원가율 계산
  const cogsRatio = totalRevenue > 0 ? totalCOGS / totalRevenue : 0;

  // 매입채무 데이터가 없으므로, 매출원가율 기반으로 DPO 추정
  // 매출원가율이 높으면 원자재/상품 매입 비중이 높아 DPO가 길어지는 경향
  // 기본 DPO 30일 + 매출원가율에 따른 가중치
  if (totalCOGS <= 0) return 0;

  // 업종 특성 반영: 인프라/건설/건자재 업종의 일반적 DPO 범위 30~60일
  // 매출원가율 80% 이상: 45일, 60~80%: 35일, 60% 미만: 30일
  if (cogsRatio >= 0.8) return 45;
  if (cogsRatio >= 0.6) return 35;
  return 30;
}

/**
 * 조직별 DPO 추정
 * 각 조직(영업조직팀)의 매출원가율 기반으로 개별 DPO 추정
 */
function estimateDPOByOrg(teamContrib: TeamContributionRecord[]): Map<string, number> {
  const orgData = new Map<string, { revenue: number; cogs: number }>();

  for (const tc of teamContrib) {
    const org = (tc.영업조직팀 || "").trim();
    if (!org) continue;
    const entry = orgData.get(org) || { revenue: 0, cogs: 0 };
    entry.revenue += tc.매출액.실적;
    entry.cogs += tc.실적매출원가.실적;
    orgData.set(org, entry);
  }

  const dpoMap = new Map<string, number>();
  for (const [org, data] of Array.from(orgData.entries())) {
    if (data.cogs <= 0) {
      dpoMap.set(org, 0);
      continue;
    }
    const cogsRatio = data.revenue > 0 ? data.cogs / data.revenue : 0;
    if (cogsRatio >= 0.8) dpoMap.set(org, 45);
    else if (cogsRatio >= 0.6) dpoMap.set(org, 35);
    else dpoMap.set(org, 30);
  }

  return dpoMap;
}

/**
 * 조직별 CCC (Cash Conversion Cycle) 계산
 * CCC = DSO + DIO - DPO
 * DIO(Days Inventory Outstanding)는 재고 데이터가 없으므로 0으로 설정
 * CCC = DSO - DPO
 */
export function calcCCCByOrg(
  dsoMetrics: DSOMetric[],
  teamContrib: TeamContributionRecord[]
): CCCMetric[] {
  const dpoByOrg = estimateDPOByOrg(teamContrib);
  const overallDPO = estimateDPO(teamContrib);

  const results: CCCMetric[] = [];

  for (const dm of dsoMetrics) {
    // DSO의 org와 TeamContribution의 영업조직팀을 매칭
    // receivableAging의 영업조직과 teamContribution의 영업조직팀은 이름이 다를 수 있음
    // 가장 가까운 매칭 시도: 포함 관계 또는 정확 일치
    let dpo = overallDPO; // 기본값: 전체 평균 DPO

    // 정확 매칭 시도
    if (dpoByOrg.has(dm.org)) {
      dpo = dpoByOrg.get(dm.org)!;
    } else {
      // 부분 매칭: receivableAging의 영업조직이 teamContribution의 영업조직팀에 포함되거나 반대
      for (const [orgTeam, orgDpo] of Array.from(dpoByOrg.entries())) {
        if (orgTeam.includes(dm.org) || dm.org.includes(orgTeam)) {
          dpo = orgDpo;
          break;
        }
      }
    }

    const ccc = dm.dso - dpo;
    const classification = classifyCCC(ccc);

    results.push({
      org: dm.org,
      dso: dm.dso,
      dpo,
      ccc,
      classification,
      recommendation: getRecommendation(classification, ccc, dm.dso, dpo),
    });
  }

  return results.sort((a, b) => a.ccc - b.ccc);
}

/**
 * CCC 종합 분석
 * 전체 평균 CCC, DSO, DPO 및 조직별 상세 메트릭스
 */
export function calcCCCAnalysis(cccMetrics: CCCMetric[]): CCCAnalysis {
  if (cccMetrics.length === 0) {
    return { avgCCC: 0, avgDSO: 0, avgDPO: 0, metrics: [] };
  }

  const totalCCC = cccMetrics.reduce((sum, m) => sum + m.ccc, 0);
  const totalDSO = cccMetrics.reduce((sum, m) => sum + m.dso, 0);
  const totalDPO = cccMetrics.reduce((sum, m) => sum + m.dpo, 0);
  const count = cccMetrics.length;

  return {
    avgCCC: Math.round(totalCCC / count),
    avgDSO: Math.round(totalDSO / count),
    avgDPO: Math.round(totalDPO / count),
    metrics: cccMetrics,
  };
}

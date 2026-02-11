import type { DSOMetric } from "./dso";
import type { TeamContributionRecord } from "@/types";

export type CCCClassification = "excellent" | "good" | "fair" | "poor";

export interface CCCMetric {
  org: string;
  dso: number;
  dpo: number;
  ccc: number;
  avgMonthlySales: number;
  classification: CCCClassification;
  recommendation: string;
}

export interface CCCAnalysis {
  avgCCC: number;
  avgDSO: number;
  avgDPO: number;
  metrics: CCCMetric[];
}

export interface DPOEstimationDetail {
  org: string;
  dpo: number;
  profileType: string;
  cogsRatio: number;
  원재료비율: number;
  상품매입비율: number;
  외주비율: number;
}

/**
 * 5-level DPO estimation based on cost profile
 * 원가 구조(비용 프로파일)에 따라 DPO를 추정
 * 구매 패턴에 따라 결제 주기가 다르기 때문에 비용 프로파일이 DPO를 결정
 */
function estimateDPOFromProfile(
  cogsRatio: number,
  원재료비율: number,
  상품매입비율: number,
  외주비율: number
): { dpo: number; profileType: string } {
  // Level 1: 구매직납형 (상품매입 비중 높음) - 짧은 DPO (구매 즉시 판매)
  if (상품매입비율 >= 30) return { dpo: 25, profileType: "구매직납형" };
  // Level 2: 자체생산형 (원재료 비중 높음) - 중간 DPO
  if (원재료비율 >= 30) return { dpo: 35, profileType: "자체생산형" };
  // Level 3: 외주의존형 (외주가공 비중 높음) - 긴 DPO
  if (외주비율 >= 20) return { dpo: 45, profileType: "외주의존형" };
  // Level 4: 고원가율 혼합형 (COGS 80%+)
  if (cogsRatio >= 0.8) return { dpo: 50, profileType: "고원가율 혼합형" };
  // Level 5: 저원가율 혼합형 (서비스/컨설팅 성격)
  return { dpo: 30, profileType: "저원가율 혼합형" };
}

/**
 * TeamContributionRecord에서 원가 프로파일 비율 계산
 * 원재료비 = 제조변동_원재료비.실적 + 제조변동_부재료비.실적
 * 상품매입 = 변동_상품매입.실적
 * 외주가공비 = 판관변동_외주가공비.실적 + 제조변동_외주가공비.실적
 */
function calcCostProfileRatios(
  rawMaterial: number,
  productPurchase: number,
  outsourcing: number,
  totalCOGS: number
): { 원재료비율: number; 상품매입비율: number; 외주비율: number } {
  if (totalCOGS <= 0) {
    return { 원재료비율: 0, 상품매입비율: 0, 외주비율: 0 };
  }
  return {
    원재료비율: (rawMaterial / totalCOGS) * 100,
    상품매입비율: (productPurchase / totalCOGS) * 100,
    외주비율: (outsourcing / totalCOGS) * 100,
  };
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

  // 전체 매출액, 매출원가, 비용 프로파일 합산
  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalRawMaterial = 0;
  let totalProductPurchase = 0;
  let totalOutsourcing = 0;

  for (const tc of teamContrib) {
    totalRevenue += tc.매출액.실적;
    totalCOGS += tc.실적매출원가.실적;
    totalRawMaterial += tc.제조변동_원재료비.실적 + tc.제조변동_부재료비.실적;
    totalProductPurchase += tc.변동_상품매입.실적;
    totalOutsourcing += tc.판관변동_외주가공비.실적 + tc.제조변동_외주가공비.실적;
  }

  if (totalCOGS <= 0) return 0;

  const cogsRatio = totalRevenue > 0 ? totalCOGS / totalRevenue : 0;
  const { 원재료비율, 상품매입비율, 외주비율 } = calcCostProfileRatios(
    totalRawMaterial,
    totalProductPurchase,
    totalOutsourcing,
    totalCOGS
  );

  return estimateDPOFromProfile(cogsRatio, 원재료비율, 상품매입비율, 외주비율).dpo;
}

/**
 * 조직별 DPO 추정
 * 각 조직(영업조직팀)의 매출원가율 기반으로 개별 DPO 추정
 */
interface OrgCostProfile {
  revenue: number;
  cogs: number;
  rawMaterial: number;
  productPurchase: number;
  outsourcing: number;
}

function buildOrgCostProfiles(
  teamContrib: TeamContributionRecord[]
): Map<string, OrgCostProfile> {
  const orgData = new Map<string, OrgCostProfile>();

  for (const tc of teamContrib) {
    const org = (tc.영업조직팀 || "").trim();
    if (!org) continue;
    const entry = orgData.get(org) || {
      revenue: 0,
      cogs: 0,
      rawMaterial: 0,
      productPurchase: 0,
      outsourcing: 0,
    };
    entry.revenue += tc.매출액.실적;
    entry.cogs += tc.실적매출원가.실적;
    entry.rawMaterial += tc.제조변동_원재료비.실적 + tc.제조변동_부재료비.실적;
    entry.productPurchase += tc.변동_상품매입.실적;
    entry.outsourcing += tc.판관변동_외주가공비.실적 + tc.제조변동_외주가공비.실적;
    orgData.set(org, entry);
  }

  return orgData;
}

function estimateDPOByOrg(teamContrib: TeamContributionRecord[]): Map<string, number> {
  const orgProfiles = buildOrgCostProfiles(teamContrib);

  const dpoMap = new Map<string, number>();
  for (const [org, data] of Array.from(orgProfiles.entries())) {
    if (data.cogs <= 0) {
      dpoMap.set(org, 0);
      continue;
    }
    const cogsRatio = data.revenue > 0 ? data.cogs / data.revenue : 0;
    const { 원재료비율, 상품매입비율, 외주비율 } = calcCostProfileRatios(
      data.rawMaterial,
      data.productPurchase,
      data.outsourcing,
      data.cogs
    );
    const { dpo } = estimateDPOFromProfile(cogsRatio, 원재료비율, 상품매입비율, 외주비율);
    dpoMap.set(org, dpo);
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
      avgMonthlySales: dm.avgMonthlySales,
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

  // 매출액 가중평균: 매출 규모가 큰 조직의 CCC가 더 큰 영향을 미침
  const totalWeight = cccMetrics.reduce((sum, m) => sum + m.avgMonthlySales, 0);
  if (totalWeight > 0) {
    const wCCC = cccMetrics.reduce((sum, m) => sum + m.ccc * m.avgMonthlySales, 0);
    const wDSO = cccMetrics.reduce((sum, m) => sum + m.dso * m.avgMonthlySales, 0);
    const wDPO = cccMetrics.reduce((sum, m) => sum + m.dpo * m.avgMonthlySales, 0);
    return {
      avgCCC: Math.round(wCCC / totalWeight),
      avgDSO: Math.round(wDSO / totalWeight),
      avgDPO: Math.round(wDPO / totalWeight),
      metrics: cccMetrics,
    };
  }

  // 매출 데이터 없으면 단순 산술평균 fallback
  const count = cccMetrics.length;
  return {
    avgCCC: Math.round(cccMetrics.reduce((s, m) => s + m.ccc, 0) / count),
    avgDSO: Math.round(cccMetrics.reduce((s, m) => s + m.dso, 0) / count),
    avgDPO: Math.round(cccMetrics.reduce((s, m) => s + m.dpo, 0) / count),
    metrics: cccMetrics,
  };
}

/**
 * 조직별 DPO 추정 상세 - 비용 프로파일 유형과 추정 DPO를 투명하게 반환
 * 대시보드에서 DPO 추정 근거를 표시하기 위한 함수
 */
export function estimateDPODetailed(
  teamContrib: TeamContributionRecord[]
): DPOEstimationDetail[] {
  const orgProfiles = buildOrgCostProfiles(teamContrib);
  const results: DPOEstimationDetail[] = [];

  for (const [org, data] of Array.from(orgProfiles.entries())) {
    if (data.cogs <= 0) {
      results.push({
        org,
        dpo: 0,
        profileType: "데이터 없음",
        cogsRatio: 0,
        원재료비율: 0,
        상품매입비율: 0,
        외주비율: 0,
      });
      continue;
    }

    const cogsRatio = data.revenue > 0 ? data.cogs / data.revenue : 0;
    const { 원재료비율, 상품매입비율, 외주비율 } = calcCostProfileRatios(
      data.rawMaterial,
      data.productPurchase,
      data.outsourcing,
      data.cogs
    );
    const { dpo, profileType } = estimateDPOFromProfile(
      cogsRatio,
      원재료비율,
      상품매입비율,
      외주비율
    );

    results.push({
      org,
      dpo,
      profileType,
      cogsRatio: Math.round(cogsRatio * 1000) / 1000,
      원재료비율: Math.round(원재료비율 * 10) / 10,
      상품매입비율: Math.round(상품매입비율 * 10) / 10,
      외주비율: Math.round(외주비율 * 10) / 10,
    });
  }

  return results.sort((a, b) => b.dpo - a.dpo);
}

export interface AgingAmounts {
  출고금액: number;
  장부금액: number;
  거래금액: number;
}

export interface ReceivableAgingRecord {
  No: number;
  영업조직: string;
  담당자: string;
  판매처: string;
  판매처명: string;
  통화: string;
  month1: AgingAmounts; // 최근 1개월
  month2: AgingAmounts; // 2개월
  month3: AgingAmounts; // 3개월
  month4: AgingAmounts; // 4개월
  month5: AgingAmounts; // 5개월
  month6: AgingAmounts; // 6개월
  overdue: AgingAmounts; // 6개월 이전
  합계: AgingAmounts;
  여신한도: number;
}

export type AgingSourceName =
  | "건자재"
  | "광주사무소"
  | "대구사무소"
  | "대전사무소"
  | "부산지점"
  | "전략구매혁신팀"
  | "해외사업팀";

export type CreditStatus = "danger" | "warning" | "normal";

export interface CreditUtilization {
  판매처: string;
  판매처명: string;
  영업조직: string;
  담당자: string;
  총미수금: number;
  여신한도: number;
  사용률: number;
  상태: CreditStatus;
}

export interface CreditSummaryByOrg {
  org: string;
  totalLimit: number;
  totalUsed: number;
  utilizationRate: number;
  dangerCount: number;
  warningCount: number;
}

export type RiskGrade = "high" | "medium" | "low";

export interface AgingRiskAssessment {
  판매처: string;
  판매처명: string;
  영업조직: string;
  담당자: string;
  총미수금: number;
  연체비율: number;
  riskGrade: RiskGrade;
}

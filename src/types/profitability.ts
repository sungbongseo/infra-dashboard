export interface PlanActualDiff {
  계획: number;
  실적: number;
  차이: number;
}

export interface OrgProfitRecord {
  No: number;
  판매사업본부: string;
  판매사업부: string;
  영업조직팀: string;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  매출총이익: PlanActualDiff;
  판관변동_직접판매운반비: PlanActualDiff;
  판관변동_운반비: PlanActualDiff;
  판매관리비: PlanActualDiff;
  영업이익: PlanActualDiff;
  공헌이익: PlanActualDiff;
  매출원가율: PlanActualDiff;
  매출총이익율: PlanActualDiff;
  판관비율: PlanActualDiff;
  영업이익율: PlanActualDiff;
  공헌이익율: PlanActualDiff;
}

export interface TeamContributionRecord {
  No: number;
  영업그룹: string;
  영업조직팀: string;
  영업담당사번: string;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  매출총이익: PlanActualDiff;
  매출총이익율: PlanActualDiff;
  판관변동_직접판매운반비: PlanActualDiff;
  판매관리비: PlanActualDiff;
  영업이익: PlanActualDiff;
  영업이익율: PlanActualDiff;
  // 판관변동 비용항목 (9개)
  판관변동_노무비: PlanActualDiff;
  판관변동_복리후생비: PlanActualDiff;
  판관변동_소모품비: PlanActualDiff;
  판관변동_수도광열비: PlanActualDiff;
  판관변동_수선비: PlanActualDiff;
  판관변동_외주가공비: PlanActualDiff;
  판관변동_운반비: PlanActualDiff;
  판관변동_지급수수료: PlanActualDiff;
  판관변동_견본비: PlanActualDiff;
  // 판관고정 비용항목 (3개)
  판관고정_노무비: PlanActualDiff;
  판관고정_감가상각비: PlanActualDiff;
  판관고정_기타경비: PlanActualDiff;
  // 제조변동 비용항목 (14개)
  제조변동_원재료비: PlanActualDiff;
  제조변동_부재료비: PlanActualDiff;
  변동_상품매입: PlanActualDiff;
  제조변동_노무비: PlanActualDiff;
  제조변동_복리후생비: PlanActualDiff;
  제조변동_소모품비: PlanActualDiff;
  제조변동_수도광열비: PlanActualDiff;
  제조변동_수선비: PlanActualDiff;
  제조변동_연료비: PlanActualDiff;
  제조변동_외주가공비: PlanActualDiff;
  제조변동_운반비: PlanActualDiff;
  제조변동_전력비: PlanActualDiff;
  제조변동_견본비: PlanActualDiff;
  제조변동_지급수수료: PlanActualDiff;
  // 합계
  변동비합계: PlanActualDiff;
  공헌이익: PlanActualDiff;
  공헌이익율: PlanActualDiff;
}

export interface ProfitabilityAnalysisRecord {
  No: number;
  영업조직팀: string;
  영업담당사번: string;
  매출거래처: string;
  품목: string;
  제품내수매출: PlanActualDiff;
  제품수출매출: PlanActualDiff;
  매출수량: PlanActualDiff;
  환산수량: PlanActualDiff;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  매출총이익: PlanActualDiff;
  판매관리비: PlanActualDiff;
  판관변동_직접판매운반비: PlanActualDiff;
  영업이익: PlanActualDiff;
}

// C1: 303 조직별 거래처별 손익
export interface OrgCustomerProfitRecord {
  No: number;
  영업조직팀: string;
  거래처대분류: string;
  거래처중분류: string;
  거래처소분류: string;
  매출거래처: string;
  매출거래처명: string;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  매출총이익: PlanActualDiff;
  판매관리비: PlanActualDiff;
  영업이익: PlanActualDiff;
  매출총이익율: PlanActualDiff;
  영업이익율: PlanActualDiff;
}

// C2: 304 본부 거래처 품목 손익
export interface HqCustomerItemProfitRecord {
  No: number;
  영업조직팀: string;
  매출거래처: string;
  매출거래처명: string;
  품목: string;
  품목명: string;
  매출수량: PlanActualDiff;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  매출총이익: PlanActualDiff;
  판매관리비: PlanActualDiff;
  영업이익: PlanActualDiff;
  매출총이익율: PlanActualDiff;
  영업이익율: PlanActualDiff;
}

// C3: 100 거래처별 품목별 손익
export interface CustomerItemDetailRecord {
  No: number;
  영업조직팀: string;
  영업담당사번: string;
  매출거래처: string;
  매출거래처명: string;
  품목: string;
  품목명: string;
  거래처대분류: string;
  거래처중분류: string;
  거래처소분류: string;
  제품군: string;
  제품내수매출: PlanActualDiff;
  제품수출매출: PlanActualDiff;
  매출수량: PlanActualDiff;
  환산수량: PlanActualDiff;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  매출총이익: PlanActualDiff;
  판매관리비: PlanActualDiff;
  판관변동_직접판매운반비: PlanActualDiff;
  영업이익: PlanActualDiff;
  매출총이익율: PlanActualDiff;
  영업이익율: PlanActualDiff;
}

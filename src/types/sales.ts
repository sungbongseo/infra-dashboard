export interface SalesRecord {
  No: number;
  공장: string;
  매출번호: string;
  매출일: string;
  세무분류: string;
  세무구분: string;
  거래처소분류: string;
  매출처: string;
  매출처명: string;
  수금처: string;
  수금처명: string;
  납품처: string;
  납품처명: string;
  결제조건: string;
  수금예정일: string;
  부가세사업장: string;   // P1-1: 5개 공장별 매출 분석
  매출상태: string;
  매출유형: string;
  품목: string;
  품목명: string;
  규격: string;
  대분류: string;
  중분류: string;
  소분류: string;
  단위: string;
  수량: number;
  거래통화: string;
  환율: number;
  판매단가: number;
  판매금액: number;
  장부단가: number;
  장부금액: number;
  부가세: number;
  총금액: number;
  품목범주: string;
  계정구분: string;       // P1-1: 제품/상품/원자재/부재료 세그먼트
  영업조직: string;
  유통경로: string;
  제품군: string;
  사업부: string;
  영업그룹: string;
  영업담당자: string;
  영업담당자명: string;
  수주번호: string;
  수주유형: string;
  출고일: string;
}

export interface CollectionRecord {
  No: number;
  수금문서번호: string;
  수금유형: string;
  결재방법: string;
  수금계정: string;
  거래처명: string;
  영업조직: string;
  담당자: string;
  수금일: string;
  통화: string;
  금융기관: string;       // P1-5: 은행별 수금 채널 분석
  만기일: string;          // P1-5: 어음 만기 → CCC 정밀화
  수금액: number;
  장부수금액: number;
  선수금액: number;
  장부선수금액: number;
}

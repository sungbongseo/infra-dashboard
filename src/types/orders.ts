export interface OrderRecord {
  No: number;
  수주번호: string;
  순번: number;
  수주일: string;
  납품요청일: string;
  판매처: string;
  판매처명: string;
  영업그룹: string;
  영업담당자: string;
  영업담당자명: string;
  판매지역: string;
  수주유형: string;
  수주유형명: string;
  영업조직: string;
  유통경로: string;
  거래구분: string;
  품목: string;
  품목명: string;
  규격: string;
  판매수량: number;
  판매단가: number;
  단가통화: string;       // P1-2: KRW/USD/QAR 내수·수출 구분
  판매금액: number;
  환율: number;
  장부단가: number;
  장부금액: number;
  부가세: number;
  총금액: number;
  납품처: string;          // P1-2: 판매처≠납품처 유통 구조 분석
  품목상태: string;        // P1-2: 완료/삭제/진행 → 수주 전환율
  저장위치: string;        // P1-2: 17개 창고별 물류 분석
  대분류: string;
  중분류: string;
  소분류: string;
}

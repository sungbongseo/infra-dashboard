export interface InventoryMovementRecord {
  factory: string;           // 공장명 (파일명에서 추출)
  no: number;                // 일련번호
  품목: string;              // 품목코드
  품목명: string;
  규격: string;
  세부규격: string;
  품목그룹: string;
  품목계정그룹: string;       // 제품, 원재료, 부재료, 상품, 재공품, 저장품
  자재유형: string;
  주거래처: string;
  대분류: string;
  중분류: string;
  소분류: string;
  단위: string;              // BAG, KG, DM 등
  기초: number;              // 기초 수량
  입고: number;              // 입고 수량
  출고: number;              // 출고 수량
  기말: number;              // 기말 수량
}

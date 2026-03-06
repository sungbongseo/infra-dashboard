export interface InventoryMovementRecord {
  factory: string;           // 공장명 (파일명에서 추출)
  품목계정그룹: string;       // 제품, 원재료, 부재료, 상품
  대분류: string;
  중분류: string;
  소분류: string;
  품목: string;              // 품목코드
  품목명: string;
  단위: string;
  기초수량: number;
  기초금액: number;
  입고수량: number;
  입고금액: number;
  출고수량: number;
  출고금액: number;
  기말수량: number;
  기말금액: number;
  비고: string;
}

import type { PlanActualDiff } from "./profitability";

export const COST_CATEGORIES = [
  "원재료비", "부재료비", "상품매입", "노무비", "복리후생비",
  "소모품비", "수도광열비", "수선비", "연료비", "외주가공비",
  "운반비", "전력비", "지급수수료", "견본비",
  "제조변동비소계", "제조고정노무비", "감가상각비", "기타경비",
] as const;
export type CostCategoryKey = typeof COST_CATEGORIES[number];

export const COST_BUCKETS = {
  재료비: ["원재료비", "부재료비"],
  상품매입비: ["상품매입"],
  인건비: ["노무비", "복리후생비", "제조고정노무비"],
  설비비: ["수도광열비", "전력비", "연료비", "감가상각비"],
  외주비: ["외주가공비"],
  물류비: ["운반비"],
  일반경비: ["소모품비", "수선비", "지급수수료", "견본비", "기타경비"],
} as const;
export type CostBucketKey = keyof typeof COST_BUCKETS;

export interface ItemCostDetailRecord {
  No: number;
  판매사업본부: string;
  영업조직팀: string;
  품목: string;
  매출수량: PlanActualDiff;
  매출액: PlanActualDiff;
  실적매출원가: PlanActualDiff;
  // 18 cost categories
  원재료비: PlanActualDiff;
  부재료비: PlanActualDiff;
  상품매입: PlanActualDiff;
  노무비: PlanActualDiff;
  복리후생비: PlanActualDiff;
  소모품비: PlanActualDiff;
  수도광열비: PlanActualDiff;
  수선비: PlanActualDiff;
  연료비: PlanActualDiff;
  외주가공비: PlanActualDiff;
  운반비: PlanActualDiff;
  전력비: PlanActualDiff;
  지급수수료: PlanActualDiff;
  견본비: PlanActualDiff;
  제조변동비소계: PlanActualDiff;
  제조고정노무비: PlanActualDiff;
  감가상각비: PlanActualDiff;
  기타경비: PlanActualDiff;
  // Summary
  제조변동비: PlanActualDiff;
  제조고정비: PlanActualDiff;
  매출총이익: PlanActualDiff;
  공헌이익: PlanActualDiff;
}

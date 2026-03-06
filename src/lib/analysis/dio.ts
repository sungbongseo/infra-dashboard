import type { InventoryMovementRecord } from "@/types";

/**
 * DIO (Days Inventory Outstanding) 계산
 * 전 공장 합산, 품목계정그룹 === "제품" 필터 (완제품 재고만)
 *
 * DIO = (평균재고 / 출고금액) x 365
 * 평균재고 = (기초금액합 + 기말금액합) / 2
 */
export function calcDIO(
  inventoryData: Map<string, InventoryMovementRecord[]>
): number {
  let totalOpening = 0;
  let totalClosing = 0;
  let totalIssued = 0;

  for (const [, records] of Array.from(inventoryData.entries())) {
    for (const r of records) {
      if (r.품목계정그룹 !== "제품") continue;
      totalOpening += r.기초금액;
      totalClosing += r.기말금액;
      totalIssued += r.출고금액;
    }
  }

  if (totalIssued <= 0) return 0;

  const avgInventory = (totalOpening + totalClosing) / 2;
  const dio = (avgInventory / totalIssued) * 365;

  return isFinite(dio) ? Math.round(dio) : 0;
}

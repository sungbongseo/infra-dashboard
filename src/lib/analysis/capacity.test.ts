import { describe, it, expect } from "vitest";
import {
  suggestItemCapacity,
  suggestFactoryCapacity,
  calcCapacityAlert,
  latestMonthlyOutput,
  type CapacityConfig,
} from "./capacity";
import type { InventoryMovementRecord } from "@/types/inventory";

function mkInv(overrides: Partial<InventoryMovementRecord>): InventoryMovementRecord {
  return {
    factory: "옥천",
    month: "202601",
    no: 1,
    품목: "A001",
    품목명: "Test Item",
    규격: "",
    세부규격: "",
    품목그룹: "",
    품목계정그룹: "제품",
    자재유형: "",
    주거래처: "",
    대분류: "",
    중분류: "",
    소분류: "",
    단위: "ROL",
    기초: 0,
    입고: 0,
    출고: 0,
    기말: 0,
    ...overrides,
  };
}

describe("capacity", () => {
  describe("suggestItemCapacity", () => {
    it("월별 max 출고 + 10% 버퍼", () => {
      const records = [
        mkInv({ month: "202601", 품목: "A001", 출고: 100 }),
        mkInv({ month: "202602", 품목: "A001", 출고: 200 }), // max
        mkInv({ month: "202603", 품목: "A001", 출고: 150 }),
      ];
      const r = suggestItemCapacity(records, "A001");
      expect(r).not.toBeNull();
      expect(r!.monthlyMax).toBe(200);
      expect(r!.suggested).toBe(220); // 200 * 1.10
      expect(r!.samples).toBe(3);
    });
    it("해당 품목 없으면 null", () => {
      const records = [mkInv({ 품목: "B001" })];
      expect(suggestItemCapacity(records, "A001")).toBeNull();
    });
    it("버퍼 조정", () => {
      const records = [mkInv({ month: "202601", 품목: "A001", 출고: 100 })];
      expect(suggestItemCapacity(records, "A001", 0.20)!.suggested).toBe(120);
    });
    it("출고 0만 있으면 null", () => {
      const records = [mkInv({ 품목: "A001", 출고: 0 })];
      expect(suggestItemCapacity(records, "A001")).toBeNull();
    });
  });

  describe("suggestFactoryCapacity", () => {
    it("공장별 월별 총출고량 합산", () => {
      const records = [
        mkInv({ factory: "옥천", month: "202601", 품목: "A", 출고: 100 }),
        mkInv({ factory: "옥천", month: "202601", 품목: "B", 출고: 50 }),
        mkInv({ factory: "옥천", month: "202602", 품목: "A", 출고: 200 }),
      ];
      const r = suggestFactoryCapacity(records, "옥천");
      expect(r!.monthlyMax).toBe(200); // 202602 합계
      expect(r!.suggested).toBe(220);
    });
  });

  describe("calcCapacityAlert", () => {
    const cfg: CapacityConfig = {
      itemCode: "A001",
      monthlyCapacity: 1000,
      stepUpFixedCost: 50_000_000,
      stepUpGranularity: 500,
    };
    it("ok: < 80%", () => {
      const r = calcCapacityAlert(500, 100, cfg);
      expect(r.breachLevel).toBe("ok");
      expect(r.usagePct).toBeCloseTo(0.6, 2);
      expect(r.additionalFixedCost).toBe(0);
    });
    it("caution: 80-90%", () => {
      const r = calcCapacityAlert(700, 150, cfg);
      expect(r.breachLevel).toBe("caution");
      expect(r.usagePct).toBeCloseTo(0.85, 2);
    });
    it("warning: 90-100%", () => {
      const r = calcCapacityAlert(700, 250, cfg);
      expect(r.breachLevel).toBe("warning");
    });
    it("severe: ≥ 100%, Step-up 고정비 계산", () => {
      const r = calcCapacityAlert(700, 600, cfg); // 총 1300, 초과 300
      expect(r.breachLevel).toBe("severe");
      expect(r.excessQty).toBe(300);
      expect(r.newLinesNeeded).toBe(1); // ceil(300/500)=1
      expect(r.additionalFixedCost).toBe(50_000_000);
    });
    it("severe: 다중 라인 필요", () => {
      const r = calcCapacityAlert(0, 1600, cfg); // 초과 600 → 2라인
      expect(r.newLinesNeeded).toBe(2);
      expect(r.additionalFixedCost).toBe(100_000_000);
    });
    it("capacity=0 방어", () => {
      const r = calcCapacityAlert(100, 50, { ...cfg, monthlyCapacity: 0 });
      expect(r.usagePct).toBe(0);
      expect(r.breachLevel).toBe("ok");
    });
    it("음수 입력 방어 (Math.max 0)", () => {
      const r = calcCapacityAlert(-100, -50, cfg);
      expect(r.usagePct).toBe(0);
    });
    it("granularity=0이면 기본값 1 처리 (divide by zero 회피)", () => {
      const r = calcCapacityAlert(0, 2000, { ...cfg, stepUpGranularity: 0 });
      expect(Number.isFinite(r.newLinesNeeded)).toBe(true);
    });
  });

  describe("latestMonthlyOutput", () => {
    it("가장 최신월의 총 출고량", () => {
      const records = [
        mkInv({ month: "202601", 품목: "A001", 출고: 100 }),
        mkInv({ month: "202603", 품목: "A001", 출고: 50 }),
        mkInv({ month: "202603", 품목: "A001", 출고: 80 }),
      ];
      expect(latestMonthlyOutput(records, "A001")).toBe(130); // 202603 합계 50+80
    });
    it("출고 없으면 0", () => {
      expect(latestMonthlyOutput([], "A001")).toBe(0);
    });
  });
});

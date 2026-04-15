import { describe, it, expect } from "vitest";
import {
  buildItemCodeMap,
  calcThreeWayComparison,
  calcFactoryVariance,
  calcCostDriverBreakdown,
  normalizeItemName,
  lookupItemCode,
} from "./costTrueVariance";
import { normalizeFactoryName } from "../excel/schemas";
import type {
  CustomerItemDetailRecord,
  ItemProfitabilityRecord,
  StandardCostBookRecord,
  ManufacturingCostRecord,
  PlanActualDiff,
} from "@/types";

// ─── Test Helpers ──────────────────────────────────

const pad = (v: number): PlanActualDiff => ({ 계획: v, 실적: v, 차이: 0 });
const pad0 = (): PlanActualDiff => ({ 계획: 0, 실적: 0, 차이: 0 });

function makeCustItem(overrides: Partial<{
  itemName: string;
  factory: string;
  month: string;
  qty: number;
  revenue: number;
}> = {}): CustomerItemDetailRecord {
  const { itemName = "테스트품목", factory = "양산", month = "202602", qty = 100, revenue = 1000000 } = overrides;
  return {
    No: 1,
    영업조직팀: "Infra",
    영업담당사번: "E001",
    매출거래처: "C001",
    매출거래처명: "거래처A",
    품목: itemName,
    품목명: itemName,
    거래처대분류: "",
    거래처중분류: "",
    거래처소분류: "",
    제품군: "",
    매출연월: month,
    계정구분: "P1",
    매출유형: "",
    품목군: "",
    중분류코드: "",
    공장: factory,
    제품내수매출: pad0(),
    제품수출매출: pad0(),
    매출수량: pad(qty),
    환산수량: pad0(),
    매출액: pad(revenue),
    실적매출원가: pad(revenue * 0.7),
    상품매입: pad0(),
    매출총이익: pad(revenue * 0.3),
    판매관리비: pad0(),
    판관변동_직접판매운반비: pad0(),
    영업이익: pad(revenue * 0.2),
    매출총이익율: pad0(),
    영업이익율: pad0(),
  } as any;
}

function makeStdCost(overrides: Partial<{
  factory: string;
  code: string;
  name: string;
  cost: number;
}> = {}): StandardCostBookRecord {
  const { factory = "양산", code = "ASCJ1021056", name = "테스트품목", cost = 5000 } = overrides;
  return {
    factory,
    품목코드: code,
    품목명: name,
    품목계정그룹: "제품",
    기본단위: "BAG",
    규격: "",
    표준원가: cost,
    유효시작: "2026-03-31",
    유효종료: "9999-12-31",
  };
}

function makeMfgCost(overrides: Partial<{
  factory: string;
  code: string;
  name: string;
  qty: number;
  totalVC: number;
  totalFC: number;
}> = {}): ManufacturingCostRecord {
  const { factory = "양산", code = "ASCJ1021056", name = "테스트품목", qty = 100, totalVC = 400000, totalFC = 200000 } = overrides;
  return {
    factory,
    공장명원본: `${factory}공장`,
    period: "2026-Q1",
    생산품코드: code,
    생산품명: name,
    품목그룹: "제품",
    대분류: "방수",
    중분류: "",
    소분류: "",
    기준단위: "BAG",
    생산입고수량: qty,
    환산수량: qty,
    원재료비: totalVC * 0.5, 부재료비: totalVC * 0.2, 상품매입: 0,
    노무비: totalVC * 0.1, 복리후생비: 0, 소모품비: 0, 수도광열비: 0,
    수선비: 0, 연료비: 0, 외주가공비: totalVC * 0.1, 운반비: 0, 전력비: 0,
    지급수수료: 0, 견본비: 0,
    고정노무비: totalFC * 0.4, 감가상각비: totalFC * 0.4, 기타경비: totalFC * 0.2,
    totalVariableCost: totalVC,
    totalFixedCost: totalFC,
    actualUnitCost: (totalVC + totalFC) / qty,
    bomLineCount: 1,
  };
}

function makeItemProfit(name: string, code: string): ItemProfitabilityRecord {
  return {
    판매사업부: "Infra",
    영업조직팀: "Infra",
    대분류: "방수",
    중분류: "",
    소분류: "",
    품목계정그룹: "제품",
    품목: `[${code}] ${name}`,
    기준단위: "BAG",
    계정구분: "P1",
    매출수량: 0, 매출액: 0, 매출단가: 0,
    표준매출원가: 0, 실적매출원가: 0, 매출원가율: 0,
    매출총이익: 0, 매출총이익율: 0, 영업이익: 0,
    직접판매운반비: 0, 판매관리비: 0, 영업이익율: 0,
    원재료비: 0, 부재료비: 0, 상품매입: 0, 노무비: 0,
    복리후생비: 0, 소모품비: 0, 수도광열비: 0, 수선비: 0,
    연료비: 0, 외주가공비: 0, 운반비: 0, 전력비: 0,
    지급수수료: 0, 견본비: 0,
    제조고정노무비: 0, 감가상각비: 0, 기타경비: 0,
  };
}

// ─── Tests ───────────────────────────────────────

describe("costTrueVariance", () => {
  describe("buildItemCodeMap", () => {
    it("200 보고서 품목명 → 코드 매핑", () => {
      const data = [
        makeItemProfit("테스트품목A", "CODE001"),
        makeItemProfit("테스트품목B", "CODE002"),
      ];
      const map = buildItemCodeMap(data);
      expect(map.get("테스트품목A")).toBe("CODE001");
      expect(map.get("테스트품목B")).toBe("CODE002");
      // Fuzzy matching으로 정규화 엔트리도 병합됨 — 최소 2개 (원본) 이상
      expect(map.size).toBeGreaterThanOrEqual(2);
    });

    it("대괄호 없는 품목명은 매핑 안 됨", () => {
      const data: ItemProfitabilityRecord[] = [
        { ...makeItemProfit("noBracket", "X"), 품목: "괄호없는품목" },
      ];
      const map = buildItemCodeMap(data);
      expect(map.size).toBe(0);
    });
  });

  describe("normalizeFactoryName", () => {
    it("한글 공장명 정규화", () => {
      expect(normalizeFactoryName("청산공장(옥천)")).toBe("청산");
      expect(normalizeFactoryName("양산공장")).toBe("양산");
      expect(normalizeFactoryName("울산공장")).toBe("울산");
      expect(normalizeFactoryName("용산본사(석유)")).toBe("용산");
      expect(normalizeFactoryName("")).toBe("unknown");
    });

    it("SAP 공장 코드 정규화 (100 보고서 ↔ 표준원가/제조원가 브릿지)", () => {
      // 100 보고서 col 28의 숫자 코드를 표준원가/제조원가와 동일한 한글로 변환
      expect(normalizeFactoryName("0000")).toBe("용산");
      expect(normalizeFactoryName("1000")).toBe("울산");
      expect(normalizeFactoryName("2000")).toBe("청산");
      expect(normalizeFactoryName("4000")).toBe("양산");
      // 공백 포함
      expect(normalizeFactoryName(" 2000 ")).toBe("청산");
    });
  });

  describe("normalizeItemName + Fuzzy matching", () => {
    it("괄호 접미사와 공백 차이를 흡수", () => {
      expect(normalizeItemName("AP-5 /BULK(상품)")).toBe(normalizeItemName("AP-5/BULK"));
      expect(normalizeItemName("RA7 콤파운드(침적)")).toBe(normalizeItemName("RA7 콤파운드"));
      expect(normalizeItemName("  경유/bulk  ")).toBe(normalizeItemName("경유 / bulk"));
    });

    it("대소문자 차이 흡수", () => {
      expect(normalizeItemName("AP-5")).toBe(normalizeItemName("ap-5"));
    });

    it("빈 값은 빈 문자열 반환", () => {
      expect(normalizeItemName("")).toBe("");
      expect(normalizeItemName("   ")).toBe("");
    });

    it("lookupItemCode: 원본 매칭 우선, 실패 시 Fuzzy 시도", () => {
      const stdBook = [
        { factory: "양산", 품목코드: "TEST_CODE", 품목명: "AP-5/BULK",
          품목계정그룹: "제품", 기본단위: "BAG", 규격: "", 표준원가: 1000,
          유효시작: "", 유효종료: "" },
      ];
      const map = buildItemCodeMap([], stdBook);
      expect(lookupItemCode(map, "AP-5/BULK")).toBe("TEST_CODE");
      // Fuzzy: 괄호 접미사 + 공백 차이
      expect(lookupItemCode(map, "AP-5 /BULK(상품)")).toBe("TEST_CODE");
      expect(lookupItemCode(map, "AP-5 / BULK ")).toBe("TEST_CODE");
      // 완전 다른 이름은 null
      expect(lookupItemCode(map, "다른품목")).toBeNull();
    });
  });

  describe("표준원가 매핑 제품 필터", () => {
    it("원재료/부재료는 매핑에서 제외 (동명 제품 충돌 방지)", () => {
      // 같은 이름의 원재료와 제품이 있을 때 제품 코드만 선택되어야 함
      const stdBook: StandardCostBookRecord[] = [
        // 원재료 먼저 등장 (순서가 첫 매칭 우선)
        { factory: "양산", 품목코드: "RAW_CODE", 품목명: "공통명",
          품목계정그룹: "원재료", 기본단위: "KG", 규격: "", 표준원가: 100,
          유효시작: "", 유효종료: "" },
        { factory: "양산", 품목코드: "PROD_CODE", 품목명: "공통명",
          품목계정그룹: "제품", 기본단위: "BAG", 규격: "", 표준원가: 5000,
          유효시작: "", 유효종료: "" },
      ];
      const map = buildItemCodeMap([], stdBook);
      // 원재료 제외 → 제품 코드만 매핑
      expect(map.get("공통명")).toBe("PROD_CODE");
    });

    it("상품도 제품과 함께 매핑 (판매 대상)", () => {
      const stdBook: StandardCostBookRecord[] = [
        { factory: "양산", 품목코드: "GOODS01", 품목명: "상품A",
          품목계정그룹: "상품", 기본단위: "EA", 규격: "", 표준원가: 1000,
          유효시작: "", 유효종료: "" },
      ];
      const map = buildItemCodeMap([], stdBook);
      expect(map.get("상품A")).toBe("GOODS01");
    });
  });

  describe("공장 매칭 출처 추적 (M-3W-03)", () => {
    it("공장 직접 매칭 시 매출 공장 기록", () => {
      const custItem = [makeCustItem({ itemName: "X", factory: "양산", qty: 10, revenue: 70000 })];
      const stdBook = [makeStdCost({ factory: "양산", code: "XCODE", name: "X", cost: 5000 })];
      const mfgCost = [makeMfgCost({ factory: "양산", code: "XCODE", name: "X", qty: 10, totalVC: 40000, totalFC: 20000 })];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("X", "XCODE")],
        standardCostBook: stdBook,
        manufacturingCost: mfgCost,
      });
      expect(result.rows[0].standardCostFactory).toBe("양산");
      expect(result.rows[0].actualCostFactory).toBe("양산");
    });

    it("fallback average — 공장 간 평균 적용 + 출처 라벨", () => {
      // 매출은 울산, 표준원가는 양산(1000) + 청산(2000) → average = 1500, 라벨 "평균(양산+청산)"
      const custItem = [makeCustItem({ itemName: "Z", factory: "울산", qty: 10, revenue: 30000 })];
      const stdBook = [
        makeStdCost({ factory: "양산", code: "ZCODE", name: "Z", cost: 1000 }),
        makeStdCost({ factory: "청산", code: "ZCODE", name: "Z", cost: 2000 }),
      ];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("Z", "ZCODE")],
        standardCostBook: stdBook,
        manufacturingCost: [],
        fallbackStrategy: "average",
      });
      expect(result.rows[0].standardCost).toBe(1500);
      expect(result.rows[0].standardCostFactory).toBe("평균(양산+청산)");
    });

    it("fallback first — 첫 매칭 공장의 원가 선택 (이전 동작)", () => {
      const custItem = [makeCustItem({ itemName: "Z", factory: "울산", qty: 10, revenue: 30000 })];
      const stdBook = [
        makeStdCost({ factory: "양산", code: "ZCODE", name: "Z", cost: 1000 }),
        makeStdCost({ factory: "청산", code: "ZCODE", name: "Z", cost: 2000 }),
      ];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("Z", "ZCODE")],
        standardCostBook: stdBook,
        manufacturingCost: [],
        fallbackStrategy: "first",
      });
      expect(result.rows[0].standardCost).toBe(1000); // 첫 공장(양산)
      expect(result.rows[0].standardCostFactory).toBe("양산");
    });

    it("공장 직접 매칭 우선 (fallback 발동 안 함)", () => {
      const custItem = [makeCustItem({ itemName: "Y", factory: "양산", qty: 10, revenue: 70000 })];
      const stdBook = [
        makeStdCost({ factory: "양산", code: "YCODE", name: "Y", cost: 5000 }),
        makeStdCost({ factory: "청산", code: "YCODE", name: "Y", cost: 6000 }),
      ];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("Y", "YCODE")],
        standardCostBook: stdBook,
        manufacturingCost: [],
        fallbackStrategy: "average", // average지만 직접 매칭 우선
      });
      expect(result.rows[0].standardCost).toBe(5000);
      expect(result.rows[0].standardCostFactory).toBe("양산");
    });
  });

  describe("calcThreeWayComparison", () => {
    it("3-Way 완전 매칭 시 3개 변동률 모두 계산", () => {
      const custItem = [
        makeCustItem({ itemName: "테스트품목", factory: "양산", month: "202602", qty: 100, revenue: 700000 }),
      ];
      const itemProfit = [makeItemProfit("테스트품목", "ASCJ1021056")];
      const stdBook = [makeStdCost({ factory: "양산", code: "ASCJ1021056", cost: 5000 })];
      const mfgCost = [makeMfgCost({ factory: "양산", code: "ASCJ1021056", qty: 100, totalVC: 400000, totalFC: 200000 })];

      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: itemProfit,
        standardCostBook: stdBook,
        manufacturingCost: mfgCost,
      });

      expect(result.rows.length).toBe(1);
      const row = result.rows[0];
      expect(row.avgSalesPrice).toBe(7000); // 700000/100
      expect(row.standardCost).toBe(5000);
      expect(row.actualUnitCost).toBe(6000); // (400000+200000)/100
      expect(row.hasStandard).toBe(true);
      expect(row.hasManufacturing).toBe(true);
      // 판매-표준: (7000-5000)/7000 = 28.57%
      expect(row.salesVsStdMarginPct).toBeCloseTo(28.57, 1);
      // 판매-실제: (7000-6000)/7000 = 14.29%
      expect(row.salesVsActualMarginPct).toBeCloseTo(14.29, 1);
      // 표준-실제: (6000-5000)/5000 = 20%
      expect(row.stdVsActualVariancePct).toBeCloseTo(20, 1);
      // 마진 영향: (6000-5000) × 100 = 100000 (표준 대비 추가 발생 원가)
      expect(row.marginVarianceImpact).toBe(100000);
      expect(row.salesImpact).toBe(100000); // deprecated 호환성
      expect(result.coverage.threeWayMatched).toBe(1);
    });

    it("Q1 기간 필터 — 202601~202603만 포함", () => {
      const custItem = [
        makeCustItem({ itemName: "품목A", month: "202602", qty: 50, revenue: 300000 }),
        makeCustItem({ itemName: "품목A", month: "202605", qty: 100, revenue: 600000 }), // Q2 — 제외
      ];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("품목A", "CA")],
        standardCostBook: [],
        manufacturingCost: [],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].salesQty).toBe(50); // Q2 제외
      expect(result.rows[0].salesAmount).toBe(300000);
    });

    it("표준 없음, 제조 있음 → 2-Way", () => {
      const custItem = [makeCustItem({ itemName: "울산품목", factory: "울산" })];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("울산품목", "U001")],
        standardCostBook: [], // 울산 표준원가 없음
        manufacturingCost: [makeMfgCost({ factory: "울산", code: "U001" })],
      });
      expect(result.rows[0].hasStandard).toBe(false);
      expect(result.rows[0].hasManufacturing).toBe(true);
      expect(result.rows[0].note).toMatch(/표준 미등록/);
      expect(result.coverage.twoWayMatched).toBe(1);
    });

    it("품목 매핑 실패 시 warnings 수집", () => {
      const custItem = [makeCustItem({ itemName: "매핑안됨" })];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [], // 매핑 맵 비어있음
        standardCostBook: [],
        manufacturingCost: [],
      });
      expect(result.coverage.mappingFailed).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("매핑 실패"))).toBe(true);
    });

    it("Q1 월별 합산 — 여러 달 데이터 정확히 합산", () => {
      const custItem = [
        makeCustItem({ itemName: "QTR", month: "202601", qty: 30, revenue: 210000 }),
        makeCustItem({ itemName: "QTR", month: "202602", qty: 40, revenue: 280000 }),
        makeCustItem({ itemName: "QTR", month: "202603", qty: 30, revenue: 210000 }),
      ];
      const result = calcThreeWayComparison({
        customerItemDetail: custItem,
        itemProfitability: [makeItemProfit("QTR", "Q001")],
        standardCostBook: [],
        manufacturingCost: [],
      });
      expect(result.rows[0].salesQty).toBe(100);
      expect(result.rows[0].salesAmount).toBe(700000);
      expect(result.rows[0].avgSalesPrice).toBe(7000);
    });
  });

  describe("calcFactoryVariance (H-3W-01: 매출액 가중평균)", () => {
    it("공장별 변동률 — 매출액 가중평균 (단순 평균이 아님)", () => {
      const rows: any[] = [
        { itemCode: "A", itemName: "A", factory: "양산", salesQty: 100, salesAmount: 700000, avgSalesPrice: 7000,
          standardCost: 5000, hasStandard: true, standardCostFactory: "양산",
          actualUnitCost: 6000, hasManufacturing: true, actualCostFactory: "양산",
          salesVsStdMarginPct: 28, salesVsActualMarginPct: 14, stdVsActualVariancePct: 20,
          marginVarianceImpact: 100000, salesImpact: 100000, note: "" },
        { itemCode: "B", itemName: "B", factory: "양산", salesQty: 50, salesAmount: 300000, avgSalesPrice: 6000,
          standardCost: 4000, hasStandard: true, standardCostFactory: "양산",
          actualUnitCost: 4500, hasManufacturing: true, actualCostFactory: "양산",
          salesVsStdMarginPct: 33, salesVsActualMarginPct: 25, stdVsActualVariancePct: 12.5,
          marginVarianceImpact: 25000, salesImpact: 25000, note: "" },
      ];
      const result = calcFactoryVariance(rows);
      expect(result.length).toBe(1);
      expect(result[0].factory).toBe("양산");
      expect(result[0].itemCount).toBe(2);
      // 매출액 가중: (20×700000 + 12.5×300000) / 1000000 = 17.75
      expect(result[0].avgVariancePct).toBeCloseTo(17.75, 2);
      // 단순 평균(참고): (20+12.5)/2 = 16.25
      expect(result[0].simpleAvgVariancePct).toBeCloseTo(16.25, 1);
      expect(result[0].totalMarginVarianceImpact).toBe(125000);
      expect(result[0].totalSalesImpact).toBe(125000); // deprecated 호환
      expect(result[0].totalSalesAmount).toBe(1000000);
    });

    it("매출액 0인 행은 가중평균에서 제외", () => {
      const rows: any[] = [
        { itemCode: "A", itemName: "A", factory: "양산", salesQty: 100, salesAmount: 0,
          avgSalesPrice: 0, standardCost: 5000, hasStandard: true, standardCostFactory: "양산",
          actualUnitCost: 6000, hasManufacturing: true, actualCostFactory: "양산",
          salesVsStdMarginPct: null, salesVsActualMarginPct: null,
          stdVsActualVariancePct: 100, marginVarianceImpact: 0, salesImpact: 0, note: "" },
        { itemCode: "B", itemName: "B", factory: "양산", salesQty: 50, salesAmount: 300000,
          avgSalesPrice: 6000, standardCost: 4000, hasStandard: true, standardCostFactory: "양산",
          actualUnitCost: 4500, hasManufacturing: true, actualCostFactory: "양산",
          salesVsStdMarginPct: 33, salesVsActualMarginPct: 25, stdVsActualVariancePct: 10,
          marginVarianceImpact: 25000, salesImpact: 25000, note: "" },
      ];
      const result = calcFactoryVariance(rows);
      // 매출 0 행 제외 → 10% 단일만 포함
      expect(result[0].avgVariancePct).toBeCloseTo(10, 1);
    });
  });

  describe("calcCostDriverBreakdown", () => {
    it("원가 구성 분석 — 주요 원인 식별", () => {
      const mfg = [
        makeMfgCost({ code: "RM_HEAVY", qty: 100, totalVC: 800000, totalFC: 200000 }),
      ];
      const result = calcCostDriverBreakdown(mfg, 10);
      expect(result.length).toBe(1);
      const d = result[0];
      // 원재료 = 400000 (50% of 800000), totalCost = 1000000
      expect(d.원재료비Pct).toBeCloseTo(40, 1);
      expect(d.dominantDriver).toBe("원재료비");
    });
  });
});

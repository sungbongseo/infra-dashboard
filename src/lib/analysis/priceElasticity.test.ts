import { describe, it, expect } from "vitest";
import {
  olsLogLinear,
  trimOutlierPED,
  industryFallbackPED,
  extractItemObservations,
  categoryAveragePED,
  estimatePED,
  applyPED,
  pedSummaryLabel,
  PED_TRIM,
  type PEDObservation,
} from "./priceElasticity";
import type { ItemProfitabilityRecord } from "@/types/itemCost";

// ─── Helper ──────────────────────────────────────────────

function mkRecord(overrides: Partial<ItemProfitabilityRecord>): ItemProfitabilityRecord {
  return {
    판매사업부: "",
    영업조직팀: "",
    대분류: "",
    중분류: "",
    소분류: "",
    품목계정그룹: "",
    품목: "A",
    기준단위: "",
    계정구분: "",
    매출수량: 0,
    매출액: 0,
    매출단가: 0,
    표준매출원가: 0,
    실적매출원가: 0,
    매출원가율: 0,
    매출총이익: 0,
    매출총이익율: 0,
    영업이익: 0,
    ...overrides,
  } as ItemProfitabilityRecord;
}

function makeObservations(prices: number[], qtys: number[]): PEDObservation[] {
  return prices.map((p, i) => ({ month: `2025${String(i + 1).padStart(2, "0")}`, unitPrice: p, quantity: qtys[i] }));
}

// ─── OLS ─────────────────────────────────────────────────

describe("olsLogLinear", () => {
  it("완벽 탄력성 -1.0 (log 선형)", () => {
    // Q = 1000 / P → PED = -1
    const obs = makeObservations([100, 200, 400, 800, 1600, 3200], [10, 5, 2.5, 1.25, 0.625, 0.3125]);
    const r = olsLogLinear(obs);
    expect(r).not.toBeNull();
    expect(r!.beta).toBeCloseTo(-1.0, 2);
    expect(r!.r2).toBeGreaterThan(0.99);
  });
  it("완벽 비탄력성 0", () => {
    const obs = makeObservations([100, 200, 400, 800], [1000, 1000, 1000, 1000]);
    const r = olsLogLinear(obs);
    expect(r!.beta).toBeCloseTo(0, 3);
  });
  it("샘플 < 3 → null", () => {
    expect(olsLogLinear(makeObservations([100, 200], [10, 5]))).toBeNull();
  });
  it("판가 변동 0 → null", () => {
    const obs = makeObservations([100, 100, 100, 100, 100], [10, 20, 15, 12, 18]);
    expect(olsLogLinear(obs)).toBeNull();
  });
  it("0/음수 값 필터링", () => {
    const obs = makeObservations([100, 0, -50, 200, 400], [10, 5, 2, 5, 2.5]);
    const r = olsLogLinear(obs);
    expect(r).not.toBeNull();
  });
});

// ─── 이상치 트림 ──────────────────────────────────────────

describe("trimOutlierPED", () => {
  it("정상 범위 유지", () => {
    expect(trimOutlierPED(-1.5).wasOutlier).toBe(false);
    expect(trimOutlierPED(-0.5).wasOutlier).toBe(false);
  });
  it("양수 PED → 0으로 트림", () => {
    const r = trimOutlierPED(0.5);
    expect(r.trimmed).toBe(PED_TRIM.max);
    expect(r.wasOutlier).toBe(true);
    expect(r.reason).toContain("역상관");
  });
  it("-5 미만 → -5로 클램핑", () => {
    const r = trimOutlierPED(-8);
    expect(r.trimmed).toBe(PED_TRIM.min);
    expect(r.wasOutlier).toBe(true);
  });
  it("NaN/Infinity 방어", () => {
    expect(trimOutlierPED(NaN).wasOutlier).toBe(true);
    expect(trimOutlierPED(Infinity).wasOutlier).toBe(true);
  });
});

// ─── 업계 벤치마크 ────────────────────────────────────────

describe("industryFallbackPED", () => {
  it("아스팔트 대분류 부분일치", () => {
    expect(industryFallbackPED("아스팔트제품")).toBe(-0.8);
  });
  it("부재료 대분류", () => {
    expect(industryFallbackPED("부재료")).toBe(-1.5);
  });
  it("기타/미매칭 → 기본", () => {
    expect(industryFallbackPED("존재하지 않는")).toBe(-1.0);
  });
});

// ─── 관측 추출 ────────────────────────────────────────────

describe("extractItemObservations", () => {
  it("월별 단가·수량 쌍 추출", () => {
    const records = [
      mkRecord({ 품목: "A", month: "202501", 매출단가: 100, 매출수량: 50 }),
      mkRecord({ 품목: "A", month: "202502", 매출단가: 110, 매출수량: 45 }),
      mkRecord({ 품목: "B", month: "202501", 매출단가: 200, 매출수량: 20 }),
    ];
    const obs = extractItemObservations(records, "A");
    expect(obs).toHaveLength(2);
    expect(obs[0].unitPrice).toBe(100);
  });
});

// ─── 대분류 폴백 ──────────────────────────────────────────

describe("categoryAveragePED", () => {
  it("대분류 평균 계산", () => {
    // 2개 품목 각각 PED=-1.0, -0.8 → 평균 -0.9
    const records: ItemProfitabilityRecord[] = [];
    ["202501", "202502", "202503", "202504", "202505", "202506"].forEach((m, i) => {
      records.push(mkRecord({ 품목: "X", 대분류: "Cat1", month: m, 매출단가: 100 * (1 + i * 0.1), 매출수량: 100 / (1 + i * 0.1) }));
      records.push(mkRecord({ 품목: "Y", 대분류: "Cat1", month: m, 매출단가: 200 * (1 + i * 0.08), 매출수량: 200 / Math.pow(1 + i * 0.08, 0.8) }));
    });
    const r = categoryAveragePED(records, "Cat1");
    expect(r).not.toBeNull();
    expect(r!.samples).toBe(2);
    expect(r!.ped).toBeLessThan(0);
    expect(r!.ped).toBeGreaterThan(-2);
  });
});

// ─── 메인 estimatePED ─────────────────────────────────────

describe("estimatePED", () => {
  const buildItem = (item: string, category: string, prices: number[], qtys: number[]) => {
    return prices.map((p, i) =>
      mkRecord({ 품목: item, 대분류: category, month: `2025${String(i + 1).padStart(2, "0")}`,
        매출단가: p,
        매출수량: qtys[i] })
    );
  };

  it("직접 회귀 성공 (14M+high R²)", () => {
    const records = buildItem("A", "아스팔트",
      [100,110,120,130,140,150,160,170,180,190,200,210,220,230],
      [100,90,80,72,64,57,51,45,40,36,32,28,25,22],
    );
    const r = estimatePED(records, "A");
    expect(r.method).toBe("direct");
    expect(r.ped).toBeLessThan(0);
    expect(r.samples).toBe(14);
    expect(r.confidence).toBe("high");
  });

  it("대분류 폴백 (관측 부족)", () => {
    const records = [
      // 대상 품목 A: 관측 부족 (2개월)
      ...buildItem("A", "부재료", [100, 110], [50, 45]),
      // 같은 대분류 B, C: 충분
      ...buildItem("B", "부재료",
        [100,110,120,130,140,150,160],
        [100,91,83,75,68,62,57]),
      ...buildItem("C", "부재료",
        [200,220,240,260,280,300,320],
        [200,181,163,147,132,119,107]),
    ];
    const r = estimatePED(records, "A");
    expect(r.method).toBe("category_fallback");
    expect(r.category).toBe("부재료");
  });

  it("업계 벤치마크 폴백 (관측 0)", () => {
    const records = [mkRecord({ 품목: "OTHER", 대분류: "아스팔트" })];
    const r = estimatePED(records, "A"); // A 자체는 없음
    expect(r.method).toBe("industry_fallback");
    expect(r.ped).toBe(-1.0); // 기본
  });

  it("이상 PED 트림 적용", () => {
    // 인위적 양의 상관 (판가↑ 수량↑)
    const records = buildItem("A", "기타",
      [100,120,140,160,180,200],
      [50,60,70,80,90,100],
    );
    const r = estimatePED(records, "A");
    expect(r.wasTrimmed).toBe(true);
    expect(r.ped).toBe(0); // max로 트림
  });
});

// ─── applyPED ─────────────────────────────────────────────

describe("applyPED", () => {
  it("PED=-1: 판가 +10% → 수량 -9.09%", () => {
    const newQty = applyPED(100, 10, -1);
    expect(newQty).toBeCloseTo(100 / 1.1, 2);
  });
  it("PED=0: 수량 불변", () => {
    expect(applyPED(100, 20, 0)).toBeCloseTo(100, 2);
  });
  it("PED=-0.5 (비탄력): 판가 -10% → 수량 +5.4%", () => {
    const newQty = applyPED(100, -10, -0.5);
    expect(newQty).toBeCloseTo(100 * Math.pow(0.9, -0.5), 2);
    expect(newQty).toBeGreaterThan(100);
  });
  it("baseQty 0 → 0", () => {
    expect(applyPED(0, 10, -1)).toBe(0);
  });
  it("극단 방어: priceChangePct < -100 → 기존 수량 유지", () => {
    expect(applyPED(100, -150, -1)).toBe(100);
  });
});

// ─── 요약 라벨 ────────────────────────────────────────────

describe("pedSummaryLabel", () => {
  it("direct high 신뢰도", () => {
    const label = pedSummaryLabel({
      itemCode: "A", ped: -1.23, pedRaw: -1.23, wasTrimmed: false,
      r2: 0.68, stderr: 0.1, samples: 14, confidence: "high", method: "direct", notes: [],
    });
    expect(label).toContain("-1.23");
    expect(label).toContain("R²=0.68");
    expect(label).toContain("신뢰도 높음");
  });
  it("category_fallback 태그", () => {
    const label = pedSummaryLabel({
      itemCode: "A", ped: -0.9, pedRaw: -0.9, wasTrimmed: false,
      r2: 0, stderr: 0, samples: 3, confidence: "low", method: "category_fallback", notes: [],
    });
    expect(label).toContain("대분류 추정");
  });
});

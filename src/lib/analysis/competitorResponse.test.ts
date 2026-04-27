import { describe, it, expect } from "vitest";
import {
  calcCompetitorResponse,
  calcAllPresets,
  presetLabel,
  reactionIntensityLabel,
  PRESETS,
  DEFAULT_MARKET_SHARE,
} from "./competitorResponse";

describe("calcCompetitorResponse", () => {
  describe("Cournot 시장 평균가 공식", () => {
    it("R=0 (단독): 시장가 = 자사 기존가", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 0, ped: -1 });
      expect(r.marketPrice).toBe(100);
      expect(r.marketPricePct).toBe(0);
    });
    it("R=1 (100% 보복): 시장가 = 자사 새 판가", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 1, ped: -1 });
      expect(r.marketPrice).toBe(90);
      expect(r.marketPricePct).toBeCloseTo(-10, 2);
    });
    it("R=0.5 (50% 반응): 시장가 = 가중 평균", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 0.5, ped: -1 });
      expect(r.marketPrice).toBe(95);
    });
  });

  describe("시장 수요 변화 (PED 재사용)", () => {
    it("R=1 + PED=-1 + 인하 10% → 시장 수요 ~+11.1%", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 1, ped: -1 });
      // (Pmkt1/P0)^PED = (90/100)^-1 = 1.111...
      expect(r.marketQtyPct).toBeCloseTo(11.11, 1);
    });
    it("R=0 + 자사만 인하 → 시장 수요 변화 없음 (시장가 동일)", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 80, baseQty: 1000, reactionPct: 0, ped: -1.5 });
      expect(r.marketQtyPct).toBeCloseTo(0, 2);
    });
  });

  describe("점유율 보정", () => {
    it("R=0 + 자사만 20% 인하 → 점유율 ↑", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 80, baseQty: 1000, reactionPct: 0, marketShare: 0.30, ped: -1, shareSensitivity: 0.2 });
      // shareGain = (1-0)*(0.20)*0.2 = 0.04 → newShare = 0.34
      expect(r.newShare).toBeCloseTo(0.34, 3);
    });
    it("R=1: 점유율 변화 없음", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 80, baseQty: 1000, reactionPct: 1, marketShare: 0.30, ped: -1 });
      expect(r.newShare).toBeCloseTo(0.30, 3);
    });
    it("점유율 클램핑 [0, 1]", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 50, baseQty: 1000, reactionPct: 0, marketShare: 0.95, ped: -1, shareSensitivity: 1 });
      expect(r.newShare).toBeLessThanOrEqual(1.0);
    });
  });

  describe("매출 영향", () => {
    it("R=1 (100% 보복) + 인하 → 매출 변화는 PED에만 의존 (점유율 변화 0)", () => {
      // basePrice 100, newPrice 90, R=1, PED=-1: 시장 수요 +11.1%, 점유율 동일 → 자사 수량 +11.1%
      // 매출 = 90 × 1111 = 99,990 vs 기존 100 × 1000 = 100,000 → -0.01%
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 1, marketShare: 0.30, ped: -1 });
      expect(r.revenueChangePct).toBeCloseTo(0, 0); // 약 0% (PED -1은 매출 중립)
    });
    it("R=0 + 인하 → 점유율 ↑로 매출 보전", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 0, marketShare: 0.30, ped: -1, shareSensitivity: 0.2 });
      // 시장 평균 변화 0 → 시장 수요 변화 0 → 자사 수량 = baseQty × (newShare/share)
      // shareGain = 0.10 × 0.2 = 0.02 → newShare = 0.32 → ratio = 1.067
      // 매출 = 90 × 1067 = 96,030 vs 100,000 → -3.97%
      expect(r.revenueChangePct).toBeCloseTo(-3.97, 1);
    });
  });

  describe("기본값 / 폴백", () => {
    it("PED 미지정 → 산업 폴백 -1.0", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 1 });
      expect(r.ped).toBe(-1.0);
      expect(r.notes.some(n => n.includes("PED 미지정"))).toBe(true);
    });
    it("marketShare 미지정 → 30% 기본", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 1, ped: -1 });
      expect(r.marketShare).toBe(DEFAULT_MARKET_SHARE);
    });
  });

  describe("엣지 케이스", () => {
    it("basePrice 0 → 시뮬 불가", () => {
      const r = calcCompetitorResponse({ basePrice: 0, newPrice: 90, baseQty: 1000, reactionPct: 1, ped: -1 });
      expect(r.notes.some(n => n.includes("시뮬 불가"))).toBe(true);
      expect(r.qtyChangePct).toBe(0);
    });
    it("baseQty 0 → 시뮬 불가", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 0, reactionPct: 1, ped: -1 });
      expect(r.notes.some(n => n.includes("시뮬 불가"))).toBe(true);
    });
    it("reactionPct > 1 → 1로 클램핑", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: 5, ped: -1 });
      expect(r.reactionPct).toBe(1);
    });
    it("reactionPct < 0 → 0으로 클램핑", () => {
      const r = calcCompetitorResponse({ basePrice: 100, newPrice: 90, baseQty: 1000, reactionPct: -0.5, ped: -1 });
      expect(r.reactionPct).toBe(0);
    });
  });
});

describe("calcAllPresets", () => {
  it("3 시나리오 동시 계산 + 단조성 (alone ≥ partial ≥ full에서 매출 일반적)", () => {
    const r = calcAllPresets({
      basePrice: 100, newPrice: 90, baseQty: 1000,
      marketShare: 0.30, ped: -1, shareSensitivity: 0.2,
    });
    expect(r.alone.reactionPct).toBe(0);
    expect(r.partial.reactionPct).toBe(0.5);
    expect(r.full.reactionPct).toBe(1);
    // 단독은 점유율 ↑로 매출 보전, 100% 보복은 점유율 변화 없음
    // 일반적으로 alone.revenue ≥ full.revenue
    expect(r.alone.newRevenue).toBeGreaterThanOrEqual(r.full.newRevenue * 0.95);
  });
});

describe("UI 헬퍼", () => {
  it("presetLabel 한국어", () => {
    expect(presetLabel("alone")).toContain("단독");
    expect(presetLabel("partial")).toContain("50%");
    expect(presetLabel("full")).toContain("100%");
    expect(presetLabel("custom")).toContain("사용자");
  });

  it("reactionIntensityLabel 임계값별 라벨", () => {
    expect(reactionIntensityLabel(0)).toBe("단독 결정");
    expect(reactionIntensityLabel(0.2)).toBe("약한 반응");
    expect(reactionIntensityLabel(0.5)).toBe("중간 반응");
    expect(reactionIntensityLabel(0.7)).toBe("강한 반응");
    expect(reactionIntensityLabel(1.0)).toBe("100% 보복");
  });
});

describe("PRESETS 상수", () => {
  it("3 프리셋 키와 reactionPct", () => {
    expect(PRESETS.alone.reactionPct).toBe(0);
    expect(PRESETS.partial.reactionPct).toBe(0.5);
    expect(PRESETS.full.reactionPct).toBe(1.0);
  });
});

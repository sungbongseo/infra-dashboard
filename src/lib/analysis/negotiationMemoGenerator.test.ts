import { describe, it, expect } from "vitest";
import {
  generateNegotiationMemo,
  generateBulkMemos,
} from "./negotiationMemoGenerator";
import type { CustomerCompositeRisk } from "./customerCompositeRisk";

// ─── 헬퍼: CustomerCompositeRisk mock ─────────────────

function mockRisk(overrides: Partial<CustomerCompositeRisk["metrics"]> & {
  riskScore?: number;
  category?: CustomerCompositeRisk["category"];
  거래처명?: string;
  거래처코드?: string;
  offices?: string[];
  담당자?: string;
}): CustomerCompositeRisk {
  const {
    riskScore = 70, category = "회수+단가",
    거래처명 = "테스트거래처", 거래처코드 = "C999",
    offices = ["건자재"], 담당자 = "김민식",
    ...metrics
  } = overrides;

  const fullMetrics: CustomerCompositeRisk["metrics"] = {
    totalReceivable: 0,
    creditLimit: 0,
    creditUsageRate: 0,
    longOverdueAmount: 0,
    longOverdueRatio: 0,
    deficitMonthCount: 0,
    consecutiveDeficitMonths: 0,
    totalProfit13M: 0,
    avgMarginRate: 0,
    salesQoQ: 0,
    profitQoQ: 0,
    topItemShare: 0,
    itemHHI: 0,
    topItemName: "",
    monthCount: 13,
    ...metrics,
  };

  return {
    거래처코드, 거래처명, 영업조직: "건자재팀", 담당자, offices,
    riskScore,
    components: {
      receivableScore: 25, deficitScore: 20, longOverdueScore: 15,
      creditUsageScore: 0, salesDeclineScore: 5, concentrationScore: 5,
    },
    signals: [],
    category,
    metrics: fullMetrics,
  };
}

// ─── 압박 근거 생성 ──────────────────────────────────

describe("buildPressurePoints (자동 도출)", () => {
  it("13M 모두 적자 + 장기연체 → 핵심 근거 2개 생성", () => {
    const risk = mockRisk({
      riskScore: 92,
      category: "거래중단",
      monthCount: 13,
      deficitMonthCount: 13,
      consecutiveDeficitMonths: 13,
      totalProfit13M: -105_000_000,
      avgMarginRate: -14.6,
      longOverdueAmount: 182_000_000,
      longOverdueRatio: 0.401,
      itemHHI: 1.0,
      topItemShare: 0.99,
      topItemName: "건진_(2.5mm*10m)",
    });
    const memo = generateNegotiationMemo(risk);

    expect(memo.pressurePoints.length).toBeGreaterThanOrEqual(3);
    expect(memo.pressurePoints[0]).toContain("13개월 모두 적자");
    expect(memo.pressurePoints[0]).toContain("억");

    // 장기연체 멘트
    const longText = memo.pressurePoints.find(p => p.includes("장기연체"));
    expect(longText).toBeDefined();
    expect(longText).toContain("40.1%");

    // 단일 품목 의존 멘트
    const concText = memo.pressurePoints.find(p => p.includes("단일 품목"));
    expect(concText).toBeDefined();
    expect(concText).toContain("건진_");
  });

  it("한도 95% 임박 → 한도 멘트 생성", () => {
    const risk = mockRisk({
      riskScore: 75,
      category: "회수+단가",
      totalReceivable: 571_000_000,
      creditLimit: 600_000_000,
      creditUsageRate: 0.952,
      deficitMonthCount: 12,
      monthCount: 13,
      totalProfit13M: -33_760_000,
      avgMarginRate: -2.9,
    });
    const memo = generateNegotiationMemo(risk);

    const creditText = memo.pressurePoints.find(p => p.includes("여신한도"));
    expect(creditText).toBeDefined();
    expect(creditText).toContain("95.2%");
    expect(creditText).toContain("임박");
  });

  it("매출 -53% QoQ + 영업이익 -161% → 급감 멘트", () => {
    const risk = mockRisk({
      salesQoQ: -0.538,
      profitQoQ: -1.613,
    });
    const memo = generateNegotiationMemo(risk);
    const declineText = memo.pressurePoints.find(p => p.includes("QoQ"));
    expect(declineText).toBeDefined();
    expect(declineText).toContain("급감");
    expect(declineText).toContain("추락");
  });

  it("Top 5 압박 근거 cap (너무 많이 안 나옴)", () => {
    const risk = mockRisk({
      monthCount: 13,
      deficitMonthCount: 13,
      totalProfit13M: -200_000_000,
      avgMarginRate: -20,
      longOverdueAmount: 200_000_000,
      longOverdueRatio: 0.5,
      creditUsageRate: 1.1,
      totalReceivable: 600_000_000,
      creditLimit: 500_000_000,
      salesQoQ: -0.6,
      profitQoQ: -2.0,
      itemHHI: 0.9,
      topItemShare: 0.95,
      topItemName: "테스트품목",
      offices: ["건자재", "광주", "대구"],
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.pressurePoints.length).toBeLessThanOrEqual(5);
  });
});

// ─── 협상 멘트 (Scripted Sentence) ────────────────────

describe("buildScriptedSentence", () => {
  it("거래중단 카테고리 → 거래 중단 검토 멘트", () => {
    const risk = mockRisk({
      category: "거래중단",
      riskScore: 90,
      deficitMonthCount: 13,
      monthCount: 13,
      totalProfit13M: -100_000_000,
      avgMarginRate: -15,
      longOverdueAmount: 180_000_000,
      longOverdueRatio: 0.4,
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.scriptedSentence).toContain("거래 지속");
    expect(memo.scriptedSentence).toContain("거래 중단");
  });

  it("회수+단가 → 미수 회수 + 단가 조정 멘트", () => {
    const risk = mockRisk({
      category: "회수+단가",
      totalReceivable: 500_000_000,
      creditUsageRate: 0.95,
      deficitMonthCount: 10,
      monthCount: 13,
      totalProfit13M: -30_000_000,
      avgMarginRate: -3,
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.scriptedSentence).toContain("정상화");
    expect(memo.scriptedSentence).toContain("단가");
  });

  it("정상 카테고리 → 모니터링 멘트", () => {
    const risk = mockRisk({
      category: "정상",
      riskScore: 30,
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.scriptedSentence).toContain("모니터링");
  });
});

// ─── 권장 액션 우선순위 ──────────────────────────────

describe("buildRecommendedActions", () => {
  it("장기연체 큰 거래처 → 1순위는 회수", () => {
    const risk = mockRisk({
      longOverdueRatio: 0.4,
      longOverdueAmount: 182_000_000,
      category: "거래중단",
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.recommendedActions[0].rank).toBe(1);
    expect(memo.recommendedActions[0].action).toContain("회수");
  });

  it("한도 95%+ → 1순위는 한도 정상화", () => {
    const risk = mockRisk({
      creditUsageRate: 0.96,
      totalReceivable: 580_000_000,
      longOverdueRatio: 0.05, // 적음
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.recommendedActions[0].action).toContain("회수");
    expect(memo.recommendedActions[0].action).toContain("한도");
  });

  it("적자 거래처 → 단가 인상률 자동 계산", () => {
    const risk = mockRisk({
      deficitMonthCount: 12,
      monthCount: 13,
      avgMarginRate: -14.6,
    });
    // components 덮어쓰기 (mockRisk는 metrics만 받으므로 직접 합성)
    const directRisk: CustomerCompositeRisk = {
      ...risk,
      components: {
        receivableScore: 25, deficitScore: 25, longOverdueScore: 0,
        creditUsageScore: 0, salesDeclineScore: 0, concentrationScore: 5,
      },
    };
    const memo = generateNegotiationMemo(directRisk);

    // 단가 인상 액션이 1순위 또는 2순위
    const priceAction = memo.recommendedActions.find(a =>
      a.action.includes("단가") && a.action.includes("인상")
    );
    expect(priceAction).toBeDefined();
    if (priceAction) {
      // 인상률이 +5% 이상
      expect(priceAction.action).toMatch(/\+\d+%/);
    }
  });

  it("권장 액션 ≤ 3개", () => {
    const risk = mockRisk({
      monthCount: 13,
      deficitMonthCount: 13,
      totalProfit13M: -200_000_000,
      longOverdueRatio: 0.5,
      longOverdueAmount: 200_000_000,
      creditUsageRate: 1.1,
      itemHHI: 0.9,
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.recommendedActions.length).toBeLessThanOrEqual(3);
  });
});

// ─── 1줄 요약 ──────────────────────────────────────

describe("buildOneLineSummary", () => {
  it("거래중단 → 🚨🚨 + 핵심 메트릭", () => {
    const risk = mockRisk({
      category: "거래중단",
      riskScore: 90,
      totalReceivable: 500_000_000,
      creditUsageRate: 0.85,
      deficitMonthCount: 13,
      monthCount: 13,
      longOverdueRatio: 0.4,
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.oneLineSummary).toContain("🚨🚨");
    expect(memo.oneLineSummary).toContain("90");
    expect(memo.oneLineSummary).toContain("거래중단");
  });

  it("정상 → ✅ + 안정", () => {
    const risk = mockRisk({
      category: "정상",
      riskScore: 25,
    });
    const memo = generateNegotiationMemo(risk);
    expect(memo.oneLineSummary).toContain("✅");
    expect(memo.oneLineSummary).toContain("정상");
  });
});

// ─── Bulk 생성 ─────────────────────────────────────

describe("generateBulkMemos", () => {
  it("배열 입력 → 동일 길이 배열 출력", () => {
    const risks = [
      mockRisk({ 거래처명: "거래처A", riskScore: 80 }),
      mockRisk({ 거래처명: "거래처B", riskScore: 70 }),
      mockRisk({ 거래처명: "거래처C", riskScore: 60 }),
    ];
    const memos = generateBulkMemos(risks);
    expect(memos).toHaveLength(3);
    expect(memos[0].거래처).toBe("거래처A");
    expect(memos[2].riskScore).toBe(60);
  });
});

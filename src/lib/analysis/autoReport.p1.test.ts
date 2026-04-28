import { describe, it, expect } from "vitest";
import {
  buildRiskCustomersSection,
  buildRiskCustomersReportSection,
  generateExecutiveOnePager,
  type ExecutiveReportInput,
} from "./autoReport";
import type { CustomerCompositeRisk } from "./customerCompositeRisk";

// ─── Mock CustomerCompositeRisk ───────────────────

function mockRisk(overrides: Partial<CustomerCompositeRisk["metrics"]> & {
  riskScore: number;
  category?: CustomerCompositeRisk["category"];
  거래처명?: string;
  거래처코드?: string;
}): CustomerCompositeRisk {
  const {
    riskScore, category = "회수+단가",
    거래처명 = "테스트", 거래처코드 = "C999",
    ...metrics
  } = overrides;

  return {
    거래처코드, 거래처명, 영업조직: "건자재팀", 담당자: "김민식", offices: ["건자재"],
    riskScore,
    components: {
      receivableScore: 25, deficitScore: 20, longOverdueScore: 15,
      creditUsageScore: 0, salesDeclineScore: 5, concentrationScore: 5,
    },
    signals: [],
    category,
    metrics: {
      totalReceivable: 0, creditLimit: 0, creditUsageRate: 0,
      longOverdueAmount: 0, longOverdueRatio: 0,
      deficitMonthCount: 0, consecutiveDeficitMonths: 0,
      totalProfit13M: 0, avgMarginRate: 0,
      salesQoQ: 0, profitQoQ: 0,
      topItemShare: 0, itemHHI: 0, topItemName: "",
      monthCount: 13,
      ...metrics,
    },
  };
}

const baseExecutiveInput: ExecutiveReportInput = {
  totalSales: 1_000_000_000,
  totalOrders: 800_000_000,
  totalCollections: 700_000_000,
  collectionRate: 70,
  gpRate: 25,
  opRate: 8,
  planAchievement: 95,
  dso: 45,
  salesGrowth: 5,
  topOrg: "팀A", bottomOrg: "팀B",
  atRiskCustomers: 10, totalCustomers: 100,
};

// ─── buildRiskCustomersSection ────────────────────

describe("buildRiskCustomersSection (P1-2)", () => {
  it("빈 입력 → 빈 결과", () => {
    expect(buildRiskCustomersSection([], 5)).toEqual([]);
  });

  it("점수 ≥ 60만 추출 + 정렬", () => {
    const risks = [
      mockRisk({ riskScore: 80, 거래처명: "고위험", 거래처코드: "C1" }),
      mockRisk({ riskScore: 55, 거래처명: "중위험", 거래처코드: "C2" }),  // 60 미만 → 제외
      mockRisk({ riskScore: 70, 거래처명: "보통",   거래처코드: "C3" }),
    ];
    const result = buildRiskCustomersSection(risks, 5);
    expect(result).toHaveLength(2);
    expect(result[0].rank).toBe(1);
    expect(result[0].거래처명).toBe("고위험");
    expect(result[1].rank).toBe(2);
    expect(result[1].거래처명).toBe("보통");
  });

  it("Top N 제한", () => {
    const risks = Array.from({ length: 10 }, (_, i) =>
      mockRisk({ riskScore: 90 - i, 거래처명: `C${i}`, 거래처코드: `K${i}` })
    );
    expect(buildRiskCustomersSection(risks, 5)).toHaveLength(5);
    expect(buildRiskCustomersSection(risks, 3)).toHaveLength(3);
  });

  it("각 항목에 oneLineSummary + topPressurePoint + topAction 포함", () => {
    const risks = [mockRisk({
      riskScore: 85, category: "거래중단",
      monthCount: 13, deficitMonthCount: 13,
      totalProfit13M: -150_000_000, avgMarginRate: -15,
      longOverdueAmount: 200_000_000, longOverdueRatio: 0.4,
    })];
    const result = buildRiskCustomersSection(risks, 5);
    expect(result[0].oneLineSummary).toContain("85");
    expect(result[0].topPressurePoint).toBeTruthy();
    expect(result[0].topAction).toBeTruthy();
    expect(result[0].창출이익13M).toBeLessThan(0);
  });
});

// ─── buildRiskCustomersReportSection ──────────────

describe("buildRiskCustomersReportSection (P1-2)", () => {
  it("위험 거래처 0건 → null", () => {
    const result = buildRiskCustomersReportSection([], 5);
    expect(result).toBeNull();
  });

  it("위험 거래처 ≥ 1건 → ReportSection 반환", () => {
    const risks = [
      mockRisk({ riskScore: 80, 거래처명: "건진", category: "거래중단" }),
      mockRisk({ riskScore: 70, 거래처명: "대성", category: "회수+단가" }),
    ];
    const result = buildRiskCustomersReportSection(risks, 5);
    expect(result).not.toBeNull();
    expect(result!.title).toContain("협상 우선순위");
    expect(result!.priority).toBe("high");
    expect(result!.type).toBe("risk");
    expect(result!.content).toContain("건진");
    expect(result!.content).toContain("대성");
    expect(result!.content).toContain("점수 80");
    expect(result!.content).toContain("거래중단");
    expect(result!.content).toContain("카테고리 분포");
  });
});

// ─── generateExecutiveOnePager 통합 ──────────────

describe("generateExecutiveOnePager + customerRisks (P1-2)", () => {
  it("customerRisks 미입력 → topRiskCustomers undefined", () => {
    const result = generateExecutiveOnePager(baseExecutiveInput, "2026-04");
    expect(result.topRiskCustomers).toBeUndefined();
  });

  it("customerRisks 입력 → topRiskCustomers Top 5 자동 도출", () => {
    const customerRisks = [
      mockRisk({ riskScore: 90, 거래처명: "최고위험" }),
      mockRisk({ riskScore: 75, 거래처명: "위험" }),
      mockRisk({ riskScore: 65, 거래처명: "주의" }),
      mockRisk({ riskScore: 50, 거래처명: "보통" }),  // 60 미만 → 제외
    ];
    const result = generateExecutiveOnePager(
      { ...baseExecutiveInput, customerRisks },
      "2026-04"
    );
    expect(result.topRiskCustomers).toBeDefined();
    expect(result.topRiskCustomers).toHaveLength(3); // 60+ 만 3건
    expect(result.topRiskCustomers![0].거래처명).toBe("최고위험");
    expect(result.topRiskCustomers![0].rank).toBe(1);
  });
});

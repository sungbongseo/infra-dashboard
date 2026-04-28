import { describe, it, expect, beforeEach } from "vitest";
import { useAlertStore } from "./alertStore";
import type { CustomerCompositeRisk } from "@/lib/analysis/customerCompositeRisk";

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

// ─── 거래처 알림 평가 ──────────────────────────

describe("alertStore.evaluateCustomerRisks (P1-1)", () => {
  beforeEach(() => {
    // 각 테스트마다 store reset
    useAlertStore.setState({ alerts: [], alertHistory: [], skippedMetrics: [] });
  });

  it("위험점수 ≥ 70 거래처만 alert 생성 (기본 threshold)", () => {
    const risks = [
      mockRisk({ riskScore: 80, 거래처명: "고위험", 거래처코드: "C1" }),
      mockRisk({ riskScore: 50, 거래처명: "저위험", 거래처코드: "C2" }),
      mockRisk({ riskScore: 70, 거래처명: "임계", 거래처코드: "C3" }),
    ];
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const alerts = useAlertStore.getState().alerts.filter(a => a.customerCode);
    expect(alerts).toHaveLength(2);
    expect(alerts.find(a => a.customerCode === "C1")).toBeDefined();
    expect(alerts.find(a => a.customerCode === "C3")).toBeDefined();
    expect(alerts.find(a => a.customerCode === "C2")).toBeUndefined();
  });

  it("거래중단 카테고리 → critical severity", () => {
    const risks = [mockRisk({
      riskScore: 90, category: "거래중단",
      거래처명: "위험거래처", 거래처코드: "C1",
    })];
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const alerts = useAlertStore.getState().alerts.filter(a => a.customerCode);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].message).toContain("🚨🚨");
  });

  it("회수+단가 + 점수 < 80 → warning severity", () => {
    const risks = [mockRisk({
      riskScore: 70, category: "회수+단가",
      거래처명: "테스트", 거래처코드: "C1",
    })];
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const alerts = useAlertStore.getState().alerts.filter(a => a.customerCode);
    expect(alerts[0].severity).toBe("warning");
  });

  it("핵심 메트릭 message 자동 포함 (미수, 한도, 적자, 장기연체)", () => {
    const risks = [mockRisk({
      riskScore: 85,
      거래처명: "건진",
      totalReceivable: 454_000_000,
      creditUsageRate: 0.85,
      deficitMonthCount: 13, monthCount: 13,
      longOverdueRatio: 0.4,
    })];
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const alerts = useAlertStore.getState().alerts.filter(a => a.customerCode);
    const msg = alerts[0].message;
    expect(msg).toContain("건진");
    expect(msg).toContain("85");
    expect(msg).toContain("미수");
    expect(msg).toContain("한도");
    expect(msg).toContain("적자");
    expect(msg).toContain("장기연체");
  });

  it("dismiss된 거래처는 다시 evaluate해도 alert 안 생성", () => {
    const risks = [mockRisk({ riskScore: 80, 거래처명: "테스트", 거래처코드: "C1" })];

    // 1차 평가
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const initial = useAlertStore.getState().alerts.filter(a => a.customerCode);
    expect(initial).toHaveLength(1);

    // dismiss
    useAlertStore.getState().dismissAlert(initial[0].id);

    // 2차 평가 (동일 거래처)
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const after = useAlertStore.getState().alerts.filter(a => a.customerCode && !a.dismissed);
    expect(after).toHaveLength(0); // dismiss된 거래처는 새 alert 안 생성
  });

  it("deepLink는 협상 우선순위 탭 가리킴", () => {
    const risks = [mockRisk({ riskScore: 80, 거래처명: "테스트", 거래처코드: "C1" })];
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const alerts = useAlertStore.getState().alerts.filter(a => a.customerCode);
    expect(alerts[0].deepLink).toContain("/dashboard/receivables");
    expect(alerts[0].deepLink).toContain("negotiation");
  });

  it("threshold 파라미터로 임계 조정 가능", () => {
    const risks = [
      mockRisk({ riskScore: 50, 거래처명: "C1", 거래처코드: "K1" }),
      mockRisk({ riskScore: 60, 거래처명: "C2", 거래처코드: "K2" }),
    ];
    useAlertStore.getState().evaluateCustomerRisks(risks, 50);
    const alerts = useAlertStore.getState().alerts.filter(a => a.customerCode);
    expect(alerts).toHaveLength(2);
  });

  it("히스토리에 자동 추가", () => {
    const risks = [mockRisk({ riskScore: 80, 거래처명: "테스트", 거래처코드: "C1" })];
    useAlertStore.getState().evaluateCustomerRisks(risks);
    const history = useAlertStore.getState().alertHistory;
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].title).toContain("거래처 위험");
  });

  it("기존 비-거래처 alerts (KPI 등)는 보존", () => {
    // 사전: 일반 KPI alert 추가 (수동 setState)
    useAlertStore.setState({
      alerts: [{
        id: "alert-kpi-1",
        ruleId: "rule-collection-rate",
        ruleName: "수금율 저조",
        metric: "collectionRate",
        currentValue: 65,
        threshold: 70,
        severity: "warning",
        message: "수금율 저조: 65%",
        timestamp: new Date(),
        dismissed: false,
      }],
      alertHistory: [],
      skippedMetrics: [],
    });

    // 거래처 평가 추가
    const risks = [mockRisk({ riskScore: 80, 거래처명: "테스트", 거래처코드: "C1" })];
    useAlertStore.getState().evaluateCustomerRisks(risks);

    const allAlerts = useAlertStore.getState().alerts;
    const kpiAlerts = allAlerts.filter(a => !a.customerCode);
    const customerAlerts = allAlerts.filter(a => a.customerCode);
    expect(kpiAlerts).toHaveLength(1);
    expect(customerAlerts).toHaveLength(1);
  });
});

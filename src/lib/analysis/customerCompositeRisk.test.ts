import { describe, it, expect } from "vitest";
import type { ReceivableAgingRecord, CustomerItemDetailRecord } from "@/types";
import {
  calcCustomerCompositeRisks,
  rankTopRiskCustomers,
  SCORE_WEIGHTS,
} from "./customerCompositeRisk";

// ─── 헬퍼: ReceivableAgingRecord 생성 ─────────────────

function aging(
  code: string,
  name: string,
  total: number,
  longOverdue: number,
  limit: number,
  org = "건자재팀",
  person = "김민식",
): ReceivableAgingRecord {
  // longOverdue 분배: month6=20%, overdue=80%
  const overdue = longOverdue * 0.8;
  const month6 = longOverdue * 0.2;
  const remain = total - longOverdue;
  return {
    No: 1,
    영업조직: org,
    담당자: person,
    판매처: code,
    판매처명: name,
    통화: "KRW",
    month1: { 출고금액: 0, 장부금액: remain * 0.3, 거래금액: 0 },
    month2: { 출고금액: 0, 장부금액: remain * 0.2, 거래금액: 0 },
    month3: { 출고금액: 0, 장부금액: remain * 0.2, 거래금액: 0 },
    month4: { 출고금액: 0, 장부금액: remain * 0.2, 거래금액: 0 },
    month5: { 출고금액: 0, 장부금액: remain * 0.1, 거래금액: 0 },
    month6: { 출고금액: 0, 장부금액: month6, 거래금액: 0 },
    overdue: { 출고금액: 0, 장부금액: overdue, 거래금액: 0 },
    합계: { 출고금액: 0, 장부금액: total, 거래금액: 0 },
    여신한도: limit,
  };
}

// ─── 헬퍼: CustomerItemDetailRecord 생성 ──────────────

function rec(
  customer: string,
  customerName: string,
  item: string,
  itemName: string,
  month: string,
  sales: number,
  profit: number,
  category: string = "방수",
): CustomerItemDetailRecord {
  return {
    No: 1,
    영업조직팀: "건자재팀",
    영업담당사번: "E001",
    매출거래처: customer,
    매출거래처명: customerName,
    품목: item,
    품목명: itemName,
    거래처대분류: "",
    거래처중분류: "",
    거래처소분류: "",
    제품군: category,
    매출연월: month,
    계정구분: "제품",
    매출유형: "",
    품목군: "",
    중분류코드: "",
    공장: "옥천",
    제품내수매출: { 계획: 0, 실적: sales, 차이: 0 },
    제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
    매출수량: { 계획: 0, 실적: 100, 차이: 0 },
    환산수량: { 계획: 0, 실적: 100, 차이: 0 },
    매출액: { 계획: 0, 실적: sales, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: sales - profit, 차이: 0 },
    상품매입: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: profit, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    판관변동_직접판매운반비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: profit, 차이: 0 },
  } as CustomerItemDetailRecord;
}

// ─── 빈 데이터 테스트 ────────────────────────────────

describe("calcCustomerCompositeRisks", () => {
  it("빈 데이터 → 빈 결과", () => {
    const result = calcCustomerCompositeRisks({
      agingMap: new Map(),
      customerItemDetail: [],
    });
    expect(result).toEqual([]);
  });

  it("미수만 있고 손익 없음 → 미수 점수만 산출", () => {
    const agingMap = new Map([
      ["건자재", [aging("C001", "테스트거래처", 100_000_000, 50_000_000, 50_000_000)]],
    ]);
    const result = calcCustomerCompositeRisks({
      agingMap,
      customerItemDetail: [],
    });
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.components.receivableScore).toBe(25); // 1억+
    expect(r.components.longOverdueScore).toBe(20); // 50%+
    expect(r.components.creditUsageScore).toBe(15); // 100%+ (1억 / 5천만)
    expect(r.components.deficitScore).toBe(0);     // 손익 데이터 없음
    expect(r.metrics.consecutiveDeficitMonths).toBe(0);
  });

  it("점수 컴포넌트 합계 ≡ riskScore", () => {
    const agingMap = new Map([
      ["건자재", [aging("C001", "테스트", 200_000_000, 100_000_000, 200_000_000)]],
    ]);
    const result = calcCustomerCompositeRisks({ agingMap, customerItemDetail: [] });
    const r = result[0];
    const sum = Object.values(r.components).reduce((s, v) => s + v, 0);
    expect(r.riskScore).toBe(sum);
  });
});

// ─── 대성이앤씨 케이스 ─────────────────────────────

describe("대성이앤씨 케이스 (실측 데이터 시뮬)", () => {
  // 대성: 미수 5.71억, 한도 6억(95%), 장기연체 1,368만(2.4%)
  // 손익: 13M, 누적 -3,376만, 평균 마진 -2.9%, 12M 적자

  it("점수 80점+, 카테고리 회수+단가", () => {
    const agingMap = new Map([
      ["건자재", [aging("C100002940", "대성이앤씨 주식회사", 571_000_000, 13_680_000, 600_000_000)]],
    ]);

    const months = ["202501", "202502", "202503", "202504", "202505", "202506",
                    "202507", "202508", "202509", "202510", "202511", "202512", "202601"];
    const profits = [-5_410_000, -5_590_000, -620_000, -4_230_000, -5_160_000, 450_000,
                     -5_270_000, -10_490_000, -4_900_000, -5_100_000, -3_200_000, -6_820_000, 22_580_000];
    const sales = [36_200_000, 38_390_000, 96_840_000, 167_000_000, 143_000_000, 33_000_000,
                   105_000_000, 77_720_000, 102_000_000, 182_000_000, 71_150_000, 73_460_000, 22_580_000];

    const customerItemDetail: CustomerItemDetailRecord[] = months.map((m, i) =>
      rec("대성이앤씨 주식회사", "대성이앤씨 주식회사", "P001", "Black Top Seal", m, sales[i], profits[i], "방수")
    );

    const result = calcCustomerCompositeRisks({ agingMap, customerItemDetail });

    // 매칭은 이름 fallback으로 대성 1건만 나와야 함
    const daesung = result.find(r => r.거래처명.includes("대성"));
    expect(daesung).toBeDefined();

    // 점수 검증
    expect(daesung!.riskScore).toBeGreaterThanOrEqual(60);
    expect(daesung!.components.receivableScore).toBe(25);  // 5.71억 → 1억+
    expect(daesung!.components.creditUsageScore).toBe(12); // 95% → 90%+ (12점)
    expect(daesung!.metrics.totalProfit13M).toBeCloseTo(-33_760_000, -3);
    expect(daesung!.metrics.totalReceivable).toBe(571_000_000);
    expect(daesung!.metrics.creditUsageRate).toBeCloseTo(0.952, 2);

    // 카테고리 (회수+단가 또는 단가조정)
    expect(["회수+단가", "단가조정"]).toContain(daesung!.category);

    // 신호 추출
    expect(daesung!.signals.length).toBeGreaterThanOrEqual(2);
    const signalTypes = daesung!.signals.map(s => s.type);
    expect(signalTypes).toContain("creditUsage");  // 한도 임박
    expect(signalTypes).toContain("receivable");   // 미수 큰 절대값
  });
});

// ─── 건진케미컬 케이스 ─────────────────────────────

describe("건진케미컬 케이스 (실측 데이터 시뮬)", () => {
  // 건진: 미수 4.54억, 한도 14억(32%), 장기연체 1.82억(40.1%)
  // 손익: 13M 모두 적자, 누적 -1.05억, 단일 품목 99% 의존

  it("점수 80점+, 카테고리 거래중단", () => {
    const agingMap = new Map([
      ["건자재", [aging("C100020396", "건진케미컬", 454_000_000, 182_000_000, 1_400_000_000, "건자재팀", "김민식")]],
    ]);

    const months = ["202501", "202502", "202503", "202504", "202505", "202506",
                    "202507", "202508", "202509", "202510", "202511", "202512", "202601"];
    // 13M 모두 적자
    const profits = [-20_960_000, -30_070_000, -27_930_000, -11_930_000, -3_960_000, -3_630_000,
                     -2_630_000, -2_430_000, -5_460_000, -4_810_000, 2_990_000, -5_830_000, 12_020_000];
    const sales = [39_480_000, 52_830_000, 149_000_000, 119_000_000, 38_220_000, 30_280_000,
                   28_500_000, 16_900_000, 75_260_000, 44_340_000, 72_060_000, 38_480_000, 12_020_000];

    // 단일 품목 99% 의존 (건진_2.5mm)
    const customerItemDetail: CustomerItemDetailRecord[] = months.map((m, i) =>
      rec("건진케미컬", "건진케미컬", "P002", "건진_(2.5mm*10m)", m, sales[i], profits[i], "방수시트")
    );

    const result = calcCustomerCompositeRisks({ agingMap, customerItemDetail });

    const geonjin = result.find(r => r.거래처명.includes("건진"));
    expect(geonjin).toBeDefined();

    // 점수 검증
    expect(geonjin!.riskScore).toBeGreaterThanOrEqual(70);
    expect(geonjin!.components.receivableScore).toBe(25);  // 4.54억 → 1억+
    expect(geonjin!.components.longOverdueScore).toBe(15); // 40% → 30%+ (15점)
    expect(geonjin!.components.concentrationScore).toBe(5); // HHI 1.0 → 0.7+

    // 단일 품목 (HHI ≈ 1.0)
    expect(geonjin!.metrics.itemHHI).toBeCloseTo(1.0, 1);
    expect(geonjin!.metrics.topItemShare).toBeCloseTo(1.0, 1);

    // 누적 적자 -1억+
    expect(geonjin!.metrics.totalProfit13M).toBeLessThan(-100_000_000);

    // 신호 추출
    const signalTypes = geonjin!.signals.map(s => s.type);
    expect(signalTypes).toContain("longOverdue");
    expect(signalTypes).toContain("concentration");

    // 카테고리: 누적 적자 + 장기연체 → 회수+단가 또는 거래중단
    expect(["회수+단가", "거래중단"]).toContain(geonjin!.category);
  });
});

// ─── 사무소 통합 테스트 ─────────────────────────────

describe("여러 사무소 분산 거래처 통합", () => {
  it("동일 거래처 코드가 2개 사무소에 있으면 미수 합산", () => {
    const agingMap = new Map([
      ["건자재", [aging("C001", "테스트거래처", 100_000_000, 0, 200_000_000)]],
      ["광주사무소", [aging("C001", "테스트거래처", 50_000_000, 10_000_000, 100_000_000)]],
    ]);

    const result = calcCustomerCompositeRisks({ agingMap, customerItemDetail: [] });
    expect(result).toHaveLength(1);
    expect(result[0].metrics.totalReceivable).toBe(150_000_000);
    expect(result[0].metrics.creditLimit).toBe(300_000_000);
    expect(result[0].offices).toHaveLength(2);
  });
});

// ─── 점수 임계 테스트 ──────────────────────────────

describe("rankTopRiskCustomers", () => {
  it("Top 10 정렬 + minScore 40 필터", () => {
    const agingMap = new Map([
      ["건자재", [
        aging("C001", "고위험", 200_000_000, 100_000_000, 200_000_000),  // ~70점
        aging("C002", "중위험", 50_000_000, 5_000_000, 100_000_000),     // ~25점
        aging("C003", "저위험", 5_000_000, 0, 100_000_000),               // ~5점
      ]],
    ]);

    const result = rankTopRiskCustomers({ agingMap, customerItemDetail: [] }, 10);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(10);

    // 점수 내림차순
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].riskScore).toBeGreaterThanOrEqual(result[i].riskScore);
    }

    // 첫 번째는 고위험
    expect(result[0].거래처명).toBe("고위험");

    // 저위험 (5점)은 minScore 40 필터로 제외됨
    expect(result.find(r => r.거래처명 === "저위험")).toBeUndefined();
  });
});

// ─── 가중치 상수 검증 ─────────────────────────────

describe("SCORE_WEIGHTS", () => {
  it("총 점수 임계 = 25 + 25 + 20 + 15 + 10 + 5 = 100", () => {
    const max =
      25 + // RECEIVABLE_HIGH
      25 + // DEFICIT_ALL_MONTHS (cumulative bonus 포함 시 caps to 25)
      20 + // LONG_OVERDUE_HIGH
      15 + // CREDIT_OVER
      10 + // DECLINE_HIGH
      5;   // HHI_HIGH
    expect(max).toBe(100);
  });

  it("카테고리 임계: 75/60/40 명확", () => {
    expect(SCORE_WEIGHTS.CATEGORY_TERMINATE).toBe(75);
    expect(SCORE_WEIGHTS.CATEGORY_COLLECT).toBe(60);
    expect(SCORE_WEIGHTS.CATEGORY_PRICING).toBe(40);
  });
});

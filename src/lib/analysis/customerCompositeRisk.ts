/**
 * 거래처 종합 위험 점수 (Composite Risk Score) — Phase v3 협상 우선순위 자동화 자산.
 *
 * @model
 *   6개 신호를 0-100 점수로 통합:
 *     ① receivableScore   (0-25): 미수 절대값
 *     ② deficitScore      (0-25): 13M 적자 패턴 + 누적 적자
 *     ③ longOverdueScore  (0-20): 장기연체 비율 (month6+overdue)
 *     ④ creditUsageScore  (0-15): 여신한도 사용률
 *     ⑤ salesDeclineScore (0-10): QoQ 매출 변동
 *     ⑥ concentrationScore (0-5): 단일 품목 HHI
 *
 *   카테고리 분류:
 *     score >= 75 + 적자/연체 ↑ : "거래중단"
 *     60 <= score < 75          : "회수+단가"
 *     40 <= score < 60          : "단가조정"
 *     score < 40                : "정상"
 *
 * @design
 *   - 재사용 모듈: aging.ts, longTermReceivable.ts, monthlyTrend (자체 계산)
 *   - 출력: CustomerCompositeRisk[] (점수 내림차순) — UI에서 Top N 정렬
 *   - 데이터 부족 시 (예: aging만 있고 100 데이터 없음) — 일부 신호 0 처리
 *   - signals 배열은 NLG 모듈(negotiationMemoGenerator)이 멘트 생성 시 활용
 *
 * @source
 *   - 미수: ReceivableAgingRecord[] (7개 사무소 통합)
 *   - 손익: CustomerItemDetailRecord[] (100, 13M)
 */

import type { ReceivableAgingRecord, CustomerItemDetailRecord } from "@/types";
import { safeDivide } from "@/lib/utils";
import { buildCustomerMasterMap, lookupCustomerCode } from "@/lib/excel/customerMasterMap";

// ─── Types ───────────────────────────────────────────────

export type RiskCategory = "거래중단" | "회수+단가" | "단가조정" | "정상";

export interface RiskSignal {
  type: "deficit" | "longOverdue" | "creditUsage" | "salesDecline" | "concentration" | "receivable";
  severity: "critical" | "warning" | "info";
  message: string;       // 압박 근거 멘트 (NLG 입력)
  metric: number;        // 정량 값
  rawData: Record<string, unknown>;  // NLG가 추가 컨텍스트 활용
}

export interface CustomerCompositeRisk {
  // 식별
  거래처코드: string;
  거래처명: string;
  영업조직: string;          // 통합 시 "건자재+광주" 같이
  담당자: string;            // 통합 시 첫 번째 담당자
  offices: string[];         // 거래 사무소 목록

  // 점수
  riskScore: number;         // 0-100 통합 점수
  components: {
    receivableScore: number;
    deficitScore: number;
    longOverdueScore: number;
    creditUsageScore: number;
    salesDeclineScore: number;
    concentrationScore: number;
  };

  // 신호
  signals: RiskSignal[];     // 자동 도출된 위험 신호 (3-5개)
  category: RiskCategory;    // 액션 카테고리

  // 원시 메트릭 (UI/NLG용)
  metrics: {
    totalReceivable: number;       // 총 미수
    creditLimit: number;           // 여신한도
    creditUsageRate: number;       // 사용률 %
    longOverdueAmount: number;     // 8M+ 미수
    longOverdueRatio: number;      // 장기연체 비율 %
    deficitMonthCount: number;     // 13M 중 적자 월 수 (총 카운트)
    consecutiveDeficitMonths: number;  // 가장 긴 연속 적자 길이
    totalProfit13M: number;        // 13M 누적 영업이익
    avgMarginRate: number;         // 평균 마진율 %
    salesQoQ: number;              // 매출 QoQ %
    profitQoQ: number;             // 영업이익 QoQ %
    topItemShare: number;          // Top 1 품목 비중 %
    itemHHI: number;               // 품목 집중도 [0, 1]
    topItemName: string;
    monthCount: number;            // 데이터 월 수
  };
}

// ─── 가중치 상수 (사용자 조정 가능) ─────────────────────

export const SCORE_WEIGHTS = {
  // 미수 절대값 임계
  RECEIVABLE_HIGH: 100_000_000,    // 1억+ → 25점
  RECEIVABLE_MED: 50_000_000,      // 5천만+ → 15점
  RECEIVABLE_LOW: 10_000_000,      // 1천만+ → 5점

  // 적자 임계
  DEFICIT_ALL_MONTHS: 25,           // 13M 전부 적자 → 25점
  DEFICIT_MOST_MONTHS: 20,          // 12M+ 적자 → 20점
  DEFICIT_HALF_MONTHS: 12,          // 7M+ 적자 → 12점
  CUMULATIVE_DEFICIT_BONUS: 5,      // 누적 -1억+ → +5점 (cap 25)

  // 장기연체 비율
  LONG_OVERDUE_HIGH: 0.5,           // 50%+ → 20점
  LONG_OVERDUE_MED: 0.3,            // 30%+ → 15점
  LONG_OVERDUE_LOW: 0.1,            // 10%+ → 8점

  // 한도 사용률
  CREDIT_OVER: 1.0,                 // 100%+ → 15점
  CREDIT_HIGH: 0.9,                 // 90%+ → 12점
  CREDIT_MED: 0.8,                  // 80%+ → 8점

  // 매출 QoQ
  DECLINE_HIGH: -0.5,               // -50%+ → 10점
  DECLINE_MED: -0.3,                // -30%+ → 7점
  DECLINE_LOW: -0.1,                // -10%+ → 3점

  // 품목 HHI
  HHI_HIGH: 0.7,                    // 0.7+ → 5점
  HHI_MED: 0.5,                     // 0.5+ → 3점

  // 카테고리 분류 임계
  CATEGORY_TERMINATE: 75,           // 거래중단
  CATEGORY_COLLECT: 60,             // 회수+단가
  CATEGORY_PRICING: 40,             // 단가조정
} as const;

// ─── 헬퍼 함수 ──────────────────────────────────────────

/** 미수 절대값 → 점수 (0-25) */
function scoreReceivable(amount: number): number {
  if (amount >= SCORE_WEIGHTS.RECEIVABLE_HIGH) return 25;
  if (amount >= SCORE_WEIGHTS.RECEIVABLE_MED) return 15;
  if (amount >= SCORE_WEIGHTS.RECEIVABLE_LOW) return 5;
  return 0;
}

/** 적자 패턴 → 점수 (0-25): 적자 월 비율 + 누적 적자 절대값 */
function scoreDeficit(deficitMonthCount: number, totalProfit: number, monthCount: number): number {
  if (monthCount === 0) return 0;
  const ratio = deficitMonthCount / monthCount;
  let score = 0;
  if (ratio >= 1.0) {                          // 100% 적자 (모든 월)
    score = SCORE_WEIGHTS.DEFICIT_ALL_MONTHS;  // 25
  } else if (ratio >= 0.8) {                   // 80%+ 적자 (예: 13M 중 11~12M 적자)
    score = SCORE_WEIGHTS.DEFICIT_MOST_MONTHS; // 20
  } else if (ratio >= 0.5) {                   // 50%+ 적자
    score = SCORE_WEIGHTS.DEFICIT_HALF_MONTHS; // 12
  } else if (ratio >= 0.25) {                  // 25%+ 적자
    score = 6;
  }
  // 누적 적자 -1억 초과 시 보너스
  if (totalProfit < -100_000_000) {
    score = Math.min(25, score + SCORE_WEIGHTS.CUMULATIVE_DEFICIT_BONUS);
  }
  return score;
}

/** 장기연체 비율 → 점수 (0-20) */
function scoreLongOverdue(ratio: number): number {
  if (ratio >= SCORE_WEIGHTS.LONG_OVERDUE_HIGH) return 20;
  if (ratio >= SCORE_WEIGHTS.LONG_OVERDUE_MED) return 15;
  if (ratio >= SCORE_WEIGHTS.LONG_OVERDUE_LOW) return 8;
  return 0;
}

/** 한도 사용률 → 점수 (0-15) */
function scoreCreditUsage(rate: number): number {
  if (rate >= SCORE_WEIGHTS.CREDIT_OVER) return 15;
  if (rate >= SCORE_WEIGHTS.CREDIT_HIGH) return 12;
  if (rate >= SCORE_WEIGHTS.CREDIT_MED) return 8;
  return 0;
}

/** 매출 QoQ → 점수 (0-10) */
function scoreSalesDecline(qoq: number): number {
  if (qoq <= SCORE_WEIGHTS.DECLINE_HIGH) return 10;
  if (qoq <= SCORE_WEIGHTS.DECLINE_MED) return 7;
  if (qoq <= SCORE_WEIGHTS.DECLINE_LOW) return 3;
  return 0;
}

/** HHI → 점수 (0-5) */
function scoreConcentration(hhi: number): number {
  if (hhi >= SCORE_WEIGHTS.HHI_HIGH) return 5;
  if (hhi >= SCORE_WEIGHTS.HHI_MED) return 3;
  return 0;
}

/** 카테고리 분류 */
function categorize(score: number, deficit: number, longOverdue: number): RiskCategory {
  if (score >= SCORE_WEIGHTS.CATEGORY_TERMINATE && deficit >= 20 && longOverdue >= 15) {
    return "거래중단";
  }
  if (score >= SCORE_WEIGHTS.CATEGORY_COLLECT) return "회수+단가";
  if (score >= SCORE_WEIGHTS.CATEGORY_PRICING) return "단가조정";
  return "정상";
}

// ─── 거래처별 손익 메트릭 추출 ────────────────────────

interface CustomerProfitMetrics {
  monthCount: number;
  deficitMonthCount: number;         // 적자 월 총 개수
  consecutiveDeficitMonths: number;  // 가장 긴 연속 적자 길이
  totalProfit: number;
  totalSales: number;
  avgMarginRate: number;
  salesQoQ: number;     // 최근 3M vs 직전 3M
  profitQoQ: number;
  itemHHI: number;
  topItemShare: number;
  topItemName: string;
}

function calcProfitMetrics(records: CustomerItemDetailRecord[]): CustomerProfitMetrics {
  if (records.length === 0) {
    return {
      monthCount: 0, deficitMonthCount: 0, consecutiveDeficitMonths: 0,
      totalProfit: 0, totalSales: 0, avgMarginRate: 0,
      salesQoQ: 0, profitQoQ: 0,
      itemHHI: 0, topItemShare: 0, topItemName: "",
    };
  }

  // 월별 집계
  const monthlyMap = new Map<string, { sales: number; profit: number }>();
  // 품목별 집계
  const itemMap = new Map<string, { sales: number; name: string }>();

  for (const r of records) {
    const month = String(r.매출연월 || "").trim().slice(0, 6);
    const sales = r.매출액?.실적 || 0;
    const profit = r.영업이익?.실적 || 0;
    if (month && /^\d{6}$/.test(month)) {
      const m = monthlyMap.get(month) || { sales: 0, profit: 0 };
      m.sales += sales;
      m.profit += profit;
      monthlyMap.set(month, m);
    }
    const item = String(r.품목 || "").trim();
    if (item && !["합계", "소계", "총계"].some(s => item.includes(s))) {
      const i = itemMap.get(item) || { sales: 0, name: String(r.품목명 || item) };
      i.sales += sales;
      itemMap.set(item, i);
    }
  }

  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  const monthCount = sortedMonths.length;

  // 누적
  let totalSales = 0;
  let totalProfit = 0;
  for (const m of sortedMonths) {
    const d = monthlyMap.get(m)!;
    totalSales += d.sales;
    totalProfit += d.profit;
  }
  const avgMarginRate = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  // 적자 월 카운트 (총 개수 + 가장 긴 연속 길이)
  let deficitMonthCount = 0;
  let consecutiveDeficitMonths = 0;
  let currentRun = 0;
  for (const m of sortedMonths) {
    const d = monthlyMap.get(m)!;
    if (d.profit < 0) {
      deficitMonthCount++;
      currentRun++;
      if (currentRun > consecutiveDeficitMonths) consecutiveDeficitMonths = currentRun;
    } else {
      currentRun = 0;
    }
  }

  // QoQ (최근 3M vs 직전 3M)
  let salesQoQ = 0;
  let profitQoQ = 0;
  if (sortedMonths.length >= 6) {
    const recent3M = sortedMonths.slice(-3);
    const prev3M = sortedMonths.slice(-6, -3);
    const recentSales = recent3M.reduce((s, m) => s + (monthlyMap.get(m)?.sales || 0), 0);
    const prevSales = prev3M.reduce((s, m) => s + (monthlyMap.get(m)?.sales || 0), 0);
    const recentProfit = recent3M.reduce((s, m) => s + (monthlyMap.get(m)?.profit || 0), 0);
    const prevProfit = prev3M.reduce((s, m) => s + (monthlyMap.get(m)?.profit || 0), 0);
    salesQoQ = prevSales !== 0 ? (recentSales / prevSales - 1) : 0;
    profitQoQ = Math.abs(prevProfit) > 0 ? (recentProfit - prevProfit) / Math.abs(prevProfit) : 0;
  }

  // HHI (품목 집중도)
  let itemHHI = 0;
  let topItemShare = 0;
  let topItemName = "";
  if (itemMap.size > 0 && totalSales > 0) {
    const itemShares = Array.from(itemMap.entries()).map(([code, d]) => ({
      code, share: d.sales / totalSales, name: d.name,
    }));
    itemHHI = itemShares.reduce((s, x) => s + x.share * x.share, 0);
    const top = itemShares.sort((a, b) => b.share - a.share)[0];
    topItemShare = top.share;
    topItemName = top.name;
  }

  return {
    monthCount, deficitMonthCount, consecutiveDeficitMonths,
    totalProfit, totalSales, avgMarginRate,
    salesQoQ, profitQoQ,
    itemHHI, topItemShare, topItemName,
  };
}

// ─── 미수채권 통합 (한 거래처가 여러 사무소에 있을 때 합산) ─────

interface MergedAgingRecord {
  판매처: string;
  판매처명: string;
  offices: string[];
  영업조직: string;          // 첫 번째
  담당자: string;            // 첫 번째
  totalReceivable: number;
  creditLimit: number;       // 합산
  longOverdueAmount: number; // month6 + overdue
  longOverdueRatio: number;
  creditUsageRate: number;
}

function mergeAgingByCustomer(
  agingMap: Map<string, ReceivableAgingRecord[]>,
): Map<string, MergedAgingRecord> {
  const merged = new Map<string, MergedAgingRecord>();

  for (const [office, records] of Array.from(agingMap.entries())) {
    for (const r of records) {
      const key = r.판매처;
      if (!key) continue;
      const longOverdue = (r.month6?.장부금액 || 0) + (r.overdue?.장부금액 || 0);
      const total = r.합계?.장부금액 || 0;

      const existing = merged.get(key);
      if (existing) {
        existing.totalReceivable += total;
        existing.creditLimit += r.여신한도 || 0;
        existing.longOverdueAmount += longOverdue;
        if (!existing.offices.includes(office)) existing.offices.push(office);
      } else {
        merged.set(key, {
          판매처: r.판매처,
          판매처명: r.판매처명 || r.판매처,
          offices: [office],
          영업조직: r.영업조직 || "",
          담당자: r.담당자 || "",
          totalReceivable: total,
          creditLimit: r.여신한도 || 0,
          longOverdueAmount: longOverdue,
          longOverdueRatio: 0,        // 합산 후 재계산
          creditUsageRate: 0,
        });
      }
    }
  }

  // 비율 재계산
  for (const m of Array.from(merged.values())) {
    m.longOverdueRatio = safeDivide(m.longOverdueAmount, m.totalReceivable);
    m.creditUsageRate = safeDivide(m.totalReceivable, m.creditLimit);
  }

  return merged;
}

// ─── 거래처별 손익 그룹화 (100 데이터) ───────────────

function groupByCustomer(
  records: CustomerItemDetailRecord[],
): Map<string, CustomerItemDetailRecord[]> {
  const map = new Map<string, CustomerItemDetailRecord[]>();
  for (const r of records) {
    const key = String(r.매출거래처 || "").trim();
    if (!key) continue;
    const arr = map.get(key) || [];
    arr.push(r);
    map.set(key, arr);
  }
  return map;
}

// ─── 신호 추출 (NLG 입력) ────────────────────────────

function extractSignals(
  metrics: CustomerCompositeRisk["metrics"],
  _components: CustomerCompositeRisk["components"],
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  // 적자 (총 적자 월 수 기반)
  const deficitRatio = metrics.monthCount > 0 ? metrics.deficitMonthCount / metrics.monthCount : 0;
  if (deficitRatio >= 0.9 && metrics.deficitMonthCount >= 10) {
    const allOrMost = deficitRatio >= 1.0
      ? `${metrics.monthCount}개월 모두`
      : `${metrics.monthCount}개월 중 ${metrics.deficitMonthCount}개월`;
    signals.push({
      type: "deficit",
      severity: "critical",
      message: `${allOrMost} 적자, 누적 영업적자 ${formatCurrency(metrics.totalProfit13M)} (마진 ${metrics.avgMarginRate.toFixed(1)}%)`,
      metric: metrics.deficitMonthCount,
      rawData: { profit: metrics.totalProfit13M, margin: metrics.avgMarginRate, monthCount: metrics.monthCount },
    });
  } else if (deficitRatio >= 0.5) {
    signals.push({
      type: "deficit",
      severity: "warning",
      message: `${metrics.monthCount}개월 중 ${metrics.deficitMonthCount}개월 적자 (마진 ${metrics.avgMarginRate.toFixed(1)}%, 최장 연속 ${metrics.consecutiveDeficitMonths}M)`,
      metric: metrics.deficitMonthCount,
      rawData: { profit: metrics.totalProfit13M },
    });
  }

  // 장기연체
  if (metrics.longOverdueRatio >= 0.3) {
    signals.push({
      type: "longOverdue",
      severity: metrics.longOverdueRatio >= 0.5 ? "critical" : "warning",
      message: `장기연체(8M+) ${formatCurrency(metrics.longOverdueAmount)} (${(metrics.longOverdueRatio * 100).toFixed(1)}% of 미수)`,
      metric: metrics.longOverdueRatio,
      rawData: { amount: metrics.longOverdueAmount },
    });
  }

  // 한도 임박
  if (metrics.creditUsageRate >= 0.9) {
    signals.push({
      type: "creditUsage",
      severity: metrics.creditUsageRate >= 1.0 ? "critical" : "warning",
      message: `여신한도 사용률 ${(metrics.creditUsageRate * 100).toFixed(1)}% ${metrics.creditUsageRate >= 1.0 ? "초과" : "임박"} (미수 ${formatCurrency(metrics.totalReceivable)} / 한도 ${formatCurrency(metrics.creditLimit)})`,
      metric: metrics.creditUsageRate,
      rawData: { receivable: metrics.totalReceivable, limit: metrics.creditLimit },
    });
  }

  // 매출 급감
  if (metrics.salesQoQ <= -0.3) {
    signals.push({
      type: "salesDecline",
      severity: metrics.salesQoQ <= -0.5 ? "critical" : "warning",
      message: `매출 ${(metrics.salesQoQ * 100).toFixed(1)}% QoQ 위축${metrics.profitQoQ < 0 ? ` + 영업이익 ${(metrics.profitQoQ * 100).toFixed(0)}% 추락` : ""}`,
      metric: metrics.salesQoQ,
      rawData: { profitQoQ: metrics.profitQoQ },
    });
  }

  // 단일 품목 의존
  if (metrics.itemHHI >= 0.5 && metrics.topItemShare >= 0.5) {
    signals.push({
      type: "concentration",
      severity: metrics.topItemShare >= 0.8 ? "warning" : "info",
      message: `단일 품목 "${metrics.topItemName.slice(0, 25)}" ${(metrics.topItemShare * 100).toFixed(0)}% 의존 (HHI ${metrics.itemHHI.toFixed(2)})`,
      metric: metrics.topItemShare,
      rawData: { itemName: metrics.topItemName, hhi: metrics.itemHHI },
    });
  }

  // 미수 절대값
  if (metrics.totalReceivable >= 100_000_000) {
    signals.push({
      type: "receivable",
      severity: metrics.totalReceivable >= 500_000_000 ? "critical" : "warning",
      message: `미수 ${formatCurrency(metrics.totalReceivable)} (한도 ${formatCurrency(metrics.creditLimit)})`,
      metric: metrics.totalReceivable,
      rawData: { offices: [] },
    });
  }

  // severity 정렬 (critical > warning > info)
  const sevRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  signals.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return signals;
}

// ─── 통화 포맷 (signal 메시지용) ─────────────────────

function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (Math.abs(v) >= 1e7) return `${(v / 1e4).toFixed(0)}만`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return `${v.toLocaleString()}원`;
}

// ─── 메인 함수 ──────────────────────────────────────

export interface CompositeRiskInput {
  agingMap: Map<string, ReceivableAgingRecord[]>;       // 사무소별 미수
  customerItemDetail: CustomerItemDetailRecord[];        // 100 손익 13M
  /** 점수 임계 미만은 결과에서 제외 (기본 0 = 전부) */
  minScore?: number;
}

export function calcCustomerCompositeRisks(
  input: CompositeRiskInput,
): CustomerCompositeRisk[] {
  const { agingMap, customerItemDetail, minScore = 0 } = input;

  // 1. 사무소 통합 미수
  const mergedAging = mergeAgingByCustomer(agingMap);

  // 2. 거래처별 손익 그룹화
  const customerSales = groupByCustomer(customerItemDetail);

  // 3. 거래처 마스터 매핑 빌드 (Phase A-1: customerMasterMap 모듈 활용)
  //    - aging의 [판매처코드, 판매처명] 으로 양방향 매핑 빌드
  //    - 안전 fuzzy 매칭 (4자+ prefix/suffix 일치)
  const masterMap = buildCustomerMasterMap(agingMap);

  // 4. 모든 거래처 코드 통합 (미수 + 100)
  const allCustomerCodes = new Set<string>();
  for (const k of Array.from(mergedAging.keys())) allCustomerCodes.add(k);

  // 100 데이터 키를 마스터 lookup으로 코드로 정규화 후 Set에 추가 (중복 방지)
  // 정확 매칭 → 정규화 매칭 → 안전 fuzzy 4단계
  const salesKeyToCode = new Map<string, string>();
  for (const k of Array.from(customerSales.keys())) {
    const normalizedCode = lookupCustomerCode(k, masterMap);
    if (normalizedCode) {
      salesKeyToCode.set(k, normalizedCode);
      allCustomerCodes.add(normalizedCode);
    } else {
      // aging에 없는 100-only 거래처 — 원본 키 그대로
      allCustomerCodes.add(k);
    }
  }

  // 5. 각 거래처별 점수 계산
  const results: CustomerCompositeRisk[] = [];

  for (const code of Array.from(allCustomerCodes)) {
    // 미수 매칭
    const aging = mergedAging.get(code);

    // 손익 매칭 (이미 정규화된 salesKeyToCode 활용)
    let salesRecords = customerSales.get(code);
    if (!salesRecords) {
      // code는 aging 판매처코드 → 100 데이터의 거래처명으로 reverse lookup
      for (const [salesKey, mappedCode] of Array.from(salesKeyToCode.entries())) {
        if (mappedCode === code) {
          salesRecords = customerSales.get(salesKey);
          break;
        }
      }
    }
    if (!salesRecords && aging?.판매처명) {
      // 마지막 fallback: 판매처명 직접 lookup (정규화 캐시 못 잡은 케이스)
      salesRecords = customerSales.get(aging.판매처명);
    }
    if (!salesRecords && aging) {
      // 최후 부분 일치 (lookupCustomerCode에서 이미 처리되지만 안전 보장)
      for (const [salesKey, recs] of Array.from(customerSales.entries())) {
        if (salesKey.includes(aging.판매처명) || aging.판매처명.includes(salesKey)) {
          salesRecords = recs;
          break;
        }
      }
    }

    const profit = calcProfitMetrics(salesRecords || []);

    // 식별 정보 (aging 우선, 없으면 sales 첫 행)
    const 거래처코드 = aging?.판매처 || code;
    const 거래처명 = aging?.판매처명 || (salesRecords?.[0]?.매출거래처명 || code);
    const 영업조직 = aging?.영업조직 || (salesRecords?.[0]?.영업조직팀 || "");
    const 담당자 = aging?.담당자 || "";
    const offices = aging?.offices || [];

    // 메트릭
    const metrics: CustomerCompositeRisk["metrics"] = {
      totalReceivable: aging?.totalReceivable || 0,
      creditLimit: aging?.creditLimit || 0,
      creditUsageRate: aging?.creditUsageRate || 0,
      longOverdueAmount: aging?.longOverdueAmount || 0,
      longOverdueRatio: aging?.longOverdueRatio || 0,
      deficitMonthCount: profit.deficitMonthCount,
      consecutiveDeficitMonths: profit.consecutiveDeficitMonths,
      totalProfit13M: profit.totalProfit,
      avgMarginRate: profit.avgMarginRate,
      salesQoQ: profit.salesQoQ,
      profitQoQ: profit.profitQoQ,
      topItemShare: profit.topItemShare,
      itemHHI: profit.itemHHI,
      topItemName: profit.topItemName,
      monthCount: profit.monthCount,
    };

    // 점수 계산
    const components = {
      receivableScore: scoreReceivable(metrics.totalReceivable),
      deficitScore: scoreDeficit(metrics.deficitMonthCount, metrics.totalProfit13M, metrics.monthCount),
      longOverdueScore: scoreLongOverdue(metrics.longOverdueRatio),
      creditUsageScore: scoreCreditUsage(metrics.creditUsageRate),
      salesDeclineScore: scoreSalesDecline(metrics.salesQoQ),
      concentrationScore: scoreConcentration(metrics.itemHHI),
    };

    const riskScore = Object.values(components).reduce((s, v) => s + v, 0);

    if (riskScore < minScore) continue;

    const signals = extractSignals(metrics, components);
    const category = categorize(riskScore, components.deficitScore, components.longOverdueScore);

    results.push({
      거래처코드, 거래처명, 영업조직, 담당자, offices,
      riskScore, components, signals, category, metrics,
    });
  }

  // 점수 내림차순 정렬
  results.sort((a, b) => b.riskScore - a.riskScore);
  return results;
}

/** Top N 위험 거래처만 추출 (협상 우선순위 페이지용) */
export function rankTopRiskCustomers(
  input: CompositeRiskInput,
  topN: number = 10,
): CustomerCompositeRisk[] {
  const all = calcCustomerCompositeRisks({ ...input, minScore: 40 });
  return all.slice(0, topN);
}

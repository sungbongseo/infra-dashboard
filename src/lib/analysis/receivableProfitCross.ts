import type { ReceivableAgingRecord } from "@/types";
import { safeDivide } from "@/lib/utils";

export interface ReceivableProfitPoint {
  customer: string;
  org: string;
  receivableAmount: number;
  overdueRatio: number;
  riskGrade: "high" | "medium" | "low";
  salesAmount?: number;
  grossMargin?: number;
  insight: string;
}

interface ProfitRecord {
  영업조직팀: string;
  거래처명: string;
  매출액: { 실적: number } | number;
  매출총이익: { 실적: number } | number;
  매출총이익율: { 실적: number } | number;
}

function extractActual(field: { 실적: number } | number | undefined): number {
  if (field === undefined || field === null) return 0;
  if (typeof field === "number") return field;
  if (typeof field === "object" && "실적" in field) return field.실적;
  return 0;
}

function normalizeCustomerName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/㈜/g, "")
    .replace(/주식회사/g, "")
    .trim()
    .toLowerCase();
}

/**
 * 미수금 × 수익성 교차 분석
 * - Aging 데이터에서 거래처별 미수금/연체비율 집계
 * - profitData가 있으면 거래처명 기준 조인하여 수익성 지표 추가
 * - 자동 인사이트 생성: 고수익-고위험, 저수익-고위험, 고수익-안정, 기본
 */
export function calcReceivableProfitCross(
  agingRecords: ReceivableAgingRecord[],
  profitData?: ProfitRecord[],
): ReceivableProfitPoint[] {
  if (!agingRecords || agingRecords.length === 0) return [];

  // 1. 거래처별 미수금 집계
  const customerMap = new Map<
    string,
    {
      customer: string;
      org: string;
      totalAmount: number;
      overdueAmount: number;
    }
  >();

  for (const r of agingRecords) {
    const key = r.판매처명;
    if (!key) continue;

    const total = r.합계.장부금액;
    // month3 이상이 연체 (61일+)
    const overdue =
      r.month3.장부금액 +
      r.month4.장부금액 +
      r.month5.장부금액 +
      r.month6.장부금액 +
      r.overdue.장부금액;

    const entry = customerMap.get(key) || {
      customer: key,
      org: r.영업조직,
      totalAmount: 0,
      overdueAmount: 0,
    };
    entry.totalAmount += total;
    entry.overdueAmount += overdue;
    customerMap.set(key, entry);
  }

  // 2. 수익성 데이터 매칭용 인덱스 구축
  const profitIndex = new Map<string, ProfitRecord>();
  if (profitData) {
    for (const p of profitData) {
      if (!p.거래처명) continue;
      const normKey = normalizeCustomerName(p.거래처명);
      // 동일 거래처가 여러 조직에 있으면 첫 번째 사용
      if (!profitIndex.has(normKey)) {
        profitIndex.set(normKey, p);
      }
    }
  }

  // 3. 교차 분석 결과 생성
  const results: ReceivableProfitPoint[] = [];

  for (const [, entry] of Array.from(customerMap.entries())) {
    if (entry.totalAmount === 0) continue;

    const overdueRatio = safeDivide(entry.overdueAmount, entry.totalAmount) * 100;

    // 리스크 등급
    let riskGrade: "high" | "medium" | "low" = "low";
    if (overdueRatio > 50 || entry.overdueAmount > 100_000_000) {
      riskGrade = "high";
    } else if (overdueRatio > 20 || entry.overdueAmount > 50_000_000) {
      riskGrade = "medium";
    }

    // 수익성 데이터 조인
    const normName = normalizeCustomerName(entry.customer);
    const profit = profitIndex.get(normName);

    let salesAmount: number | undefined;
    let grossMargin: number | undefined;

    if (profit) {
      salesAmount = extractActual(profit.매출액);
      const grossProfitRate = extractActual(profit.매출총이익율);
      // 매출총이익율이 직접 % 값으로 제공되는 경우
      if (grossProfitRate !== 0) {
        grossMargin = grossProfitRate;
      } else {
        // 매출총이익 / 매출액으로 계산
        const grossProfit = extractActual(profit.매출총이익);
        grossMargin = salesAmount > 0
          ? safeDivide(grossProfit, salesAmount) * 100
          : undefined;
      }
    }

    // 인사이트 생성
    const insight = generateInsight(
      entry.customer,
      overdueRatio,
      riskGrade,
      grossMargin,
    );

    results.push({
      customer: entry.customer,
      org: entry.org,
      receivableAmount: entry.totalAmount,
      overdueRatio: Math.round(overdueRatio * 10) / 10,
      riskGrade,
      salesAmount,
      grossMargin:
        grossMargin !== undefined
          ? Math.round(grossMargin * 10) / 10
          : undefined,
      insight,
    });
  }

  return results.sort((a, b) => b.receivableAmount - a.receivableAmount);
}

function generateInsight(
  customer: string,
  overdueRatio: number,
  riskGrade: "high" | "medium" | "low",
  grossMargin?: number,
): string {
  if (grossMargin !== undefined && grossMargin > 20 && overdueRatio > 50) {
    return `고수익-고위험: ${customer}은 매출총이익률 ${grossMargin.toFixed(1)}%로 수익성이 높지만, 연체비율 ${overdueRatio.toFixed(0)}%로 채권 리스크가 큽니다. 수금 조건 강화를 권장합니다.`;
  }
  if (grossMargin !== undefined && grossMargin < 10 && overdueRatio > 30) {
    return `저수익-고위험: ${customer}은 매출총이익률 ${grossMargin.toFixed(1)}%로 수익성이 낮고, 연체비율 ${overdueRatio.toFixed(0)}%로 위험합니다. 거래 축소 또는 결제조건 재검토를 권장합니다.`;
  }
  if (grossMargin !== undefined && grossMargin > 20 && overdueRatio < 20) {
    return `고수익-안정: ${customer}은 매출총이익률 ${grossMargin.toFixed(1)}%, 연체비율 ${overdueRatio.toFixed(0)}%로 우량 거래처입니다. 거래 확대를 검토하세요.`;
  }
  if (riskGrade === "high") {
    return `고위험: ${customer}의 연체비율이 ${overdueRatio.toFixed(0)}%로 높습니다. 즉시 수금 조치가 필요합니다.`;
  }
  if (riskGrade === "medium") {
    return `주의: ${customer}의 연체비율이 ${overdueRatio.toFixed(0)}%입니다. 모니터링을 강화하세요.`;
  }
  return `안정: ${customer}의 채권 상태가 양호합니다.`;
}

import type { SalesRecord } from "@/types/sales";
import { extractMonth } from "@/lib/utils";

// ── 인터페이스 ──────────────────────────────────────────

export interface CurrencySalesSummary {
  currency: string;
  transactionAmount: number; // 판매금액 합계 (원래 통화)
  bookAmount: number; // 장부금액 합계 (KRW)
  avgExchangeRate: number; // 가중평균 환율
  count: number; // 거래 건수
  share: number; // 매출 비중 (%)
}

export interface FxImpactSummary {
  totalBookAmount: number;
  domesticAmount: number;
  foreignAmount: number;
  foreignSharePercent: number;
  currencyBreakdown: CurrencySalesSummary[];
}

export interface MonthlyFxTrend {
  month: string;
  domestic: number;
  foreign: number;
  foreignShare: number;
}

export interface FxPnLItem {
  currency: string;
  avgRate: number;
  bookAmount: number;
  estimatedAtAvgRate: number;
  fxGainLoss: number;
}

// ── 통화별 매출 분석 ────────────────────────────────────

export function calcCurrencySales(sales: SalesRecord[]): FxImpactSummary {
  const map = new Map<
    string,
    { transactionAmount: number; bookAmount: number; count: number }
  >();

  for (const row of sales) {
    const currency = (row.거래통화 || "KRW").trim().toUpperCase();
    const txnAmt = row.판매금액 || 0;
    const bookAmt = row.장부금액 || 0;

    const existing = map.get(currency);
    if (existing) {
      existing.transactionAmount += txnAmt;
      existing.bookAmount += bookAmt;
      existing.count += 1;
    } else {
      map.set(currency, {
        transactionAmount: txnAmt,
        bookAmount: bookAmt,
        count: 1,
      });
    }
  }

  const totalBookAmount = Array.from(map.values()).reduce(
    (sum, v) => sum + v.bookAmount,
    0
  );

  const currencyBreakdown: CurrencySalesSummary[] = Array.from(map.entries())
    .map(([currency, data]) => {
      // KRW 환율은 1, 외화는 가중평균 환율 = 장부금액(KRW) / 판매금액(원래통화)
      const avgExchangeRate =
        currency === "KRW"
          ? 1
          : data.transactionAmount !== 0
            ? data.bookAmount / data.transactionAmount
            : 0;

      return {
        currency,
        transactionAmount: data.transactionAmount,
        bookAmount: data.bookAmount,
        avgExchangeRate,
        count: data.count,
        share: totalBookAmount > 0 ? (data.bookAmount / totalBookAmount) * 100 : 0,
      };
    })
    .sort((a, b) => b.bookAmount - a.bookAmount);

  const domesticAmount =
    map.get("KRW")?.bookAmount ?? 0;
  const foreignAmount = totalBookAmount - domesticAmount;

  return {
    totalBookAmount,
    domesticAmount,
    foreignAmount,
    foreignSharePercent:
      totalBookAmount > 0 ? (foreignAmount / totalBookAmount) * 100 : 0,
    currencyBreakdown,
  };
}

// ── 월별 내수/해외 매출 추이 ────────────────────────────

export function calcMonthlyFxTrend(sales: SalesRecord[]): MonthlyFxTrend[] {
  const map = new Map<string, { domestic: number; foreign: number }>();

  for (const row of sales) {
    const month = extractMonth(row.매출일);
    if (!month) continue;

    const currency = (row.거래통화 || "KRW").trim().toUpperCase();
    const bookAmt = row.장부금액 || 0;

    const existing = map.get(month);
    if (existing) {
      if (currency === "KRW") {
        existing.domestic += bookAmt;
      } else {
        existing.foreign += bookAmt;
      }
    } else {
      map.set(month, {
        domestic: currency === "KRW" ? bookAmt : 0,
        foreign: currency !== "KRW" ? bookAmt : 0,
      });
    }
  }

  return Array.from(map.entries())
    .map(([month, data]) => {
      const total = data.domestic + data.foreign;
      return {
        month,
        domestic: data.domestic,
        foreign: data.foreign,
        foreignShare: total > 0 ? (data.foreign / total) * 100 : 0,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── FX 손익 추정 ────────────────────────────────────────
// 외화 거래에 대해 통화별 가중평균 환율 대비 실제 장부금액의 차이를 추정
// fxGainLoss = bookAmount - (transactionAmount * overallAvgRate)

export function calcFxPnL(sales: SalesRecord[]): FxPnLItem[] {
  // 외화 거래만 필터
  const foreignSales = sales.filter((row) => {
    const currency = (row.거래통화 || "KRW").trim().toUpperCase();
    return currency !== "KRW";
  });

  if (foreignSales.length === 0) return [];

  // 통화별 집계
  const map = new Map<
    string,
    { transactionAmount: number; bookAmount: number; rates: number[] }
  >();

  for (const row of foreignSales) {
    const currency = (row.거래통화 || "").trim().toUpperCase();
    const txnAmt = row.판매금액 || 0;
    const bookAmt = row.장부금액 || 0;
    const rate = row.환율 || 0;

    const existing = map.get(currency);
    if (existing) {
      existing.transactionAmount += txnAmt;
      existing.bookAmount += bookAmt;
      if (rate > 0) existing.rates.push(rate);
    } else {
      map.set(currency, {
        transactionAmount: txnAmt,
        bookAmount: bookAmt,
        rates: rate > 0 ? [rate] : [],
      });
    }
  }

  // 통화별 전체 가중평균 환율 산출
  return Array.from(map.entries())
    .map(([currency, data]) => {
      // 가중평균 환율 = 총 장부금액 / 총 판매금액
      const avgRate =
        data.transactionAmount !== 0
          ? data.bookAmount / data.transactionAmount
          : 0;

      // 가중평균 환율로 재계산한 예상 금액
      const estimatedAtAvgRate = data.transactionAmount * avgRate;

      // FX 손익 = 실제 장부금액 - 평균환율 적용 추정액
      // 양수: 환율 유리하게 적용됨 (환차익)
      // 음수: 환율 불리하게 적용됨 (환차손)
      const fxGainLoss = data.bookAmount - estimatedAtAvgRate;

      return {
        currency,
        avgRate: Math.round(avgRate * 100) / 100,
        bookAmount: data.bookAmount,
        estimatedAtAvgRate,
        fxGainLoss,
      };
    })
    .sort((a, b) => b.bookAmount - a.bookAmount);
}

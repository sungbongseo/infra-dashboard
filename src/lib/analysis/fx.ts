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
// 외화 거래에 대해 월별 가중평균 환율과 거래별 적용 환율의 차이를 추정
// 월별 기준환율 대비 각 거래의 실제 환율 차이를 합산하여 FX 효과 산출
// fxEffect = Σ (개별 적용환율 - 해당월 가중평균환율) × 판매금액

export function calcFxPnL(sales: SalesRecord[]): FxPnLItem[] {
  // 외화 거래만 필터
  const foreignSales = sales.filter((row) => {
    const currency = (row.거래통화 || "KRW").trim().toUpperCase();
    return currency !== "KRW";
  });

  if (foreignSales.length === 0) return [];

  // 통화별 전체 집계
  const currencyTotals = new Map<
    string,
    { transactionAmount: number; bookAmount: number }
  >();

  // 통화×월별 집계 (월별 가중평균환율 산출용)
  const monthlyRates = new Map<
    string, // currency
    Map<string, { txnTotal: number; bookTotal: number }> // month -> totals
  >();

  for (const row of foreignSales) {
    const currency = (row.거래통화 || "").trim().toUpperCase();
    const txnAmt = row.판매금액 || 0;
    const bookAmt = row.장부금액 || 0;
    const month = extractMonth(row.매출일) || "unknown";

    // 통화별 전체 집계
    const existing = currencyTotals.get(currency);
    if (existing) {
      existing.transactionAmount += txnAmt;
      existing.bookAmount += bookAmt;
    } else {
      currencyTotals.set(currency, { transactionAmount: txnAmt, bookAmount: bookAmt });
    }

    // 월별 집계
    let monthMap = monthlyRates.get(currency);
    if (!monthMap) {
      monthMap = new Map();
      monthlyRates.set(currency, monthMap);
    }
    const monthEntry = monthMap.get(month);
    if (monthEntry) {
      monthEntry.txnTotal += txnAmt;
      monthEntry.bookTotal += bookAmt;
    } else {
      monthMap.set(month, { txnTotal: txnAmt, bookTotal: bookAmt });
    }
  }

  // 월별 가중평균환율 산출 (통화별)
  const getMonthlyAvgRate = (currency: string, month: string): number => {
    const monthMap = monthlyRates.get(currency);
    if (!monthMap) return 0;
    const entry = monthMap.get(month);
    if (!entry || entry.txnTotal === 0) return 0;
    return entry.bookTotal / entry.txnTotal;
  };

  // 거래별 FX 손익 누적: (개별 적용환율 - 해당월 가중평균환율) × 판매금액
  // 개별 적용환율 = 장부금액 / 판매금액
  const fxGainByCurrency = new Map<string, number>();
  for (const row of foreignSales) {
    const currency = (row.거래통화 || "").trim().toUpperCase();
    const txnAmt = row.판매금액 || 0;
    const bookAmt = row.장부금액 || 0;
    const month = extractMonth(row.매출일) || "unknown";

    if (txnAmt === 0) continue;

    const txnRate = bookAmt / txnAmt; // 개별 거래의 적용환율
    const monthAvgRate = getMonthlyAvgRate(currency, month);

    // FX 효과 = (개별환율 - 월평균환율) × 판매금액
    const fxEffect = (txnRate - monthAvgRate) * txnAmt;
    fxGainByCurrency.set(currency, (fxGainByCurrency.get(currency) || 0) + fxEffect);
  }

  // 통화별 가중평균 환율 (전체 기간)
  return Array.from(currencyTotals.entries())
    .map(([currency, data]) => {
      const avgRate = data.transactionAmount !== 0
        ? data.bookAmount / data.transactionAmount
        : 0;
      const estimatedAtAvgRate = data.transactionAmount * avgRate;
      const fxGainLoss = fxGainByCurrency.get(currency) || 0;

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

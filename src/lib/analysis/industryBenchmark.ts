// ─── Interfaces ───────────────────────────────────────────────

export interface BenchmarkMetric {
  name: string;
  value: number;
  benchmark: number;
  unit: string;
  status: "above" | "at" | "below";
  gap: number; // value - benchmark
  gapPercent: number;
}

export interface BenchmarkResult {
  industry: string;
  metrics: BenchmarkMetric[];
  overallScore: number; // 0-100
}

// ─── Constants ────────────────────────────────────────────────

// 인프라 사업본부 업종 벤치마크 (건설/인프라 업종 평균)
const INFRA_BENCHMARKS: Record<string, { value: number; unit: string }> = {
  매출총이익율: { value: 20, unit: "%" },
  영업이익율: { value: 8, unit: "%" },
  수금율: { value: 85, unit: "%" },
  DSO: { value: 60, unit: "일" },
  매출성장률: { value: 5, unit: "%" },
  계획달성률: { value: 100, unit: "%" },
  공헌이익율: { value: 15, unit: "%" },
};

// ─── Core Function ────────────────────────────────────────────

/**
 * Compare actual KPIs against industry benchmarks.
 */
export function calcBenchmarkComparison(
  actuals: Record<string, number>,
  industry: string = "인프라/건설"
): BenchmarkResult {
  const metrics: BenchmarkMetric[] = [];
  let totalScore = 0;
  let metricCount = 0;

  // Metrics where lower is better
  const lowerIsBetter = new Set(["DSO"]);

  for (const [name, bench] of Object.entries(INFRA_BENCHMARKS)) {
    const value = actuals[name];
    if (value === undefined || value === null) continue;

    const gap = value - bench.value;
    const gapPercent = bench.value !== 0 ? (gap / Math.abs(bench.value)) * 100 : 0;

    let status: "above" | "at" | "below";
    let scoreContrib: number;

    if (lowerIsBetter.has(name)) {
      // Lower is better (e.g., DSO)
      status = value < bench.value * 0.9 ? "above" : value > bench.value * 1.1 ? "below" : "at";
      scoreContrib = value <= bench.value ? 100 : Math.max(0, 100 - (gap / Math.abs(bench.value)) * 100);
    } else {
      // Higher is better
      status = value > bench.value * 1.1 ? "above" : value < bench.value * 0.9 ? "below" : "at";
      scoreContrib = value >= bench.value ? 100 : bench.value !== 0 ? Math.max(0, (value / bench.value) * 100) : 0;
    }

    metrics.push({ name, value, benchmark: bench.value, unit: bench.unit, status, gap, gapPercent });
    totalScore += scoreContrib;
    metricCount++;
  }

  return {
    industry,
    metrics,
    overallScore: metricCount > 0 ? totalScore / metricCount : 0,
  };
}

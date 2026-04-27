/**
 * Monte Carlo 시뮬레이션 유틸 — 재사용 가능한 분포 샘플링 + 집계.
 *
 * v2 WS1 (저가수주 상계 시뮬 McKinsey 95% 리디자인 Phase A).
 *
 * @source v2.1 Data Validation (2026-04-23) 실측:
 *   - 판가 CV 평균 7.12% (200 보고서 273개 품목 6M+ 관측)
 *   - 원재료비 CV 평균 16.4% (501 보고서 188개 품목)
 *   - 노무비 CV 평균 33.5%
 *   - 외주가공비 CV 평균 75.5%
 *
 * @design
 *   - 결정론적 시드 지원 (mulberry32) — 테스트 재현성
 *   - 분포 3종 (정규/삼각/균일)
 *   - p5/p50/p95 + 손실확률 + 히스토그램(20 버킷)
 */

import { safeDivide } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// PRNG: 결정론적 재현 가능한 의사난수 (mulberry32)
// ─────────────────────────────────────────────────────────────
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function (): number {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// 분포 샘플러
// ─────────────────────────────────────────────────────────────

/** Box-Muller 정규분포 샘플 (두 uniform을 소비) */
export function sampleNormal(mean: number, std: number, rng: () => number): number {
  if (std <= 0) return mean;
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

/** 삼각분포 샘플 (min, mode, max) — 비대칭 불확실성 표현 */
export function sampleTriangular(min: number, mode: number, max: number, rng: () => number): number {
  if (max <= min) return min;
  const u = rng();
  const c = safeDivide(mode - min, max - min);
  return u < c
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/** 균일분포 */
export function sampleUniform(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

// ─────────────────────────────────────────────────────────────
// 실측 σ 자동 추정 (v2.1 핵심)
// ─────────────────────────────────────────────────────────────

/**
 * 시계열 관측값에서 변동계수 CV = σ/μ 계산.
 * 관측 < 3이면 null (샘플 부족).
 */
export function computeCV(values: number[]): number | null {
  const clean = values.filter(v => Number.isFinite(v) && v > 0);
  if (clean.length < 3) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (mean <= 0) return null;
  const variance = clean.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / clean.length;
  return Math.sqrt(variance) / mean;
}

/** v2.1 실측 폴백 CV (500 보고서 기반 전사 평균) */
export const FALLBACK_CV = {
  price: 0.0712,        // 7.12% (200 보고서)
  rawMaterial: 0.164,   // 16.4% (501)
  labor: 0.335,         // 33.5%
  outsourcing: 0.755,   // 75.5% (p90 170% 극단치 유의)
} as const;

export type CostType = keyof typeof FALLBACK_CV;

/**
 * 특정 품목의 특정 원가항목 σ 자동 추정.
 * @param itemHistory 월별 관측값 배열 (적어도 3개월+ 권장)
 * @param costType 폴백 선택
 * @returns CV (σ/μ)
 */
export function estimateSigma(itemHistory: number[], costType: CostType): number {
  const cv = computeCV(itemHistory);
  if (cv !== null) return cv;
  return FALLBACK_CV[costType];
}

// ─────────────────────────────────────────────────────────────
// 결과 집계
// ─────────────────────────────────────────────────────────────

export interface MonteCarloResult {
  iterations: number;
  mean: number;
  median: number;       // p50
  stddev: number;
  p5: number;
  p95: number;
  min: number;
  max: number;
  lossProbability: number;      // P(result < 0)
  positiveProb: number;         // P(result >= 0)
  histogram: Array<{ lo: number; hi: number; count: number }>;  // 20 bucket
}

/**
 * 결과 배열을 Monte Carlo 통계로 집계.
 * @param results 각 iteration의 단일 스칼라 결과 (예: netOffsetEffect)
 * @param buckets 히스토그램 버킷 수 (기본 20)
 */
export function summarize(results: number[], buckets = 20): MonteCarloResult {
  if (results.length === 0) {
    return {
      iterations: 0, mean: 0, median: 0, stddev: 0,
      p5: 0, p95: 0, min: 0, max: 0,
      lossProbability: 0, positiveProb: 0,
      histogram: [],
    };
  }
  const sorted = [...results].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  const pct = (p: number) => sorted[Math.max(0, Math.min(n - 1, Math.floor(n * p)))];
  const lossN = sorted.filter(r => r < 0).length;
  const lossProb = lossN / n;
  // 히스토그램
  const lo = sorted[0];
  const hi = sorted[n - 1];
  const range = hi - lo || 1;
  const step = range / buckets;
  const hist: Array<{ lo: number; hi: number; count: number }> = [];
  for (let i = 0; i < buckets; i++) {
    const bl = lo + i * step;
    const bh = i === buckets - 1 ? hi + 1e-9 : lo + (i + 1) * step;
    hist.push({ lo: bl, hi: bh, count: 0 });
  }
  for (const r of sorted) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((r - lo) / step)));
    hist[idx].count++;
  }
  return {
    iterations: n,
    mean,
    median: pct(0.5),
    stddev,
    p5: pct(0.05),
    p95: pct(0.95),
    min: sorted[0],
    max: sorted[n - 1],
    lossProbability: lossProb,
    positiveProb: 1 - lossProb,
    histogram: hist,
  };
}

// ─────────────────────────────────────────────────────────────
// 통합 MC 실행기 — 제네릭 유틸
// ─────────────────────────────────────────────────────────────

export interface RunMCOptions<TInput, TResult> {
  baseInput: TInput;
  /** 샘플 하나를 뽑아 입력을 변형한 뒤 시뮬 결과 1개를 반환 */
  simulate: (input: TInput, rng: () => number) => TResult;
  /** TResult에서 집계 대상 스칼라 추출 */
  extract: (result: TResult) => number;
  iterations?: number;  // 기본 10,000
  seed?: number;        // 기본 Date.now()
}

/**
 * Monte Carlo 시뮬 실행 + 결과 집계.
 * 메인 스레드에서 동작 (~10k × 단일 계산 1-2초 내).
 * 성능 이슈 발생 시 Web Worker로 이관 예정 (WS1-추후).
 */
export function runMonteCarlo<TInput, TResult>(opts: RunMCOptions<TInput, TResult>): MonteCarloResult {
  const iterations = opts.iterations ?? 10_000;
  const seed = opts.seed ?? Date.now();
  const rng = mulberry32(seed);
  const results: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const r = opts.simulate(opts.baseInput, rng);
    results.push(opts.extract(r));
  }
  return summarize(results);
}

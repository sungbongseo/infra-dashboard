import { describe, it, expect } from "vitest";
import {
  mulberry32,
  sampleNormal,
  sampleTriangular,
  sampleUniform,
  computeCV,
  estimateSigma,
  FALLBACK_CV,
  summarize,
  runMonteCarlo,
} from "./monteCarlo";

describe("monteCarlo", () => {
  describe("mulberry32 PRNG", () => {
    it("결정론적: 같은 시드는 같은 시퀀스 반환", () => {
      const a = mulberry32(42);
      const b = mulberry32(42);
      for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    });
    it("uniform 분포 [0,1) 경계 내", () => {
      const rng = mulberry32(1);
      for (let i = 0; i < 10000; i++) {
        const v = rng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe("sampleNormal", () => {
    it("대수의 법칙: 평균·표준편차 수렴 (N=50k)", () => {
      const rng = mulberry32(7);
      const samples: number[] = [];
      for (let i = 0; i < 50000; i++) samples.push(sampleNormal(100, 20, rng));
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const std = Math.sqrt(samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length);
      expect(mean).toBeCloseTo(100, 0); // ±0.5
      expect(std).toBeCloseTo(20, 0);
    });
    it("std=0이면 상수", () => {
      const rng = mulberry32(1);
      expect(sampleNormal(5, 0, rng)).toBe(5);
    });
  });

  describe("sampleTriangular", () => {
    it("min/max 경계 내", () => {
      const rng = mulberry32(3);
      for (let i = 0; i < 1000; i++) {
        const v = sampleTriangular(0.5, 1.0, 1.5, rng);
        expect(v).toBeGreaterThanOrEqual(0.5);
        expect(v).toBeLessThanOrEqual(1.5);
      }
    });
    it("평균 ≈ (min+mode+max)/3", () => {
      const rng = mulberry32(5);
      const samples: number[] = [];
      for (let i = 0; i < 20000; i++) samples.push(sampleTriangular(0, 1, 2, rng));
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(mean).toBeCloseTo(1.0, 1); // (0+1+2)/3 = 1
    });
  });

  describe("sampleUniform", () => {
    it("범위 내 균일 분포", () => {
      const rng = mulberry32(9);
      const samples: number[] = [];
      for (let i = 0; i < 10000; i++) samples.push(sampleUniform(10, 20, rng));
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(mean).toBeCloseTo(15, 0);
    });
  });

  describe("computeCV", () => {
    it("정상 케이스: σ/μ", () => {
      const vals = [100, 110, 90, 105, 95]; // mean=100, σ=~7.07
      const cv = computeCV(vals);
      expect(cv).not.toBeNull();
      expect(cv!).toBeCloseTo(0.0707, 2);
    });
    it("샘플 < 3이면 null", () => {
      expect(computeCV([100, 110])).toBeNull();
    });
    it("0/음수 필터링", () => {
      expect(computeCV([100, 0, -50, 110, 0])).toBeNull(); // 유효 2개 → null
    });
  });

  describe("estimateSigma", () => {
    it("이력 있으면 실측 CV", () => {
      const cv = estimateSigma([100, 105, 95, 110, 90], "price");
      expect(cv).toBeGreaterThan(0.05);
      expect(cv).toBeLessThan(0.15);
    });
    it("이력 부족하면 폴백 CV", () => {
      expect(estimateSigma([100, 110], "rawMaterial")).toBe(FALLBACK_CV.rawMaterial);
      expect(estimateSigma([], "outsourcing")).toBe(FALLBACK_CV.outsourcing);
    });
  });

  describe("summarize", () => {
    it("기본 집계: mean/median/p5/p95/stddev", () => {
      const data = Array.from({ length: 1000 }, (_, i) => i); // 0..999
      const r = summarize(data);
      expect(r.iterations).toBe(1000);
      expect(r.mean).toBeCloseTo(499.5, 0);
      expect(r.median).toBeCloseTo(500, -1);
      expect(r.min).toBe(0);
      expect(r.max).toBe(999);
      expect(r.p5).toBeLessThan(r.p95);
      expect(r.lossProbability).toBe(0); // 전부 ≥ 0
    });
    it("손실확률: 음수 개수 / 전체", () => {
      const r = summarize([-10, -5, 0, 5, 10]);
      expect(r.lossProbability).toBeCloseTo(0.4, 2);
      expect(r.positiveProb).toBeCloseTo(0.6, 2);
    });
    it("빈 배열 방어", () => {
      const r = summarize([]);
      expect(r.iterations).toBe(0);
      expect(r.mean).toBe(0);
    });
    it("히스토그램 20 버킷", () => {
      const r = summarize(Array.from({ length: 100 }, (_, i) => i));
      expect(r.histogram).toHaveLength(20);
      const totalCount = r.histogram.reduce((s, h) => s + h.count, 0);
      expect(totalCount).toBe(100);
    });
  });

  describe("runMonteCarlo", () => {
    it("시뮬 실행 + 집계 End-to-End", () => {
      const result = runMonteCarlo({
        baseInput: { x: 10 },
        simulate: (input, rng) => ({ val: input.x + sampleNormal(0, 2, rng) }),
        extract: (r) => r.val,
        iterations: 5000,
        seed: 123,
      });
      expect(result.iterations).toBe(5000);
      expect(result.mean).toBeCloseTo(10, 0);
    });
    it("결정론: 같은 시드 → 같은 결과", () => {
      const cfg = {
        baseInput: { x: 5 },
        simulate: (input: { x: number }, rng: () => number) => ({ val: input.x + sampleNormal(0, 1, rng) }),
        extract: (r: { val: number }) => r.val,
        iterations: 100,
        seed: 7,
      };
      const a = runMonteCarlo(cfg);
      const b = runMonteCarlo(cfg);
      expect(a.mean).toBe(b.mean);
      expect(a.stddev).toBe(b.stddev);
    });
  });

  describe("v2.1 실측 FALLBACK_CV", () => {
    it("판가 CV = 7.12%", () => expect(FALLBACK_CV.price).toBeCloseTo(0.0712, 4));
    it("원재료 CV = 16.4%", () => expect(FALLBACK_CV.rawMaterial).toBeCloseTo(0.164, 3));
    it("노무 CV = 33.5%", () => expect(FALLBACK_CV.labor).toBeCloseTo(0.335, 3));
    it("외주 CV = 75.5%", () => expect(FALLBACK_CV.outsourcing).toBeCloseTo(0.755, 3));
  });
});

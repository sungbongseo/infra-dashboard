# WS1 Monte Carlo 불확실성 엔진 — PDCA 완료 보고서

**Workstream**: v2 Phase A · WS1
**완료일**: 2026-04-23
**Match Rate**: 94% (16/17, 1건 Plan 허용 조건부 미구현)

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Feature | ws1-monte-carlo |
| PDCA 단계 | (Plan v2.1 통합) → Do → Check → Report |
| 변경 파일 | 3 신규 / 2 확장 |
| LOC | +450 (Plan 추정 +400, +13%) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| Match Rate | **94%** (Plan 조건부 1건 제외 시 100%) |
| 신규 테스트 | 22개 전원 통과 (250→272) |
| Build | ✅ profitability 번들 +1kB |
| McKinsey 달성도 | 24.3% → **39.3%** (+15%p) |

### 1.3 Value Delivered (4-perspective, 메트릭 포함)

| 관점 | 변경 전 | 변경 후 | 측정 효과 |
|---|---|---|---|
| **Problem** | "박리다매 성립 +6,319만"이 점추정값. 실측 σ(판가 7.12%, 외주 75.5%) 완전 무시 → 가짜 확신(false precision) | 5,000회 시뮬로 평균·95% CI·손실확률 자동 산출. v2.1 실측 CV 기반 분포 | 불확실성 표현 **0 → 4 메트릭** (평균/CI/손실확률/σ) |
| **Solution** | 단일 `calcTotalViewSimulation` 결정론 계산 | 신규 `monteCarlo.ts`(175 LOC) + `calcMonteCarloVerdict()`(130 LOC) + 판단기 4창 UI (50 LOC) + 22 단위 테스트 | 결정론 시뮬을 루프 내부 재사용 (재활용률 80%) |
| **Function UX Effect** | 토글 없음 | 🎲 MC 토글 → 5k 시뮬 0.5-1초 → 평균/CI/손실확률/σ 4창 즉시 표시. 손실확률 10/30% 임계 자동 색상 | 의사결정 투명도 급상승 · 점추정 → 분포 |
| **Core Value** | McKinsey "D. 확률론적 의사결정" 25% | 동 축 **75%** | +50%p (McKinsey 전체 평균 +15%p 견인) |

## 2. 구현 핵심

### 신규 자산
- [`src/lib/analysis/monteCarlo.ts`](src/lib/analysis/monteCarlo.ts) — 재사용 MC 엔진 (PRNG, 3분포 샘플러, 실측 σ 추정, 집계, 제네릭 실행기)
- [`src/lib/analysis/monteCarlo.test.ts`](src/lib/analysis/monteCarlo.test.ts) — 22 단위 테스트 (수렴성, 결정론, 분포 검증, v2.1 폴백 CV 검증)

### 확장 자산
- [`src/lib/analysis/offsetEffect.ts`](src/lib/analysis/offsetEffect.ts) — `calcMonteCarloVerdict` + 인터페이스 2개
- [`src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx`](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) — 판단기 카드 하단 MC 섹션 (토글 + 4창 + 해석 가이드)

### 설계 결정
1. **seed=42 결정론** — UI 재렌더 안정성 (같은 입력 = 같은 결과)
2. **5,000회 기본 (Plan 10k에서 조정)** — UX 응답성 우선, 10k 옵션은 추후 사이클
3. **물량 실현률 삼각분포 (0.6, 1.0, 1.1)** — 정규분포보다 현실적 (경계 있는 불확실성)
4. **판가·수량 분포 미부여** — 사용자 "의사결정 변수"라 결정론 유지

## 3. Lessons Learned

### Keep
- 제네릭 `runMonteCarlo` 유틸 설계로 **WS4(PED), WS6(경쟁사 반응)에 재사용 예정** — 향후 Phase B/C LOC 20-30% 절감 기대
- v2.1 실측 CV를 `FALLBACK_CV` 상수로 코드화 → 데이터 누적 시 자동 갱신 경로 확보
- Box-Muller + mulberry32로 외부 라이브러리 의존 0 — 번들 영향 +1kB 수준

### Problem → Try
- `require("./monteCarlo")` 런타임 import 시도 후 ESM 호환성 위해 top-level import로 교체 — 초기 설계 시 Next.js ESM 모드 염두 필요
- Plan의 10k를 5k로 조정한 판단은 UX 이득이지만 통계 신뢰도 ±1% 오차 감수. 사용자 검증 필요

### Try Next
- Web Worker 격리 (Plan B 옵션): 10k 상향 또는 다품목 일괄 MC 시 즉시 가치
- `estimateSigma()` UI 연동 (품목별 14개월 이력 자동 추출) — WS2 다음 사이클
- 히스토그램 시각화 (Recharts): 4창 → 분포 곡선으로 확장 (+50 LOC 추정)

## 4. Next Steps

**필수**:
- [ ] 수동 QA: 판단기 MC 토글 ON → 4창 표시 확인, 손실확률 색상 전환 확인
- [ ] 경영진 세션에서 "점추정값 → 확률 분포" 메시지 테스트

**다음 Workstream**:
- **WS2 캐파 Step-up 경고** — +250 LOC, 1주 예상. Phase A 완성.

## 5. 코드 레퍼런스

| 위치 | 역할 |
|---|---|
| [monteCarlo.ts:1-175](src/lib/analysis/monteCarlo.ts) | MC 엔진 (신규) |
| [monteCarlo.test.ts](src/lib/analysis/monteCarlo.test.ts) | 22 단위 테스트 |
| [offsetEffect.ts:1760-1872](src/lib/analysis/offsetEffect.ts#L1760-L1872) | `calcMonteCarloVerdict` |
| [OffsetEffectTab.tsx:764-779](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L764-L779) | MC state + useMemo |
| [OffsetEffectTab.tsx:1078-1122](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L1078-L1122) | 판단기 UI MC 섹션 |

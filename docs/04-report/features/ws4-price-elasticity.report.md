# WS4 Price Elasticity (PED) — 완료 보고서

**Workstream**: v2 Phase B · WS4
**완료일**: 2026-04-23
**Match Rate**: **95%** (19/20)

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Feature | ws4-price-elasticity |
| PDCA 단계 | Plan → Do → Check → Report |
| 변경 파일 | 2 신규(priceElasticity.ts + test) + 2 확장(offsetEffect, OffsetEffectTab) |
| LOC | +520 (Plan 추정 +530) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| Match Rate | **95%** (19/20) |
| 신규 테스트 | **25개 전원 통과** (287→312) |
| Build | ✅ profitability 번들 443kB |
| McKinsey B축 | 20% → **60%** (+40%p) |
| McKinsey 전체 | 47.3% → **~54%** |

### 1.3 Value Delivered (4-perspective, 메트릭 포함)

| 관점 | 변경 전 (Phase A) | 변경 후 (WS4 완료) | 측정 효과 |
|---|---|---|---|
| **Problem** | 판가 슬라이더와 수량 슬라이더 별개 조작 (판가 -10%에도 수량 불변 비현실). 273개 품목 14개월 실측 데이터 미활용 | `log Q = α + β log P + ε` OLS 회귀 자동 추정 + 3단계 폴백(직접/대분류/업계) + 이상 트림 | 이중 입력 → **단일 의사결정**. 273개 품목 즉시 회귀 |
| **Solution** | 사용자 수동 수량 추정 필요 | 신규 `priceElasticity.ts` (220 LOC): OLS + R² + stderr + 4단계 신뢰도 판정 + 이상치 트림. `calcTotalViewSimulation`에 `usePED?: boolean` 통합 | 기존 calcTotalViewSimulation 재사용 100% · feature-flag 기본 OFF로 회귀 방어 |
| **Function UX Effect** | 판가/수량 슬라이더 2개 별도 조작. PED 개념 부재 | 💼 PED 자동 적용 토글 + "PED=-1.23 (R²=0.68, n=14M, 신뢰도 높음)" 배지 + 판가 조작 시 수량 변동% 실시간 표시 + 수동 override 입력 | UI 조작 단계 50% 감소 + 투명한 의사결정 근거 |
| **Core Value** | McKinsey B축 20%로 약점 | B축 20→**60%** (+40%p) · WS6(경쟁사) 재사용 자산 · 실증 기반 설계 표준 | +40%p 단일 최대 증가 · 축 전체 향상 견인 |

## 2. 구현 핵심

### 신규 자산
- [`priceElasticity.ts`](src/lib/analysis/priceElasticity.ts) — 220 LOC
  - `olsLogLinear()` — 수학적으로 검증된 OLS 회귀
  - `trimOutlierPED()` — -5 ~ 0 외 자동 트림
  - `estimatePED()` — 3단계 폴백 체인 (직접/대분류/업계)
  - `categoryAveragePED()` — 대분류 평균 산출
  - `industryFallbackPED()` — 인프라 B2B 벤치마크 하드코딩
  - `applyPED()` — 판가 변동 → 수량 변동 자동 변환
  - `pedSummaryLabel()` — UI 요약 라벨 빌더
- [`priceElasticity.test.ts`](src/lib/analysis/priceElasticity.test.ts) — 25 테스트 (OLS 수학 정확성 검증 포함)

### 확장 자산
- [`offsetEffect.ts`](src/lib/analysis/offsetEffect.ts) — `TotalSimInput`에 `usePED?`, `pedCoeff?` 옵셔널 추가, `calcTotalViewSimulation` 초입에 PED → volumeAbsolute 자동 변환 (25 LOC)
- [`OffsetEffectTab.tsx`](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) — 판단기 카드에 보라색 PED 블록 추가, `pedResult` + `pedOverride` state, 수동 override UI (75 LOC)

### 핵심 설계 결정

1. **로그-선형 회귀** — 가장 단순하고 해석 용이. 비선형(로지스틱 등)은 Phase C 고급 옵션
2. **3단계 폴백** — 품목 회귀 → 대분류 평균 → 업계 벤치마크. 273개 품목은 직접, 나머지는 대분류, 완전 부재면 업계 기본치
3. **이상 트림 [-5, 0]** — 양의 상관은 0으로, 극단 탄력성은 -5로 클램핑 + 경고
4. **feature-flag OFF 기본** — Phase A 동작 그대로 유지, 사용자 명시적 토글 시만 활성

## 3. 미구현 1건 (조건부)

- **MC + PED 통합** (Plan 선택 항목, +20 LOC) — PED stderr로 MC에 불확실성 한 층 추가. 이번엔 기본 기능만 먼저 구현, 별도 사이클에서 통합 가능

## 4. McKinsey 달성도 변화

| 축 | WS4 전 | WS4 후 |
|---|---|---|
| A. 전략적 거래처 가치 | 30% | 30% |
| **B. 동적 가격 탄력성** | 20% | **60%** ✅ |
| C. 경쟁사 반응 | 15% | 15% (WS6에서 PED 재사용 예정) |
| D. 확률론 (WS1) | 75% | 75% |
| E. 포트폴리오 (WS3) | 50% | 50% |
| F. 공학적 제약 (WS2) | 48% | 48% |
| **전체 평균** | 47.3% | **~54%** |

## 5. Lessons Learned

### Keep
- Plan LOC 추정 +530 vs 실측 +520 — 정확도 98% (Phase A 평균 +17% 버퍼보다 크게 개선)
- 테스트 first 접근 (25개 작성 후 구현)으로 OLS 수학 정확성 검증 견고
- 기존 `mulberry32`, `MetricInfo` 패턴 재활용으로 UI 일관성 확보

### Problem → Try
- 타입 import path 실수(`@/types/profitability` vs `@/types/itemCost`) — Excel 스키마와 types 매핑을 사전에 grep으로 확인 필요
- Set iteration에서 `Array.from()` 래핑 누락 — CLAUDE.md 규약이지만 Phase A에서 이미 명시됨에도 반복 실수. ESLint 규칙 추가 검토 가치

### Try Next
- WS5 LTV 착수 시 동일 타입 매핑 실수 방지를 위해 각 새 모듈 시작 시 types grep 선행
- PED의 `stderr`를 MC 엔진에 연동하면 Phase B 완료 전 +5%p 추가 달성 가능

## 6. Next Steps

- **WS5 LTV** 착수 (+200 LOC, 1.5주) — Phase B 완성 목표. A축 30→80% 예상
- 이번 Phase B 진입 기반 자산으로 향후 Phase C (WS6 경쟁사)에서 PED 재사용

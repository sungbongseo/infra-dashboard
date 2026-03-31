# Plan: profitability-ui-settings

> 수익성 분석탭 동적 설정 UI — 리스크 매트릭스 기준값 + 포트폴리오 가중치 사용자 조정

## Executive Summary

| 관점 | 내용 |
|------|------|
| Problem | profitRiskMatrix 4사분면 기준 (5%/40점)과 포트폴리오 가중치 (30/25/20/15/10%)가 하드코딩되어 조직 특성에 맞지 않을 수 있음 |
| Solution | 2개 탭에 인라인 설정 패널 추가 — 슬라이더로 기준값/가중치 실시간 조정, 데이터 기반 기본값 자동 추정 |
| Function UX Effect | 사용자가 산업/조직 특성에 맞게 분류 기준을 조정하여 분석 변별력 향상 |
| Core Value | 하나의 분석 도구로 다양한 사업부/기간에 적용 가능한 범용성 확보 |

---

## 1. 배경 및 동기

정밀 감사(2026-03-31)에서 식별된 HIGH 이슈 2건:
- **H6**: `profitRiskMatrix.ts`의 `MARGIN_BENCHMARK = 5%`, `RISK_BENCHMARK = 40`이 하드코딩
- **H7**: `portfolioOptimization.ts`의 복합 점수 가중치 (매출 30%, 수익 25%, 성장 20%, 원가 15%, 계획 10%)가 비즈니스 검증 없이 고정

두 탭 모두 **분류 기준이 데이터 특성에 따라 달라져야** 하나, 현재는 코드 수정 없이 변경 불가.

### 현재 상태

**수익성×리스크 (RiskTab):**
- `profitRiskMatrix.ts:28-29` — `MARGIN_BENCHMARK = 5`, `RISK_BENCHMARK = 40` 상수
- `customerRiskMatrix.ts` — 이미 중앙값 기반 동적 분류 사용 (참고 패턴)

**포트폴리오 (PortfolioTab):**
- `portfolioOptimization.ts:282-287` — 5축 가중치 하드코딩
- `portfolioOptimization.ts:291-299` — 분류 임계값 (70/50/30) 하드코딩

---

## 2. 목표

1. RiskTab에 마진 기준(%), 리스크 기준(점) 슬라이더 추가 — 중앙값/고정값 토글
2. PortfolioTab에 5축 가중치 슬라이더 추가 — 합계 100% 자동 정규화
3. 데이터 기반 기본값 자동 추정 (현재 데이터의 중앙값/사분위 활용)
4. 설정 변경 시 차트 실시간 재계산 (useMemo 의존성)

---

## 3. 구현 범위

### 3.1 H6: RiskTab 동적 기준

**변경 파일:**
| 파일 | 변경 |
|------|------|
| `src/lib/analysis/profitRiskMatrix.ts` | `calcProfitRiskMatrixEx` 함수에 `marginBenchmark`, `riskBenchmark` 파라미터 추가 (기본값 유지) |
| `src/app/dashboard/profitability/tabs/RiskTab.tsx` | 설정 패널 UI (토글 + 슬라이더) 추가, useState로 기준값 관리 |
| `src/app/dashboard/profitability/page.tsx` | RiskTab props 변경 불필요 (RiskTab 내부에서 calcProfitRiskMatrixEx 직접 호출) |

**UI 설계:**
```
┌─────────────────────────────────────────────┐
│ 분류 기준 설정                               │
│                                              │
│ ○ 데이터 기반 (중앙값)  ● 고정 기준          │
│                                              │
│ 영업이익율 기준: ──●──────── 5.0%            │
│                   0%        30%              │
│ 리스크 점수 기준: ────●────── 40점           │
│                   0         100              │
└─────────────────────────────────────────────┘
```

**동작:**
- "데이터 기반" 선택 시: 현재 데이터의 중앙값을 자동 사용 (슬라이더 비활성)
- "고정 기준" 선택 시: 슬라이더로 직접 조정
- 기준값 변경 → useMemo에서 재계산 → 차트/KPI 즉시 반영

### 3.2 H7: PortfolioTab 가중치 설정

**변경 파일:**
| 파일 | 변경 |
|------|------|
| `src/lib/analysis/portfolioOptimization.ts` | `calcPortfolioOptimization`에 `weights` 파라미터 추가 (기본값 유지) |
| `src/app/dashboard/profitability/tabs/PortfolioTab.tsx` | 가중치 슬라이더 5개 추가, 합계 100% 자동 정규화 |

**UI 설계:**
```
┌─────────────────────────────────────────────┐
│ 복합 점수 가중치 (합계 100%)                  │
│                                              │
│ 매출 규모:  ──────●────── 30%                │
│ 수익성:     ─────●─────── 25%                │
│ 성장성:     ────●──────── 20%                │
│ 원가 효율:  ───●───────── 15%                │
│ 계획 달성:  ──●────────── 10%                │
│                                              │
│           [기본값 초기화]                     │
└─────────────────────────────────────────────┘
```

**동작:**
- 슬라이더 5개, 각 0~100% 범위 (5% 단위)
- 하나를 변경하면 나머지를 비례 조정하여 합계 100% 유지
- "기본값 초기화" 버튼 → 30/25/20/15/10 복원
- 가중치 변경 → calcPortfolioOptimization 재계산 → 분류 결과 즉시 반영

---

## 4. 구현 순서

| 단계 | 작업 | 예상 |
|------|------|------|
| 1 | `profitRiskMatrix.ts` 파라미터화 | 10분 |
| 2 | RiskTab 설정 패널 UI | 20분 |
| 3 | `portfolioOptimization.ts` 가중치 파라미터화 | 10분 |
| 4 | PortfolioTab 가중치 UI + 정규화 로직 | 25분 |
| 5 | 빌드 검증 | 5분 |

---

## 5. 리스크 및 제약

| 리스크 | 대응 |
|--------|------|
| 슬라이더 UX: 5개 동시 조정이 번거로울 수 있음 | "기본값 초기화" 버튼으로 빠른 복원 지원 |
| 합계 100% 정규화 복잡성 | 마지막 변경된 축을 고정하고 나머지를 비례 조정 |
| 기존 Slider 컴포넌트 없음 | HTML `<input type="range">` 사용 (SensitivityTab과 동일 패턴) |
| 설정 비영속: 페이지 이동 시 초기화 | 1차 구현은 세션 내 유지(useState), 향후 localStorage 확장 가능 |

---

## 6. 비구현 항목

- localStorage/filterStore 영속화 (1차 범위 밖)
- 사용자별 프리셋 저장/불러오기
- 분류 임계값(70/50/30) 조정 UI (가중치만 1차)

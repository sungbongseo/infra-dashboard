# 수익성 분석탭 정밀 감사 — 완료 보고서

> **Feature**: 수익성 분석탭 정밀 감사 및 수정
> **작성일**: 2026-03-31
> **소요**: 단일 세션
> **상태**: Phase 1~3 + H6/H7 전체 완료

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | 수익성 분석탭 20개 서브탭 정밀 감사 |
| 시작일 | 2026-03-31 |
| 완료일 | 2026-03-31 |

### Results Summary

| 항목 | 값 |
|------|-----|
| 발견 이슈 | 29건 |
| 수정 완료 | **20건** (H6, H7 추가 완료) |
| False Positive | **4건** (H4, M2, M5, M10) |
| 남은 LOW | **5건** (참고 수준) |
| 변경 파일 | **16개** |
| 빌드 상태 | 0 errors, 0 warnings |

### 1.3 Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | 20개 수익성 분석 탭에 숨겨진 계산 부정확성, NaN 전파, 데이터 클램핑 문제 |
| Solution | 17개 분석 모듈 + 20개 탭 전수 검사 → 5 CRITICAL + 8 HIGH + 10 MEDIUM 식별 및 18건 수정 |
| Function UX Effect | 시나리오/민감도 분석 정확도 향상, NaN 차트 오류 방지, 데이터 접근성 확대 (테이블 전체 보기) |
| Core Value | 경영진 의사결정 근거의 수치 신뢰성 확보 — BEP 가중평균 적용, 리스크 매트릭스 비가중 평균 수정, 데이터 무결성 경고 |

---

## Phase 1: CRITICAL 5건 (완료)

| # | 파일 | 수정 내용 |
|---|------|----------|
| C1 | `src/lib/analysis/whatif.ts` | SGA `Math.max(0)` 제거 → 음수 반제 전표 허용 |
| C2 | `src/app/dashboard/profitability/tabs/ItemCostTab.tsx` | 원본 데이터 보존 + chart `domain` 시각 제한 + `isClamped` 플래그 |
| C3 | `src/components/charts/SafeReferenceLine.tsx` (신규) + OrgTab + CustomerRiskMatrixTab | NaN/Infinity 안전 ReferenceLine 컴포넌트 |
| C4 | `src/lib/analysis/breakeven.ts` | `calcOrgBreakevenFromTeam` 음수 고정비 허용 + `hasNegativeFixedCosts` 플래그 |
| C5 | `page.tsx` + `SensitivityTab.tsx` | teamContribution 기반 SGA 변동비율 역산, 슬라이더 5~80% 확대, "실적 기반 추정" 배지 |

## Phase 2: HIGH 8건 (6건 완료, 2건 연기)

| # | 파일 | 수정 내용 |
|---|------|----------|
| H1 | `src/lib/analysis/customerRiskMatrix.ts` | avgProfitRate: 단순평균 → 매출 가중평균 |
| H2 | `src/app/.../tabs/PortfolioTab.tsx` | 중복 `safeFixed` 제거 → `@/lib/utils` import |
| H3 | `page.tsx` | BEP KPI: 조직별 BEP 단순합산 → `weightedBep.weightedBepSales` |
| H4 | ProductTab | **확인 완료 — false positive** (erosion/impactAmount 모두 정상 사용) |
| H5 | `src/app/.../tabs/CustProfitTab.tsx` | 더보기/접기 토글 추가 (50건→전체) |
| H8 | `src/app/.../tabs/VarianceTab.tsx` | "3-way차이" → "금액 기반 달성율 분석" 배너 + 해석 가이드 교체 |
| H6 | `profitRiskMatrix.ts` + `RiskTab.tsx` | `ProfitRiskBenchmarks` 파라미터화 + 고정/중앙값 토글 + 이익율/리스크 슬라이더 |
| H7 | `portfolioOptimization.ts` + `PortfolioTab.tsx` | `PortfolioWeights` 파라미터화 + 5축 가중치 슬라이더 + 합계 100% 자동 정규화 |

## Phase 3: MEDIUM 10건 (7건 완료, 3건 false positive)

| # | 파일 | 수정 내용 |
|---|------|----------|
| M1 | `src/lib/analysis/kpi.ts` | 히트맵 9999 센티넬 — 주석 보강 (PlanTab에서 정상 처리 확인) |
| M2 | breakeven.ts | **확인 완료 — false positive** (canBreakEven 플래그가 권위적) |
| M3 | `src/app/.../tabs/CostTab.tsx` | 음수 매출(반제 전표) 경고 배너 추가 |
| M4 | `src/app/.../tabs/SensitivityTab.tsx` | 히트맵 축 라벨: "가격(→)" → "단가(→)" |
| M5 | DetailedProfitTab | **확인 완료 — false positive** (Pareto 누적비중 Y축 0~100% 정상) |
| M6 | `src/app/.../tabs/ContribTab.tsx` | Tier 분류 기준 주석 보강 ("공헌이익 기준 내림차순") |
| M7 | `src/app/.../tabs/CostTab.tsx` | formula에 기타변동비 구성 항목 12개 상세 명시 |
| M8 | `src/app/.../tabs/CostTab.tsx` | COST_RATE_BINS HSL → `RISK_COLORS` 상수 교체 |
| M9 | `page.tsx` | 영업이익>매출총이익 데이터 무결성 경고 배너 추가 |
| M10 | PlanTab | **확인 완료 — false positive** (원본값 `_raw_` 키로 보존, 툴팁에 "(손실)" 표시) |

---

## 변경 파일 목록 (12개)

| 파일 | 변경 유형 |
|------|-----------|
| `src/lib/analysis/whatif.ts` | 수정 (SGA 클램핑 제거) |
| `src/lib/analysis/breakeven.ts` | 수정 (음수 고정비 허용) |
| `src/lib/analysis/customerRiskMatrix.ts` | 수정 (매출 가중평균) |
| `src/lib/analysis/kpi.ts` | 수정 (주석 보강) |
| `src/components/charts/SafeReferenceLine.tsx` | **신규** |
| `src/components/charts/index.tsx` | 수정 (export 추가) |
| `src/app/dashboard/profitability/page.tsx` | 수정 (SGA 추정, BEP 가중, 무결성 경고) |
| `src/app/dashboard/profitability/tabs/ItemCostTab.tsx` | 수정 (데이터 보존, domain) |
| `src/app/dashboard/profitability/tabs/OrgTab.tsx` | 수정 (SafeReferenceLine) |
| `src/app/dashboard/profitability/tabs/CustomerRiskMatrixTab.tsx` | 수정 (SafeReferenceLine) |
| `src/app/dashboard/profitability/tabs/SensitivityTab.tsx` | 수정 (SGA 추정, 축 라벨) |
| `src/app/dashboard/profitability/tabs/PortfolioTab.tsx` | 수정 (safeFixed import) |
| `src/app/dashboard/profitability/tabs/CustProfitTab.tsx` | 수정 (더보기 토글) |
| `src/app/dashboard/profitability/tabs/VarianceTab.tsx` | 수정 (방법론 배너) |
| `src/app/dashboard/profitability/tabs/CostTab.tsx` | 수정 (경고, formula, 색상) |
| `src/app/dashboard/profitability/tabs/ContribTab.tsx` | 수정 (Tier 주석) |

---

## H6/H7 추가 구현 (2026-04-01)

| # | 파일 | 수정 내용 |
|---|------|----------|
| H6 | `src/lib/analysis/profitRiskMatrix.ts` | `ProfitRiskBenchmarks` 파라미터 + `DEFAULT_MARGIN_BENCHMARK`/`DEFAULT_RISK_BENCHMARK` export |
| H6 | `src/app/.../tabs/RiskTab.tsx` | 접이식 설정 패널: 고정/중앙값 토글 + 이익율(-10~30%)/리스크(10~80점) 슬라이더 |
| H7 | `src/lib/analysis/portfolioOptimization.ts` | `PortfolioWeights` 인터페이스 + `DEFAULT_PORTFOLIO_WEIGHTS` export + 가중치 파라미터 |
| H7 | `src/app/.../tabs/PortfolioTab.tsx` | 5축 가중치 슬라이더 + `adjustWeights()` 합계 100% 정규화 + "기본값 초기화" |

## 차기 세션 권장 작업

1. **L1~L6**: LOW 이슈 점진적 해소
2. **단위 테스트**: 음수 매출, 계획=0, NaN 전파 시나리오
3. **localStorage 영속화**: 설정값 페이지 이동 시 유지
